import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { allow, requireModule, tenant } from '../middleware/auth';
import { Account, Announcement, Employee, JournalEntry, LeaveRequest, Notification, Payroll, StaffAttendance, Student, User } from '../models';
import { crud } from '../utils/crud';
import { HttpError, wrap } from '../utils/http';
import { ensureChart, notifyGuardians, postJournal } from '../utils/services';

const oid = (s: string) => new Types.ObjectId(s);

// ---------------- Accounting (Business) ----------------
export const accounting = Router();
accounting.use(requireModule('accounting'), allow('accountant'));

accounting.get('/accounts', wrap(async (req, res) => {
  const id = tenant(req);
  await ensureChart(id);
  res.json(await Account.find({ schoolId: id }).sort({ code: 1 }).lean());
}));
accounting.post('/accounts', wrap(async (req, res) => {
  const d = z.object({ code: z.string().min(1), name: z.string().min(1), type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']) }).parse(req.body);
  res.status(201).json(await Account.create({ ...d, schoolId: tenant(req) }));
}));

accounting.get('/journal', wrap(async (req, res) => {
  const q: any = { schoolId: tenant(req) };
  if (req.query.from || req.query.to) q.date = { ...(req.query.from && { $gte: new Date(String(req.query.from)) }), ...(req.query.to && { $lte: new Date(String(req.query.to) + 'T23:59:59') }) };
  res.json(await JournalEntry.find(q).sort({ date: -1 }).limit(200).populate('lines.accountId', 'code name').lean());
}));

accounting.post('/journal', wrap(async (req, res) => {
  const d = z.object({
    date: z.coerce.date().optional(), memo: z.string().optional(),
    lines: z.array(z.object({ accountId: z.string(), debit: z.number().min(0).default(0), credit: z.number().min(0).default(0) })).min(2),
  }).parse(req.body);
  const dr = d.lines.reduce((s, l) => s + l.debit, 0), cr = d.lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(dr - cr) > 0.005 || dr === 0) throw new HttpError(400, 'القيد غير متوازن');
  const schoolId = tenant(req);
  const n = await Account.countDocuments({ schoolId, _id: { $in: d.lines.map((l) => l.accountId) } });
  if (n !== new Set(d.lines.map((l) => l.accountId)).size) throw new HttpError(400, 'حساب غير صحيح');
  res.status(201).json(await JournalEntry.create({ ...d, schoolId, createdBy: req.user!.id }));
}));

accounting.get('/trial-balance', wrap(async (req, res) => {
  const schoolId = oid(tenant(req));
  const to = req.query.to ? new Date(String(req.query.to) + 'T23:59:59') : new Date();
  const rows = await JournalEntry.aggregate([
    { $match: { schoolId, date: { $lte: to } } }, { $unwind: '$lines' },
    { $group: { _id: '$lines.accountId', debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
  ]);
  const m = new Map(rows.map((r) => [String(r._id), r]));
  const accts = await Account.find({ schoolId }).sort({ code: 1 }).lean();
  const out = accts.map((a) => { const r = m.get(String(a._id)); const debit = r?.debit || 0, credit = r?.credit || 0; return { code: a.code, name: a.name, type: a.type, debit, credit, balance: debit - credit }; });
  res.json({ rows: out, totalDebit: out.reduce((s, r) => s + r.debit, 0), totalCredit: out.reduce((s, r) => s + r.credit, 0) });
}));

// ---------------- HR & payroll (Business) ----------------
export const employees = Router();
employees.use(requireModule('hr'));

employees.use('/attendance', Router()
  .get('/', allow('hr'), wrap(async (req, res) => {
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);
    const schoolId = tenant(req);
    const [emps, recs] = await Promise.all([Employee.find({ schoolId, status: 'active' }).sort({ name: 1 }).lean(), StaffAttendance.find({ schoolId, date }).lean()]);
    const m = new Map(recs.map((r) => [String(r.employeeId), r]));
    res.json(emps.map((e) => ({ employeeId: e._id, name: e.name, jobTitle: e.jobTitle, status: m.get(String(e._id))?.status ?? null, checkIn: m.get(String(e._id))?.checkIn, checkOut: m.get(String(e._id))?.checkOut })));
  }))
  .post('/', allow('hr'), wrap(async (req, res) => {
    const schoolId = tenant(req);
    const d = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), records: z.array(z.object({ employeeId: z.string(), status: z.enum(['present', 'absent', 'late', 'leave']), checkIn: z.string().optional(), checkOut: z.string().optional() })) }).parse(req.body);
    const valid = new Set((await Employee.find({ schoolId }).select('_id').lean()).map((e) => String(e._id)));
    const recs = d.records.filter((r) => valid.has(r.employeeId));
    await StaffAttendance.bulkWrite(recs.map((r) => ({ updateOne: { filter: { schoolId, employeeId: r.employeeId, date: d.date }, update: { $set: { status: r.status, checkIn: r.checkIn, checkOut: r.checkOut } }, upsert: true } })));
    res.json({ saved: recs.length });
  })));

employees.use('/leaves', Router()
  .use(crud(LeaveRequest, {
    name: 'leave', read: ['hr'], write: ['hr'], populate: { path: 'employeeId', select: 'name jobTitle' }, filters: ['status', 'employeeId'],
    schema: z.object({ employeeId: z.string(), type: z.enum(['annual', 'sick', 'unpaid', 'other']).default('annual'), from: z.coerce.date(), to: z.coerce.date(), note: z.string().optional() }),
    beforeCreate: (_r, d) => { if (d.to < d.from) throw new HttpError(400, 'تاريخ النهاية قبل البداية'); },
  }))
  .post('/:id/decide', allow('hr'), wrap(async (req, res) => {
    const { status } = z.object({ status: z.enum(['approved', 'rejected']) }).parse(req.body);
    const l = await LeaveRequest.findOneAndUpdate({ _id: req.params.id, schoolId: tenant(req), status: 'pending' }, { status, decidedBy: req.user!.id }, { new: true });
    if (!l) throw new HttpError(404, 'الطلب غير موجود أو تم البت فيه');
    res.json(l);
  })));

// Payroll (Business). Unpaid-leave days & absences deducted automatically.
export const payroll = Router();
payroll.use(requireModule('payroll'), allow('hr', 'accountant'));
payroll.get('/', wrap(async (req, res) => res.json(await Payroll.find({ schoolId: tenant(req) }).sort({ month: -1 }).lean())));
payroll.get('/:month', wrap(async (req, res) => {
  const p = await Payroll.findOne({ schoolId: tenant(req), month: req.params.month }).lean();
  if (!p) throw new HttpError(404, 'غير موجود');
  res.json(p);
}));

payroll.post('/generate', wrap(async (req, res) => {
  const schoolId = tenant(req);
  const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.body);
  if (await Payroll.exists({ schoolId, month, status: 'paid' })) throw new HttpError(409, 'تم صرف رواتب هذا الشهر');
  const emps = await Employee.find({ schoolId, status: 'active' }).lean();
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const absences = await StaffAttendance.aggregate([
    { $match: { schoolId: oid(schoolId), date: { $regex: `^${month}` }, status: 'absent' } }, { $group: { _id: '$employeeId', n: { $sum: 1 } } },
  ]);
  const abs = new Map(absences.map((a) => [String(a._id), a.n]));
  const items = emps.map((e) => {
    const deductions = +((e.baseSalary / days) * (abs.get(String(e._id)) || 0)).toFixed(2);
    return { employeeId: e._id, name: e.name, base: e.baseSalary, additions: 0, deductions, net: +(e.baseSalary - deductions).toFixed(2) };
  });
  const doc = await Payroll.findOneAndUpdate({ schoolId, month }, { items, total: items.reduce((s, i) => s + i.net, 0), status: 'draft' }, { upsert: true, new: true });
  res.json(doc);
}));

// Adjust additions/deductions on a draft
payroll.put('/:month', wrap(async (req, res) => {
  const d = z.object({ items: z.array(z.object({ employeeId: z.string(), additions: z.number().min(0), deductions: z.number().min(0) })) }).parse(req.body);
  const p = await Payroll.findOne({ schoolId: tenant(req), month: req.params.month });
  if (!p) throw new HttpError(404, 'غير موجود');
  if (p.status === 'paid') throw new HttpError(409, 'تم الصرف');
  for (const u of d.items) {
    const it = p.items.find((i) => String(i.employeeId) === u.employeeId);
    if (it) { it.additions = u.additions; it.deductions = u.deductions; it.net = +((it.base || 0) + u.additions - u.deductions).toFixed(2); }
  }
  p.total = p.items.reduce((s, i) => s + (i.net || 0), 0);
  await p.save();
  res.json(p);
}));

payroll.post('/:month/pay', wrap(async (req, res) => {
  const p = await Payroll.findOneAndUpdate({ schoolId: tenant(req), month: req.params.month, status: 'draft' }, { status: 'paid' }, { new: true });
  if (!p) throw new HttpError(409, 'غير موجود أو تم صرفه');
  await postJournal(req.school, `رواتب ${p.month}`, `payroll:${p._id}`, [{ code: '5100', debit: p.total! }, { code: '1000', credit: p.total! }], req.user!.id);
  res.json(p);
}));

employees.use('/', crud(Employee, {
  name: 'employee', read: ['hr', 'accountant'], write: ['hr'], search: ['name', 'jobTitle', 'phone'], filters: ['status'],
  schema: z.object({ name: z.string().min(2), jobTitle: z.string().optional(), phone: z.string().optional(), nationalId: z.string().optional(), baseSalary: z.number().min(0).default(0), hireDate: z.coerce.date().optional(), status: z.enum(['active', 'inactive']).optional(), userId: z.string().optional() }),
}));

// ---------------- Announcements & notifications ----------------
export const announcements = Router();
announcements.use(requireModule('notifications'));
announcements.use('/', crud(Announcement, {
  name: 'announcement', read: ['teacher', 'accountant', 'hr', 'receptionist'], write: ['receptionist', 'teacher'], sort: { createdAt: -1 },
  schema: z.object({ title: z.string().min(1), body: z.string().optional(), classId: z.string().optional() }),
  beforeCreate: (req, d) => ({ ...d, createdBy: req.user!.id }),
  afterCreate: async (req, doc: any) => {
    const f: any = { schoolId: doc.schoolId, status: 'active' };
    if (doc.classId) f.classId = doc.classId;
    const studs = await Student.find(f).select('_id guardian.phone').lean();
    const parents = await User.find({ schoolId: doc.schoolId, role: 'parent', studentIds: { $in: studs.map((s) => s._id) }, active: true }).select('_id studentIds').lean();
    if (parents.length) await Notification.insertMany(parents.map((p) => ({ schoolId: doc.schoolId, userId: p._id, title: doc.title, body: doc.body, type: 'announcement' })));
    void notifyGuardians;
  },
}));
