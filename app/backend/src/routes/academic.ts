import { Router } from 'express';
import { z } from 'zod';
import { hasModule, Plan } from '../config/plans';
import { allow, requireModule, tenant } from '../middleware/auth';
import { Attendance, ClassRoom, Exam, Mark, Student, Subject } from '../models';
import { crud } from '../utils/crud';
import { HttpError, wrap } from '../utils/http';
import { assertTeacherClass, teacherClassFilter, teacherScope } from '../utils/scope';
import { notifyGuardians } from '../utils/services';

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
  schema: z.object({ name: z.string().min(1), classIds: z.array(z.string()).optional(), teacherIds: z.array(z.string()).optional() }),
  search: ['name'],
  populate: [{ path: 'teacherIds', select: 'name' }, { path: 'classIds', select: 'name section' }],
  scope: async (req) => { const s = await teacherScope(req); return s ? { _id: { $in: s.subjectIds } } : null; },
});

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
