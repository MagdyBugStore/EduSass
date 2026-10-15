import { Router } from 'express';
import { Types } from 'mongoose';
import { allow, requireModule, tenant } from '../middleware/auth';
import { Attendance, ClassRoom, Employee, Expense, Invoice, LeaveRequest, Mark, Exam, Payment, Student, Subject, TimetableSlot, User } from '../models';
import { hasModule, Plan } from '../config/plans';
import { wrap } from '../utils/http';
import { teacherScope } from '../utils/scope';

const oid = (s: string) => new Types.ObjectId(s);
const today = () => new Date().toISOString().slice(0, 10);
const r = Router();

// Dashboard summary (all plans; richer on higher plans)
r.get('/summary', allow('teacher', 'accountant', 'hr', 'receptionist'), wrap(async (req, res) => {
  const id = tenant(req), sid = oid(id);
  const ts = await teacherScope(req); // a teacher's dashboard counts their own classes only
  const inCls = ts ? { classId: { $in: ts.classIds.map(oid) } } : {};
  const [students, classes, attToday, fees] = await Promise.all([
    Student.countDocuments({ schoolId: id, status: 'active', ...inCls }),
    ClassRoom.countDocuments({ schoolId: id, ...(ts ? { _id: { $in: ts.classIds } } : {}) }),
    Attendance.aggregate([{ $match: { schoolId: sid, date: today(), period: 0, ...inCls } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Invoice.aggregate([{ $match: { schoolId: sid, status: { $ne: 'cancelled' } } }, { $group: { _id: null, total: { $sum: '$total' }, paid: { $sum: '$paid' } } }]),
  ]);
  const t = fees[0] || { total: 0, paid: 0 };
  res.json({
    students, classes, maxStudents: req.school.maxStudents,
    attendanceToday: Object.fromEntries(attToday.map((a) => [a._id, a.n])),
    fees: { total: t.total, paid: t.paid, outstanding: t.total - t.paid },
  });
}));

r.get('/students-by-class', allow('teacher', 'accountant', 'receptionist'), wrap(async (req, res) => {
  const ts = await teacherScope(req);
  res.json(await Student.aggregate([
    { $match: { schoolId: oid(tenant(req)), status: 'active', ...(ts ? { classId: { $in: ts.classIds.map(oid) } } : {}) } },
    { $group: { _id: '$classId', n: { $sum: 1 } } },
    { $lookup: { from: 'classrooms', localField: '_id', foreignField: '_id', as: 'c' } }, { $unwind: { path: '$c', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, classId: '$_id', name: { $concat: [{ $ifNull: ['$c.name', 'بدون فصل'] }, ' ', { $ifNull: ['$c.section', ''] }] }, n: 1 } }, { $sort: { name: 1 } },
  ]));
}));

// Classes at a glance for one day (default today): roster size, homeroom teacher, attendance mix, late arrivals.
r.get('/classes-overview', allow('teacher', 'accountant', 'receptionist', 'hr'), wrap(async (req, res) => {
  const id = tenant(req), sid = oid(id);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? String(req.query.date) : today();
  const ts = await teacherScope(req);
  const classes = await ClassRoom.find({ schoolId: id, ...(ts ? { _id: { $in: ts.classIds } } : {}) })
    .populate('teacherIds', 'name photo').sort({ stage: 1, name: 1, section: 1 }).lean();
  const ids = classes.map((c) => c._id);
  const role = req.user!.role, plan = req.school.plan as Plan;
  const [counts, att, teachers, pending] = await Promise.all([
    Student.aggregate([{ $match: { schoolId: sid, status: 'active', classId: { $in: ids } } }, { $group: { _id: '$classId', n: { $sum: 1 } } }]),
    Attendance.aggregate([{ $match: { schoolId: sid, date, period: 0, classId: { $in: ids } } }, { $group: { _id: { c: '$classId', s: '$status' }, n: { $sum: 1 } } }]),
    User.countDocuments({ schoolId: id, role: 'teacher', active: true }),
    hasModule(plan, 'hr') && ['owner', 'admin', 'hr'].includes(role) ? LeaveRequest.countDocuments({ schoolId: id, status: 'pending' }) : Promise.resolve(null),
  ]);
  const cnt = new Map(counts.map((x) => [String(x._id), x.n]));
  const mix = new Map<string, Record<string, number>>();
  for (const a of att) { const k = String(a._id.c); mix.set(k, { ...(mix.get(k) || {}), [a._id.s]: a.n }); }
  const items = classes.map((c: any) => {
    const m = mix.get(String(c._id)) || {}, marked = Object.values(m).reduce((t, n) => t + n, 0);
    return {
      _id: c._id, name: c.name, section: c.section, stage: c.stage, capacity: c.capacity ?? null,
      teacher: c.teacherIds?.[0] ? { _id: c.teacherIds[0]._id, name: c.teacherIds[0].name, photo: c.teacherIds[0].photo } : null,
      teachers: c.teacherIds?.length || 0,
      students: cnt.get(String(c._id)) || 0,
      attendance: { ...m, marked, rate: marked ? Math.round(((m.present || 0) + (m.late || 0)) / marked * 100) : null } as { marked: number; rate: number | null; present?: number; late?: number; absent?: number; excused?: number },
    };
  });
  const tot = items.reduce((t, c) => ({ ok: t.ok + (c.attendance.present || 0) + (c.attendance.late || 0), n: t.n + c.attendance.marked }), { ok: 0, n: 0 });
  const byStage = new Map<string, { ok: number; n: number }>();
  for (const c of items) { const b = byStage.get(c.stage) || { ok: 0, n: 0 }; b.ok += (c.attendance.present || 0) + (c.attendance.late || 0); b.n += c.attendance.marked; byStage.set(c.stage, b); }
  res.json({
    date, items,
    totals: {
      attendanceRate: tot.n ? Math.round(tot.ok / tot.n * 100) : null, marked: tot.n,
      students: items.reduce((t, c) => t + c.students, 0), late: items.reduce((t, c) => t + (c.attendance.late || 0), 0),
      teachers, pendingLeaves: pending,
    },
    byStage: [...byStage].map(([stage, b]) => ({ stage, rate: b.n ? Math.round(b.ok / b.n * 100) : null })),
  });
}));

// Subjects at a glance: who teaches them, where, how many lessons a week, and how students score.
r.get('/subjects-overview', allow('teacher', 'accountant', 'receptionist', 'hr'), wrap(async (req, res) => {
  const id = tenant(req), sid = oid(id);
  const ts = await teacherScope(req);
  const subjects = await Subject.find({ schoolId: id, ...(ts ? { _id: { $in: ts.subjectIds } } : {}) }).sort({ name: 1 }).lean();
  const ids = subjects.map((s) => s._id);
  const [classCount, lessons, scores] = await Promise.all([
    ClassRoom.countDocuments({ schoolId: id }),
    TimetableSlot.aggregate([
      { $match: { schoolId: sid, year: req.school.currentYear, subjectId: { $in: ids } } },
      { $group: { _id: '$subjectId', n: { $sum: 1 }, classes: { $addToSet: '$classId' }, teachers: { $addToSet: '$teacherId' } } },
    ]),
    Mark.aggregate([
      { $match: { schoolId: sid } },
      { $lookup: { from: 'exams', localField: 'examId', foreignField: '_id', as: 'e' } }, { $unwind: '$e' },
      { $match: { 'e.subjectId': { $in: ids } } },
      { $group: { _id: '$e.subjectId', avg: { $avg: { $multiply: [{ $divide: ['$score', '$e.maxScore'] }, 100] } }, marks: { $sum: 1 }, exams: { $addToSet: '$e._id' } } },
    ]),
  ]);
  const l = new Map(lessons.map((x) => [String(x._id), x]));
  const sc = new Map(scores.map((x) => [String(x._id), x]));
  res.json(subjects.map((s) => {
    const t = l.get(String(s._id)), g = sc.get(String(s._id));
    const teachers = new Set([...(s.teacherIds || []).map(String), ...((t?.teachers || []).filter(Boolean).map(String))]);
    const classes = new Set([...(s.classIds || []).map(String), ...((t?.classes || []).map(String))]);
    return {
      _id: s._id, name: s.name, code: s.code,
      teachers: teachers.size, classes: s.classIds?.length || t?.classes?.length ? classes.size : classCount, allClasses: !s.classIds?.length && !t,
      lessons: t?.n || 0, averageScore: g ? Math.round(g.avg) : null, exams: g?.exams.length || 0,
    };
  }));
}));

// Outstanding balances per student (Core: basic fee report)
r.get('/outstanding', allow('accountant', 'receptionist'), wrap(async (req, res) => {
  res.json(await Invoice.aggregate([
    { $match: { schoolId: oid(tenant(req)), status: { $in: ['unpaid', 'partial'] } } },
    { $group: { _id: '$studentId', due: { $sum: { $subtract: ['$total', '$paid'] } }, invoices: { $sum: 1 } } },
    { $lookup: { from: 'students', localField: '_id', foreignField: '_id', as: 's' } }, { $unwind: '$s' },
    { $project: { name: '$s.name', code: '$s.code', phone: '$s.guardian.phone', due: 1, invoices: 1 } }, { $sort: { due: -1 } },
  ]));
}));

// Financial report (Management+): collections vs expenses by month
r.get('/financial', requireModule('financeReports'), allow('accountant'), wrap(async (req, res) => {
  const sid = oid(tenant(req));
  const from = new Date(String(req.query.from || `${new Date().getFullYear()}-01-01`));
  const to = new Date(String(req.query.to || today()) + 'T23:59:59');
  const m = { schoolId: sid, date: { $gte: from, $lte: to } };
  const [inc, exp, byCat] = await Promise.all([
    Payment.aggregate([{ $match: m }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, total: { $sum: '$amount' } } }]),
    Expense.aggregate([{ $match: m }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, total: { $sum: '$amount' } } }]),
    Expense.aggregate([{ $match: m }, { $group: { _id: '$category', total: { $sum: '$amount' } } }, { $sort: { total: -1 } }]),
  ]);
  const months = [...new Set([...inc, ...exp].map((x) => x._id))].sort();
  const get = (a: any[], k: string) => a.find((x) => x._id === k)?.total || 0;
  const rows = months.map((k) => ({ month: k, income: get(inc, k), expenses: get(exp, k), net: get(inc, k) - get(exp, k) }));
  res.json({ rows, expensesByCategory: byCat.map((c) => ({ category: c._id, total: c.total })), totals: { income: rows.reduce((s, x) => s + x.income, 0), expenses: rows.reduce((s, x) => s + x.expenses, 0) } });
}));

// KPI board (Business+)
r.get('/kpi', requireModule('kpi'), allow('accountant', 'hr'), wrap(async (req, res) => {
  const id = tenant(req), sid = oid(id);
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [att, fees, marks, staff, trend] = await Promise.all([
    Attendance.aggregate([{ $match: { schoolId: sid, period: 0, date: { $gte: since } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Invoice.aggregate([{ $match: { schoolId: sid, status: { $ne: 'cancelled' } } }, { $group: { _id: null, total: { $sum: '$total' }, paid: { $sum: '$paid' } } }]),
    Mark.aggregate([{ $match: { schoolId: sid } }, { $lookup: { from: 'exams', localField: 'examId', foreignField: '_id', as: 'e' } }, { $unwind: '$e' }, { $group: { _id: null, avg: { $avg: { $multiply: [{ $divide: ['$score', '$e.maxScore'] }, 100] } } } }]),
    Employee.countDocuments({ schoolId: id, status: 'active' }),
    Attendance.aggregate([{ $match: { schoolId: sid, period: 0, date: { $gte: since } } }, { $group: { _id: '$date', present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } }, total: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);
  const a = Object.fromEntries(att.map((x) => [x._id, x.n])) as Record<string, number>;
  const at = Object.values(a).reduce((s, n) => s + n, 0);
  const f = fees[0] || { total: 0, paid: 0 };
  void Exam;
  res.json({
    attendanceRate: at ? +(((a.present || 0) + (a.late || 0)) / at * 100).toFixed(1) : null,
    collectionRate: f.total ? +(f.paid / f.total * 100).toFixed(1) : null,
    averageScore: marks[0] ? +marks[0].avg.toFixed(1) : null,
    activeStaff: staff,
    attendanceTrend: trend.map((t) => ({ date: t._id, rate: +(t.present / t.total * 100).toFixed(1) })),
  });
}));

export default r;
