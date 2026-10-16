import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env';
import { modulesFor, needsPlan, Plan } from '../config/plans';
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
  photo: u.photo,
  role: u.role,
  schoolId: u.schoolId ? String(u.schoolId) : undefined,
  studentIds: (u.studentIds || []).map(String),
  school: school && {
    id: String(school._id), name: school.name, plan: school.plan, tier: school.tier, maxStudents: school.maxStudents,
    status: school.status, color: school.color, logo: school.logo, modules: modulesFor(school.plan as Plan),
    subscriptionEnds: school.subscriptionEnds, trialUsed: !!school.trialUsed, needsPlan: needsPlan(school),
  },
});

const google = new OAuth2Client();

// Session for a user who passed authentication: blocks suspended schools, stamps lastLogin.
async function startSession(u: any) {
  const school = u.schoolId ? await School.findById(u.schoolId).lean() : undefined;
  if (school?.status === 'suspended') throw new HttpError(403, 'اشتراك المدرسة موقوف');
  u.lastLogin = new Date();
  await u.save();
  return { token: signToken({ id: String(u._id), role: u.role as any, schoolId: u.schoolId ? String(u.schoolId) : undefined }), user: publicUser(u, school) };
}

async function createSchool(d: { schoolName: string; name: string; email: string; phone?: string; passwordHash: string; photo?: string }) {
  // no plan yet: the owner lands on the plans page and is offered the free trial there
  const school = await School.create({ name: d.schoolName, plan: 'core', tier: 100, maxStudents: 100, status: 'pending' });
  const owner = await User.create({
    schoolId: school._id, name: d.name, email: d.email, phone: d.phone || undefined, role: 'owner',
    passwordHash: d.passwordHash, photo: d.photo,
  });
  await ensureChart(String(school._id));
  return { token: signToken({ id: String(owner._id), role: 'owner', schoolId: String(school._id) }), user: publicUser(owner, school) };
}

// Public settings the login page needs.
r.get('/config', (_req, res) => { res.json({ googleClientId: env.googleClientId || null }); });

// Sign in with Google: the browser sends the ID token Google issued. A known email signs straight in;
// an unknown one gets a short-lived sign-up ticket to create a school with.
r.post('/google', limiter, wrap(async (req, res) => {
  if (!env.googleClientId) throw new HttpError(503, 'الدخول بجوجل غير مفعّل');
  const { credential } = z.object({ credential: z.string().min(20) }).parse(req.body);
  const ticket = await google.verifyIdToken({ idToken: credential, audience: env.googleClientId }).catch(() => null);
  const p = ticket?.getPayload();
  if (!p?.email || !p.email_verified) throw new HttpError(401, 'تعذّر التحقق من حساب جوجل');
  const email = p.email.toLowerCase();
  const u = await User.findOne({ email });
  if (u) {
    if (!u.active) throw new HttpError(403, 'الحساب موقوف');
    if (!u.photo && p.picture) u.photo = p.picture;
    return res.json(await startSession(u));
  }
  const signup = jwt.sign({ purpose: 'google-signup', email, name: p.name || email, picture: p.picture }, env.jwtSecret, { expiresIn: '30m' });
  res.json({ signup, profile: { email, name: p.name || '', picture: p.picture || null } });
}));

// Second step for a new Google user: name the school and become its owner.
r.post('/google/register-school', limiter, wrap(async (req, res) => {
  const d = z.object({ signup: z.string(), schoolName: z.string().min(2), name: z.string().min(2), phone: z.string().optional() }).parse(req.body);
  let t: any;
  try { t = jwt.verify(d.signup, env.jwtSecret); } catch { throw new HttpError(401, 'انتهت صلاحية التسجيل، ادخل بجوجل تاني'); }
  if (t.purpose !== 'google-signup') throw new HttpError(401, 'تذكرة تسجيل غير صالحة');
  if (await User.exists({ email: t.email })) throw new HttpError(409, 'البريد مستخدم بالفعل');
  // Google accounts never use this password; it only fills the required field.
  const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
  res.status(201).json(await createSchool({ schoolName: d.schoolName, name: d.name, email: t.email, phone: d.phone, passwordHash, photo: t.picture }));
}));

// Self-service sign-up: creates a school (no plan yet) + its owner.
r.post('/register-school', limiter, wrap(async (req, res) => {
  const d = z.object({
    schoolName: z.string().min(2),
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().optional(),
    password: z.string().min(8),
  }).parse(req.body);
  if (await User.exists({ email: d.email.toLowerCase() })) throw new HttpError(409, 'البريد مستخدم بالفعل');
  res.status(201).json(await createSchool({ ...d, passwordHash: await bcrypt.hash(d.password, 12) }));
}));

// Login by email or phone (parents usually use phone).
r.post('/login', limiter, wrap(async (req, res) => {
  const d = z.object({ login: z.string().min(3), password: z.string().min(1) }).parse(req.body);
  const key = d.login.trim().toLowerCase();
  const u = await User.findOne({ $or: [{ email: key }, { phone: d.login.trim() }] }).select('+passwordHash');
  if (!u || !u.active || !(await bcrypt.compare(d.password, u.passwordHash)))
    throw new HttpError(401, 'بيانات الدخول غير صحيحة');
  res.json(await startSession(u));
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
