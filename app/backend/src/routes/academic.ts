import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { hasModule, Plan } from '../config/plans';
import { allow, requireModule, tenant } from '../middleware/auth';
import { Attendance, ClassRoom, Exam, Mark, Period, Student, Subject, TimetableSlot } from '../models';
import { crud } from '../utils/crud';
import { HttpError, wrap } from '../utils/http';
import { assertTeacherClass, teacherClassFilter, teacherScope } from '../utils/scope';
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
  populate: [{ path: 'teacherIds', select: 'name photo' }, { path: 'classIds', select: 'name section' }],
  scope: async (req) => { const s = await teacherScope(req); return s ? { _id: { $in: s.subjectIds } } : null; },
});

// One subject in full: its teachers, the classes that take it, where it sits in the week, and its exams.
subjects.get('/:id/details', allow('teacher', 'accountant', 'receptionist'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const ts = await teacherScope(req);
  if (ts && !ts.subjectIds.includes(req.params.id)) throw new HttpError(403, 'المادة دي مش من موادك');
  const sub = await Subject.findOne({ _id: req.params.id, schoolId }).populate('teacherIds', 'name photo profile.title').lean() as any;
  if (!sub) throw new HttpError(404, 'المادة غير موجودة');
  const [slots, periods, exams] = await Promise.all([
    TimetableSlot.find({ schoolId, year: req.school.currentYear, subjectId: sub._id })
      .populate('classId', 'name section stage').populate('teacherId', 'name photo').sort({ day: 1, period: 1 }).lean() as Promise<any[]>,
    Period.find({ schoolId }).sort({ number: 1 }).lean(),
    Exam.find({ schoolId, subjectId: sub._id }).populate('classId', 'name section').sort({ date: -1, createdAt: -1 }).lean() as Promise<any[]>,
  ]);

  // classes: listed on the subject, or on its timetable; a subject listing no classes applies to all of them
  const classIds = new Set<string>([...(sub.classIds || []).map(String), ...slots.map((x) => String(x.classId?._id))]);
  const classes = await ClassRoom.find({ schoolId, ...(classIds.size ? { _id: { $in: [...classIds] } } : {}), ...(ts ? { _id: { $in: ts.classIds } } : {}) })
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
  for (const t of sub.teacherIds || []) teachersById.set(String(t._id), { _id: t._id, name: t.name, photo: t.photo, title: t.profile?.title, classes: new Map(), lessons: 0 });
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

// ---------------- Attendance ----------------
export const attendance = Router();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Roster + existing marks for a class/day(/period)
attendance.get('/sheet', allow('teacher', 'receptionist'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const { classId, date, period = '0' } = z.object({ classId: z.string(), date: ymd, period: z.string().optional() }).parse(req.query);
  await assertTeacherClass(req, classId);
  const [students, marks] = await Promise.all([
    Student.find({ schoolId, classId, status: 'active' }).select('name code').sort({ name: 1 }).lean(),
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
    const exam = await Exam.findOne({ _id: req.params.examId, schoolId }).lean();
    if (!exam) throw new HttpError(404, 'غير موجود');
    await assertTeacherClass(req, exam.classId);
    const [students, marks] = await Promise.all([
      Student.find({ schoolId, classId: exam.classId, status: 'active' }).select('name code').sort({ name: 1 }).lean(),
      Mark.find({ schoolId, examId: exam._id }).lean(),
    ]);
    const m = new Map(marks.map((x) => [String(x.studentId), x]));
    res.json({ exam, rows: students.map((s) => ({ ...s, score: m.get(String(s._id))?.score ?? null, notes: m.get(String(s._id))?.notes ?? '' })) });
  }))
  .post('/:examId', allow('teacher'), wrap(async (req, res) => {
    const schoolId = tenant(req);
    const exam = await Exam.findOne({ _id: req.params.examId, schoolId }).lean();
    if (!exam) throw new HttpError(404, 'غير موجود');
    await assertTeacherClass(req, exam.classId);
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
  beforeCreate: async (req, data) => { await assertTeacherClass(req, data.classId); return data; },
  beforeUpdate: async (req, data) => { if (data.classId) await assertTeacherClass(req, data.classId); return data; },
  beforeDelete: async (_r, doc: any) => { await Mark.deleteMany({ examId: doc._id }); },
  scope: (req) => teacherClassFilter(req),
}));
