import { Request, Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { allow, requireModule, tenant } from '../middleware/auth';
import { Announcement, Attendance, ClassRoom, Exam, Mark, Period, School, Student, StudentNote, Subject, TimetableSlot, User } from '../models';
import { audit } from '../utils/audit';
import { HttpError, wrap } from '../utils/http';
import { assertTeacherClass, teacherScope } from '../utils/scope';
import { notifyGuardians } from '../utils/services';

const oid = (s: string) => new Types.ObjectId(s);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const year = (req: Request) => String(req.school.currentYear);
const className = (c: any) => (c ? `${c.name} ${c.section || ''}`.trim() : '');

// ======================= Timetable (Academic) =======================
export const timetable = Router();
timetable.use(requireModule('timetable'));

// Periods (bell schedule) + school days
timetable.get('/periods', allow('teacher', 'receptionist', 'accountant', 'hr'), wrap(async (req, res) => {
  res.json({ periods: await Period.find({ schoolId: tenant(req) }).sort({ number: 1 }).lean(), days: req.school.schoolDays ?? [0, 1, 2, 3, 4] });
}));

timetable.put('/periods', allow(), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const d = z.object({
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    periods: z.array(z.object({ number: z.number().int().min(1).max(12), start: hhmm, end: hhmm })).min(1).max(12),
  }).parse(req.body);
  const nums = d.periods.map((p) => p.number);
  if (new Set(nums).size !== nums.length) throw new HttpError(400, 'رقم الحصة متكرر');
  if (d.periods.some((p) => p.start >= p.end)) throw new HttpError(400, 'وقت نهاية الحصة لازم يكون بعد بدايتها');
  await Period.deleteMany({ schoolId, number: { $nin: nums } });
  await Period.bulkWrite(d.periods.map((p) => ({ updateOne: { filter: { schoolId, number: p.number }, update: { $set: p }, upsert: true } })) as any);
  // slots in removed periods/days no longer exist on the grid
  await TimetableSlot.deleteMany({ schoolId, $or: [{ period: { $nin: nums } }, { day: { $nin: d.days } }] });
  await School.updateOne({ _id: schoolId }, { schoolDays: [...new Set(d.days)].sort() });
  audit(req, 'update', 'periods', schoolId);
  res.json({ ok: true });
}));

const populateSlot = (q: any) => q
  .populate('classId', 'name section stage')
  .populate('subjectId', 'name')
  .populate('teacherId', 'name');

// Grid for one class or one teacher. Teachers may read their own timetable and their classes'.
timetable.get('/', allow('teacher', 'receptionist', 'accountant', 'hr'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const q = z.object({ classId: z.string().optional(), teacherId: z.string().optional() }).parse(req.query);
  if (!q.classId && !q.teacherId) throw new HttpError(400, 'اختار فصل أو معلم');
  if (req.user!.role === 'teacher') {
    if (q.teacherId && q.teacherId !== req.user!.id) throw new HttpError(403, 'تقدر تشوف جدولك بس');
    if (q.classId) await assertTeacherClass(req, q.classId);
  }
  const filter: any = { schoolId, year: year(req) };
  if (q.classId) filter.classId = q.classId;
  if (q.teacherId) filter.teacherId = q.teacherId;
  res.json(await populateSlot(TimetableSlot.find(filter).sort({ day: 1, period: 1 })).lean());
}));

// Load overview: lessons per teacher per week, empty slots per class
timetable.get('/overview', allow(), wrap(async (req, res) => {
  const schoolId = tenant(req), sid = oid(schoolId);
  const [teachers, classes, periods, perTeacher, perClass] = await Promise.all([
    User.find({ schoolId, role: 'teacher', active: true }).select('name').sort({ name: 1 }).lean(),
    ClassRoom.find({ schoolId }).select('name section stage').sort({ stage: 1, name: 1, section: 1 }).lean(),
    Period.countDocuments({ schoolId }),
    TimetableSlot.aggregate([{ $match: { schoolId: sid, year: year(req), teacherId: { $ne: null } } }, { $group: { _id: '$teacherId', n: { $sum: 1 } } }]),
    TimetableSlot.aggregate([{ $match: { schoolId: sid, year: year(req) } }, { $group: { _id: '$classId', n: { $sum: 1 } } }]),
  ]);
  const t = new Map(perTeacher.map((x) => [String(x._id), x.n]));
  const c = new Map(perClass.map((x) => [String(x._id), x.n]));
  const total = periods * (req.school.schoolDays?.length ?? 5);
  res.json({
    teachers: teachers.map((x) => ({ _id: x._id, name: x.name, lessons: t.get(String(x._id)) || 0 })),
    classes: classes.map((x) => ({ _id: x._id, name: className(x), stage: x.stage, filled: c.get(String(x._id)) || 0, total })),
  });
}));

const slotSchema = z.object({
  day: z.number().int().min(0).max(6), period: z.number().int().min(1).max(12),
  classId: z.string(), subjectId: z.string(), teacherId: z.string().nullable().optional(), room: z.string().max(40).optional(),
});

// Create or replace the lesson in (class, day, period). Refuses double-booking a teacher.
timetable.put('/slot', allow(), wrap(async (req, res) => {
  const schoolId = tenant(req), y = year(req);
  const d = slotSchema.parse(req.body);
  const days: number[] = req.school.schoolDays ?? [0, 1, 2, 3, 4];
  if (!days.includes(d.day)) throw new HttpError(400, 'اليوم ده مش يوم دراسة');
  const [cls, sub, per] = await Promise.all([
    ClassRoom.findOne({ _id: d.classId, schoolId }).lean(),
    Subject.findOne({ _id: d.subjectId, schoolId }).lean(),
    Period.findOne({ schoolId, number: d.period }).lean(),
  ]);
  if (!cls) throw new HttpError(404, 'الفصل غير موجود');
  if (!sub) throw new HttpError(404, 'المادة غير موجودة');
  if (!per) throw new HttpError(400, 'الحصة دي مش متعرّفة في مواعيد الحصص');
  if (sub.classIds?.length && !sub.classIds.some((c) => String(c) === d.classId)) throw new HttpError(400, `مادة ${sub.name} مش مقررة على ${className(cls)}`);

  if (d.teacherId) {
    const t = await User.findOne({ _id: d.teacherId, schoolId, role: 'teacher', active: true }).select('name').lean();
    if (!t) throw new HttpError(404, 'المعلم غير موجود');
    const busy = await TimetableSlot.findOne({ schoolId, year: y, day: d.day, period: d.period, teacherId: d.teacherId, classId: { $ne: d.classId } })
      .populate('classId', 'name section').lean();
    if (busy) throw new HttpError(409, `${t.name} عنده حصة مع ${className(busy.classId)} في نفس الوقت`, 'CONFLICT');
    // keep assignments in sync so the teacher's access follows the timetable
    await Promise.all([
      Subject.updateOne({ _id: sub._id }, { $addToSet: { teacherIds: t._id, assignments: { classId: cls._id, teacherId: t._id } } }),
      ClassRoom.updateOne({ _id: cls._id }, { $addToSet: { teacherIds: t._id } }),
    ]);
  }
  const slot = await TimetableSlot.findOneAndUpdate(
    { schoolId, year: y, day: d.day, period: d.period, classId: d.classId },
    { $set: { subjectId: d.subjectId, teacherId: d.teacherId || null, room: d.room } },
    { upsert: true, new: true },
  );
  audit(req, 'update', 'timetable', slot._id, d);
  res.json(await populateSlot(TimetableSlot.findById(slot._id)).lean());
}));

timetable.delete('/slot/:id', allow(), wrap(async (req, res) => {
  const s = await TimetableSlot.findOneAndDelete({ _id: req.params.id, schoolId: tenant(req) });
  if (!s) throw new HttpError(404, 'غير موجود');
  audit(req, 'delete', 'timetable', s._id);
  res.json({ ok: true });
}));

// Copy one class's lessons (subjects only, no teachers) onto another class
timetable.post('/copy', allow(), wrap(async (req, res) => {
  const schoolId = tenant(req), y = year(req);
  const d = z.object({ fromClassId: z.string(), toClassId: z.string() }).parse(req.body);
  if (d.fromClassId === d.toClassId) throw new HttpError(400, 'اختار فصل مختلف');
  if (!(await ClassRoom.exists({ _id: d.toClassId, schoolId }))) throw new HttpError(404, 'الفصل غير موجود');
  const src = await TimetableSlot.find({ schoolId, year: y, classId: d.fromClassId }).lean();
  await TimetableSlot.deleteMany({ schoolId, year: y, classId: d.toClassId });
  if (src.length)
    await TimetableSlot.insertMany(src.map((s) => ({ schoolId, year: y, day: s.day, period: s.period, classId: d.toClassId, subjectId: s.subjectId, room: s.room })));
  audit(req, 'copy', 'timetable', d.toClassId, d);
  res.json({ copied: src.length });
}));

// ======================= Teacher portal (Academic) =======================
export const teacher = Router();
teacher.use(requireModule('teacherPortal'));

// A day as the teacher sees it. `date` and `day` come from the browser so "today" is the school's local day.
teacher.get('/day', allow('teacher'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const q = z.object({ date: ymd, teacherId: z.string().optional() }).parse(req.query);
  const teacherId = req.user!.role === 'teacher' ? req.user!.id : q.teacherId;
  if (!teacherId) throw new HttpError(400, 'اختار معلم');
  const day = new Date(`${q.date}T12:00:00Z`).getUTCDay();
  const [periods, slots, news] = await Promise.all([
    Period.find({ schoolId }).sort({ number: 1 }).lean(),
    populateSlot(TimetableSlot.find({ schoolId, year: year(req), teacherId, day })).sort({ period: 1 }).lean(),
    Announcement.find({ schoolId }).sort({ createdAt: -1 }).limit(3).select('title body createdAt').lean(),
  ]);
  const marked = await Attendance.aggregate([
    { $match: { schoolId: oid(schoolId), date: q.date, period: { $in: slots.map((s: any) => s.period) }, classId: { $in: slots.map((s: any) => s.classId._id) } } },
    { $group: { _id: { c: '$classId', p: '$period' } } },
  ]);
  const done = new Set(marked.map((m) => `${m._id.c}:${m._id.p}`));
  const per = new Map(periods.map((p) => [p.number, p]));
  res.json({
    date: q.date, day, schoolDay: (req.school.schoolDays ?? [0, 1, 2, 3, 4]).includes(day),
    lessons: slots.map((s: any) => ({
      _id: s._id, period: s.period, start: per.get(s.period)?.start, end: per.get(s.period)?.end,
      class: s.classId, subject: s.subjectId, room: s.room, attendanceDone: done.has(`${s.classId._id}:${s.period}`),
    })),
    announcements: news,
  });
}));

// My classes with quick stats (attendance rate last 30 days, average in my subjects)
teacher.get('/classes', allow('teacher'), wrap(async (req, res) => {
  const schoolId = tenant(req), sid = oid(schoolId);
  const s = await teacherScope(req);
  const classFilter: any = { schoolId, ...(s ? { _id: { $in: s.classIds } } : {}) };
  const classes = await ClassRoom.find(classFilter).sort({ stage: 1, name: 1, section: 1 }).lean();
  const ids = classes.map((c) => c._id);
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const examFilter: any = { schoolId, classId: { $in: ids }, ...(s ? (s.pairs.length ? { $or: s.pairs.map((p) => ({ classId: p.classId, subjectId: p.subjectId })) } : { _id: null }) : {}) };
  const exams = await Exam.find(examFilter).select('_id classId maxScore').lean();
  const [counts, att, marks] = await Promise.all([
    Student.aggregate([{ $match: { schoolId: sid, status: 'active', classId: { $in: ids } } }, { $group: { _id: '$classId', n: { $sum: 1 } } }]),
    Attendance.aggregate([
      { $match: { schoolId: sid, classId: { $in: ids }, date: { $gte: since } } },
      { $group: { _id: '$classId', ok: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } }, n: { $sum: 1 } } },
    ]),
    Mark.find({ schoolId, examId: { $in: exams.map((e) => e._id) } }).select('examId score').lean(),
  ]);
  const ex = new Map(exams.map((e) => [String(e._id), e]));
  const avg = new Map<string, { s: number; n: number }>();
  for (const m of marks) {
    const e = ex.get(String(m.examId)); if (!e) continue;
    const k = String(e.classId), a = avg.get(k) || { s: 0, n: 0 };
    a.s += (m.score / e.maxScore) * 100; a.n++; avg.set(k, a);
  }
  const cnt = new Map(counts.map((x) => [String(x._id), x.n]));
  const at = new Map(att.map((x) => [String(x._id), x]));
  res.json(classes.map((c) => {
    const a = at.get(String(c._id)), g = avg.get(String(c._id));
    return {
      _id: c._id, name: className(c), stage: c.stage, students: cnt.get(String(c._id)) || 0,
      attendanceRate: a?.n ? +(a.ok / a.n * 100).toFixed(1) : null,
      averageScore: g?.n ? +(g.s / g.n).toFixed(1) : null,
    };
  }));
}));

// Notes on students. Teachers write on their own classes; admins read everything.
teacher.get('/notes', allow('teacher'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const q = z.object({ studentId: z.string() }).parse(req.query);
  const st = await Student.findOne({ _id: q.studentId, schoolId }).select('classId').lean();
  if (!st) throw new HttpError(404, 'غير موجود');
  await assertTeacherClass(req, st.classId);
  res.json(await StudentNote.find({ schoolId, studentId: q.studentId }).sort({ createdAt: -1 }).limit(100).populate('teacherId', 'name').lean());
}));

teacher.post('/notes', allow('teacher'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const d = z.object({
    studentId: z.string(), kind: z.enum(['behavior', 'academic']), body: z.string().trim().min(2).max(1000), sendToParent: z.boolean().default(false),
  }).parse(req.body);
  const st = await Student.findOne({ _id: d.studentId, schoolId }).select('name classId').lean();
  if (!st) throw new HttpError(404, 'غير موجود');
  await assertTeacherClass(req, st.classId);
  const note = await StudentNote.create({ schoolId, studentId: d.studentId, teacherId: req.user!.id, kind: d.kind, body: d.body, sentToParent: d.sendToParent });
  if (d.sendToParent)
    await notifyGuardians(req.school, d.studentId, { title: `ملاحظة من ${req.user!.name} عن ${st.name}`, body: d.body, type: 'note' });
  audit(req, 'create', 'note', note._id);
  res.status(201).json(note);
}));

teacher.delete('/notes/:id', allow('teacher'), wrap(async (req, res) => {
  const filter: any = { _id: req.params.id, schoolId: tenant(req) };
  if (req.user!.role === 'teacher') filter.teacherId = req.user!.id; // a teacher deletes only their own
  if (!(await StudentNote.findOneAndDelete(filter))) throw new HttpError(404, 'غير موجود');
  res.json({ ok: true });
}));

// Management report: how reliably each teacher takes attendance in their lessons
/** Lessons each teacher was timetabled for in [from, to] vs. lesson attendance actually taken. */
export async function teacherCompliance(req: Request, from: string, to: string, teacherId?: string) {
  const schoolId = tenant(req), sid = oid(schoolId);
  const days = new Set<number>(req.school.schoolDays ?? [0, 1, 2, 3, 4]);
  const dates: { date: string; day: number }[] = [];
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`) && dates.length < 120; t += 864e5) {
    const d = new Date(t);
    if (days.has(d.getUTCDay())) dates.push({ date: d.toISOString().slice(0, 10), day: d.getUTCDay() });
  }
  const who = teacherId ? { _id: teacherId } : {};
  const [slots, teachers, marked] = await Promise.all([
    TimetableSlot.find({ schoolId, year: year(req), teacherId: teacherId || { $ne: null } }).populate('classId', 'name section').lean() as Promise<any[]>,
    User.find({ schoolId, role: 'teacher', ...who }).select('name').sort({ name: 1 }).lean(),
    Attendance.aggregate([
      { $match: { schoolId: sid, date: { $gte: from, $lte: to }, period: { $gt: 0 } } },
      { $group: { _id: { c: '$classId', d: '$date', p: '$period' } } },
    ]),
  ]);
  const done = new Set(marked.map((m) => `${m._id.c}:${m._id.d}:${m._id.p}`));
  const stats = new Map<string, { expected: number; done: number; missing: { date: string; period: number; class: string }[] }>();
  for (const { date, day } of dates)
    for (const s of slots) {
      // a lesson only counts from the day it was put on the timetable
      if (s.day !== day || date < new Date(s.createdAt).toISOString().slice(0, 10)) continue;
      const k = String(s.teacherId), st = stats.get(k) || { expected: 0, done: 0, missing: [] };
      st.expected++;
      if (done.has(`${(s.classId as any)._id}:${date}:${s.period}`)) st.done++;
      else st.missing.push({ date, period: s.period, class: className(s.classId) });
      stats.set(k, st);
    }
  return teachers.map((t) => {
    const s = stats.get(String(t._id)) || { expected: 0, done: 0, missing: [] };
    return { _id: t._id, name: t.name, expected: s.expected, done: s.done, rate: s.expected ? +(s.done / s.expected * 100).toFixed(1) : null, missing: s.missing.slice(-20).reverse() };
  }).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
}

teacher.get('/compliance', allow(), wrap(async (req, res) => {
  const q = z.object({ from: ymd, to: ymd }).parse(req.query);
  if (q.from > q.to) throw new HttpError(400, 'تاريخ البداية بعد النهاية');
  res.json(await teacherCompliance(req, q.from, q.to));
}));
