import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { hasModule, Plan } from '../config/plans';
import { allow, requireModule, tenant } from '../middleware/auth';
import { Attendance, ClassRoom, Exam, Mark, Period, Student, Subject, TimetableSlot, User } from '../models';
import { crud } from '../utils/crud';
import { HttpError, wrap } from '../utils/http';
import { audit } from '../utils/audit';
import { assertTeacherClass, assertTeacherPair, teacherClassFilter, teacherPairFilter, teacherScope } from '../utils/scope';
import { notifyGuardians } from '../utils/services';

const className = (c: any) => (c ? `${c.name} ${c.section || ''}`.trim() : '');

export const classes = crud(ClassRoom, {
  name: 'class', module: 'classes', read: ['teacher', 'accountant', 'receptionist', 'hr'], write: [],
  schema: z.object({
    stage: z.string().min(1), name: z.string().min(1), section: z.string().optional(), year: z.string().optional(),
    teacherIds: z.array(z.string()).optional(), capacity: z.number().int().positive().optional(),
  }),
  search: ['name', 'stage'], sort: { stage: 1, name: 1, section: 1 },
  populate: { path: 'teacherIds', select: 'name photo' },
  scope: (req) => teacherClassFilter(req, '_id'),
});

export const subjects = crud(Subject, {
  name: 'subject', module: 'classes', read: ['teacher', 'accountant', 'receptionist'], write: [],
  schema: z.object({ name: z.string().min(1), code: z.string().trim().max(20).optional(), classIds: z.array(z.string()).optional(), teacherIds: z.array(z.string()).optional() }),
  search: ['name', 'code'],
  populate: [{ path: 'teacherIds', select: 'name photo' }, { path: 'classIds', select: 'name section' }, { path: 'assignments.teacherId', select: 'name photo' }],
  scope: async (req) => { const s = await teacherScope(req); return s ? { _id: { $in: s.subjectIds } } : null; },
});

// One subject in full: its teachers, the classes that take it, where it sits in the week, and its exams.
subjects.get('/:id/details', allow('teacher', 'accountant', 'receptionist'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const ts = await teacherScope(req);
  if (ts && !ts.subjectIds.includes(req.params.id)) throw new HttpError(403, 'المادة دي مش من موادك');
  const sub = await Subject.findOne({ _id: req.params.id, schoolId }).populate('teacherIds', 'name photo profile.title').populate('assignments.teacherId', 'name photo profile.title').lean() as any;
  if (!sub) throw new HttpError(404, 'المادة غير موجودة');
  const [slots, periods, exams] = await Promise.all([
    TimetableSlot.find({ schoolId, year: req.school.currentYear, subjectId: sub._id })
      .populate('classId', 'name section stage').populate('teacherId', 'name photo').sort({ day: 1, period: 1 }).lean() as Promise<any[]>,
    Period.find({ schoolId }).sort({ number: 1 }).lean(),
    Exam.find({ schoolId, subjectId: sub._id }).populate('classId', 'name section').sort({ date: -1, createdAt: -1 }).lean() as Promise<any[]>,
  ]);

  // classes: listed on the subject, or on its timetable; a subject listing no classes applies to all of them
  const assigned = (sub.assignments || []).filter((a: any) => a.teacherId && a.classId);
  const classIds = new Set<string>([...(sub.classIds || []).map(String), ...slots.map((x) => String(x.classId?._id)), ...assigned.map((a: any) => String(a.classId))]);
  // a teacher sees only the classes where they teach this subject
  const mineHere = ts ? ts.pairs.filter((p) => p.subjectId === String(sub._id)).map((p) => p.classId) : null;
  const classes = await ClassRoom.find({ schoolId, ...(classIds.size ? { _id: { $in: [...classIds] } } : {}), ...(mineHere ? { _id: { $in: mineHere } } : {}) })
    .sort({ stage: 1, name: 1, section: 1 }).lean();
  const [students, marks] = await Promise.all([
    Student.aggregate([{ $match: { schoolId: new Types.ObjectId(schoolId), status: 'active', classId: { $in: classes.map((c) => c._id) } } }, { $group: { _id: '$classId', n: { $sum: 1 } } }]),
    Mark.find({ schoolId, examId: { $in: exams.map((e) => e._id) } }).select('examId score').lean(),
  ]);
  const studentsIn = new Map(students.map((x) => [String(x._id), x.n]));
  const examById = new Map(exams.map((e) => [String(e._id), e]));
  const avg = (rows: { pct: number }[]) => (rows.length ? Math.round(rows.reduce((t, r) => t + r.pct, 0) / rows.length) : null);
  const pcts = marks.map((m) => { const e = examById.get(String(m.examId))!; return { exam: String(e._id), cls: String(e.classId?._id), pct: (m.score / e.maxScore) * 100 }; });

  const teachersById = new Map<string, any>();
  const classNames = new Map(classes.map((c) => [String(c._id), className(c)]));
  for (const t of sub.teacherIds || []) teachersById.set(String(t._id), { _id: t._id, name: t.name, photo: t.photo, title: t.profile?.title, classes: new Map(), lessons: 0 });
  for (const a of assigned) {
    const k = String(a.teacherId._id);
    const t = teachersById.get(k) || { _id: a.teacherId._id, name: a.teacherId.name, photo: a.teacherId.photo, title: a.teacherId.profile?.title, classes: new Map(), lessons: 0 };
    if (classNames.has(String(a.classId))) t.classes.set(String(a.classId), classNames.get(String(a.classId)));
    teachersById.set(k, t);
  }
  for (const sl of slots) {
    if (!sl.teacherId) continue;
    const k = String(sl.teacherId._id);
    const t = teachersById.get(k) || { _id: sl.teacherId._id, name: sl.teacherId.name, photo: sl.teacherId.photo, classes: new Map(), lessons: 0 };
    t.lessons++; t.classes.set(String(sl.classId._id), className(sl.classId));
    teachersById.set(k, t);
  }

  res.json({
    subject: { _id: sub._id, name: sub.name, code: sub.code, allClasses: !sub.classIds?.length && !slots.length },
    stats: { teachers: teachersById.size, classes: classes.length, lessons: slots.length, exams: exams.length, averageScore: avg(pcts) },
    teachers: [...teachersById.values()].map((t) => ({ ...t, classes: [...t.classes.values()] })),
    classes: classes.map((c) => {
      const here = slots.filter((x) => String(x.classId?._id) === String(c._id));
      const tset = new Map(here.filter((x) => x.teacherId).map((x) => [String(x.teacherId._id), { _id: x.teacherId._id, name: x.teacherId.name, photo: x.teacherId.photo }]));
      for (const a of assigned) if (String(a.classId) === String(c._id)) tset.set(String(a.teacherId._id), { _id: a.teacherId._id, name: a.teacherId.name, photo: a.teacherId.photo });
      return {
        _id: c._id, name: className(c), stage: c.stage, students: studentsIn.get(String(c._id)) || 0, lessons: here.length,
        teachers: [...tset.values()], averageScore: avg(pcts.filter((p) => p.cls === String(c._id))),
      };
    }),
    timetable: {
      days: req.school.schoolDays ?? [0, 1, 2, 3, 4], periods,
      slots: slots.map((x) => ({ day: x.day, period: x.period, class: { _id: x.classId?._id, name: className(x.classId) }, teacher: x.teacherId ? { _id: x.teacherId._id, name: x.teacherId.name } : null, room: x.room })),
    },
    exams: exams.slice(0, 20).map((e) => ({ _id: e._id, name: e.name, class: className(e.classId), date: e.date, term: e.term, maxScore: e.maxScore, averageScore: avg(pcts.filter((p) => p.exam === String(e._id))) })),
  });
}));

// Who teaches this subject in one class (replaces that class's list). Managers only.
subjects.put('/:id/assignments/:classId', allow(), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const { teacherIds } = z.object({ teacherIds: z.array(z.string()).max(5) }).parse(req.body);
  const [sub, cls, teachers] = await Promise.all([
    Subject.findOne({ _id: req.params.id, schoolId }),
    ClassRoom.findOne({ _id: req.params.classId, schoolId }).select('_id').lean(),
    User.find({ _id: { $in: teacherIds }, schoolId, role: 'teacher' }).select('_id').lean(),
  ]);
  if (!sub) throw new HttpError(404, 'المادة غير موجودة');
  if (!cls) throw new HttpError(404, 'الفصل غير موجود');
  if (teachers.length !== teacherIds.length) throw new HttpError(400, 'معلم غير موجود');
  const others = (sub.assignments || []).filter((a: any) => String(a.classId) !== String(cls._id));
  sub.set('assignments', [...others, ...teachers.map((t) => ({ classId: cls._id, teacherId: t._id }))]);
  if (teachers.length) {
    sub.set('teacherIds', [...new Set([...(sub.teacherIds || []).map(String), ...teachers.map((t) => String(t._id))])]);
    if (sub.classIds?.length && !sub.classIds.some((c: any) => String(c) === String(cls._id))) sub.classIds.push(cls._id);
    await ClassRoom.updateOne({ _id: cls._id }, { $addToSet: { teacherIds: { $each: teachers.map((t) => t._id) } } });
  }
  await sub.save();
  audit(req, 'assign', 'subject', sub._id, { classId: cls._id, teacherIds });
  res.json({ ok: true });
}));

// ---------------- Attendance ----------------
export const attendance = Router();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Roster + existing marks for a class/day(/period)
attendance.get('/sheet', allow('teacher', 'receptionist'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const { classId, date, period = '0' } = z.object({ classId: z.string(), date: ymd, period: z.string().optional() }).parse(req.query);
  await assertTeacherClass(req, classId);
  const [students, marks] = await Promise.all([
    Student.find({ schoolId, classId, status: 'active' }).select('name code photo').sort({ name: 1 }).lean(),
    Attendance.find({ schoolId, classId, date, period: Number(period) }).lean(),
  ]);
  const m = new Map(marks.map((x) => [String(x.studentId), x]));
  res.json(students.map((s) => ({ ...s, status: m.get(String(s._id))?.status ?? null, reason: m.get(String(s._id))?.reason ?? '' })));
}));

// Bulk save. Per-lesson periods need Management+. Absence notifies guardians on Business+.
attendance.post('/sheet', allow('teacher', 'receptionist'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const d = z.object({
    classId: z.string(), date: ymd, period: z.number().int().min(0).max(12).default(0),
    records: z.array(z.object({ studentId: z.string(), status: z.enum(['present', 'absent', 'late', 'excused']), reason: z.string().optional() })).min(1),
  }).parse(req.body);
  await assertTeacherClass(req, d.classId);
  const plan = req.school.plan as Plan;
  if (d.period > 0 && !hasModule(plan, 'exams')) throw new HttpError(402, 'الحضور بالحصة متاح من باقة Management', 'UPGRADE_REQUIRED');

  const valid = new Set((await Student.find({ schoolId, classId: d.classId }).select('_id').lean()).map((s) => String(s._id)));
  const recs = d.records.filter((x) => valid.has(x.studentId));
  const prev = await Attendance.find({ schoolId, classId: d.classId, date: d.date, period: d.period }).select('studentId status').lean();
  const prevMap = new Map(prev.map((p) => [String(p.studentId), p.status]));

  await Attendance.bulkWrite(recs.map((x) => ({
    updateOne: {
      filter: { schoolId, studentId: x.studentId, date: d.date, period: d.period },
      update: { $set: { classId: d.classId, status: x.status, reason: x.reason, markedBy: req.user!.id } },
      upsert: true,
    },
  })) as any);

  // notify newly-absent only
  const newlyAbsent = recs.filter((x) => x.status === 'absent' && prevMap.get(x.studentId) !== 'absent');
  if (newlyAbsent.length && hasModule(plan, 'notifications')) {
    const studs = await Student.find({ _id: { $in: newlyAbsent.map((x) => x.studentId) } }).select('name guardian.phone').lean();
    await Promise.all(studs.map((s) =>
      notifyGuardians(req.school, String(s._id), { title: 'غياب', body: `تغيب ${s.name} اليوم ${d.date}`, type: 'absence', guardianPhone: s.guardian?.phone ?? undefined })));
  }
  res.json({ saved: recs.length });
}));

// Report: per-student totals within range
attendance.get('/report', allow('teacher', 'accountant', 'receptionist'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const q = z.object({ classId: z.string().optional(), from: ymd, to: ymd }).parse(req.query);
  const match: any = { schoolId: (await import('mongoose')).Types.ObjectId.createFromHexString(schoolId), date: { $gte: q.from, $lte: q.to } };
  const { Types } = await import('mongoose');
  if (q.classId) {
    await assertTeacherClass(req, q.classId);
    match.classId = Types.ObjectId.createFromHexString(q.classId);
  } else {
    const s = await teacherScope(req);
    if (s) match.classId = { $in: s.classIds.map((id) => Types.ObjectId.createFromHexString(id)) };
  }
  const rows = await Attendance.aggregate([
    { $match: match },
    { $group: { _id: { s: '$studentId', st: '$status' }, n: { $sum: 1 } } },
    { $group: { _id: '$_id.s', counts: { $push: { k: '$_id.st', n: '$n' } } } },
    { $lookup: { from: 'students', localField: '_id', foreignField: '_id', as: 's' } },
    { $unwind: '$s' },
    { $project: { name: '$s.name', code: '$s.code', counts: { $arrayToObject: { $map: { input: '$counts', as: 'c', in: { k: '$$c.k', v: '$$c.n' } } } } } },
    { $sort: { name: 1 } },
  ]);
  res.json(rows);
}));

// ---------------- Exams & marks (Management+) ----------------
export const exams = Router();
exams.use(requireModule('exams'));

exams.use('/marks', Router()
  .get('/:examId', allow('teacher'), wrap(async (req, res) => {
    const schoolId = tenant(req);
    const exam = await Exam.findOne({ _id: req.params.examId, schoolId })
      .populate('subjectId', 'name code').populate('classId', 'name section stage').lean() as any;
    if (!exam) throw new HttpError(404, 'غير موجود');
    await assertTeacherPair(req, exam.classId._id, exam.subjectId._id);
    const [students, marks] = await Promise.all([
      Student.find({ schoolId, classId: exam.classId._id, status: 'active' }).select('name code photo').sort({ name: 1 }).lean(),
      Mark.find({ schoolId, examId: exam._id }).lean(),
    ]);
    const m = new Map(marks.map((x) => [String(x.studentId), x]));
    res.json({ exam, rows: students.map((s) => ({ ...s, score: m.get(String(s._id))?.score ?? null, notes: m.get(String(s._id))?.notes ?? '' })) });
  }))
  .post('/:examId', allow('teacher'), wrap(async (req, res) => {
    const schoolId = tenant(req);
    const exam = await Exam.findOne({ _id: req.params.examId, schoolId }).lean();
    if (!exam) throw new HttpError(404, 'غير موجود');
    await assertTeacherPair(req, exam.classId, exam.subjectId);
    const d = z.object({ rows: z.array(z.object({ studentId: z.string(), score: z.number().min(0).max(exam.maxScore), notes: z.string().optional() })) }).parse(req.body);
    await Mark.bulkWrite(d.rows.map((x) => ({
      updateOne: { filter: { examId: exam._id, studentId: x.studentId }, update: { $set: { schoolId, score: x.score, notes: x.notes } }, upsert: true },
    })) as any);
    if (hasModule(req.school.plan, 'notifications')) {
      const studs = await Student.find({ _id: { $in: d.rows.map((x) => x.studentId) } }).select('name').lean();
      await Promise.all(studs.map((s) => notifyGuardians(req.school, String(s._id), { title: 'نتيجة جديدة', body: `تم رصد درجة ${s.name} في ${exam.name}`, type: 'exam' })));
    }
    res.json({ saved: d.rows.length });
  })));

// Exams board: every exam the caller may see, with how far grading got and how students did.
exams.get('/overview', allow('teacher', 'accountant', 'receptionist'), wrap(async (req, res) => {
  const schoolId = tenant(req), sid = new Types.ObjectId(schoolId);
  const q = z.object({ term: z.string().optional(), classId: z.string().optional(), subjectId: z.string().optional() }).parse(req.query);
  const filter: any = { schoolId, ...((await teacherPairFilter(req)) || {}) };
  for (const k of ['term', 'classId', 'subjectId'] as const) if (q[k]) filter[k] = q[k];
  const list = await Exam.find(filter).populate('subjectId', 'name code').populate('classId', 'name section stage')
    .sort({ date: -1, createdAt: -1 }).limit(300).lean() as any[];
  const [marks, roster, terms] = await Promise.all([
    Mark.aggregate([
      { $match: { schoolId: sid, examId: { $in: list.map((e) => e._id) } } },
      { $group: { _id: '$examId', n: { $sum: 1 }, scores: { $push: '$score' } } },
    ]),
    Student.aggregate([
      { $match: { schoolId: sid, status: 'active', classId: { $in: [...new Set(list.map((e) => String(e.classId?._id)))].map((x) => new Types.ObjectId(x)) } } },
      { $group: { _id: '$classId', n: { $sum: 1 } } },
    ]),
    Exam.distinct('term', { schoolId, term: { $nin: [null, ''] } }),
  ]);
  const m = new Map(marks.map((x) => [String(x._id), x]));
  const size = new Map(roster.map((x) => [String(x._id), x.n]));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const items = list.map((e) => {
    const g = m.get(String(e._id)), students = size.get(String(e.classId?._id)) || 0, graded = g?.n || 0;
    const pcts: number[] = (g?.scores || []).map((s: number) => (s / e.maxScore) * 100);
    const status = e.date && new Date(e.date) > today && !graded ? 'upcoming' : graded >= students && students > 0 ? 'graded' : 'pending';
    return {
      _id: e._id, name: e.name, term: e.term, date: e.date, maxScore: e.maxScore,
      subject: e.subjectId && { _id: e.subjectId._id, name: e.subjectId.name, code: e.subjectId.code },
      class: e.classId && { _id: e.classId._id, name: `${e.classId.name} ${e.classId.section || ''}`.trim(), stage: e.classId.stage },
      students, graded, status,
      averageScore: pcts.length ? Math.round(pcts.reduce((t, p) => t + p, 0) / pcts.length) : null,
      passRate: pcts.length ? Math.round((pcts.filter((p) => p >= 50).length / pcts.length) * 100) : null,
    };
  });
  const scored = items.filter((i) => i.averageScore != null);
  res.json({
    items, terms: terms.sort(),
    totals: {
      exams: items.length,
      pending: items.filter((i) => i.status === 'pending').length,
      upcoming: items.filter((i) => i.status === 'upcoming').length,
      averageScore: scored.length ? Math.round(scored.reduce((t, i) => t + i.averageScore!, 0) / scored.length) : null,
    },
  });
}));

// Class results: total/percentage per student
exams.get('/results/:classId', allow('teacher', 'accountant', 'receptionist'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  await assertTeacherClass(req, req.params.classId);
  const exs = await Exam.find({ schoolId, classId: req.params.classId, ...(req.query.term ? { term: req.query.term } : {}) }).lean();
  const marks = await Mark.find({ schoolId, examId: { $in: exs.map((e) => e._id) } }).lean();
  const max = new Map(exs.map((e) => [String(e._id), e.maxScore]));
  const agg = new Map<string, { score: number; max: number }>();
  for (const m of marks) {
    const k = String(m.studentId);
    const a = agg.get(k) || { score: 0, max: 0 };
    a.score += m.score; a.max += max.get(String(m.examId)) || 0;
    agg.set(k, a);
  }
  const studs = await Student.find({ _id: { $in: [...agg.keys()] } }).select('name code').lean();
  res.json(studs.map((s) => { const a = agg.get(String(s._id))!; return { ...s, score: a.score, max: a.max, percent: a.max ? +(a.score / a.max * 100).toFixed(1) : 0 }; })
    .sort((a, b) => b.percent - a.percent));
}));

exams.use('/', crud(Exam, {
  name: 'exam', read: ['teacher', 'accountant', 'receptionist'], write: ['teacher'],
  schema: z.object({
    name: z.string().min(1), classId: z.string(), subjectId: z.string(), term: z.string().optional(),
    date: z.coerce.date().optional(), maxScore: z.number().positive().default(100),
  }),
  filters: ['classId', 'subjectId', 'term'], populate: [{ path: 'subjectId', select: 'name' }, { path: 'classId', select: 'stage name section' }],
  beforeCreate: async (req, data) => { await assertTeacherPair(req, data.classId, data.subjectId); return data; },
  beforeUpdate: async (req, data) => {
    if (data.classId || data.subjectId) {
      const cur = await Exam.findOne({ _id: req.params.id, schoolId: tenant(req) }).select('classId subjectId').lean();
      await assertTeacherPair(req, data.classId || cur?.classId, data.subjectId || cur?.subjectId);
    }
    return data;
  },
  beforeDelete: async (_r, doc: any) => { await Mark.deleteMany({ examId: doc._id }); },
  scope: (req) => teacherPairFilter(req),
}));
