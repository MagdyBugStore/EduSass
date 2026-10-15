import { Router } from 'express';
import { Types } from 'mongoose';
import { allow, requireModule, tenant } from '../middleware/auth';
import { Attendance, ClassRoom, Employee, Expense, Invoice, Mark, Exam, Payment, Student } from '../models';
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
