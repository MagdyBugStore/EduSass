import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { modulesFor, Plan } from '../config/plans';
import { authenticate, signToken } from '../middleware/auth';
import { School, User } from '../models';
import { ensureChart } from '../utils/services';
import { HttpError, wrap } from '../utils/http';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const publicUser = (u: any, school?: any) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  schoolId: u.schoolId ? String(u.schoolId) : undefined,
  studentIds: (u.studentIds || []).map(String),
  school: school && {
    id: String(school._id), name: school.name, plan: school.plan, tier: school.tier, maxStudents: school.maxStudents,
    status: school.status, color: school.color, logo: school.logo, modules: modulesFor(school.plan as Plan),
  },
});

// Self-service sign-up: creates a school on Core (trial) + its owner.
r.post('/register-school', limiter, wrap(async (req, res) => {
  const d = z.object({
    schoolName: z.string().min(2),
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().optional(),
    password: z.string().min(8),
  }).parse(req.body);
  if (await User.exists({ email: d.email.toLowerCase() })) throw new HttpError(409, 'البريد مستخدم بالفعل');
  const school = await School.create({
    name: d.schoolName, plan: 'core', tier: 100, maxStudents: 100, status: 'trial',
    subscriptionEnds: new Date(Date.now() + 14 * 864e5),
  });
  const owner = await User.create({
    schoolId: school._id, name: d.name, email: d.email, phone: d.phone || undefined, role: 'owner',
    passwordHash: await bcrypt.hash(d.password, 12),
  });
  await ensureChart(String(school._id));
  res.status(201).json({ token: signToken({ id: String(owner._id), role: 'owner', schoolId: String(school._id) }), user: publicUser(owner, school) });
}));

// Login by email or phone (parents usually use phone).
r.post('/login', limiter, wrap(async (req, res) => {
  const d = z.object({ login: z.string().min(3), password: z.string().min(1) }).parse(req.body);
  const key = d.login.trim().toLowerCase();
  const u = await User.findOne({ $or: [{ email: key }, { phone: d.login.trim() }] }).select('+passwordHash');
  if (!u || !u.active || !(await bcrypt.compare(d.password, u.passwordHash)))
    throw new HttpError(401, 'بيانات الدخول غير صحيحة');
  const school = u.schoolId ? await School.findById(u.schoolId).lean() : undefined;
  if (school?.status === 'suspended') throw new HttpError(403, 'اشتراك المدرسة موقوف');
  u.lastLogin = new Date();
  await u.save();
  res.json({ token: signToken({ id: String(u._id), role: u.role as any, schoolId: u.schoolId ? String(u.schoolId) : undefined }), user: publicUser(u, school) });
}));

r.get('/me', authenticate, wrap(async (req, res) => {
  const u = await User.findById(req.user!.id).lean();
  res.json(publicUser(u, req.school));
}));

r.post('/change-password', authenticate, wrap(async (req, res) => {
  const d = z.object({ current: z.string(), password: z.string().min(8) }).parse(req.body);
  const u = await User.findById(req.user!.id).select('+passwordHash');
  if (!u || !(await bcrypt.compare(d.current, u.passwordHash))) throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة');
  u.passwordHash = await bcrypt.hash(d.password, 12);
  await u.save();
  res.json({ ok: true });
}));

// Mobile: register FCM token
r.post('/device-token', authenticate, wrap(async (req, res) => {
  const { token } = z.object({ token: z.string().min(10) }).parse(req.body);
  await User.updateOne({ _id: req.user!.id }, { $addToSet: { deviceTokens: token } });
  res.json({ ok: true });
}));

export default r;
export { publicUser };
