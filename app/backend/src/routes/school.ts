import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { modulesFor, Plan, PACKAGES, PRICES, priceFor, TIERS } from '../config/plans';
import { allow, authenticate, requireModule, tenant } from '../middleware/auth';
import * as M from '../models';
import { audit } from '../utils/audit';
import { HttpError, wrap } from '../utils/http';

// ---------- public plans (landing/pricing) ----------
export const plansPublic = Router().get('/', (_q, res) => res.json({ packages: PACKAGES, tiers: TIERS, prices: PRICES, yearlyMultiplier: 10 }));

// ---------- school settings + subscription ----------
export const school = Router();

school.get('/', wrap(async (req, res) => {
  const active = await M.Student.countDocuments({ schoolId: tenant(req), status: 'active' });
  res.json({ ...req.school, activeStudents: active, modules: modulesFor(req.school.plan as Plan), price: priceFor(req.school.tier, req.school.plan, req.school.billingCycle) });
}));

school.put('/', allow(), wrap(async (req, res) => {
  const d = z.object({
    name: z.string().min(2).optional(), phone: z.string().optional(), email: z.string().optional(), address: z.string().optional(),
    currentYear: z.string().optional(), logo: z.string().optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }).parse(req.body);
  if ((d.logo || d.color) && !modulesFor(req.school.plan).includes('branding')) throw new HttpError(402, 'تخصيص الهوية متاح في باقة Enterprise', 'UPGRADE_REQUIRED');
  res.json(await M.School.findByIdAndUpdate(tenant(req), d, { new: true }));
}));

// Upgrade / downgrade at any time. Cannot drop below the active student count.
school.post('/subscription', allow(), wrap(async (req, res) => {
  if (req.user!.role !== 'owner') throw new HttpError(403, 'المالك فقط يستطيع تغيير الاشتراك');
  const d = z.object({ plan: z.enum(['core', 'mgmt', 'biz', 'acad']), tier: z.union([z.literal(100), z.literal(250), z.literal(500), z.literal(1000)]), billingCycle: z.enum(['monthly', 'yearly']) }).parse(req.body);
  const active = await M.Student.countDocuments({ schoolId: tenant(req), status: 'active' });
  if (active > d.tier) throw new HttpError(400, `عدد الطلاب النشطين (${active}) أكبر من الشريحة المختارة`);
  const months = d.billingCycle === 'yearly' ? 12 : 1;
  const s = await M.School.findByIdAndUpdate(tenant(req), {
    plan: d.plan, tier: d.tier, maxStudents: d.tier, billingCycle: d.billingCycle, status: 'active',
    subscriptionEnds: new Date(Date.now() + months * 30 * 864e5),
  }, { new: true });
  audit(req, 'subscription', 'school', s!._id, d);
  res.json({ school: s, price: priceFor(d.tier, d.plan, d.billingCycle) });
}));

// ---------- users & roles ----------
export const users = Router();
users.use(allow());
const STAFF = ['admin', 'teacher', 'accountant', 'hr', 'receptionist'] as const; // staff are unlimited in every plan

users.get('/', wrap(async (req, res) => {
  const q: any = { schoolId: tenant(req), role: req.query.role || { $ne: 'parent' } };
  res.json(await M.User.find(q).select('-deviceTokens').sort({ createdAt: -1 }).limit(500).lean());
}));
users.post('/', wrap(async (req, res) => {
  const d = z.object({ name: z.string().min(2), email: z.string().email().optional(), phone: z.string().optional(), password: z.string().min(8), role: z.enum(STAFF) }).parse(req.body);
  if (!d.email && !d.phone) throw new HttpError(400, 'البريد أو الهاتف مطلوب');
  const u = await M.User.create({ ...d, schoolId: tenant(req), passwordHash: await bcrypt.hash(d.password, 12) });
  audit(req, 'create', 'user', u._id);
  res.status(201).json({ id: u._id, name: u.name, role: u.role });
}));
users.put('/:id', wrap(async (req, res) => {
  const d = z.object({ name: z.string().optional(), role: z.enum(STAFF).optional(), active: z.boolean().optional(), password: z.string().min(8).optional() }).parse(req.body);
  const u = await M.User.findOne({ _id: req.params.id, schoolId: tenant(req) });
  if (!u) throw new HttpError(404, 'غير موجود');
  if (u.role === 'owner') throw new HttpError(403, 'لا يمكن تعديل المالك');
  if (d.name) u.name = d.name;
  if (d.role) u.role = d.role;
  if (d.active !== undefined) u.active = d.active;
  if (d.password) u.passwordHash = await bcrypt.hash(d.password, 12);
  await u.save();
  res.json({ id: u._id });
}));

// ---------- data export / backup ----------
export const exportRouter = Router();
exportRouter.use(allow());
const COLLS: Record<string, any> = { students: M.Student, classes: M.ClassRoom, attendance: M.Attendance, invoices: M.Invoice, payments: M.Payment, expenses: M.Expense, exams: M.Exam, marks: M.Mark };

exportRouter.get('/backup', wrap(async (req, res) => {
  if (req.user!.role !== 'owner' && req.user!.role !== 'admin') throw new HttpError(403, 'غير مصرح');
  const schoolId = tenant(req);
  const out: any = { exportedAt: new Date(), school: req.school };
  for (const [k, m] of Object.entries(COLLS)) out[k] = await m.find({ schoolId }).lean();
  res.setHeader('Content-Disposition', `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(out);
}));

const csvCell = (v: any) => {
  let s = v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // CSV/Excel formula injection guard
  return `"${s.replace(/"/g, '""')}"`;
};
exportRouter.get('/:what.csv', wrap(async (req, res) => {
  const schoolId = tenant(req);
  const w = req.params.what;
  let rows: any[][];
  if (w === 'students') {
    const s = await M.Student.find({ schoolId }).populate('classId', 'name section').lean();
    rows = [['الكود', 'الاسم', 'الفصل', 'الحالة', 'ولي الأمر', 'الهاتف'], ...s.map((x: any) => [x.code, x.name, x.classId ? `${x.classId.name} ${x.classId.section || ''}` : '', x.status, x.guardian?.name, x.guardian?.phone])];
  } else if (w === 'invoices') {
    requireModule('fees');
    const s = await M.Invoice.find({ schoolId }).populate('studentId', 'name').lean();
    rows = [['رقم', 'الطالب', 'الإجمالي', 'المدفوع', 'الحالة'], ...s.map((x: any) => [x.number, x.studentId?.name, x.total, x.paid, x.status])];
  } else throw new HttpError(404, 'غير معروف');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${w}.csv"`);
  res.send('﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'));
}));

// ---------- platform super-admin ----------
export const superadmin = Router();
superadmin.use((req, _res, next) => (req.user?.role === 'superadmin' ? next() : next(new HttpError(403, 'غير مصرح'))));
superadmin.get('/schools', wrap(async (_q, res) => {
  const schools = await M.School.find().sort({ createdAt: -1 }).lean();
  const counts = await M.Student.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$schoolId', n: { $sum: 1 } } }]);
  const c = new Map(counts.map((x) => [String(x._id), x.n]));
  res.json(schools.map((s) => ({ ...s, activeStudents: c.get(String(s._id)) || 0, price: priceFor(s.tier, s.plan as Plan, s.billingCycle as any) })));
}));
superadmin.put('/schools/:id', wrap(async (req, res) => {
  const d = z.object({ status: z.enum(['trial', 'active', 'suspended']).optional(), plan: z.enum(['core', 'mgmt', 'biz', 'acad', 'ent']).optional(), maxStudents: z.number().int().positive().optional(), tier: z.number().optional(), subscriptionEnds: z.coerce.date().optional() }).parse(req.body);
  const s = await M.School.findByIdAndUpdate(req.params.id, d, { new: true });
  if (!s) throw new HttpError(404, 'غير موجود');
  res.json(s);
}));

export const authMw = authenticate;
