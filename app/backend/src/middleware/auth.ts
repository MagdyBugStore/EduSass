import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { hasModule, Plan } from '../config/plans';
import { School, User } from '../models';
import { HttpError, wrap } from '../utils/http';

export type Role = 'superadmin' | 'owner' | 'admin' | 'teacher' | 'accountant' | 'hr' | 'receptionist' | 'parent';
export const STAFF_ROLES: Role[] = ['owner', 'admin', 'teacher', 'accountant', 'hr', 'receptionist'];

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role; schoolId?: string; name: string; studentIds: string[] };
      school?: any;
    }
  }
}

export const signToken = (u: { id: string; role: Role; schoolId?: string }) =>
  jwt.sign(u, env.jwtSecret, { expiresIn: env.jwtExpires as any });

export const authenticate = wrap(async (req, _res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) throw new HttpError(401, 'غير مصرح');
  let payload: any;
  try {
    payload = jwt.verify(h.slice(7), env.jwtSecret);
  } catch {
    throw new HttpError(401, 'الجلسة منتهية');
  }
  const u = await User.findById(payload.id).lean();
  if (!u || !u.active) throw new HttpError(401, 'الحساب غير متاح');
  req.user = {
    id: String(u._id),
    role: u.role as Role,
    schoolId: u.schoolId ? String(u.schoolId) : undefined,
    name: u.name,
    studentIds: (u.studentIds || []).map(String),
  };
  if (u.schoolId) {
    const s = await School.findById(u.schoolId).lean();
    if (!s) throw new HttpError(401, 'المدرسة غير موجودة');
    if (s.status === 'suspended') throw new HttpError(403, 'اشتراك المدرسة موقوف', 'SUSPENDED');
    req.school = s;
  }
  next();
});

/** Owner/admin/superadmin always pass; others must be listed. */
export const allow =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const r = req.user?.role;
    if (!r) return next(new HttpError(401, 'غير مصرح'));
    if (r === 'superadmin' || r === 'owner' || r === 'admin' || roles.includes(r)) return next();
    next(new HttpError(403, 'ليس لديك صلاحية'));
  };

export const staffOnly = (req: Request, _res: Response, next: NextFunction) =>
  req.user && req.user.role !== 'parent' && req.user.role !== 'superadmin'
    ? next()
    : next(new HttpError(403, 'ليس لديك صلاحية'));

export const requireModule = (module: string) => (req: Request, _res: Response, next: NextFunction) => {
  const plan = (req.school?.plan || 'core') as Plan;
  if (!hasModule(plan, module)) return next(new HttpError(402, 'هذه الميزة غير متاحة في باقتك الحالية', 'UPGRADE_REQUIRED'));
  next();
};

export const tenant = (req: Request) => {
  if (!req.user?.schoolId) throw new HttpError(403, 'لا توجد مدرسة مرتبطة');
  return req.user.schoolId;
};
