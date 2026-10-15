import { Request, Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { hasModule, Plan } from '../config/plans';
import { tenant } from '../middleware/auth';
import { ClassRoom, Period, StudentNote, Subject, TimetableSlot, User } from '../models';
import { audit } from '../utils/audit';
import { HttpError, wrap } from '../utils/http';
import { photoSchema } from '../utils/photo';
import { teacherCompliance } from './timetable';

/** Teachers directory and CV-style profiles. Managers and HR see all; a teacher sees and edits their own. */
const r = Router();
const SAFE = '-passwordHash -deviceTokens -studentIds';
const isMgr = (req: Request) => ['owner', 'admin', 'superadmin'].includes(req.user!.role);
const canSeeAll = (req: Request) => isMgr(req) || req.user!.role === 'hr';
const className = (c: any) => (c ? `${c.name} ${c.section || ''}`.trim() : '');

async function findTeacher(req: Request) {
  const t = await User.findOne({ _id: req.params.id, schoolId: tenant(req), role: 'teacher' }).select(SAFE).lean();
  if (!t) throw new HttpError(404, 'المعلم غير موجود');
  if (!canSeeAll(req) && String(t._id) !== req.user!.id) throw new HttpError(403, 'تقدر تشوف ملفك بس');
  return t;
}

r.get('/', wrap(async (req, res) => {
  if (!canSeeAll(req)) throw new HttpError(403, 'ليس لديك صلاحية');
  const schoolId = tenant(req);
  const q = String(req.query.q || '').trim();
  const filter: any = { schoolId, role: 'teacher' };
  if (q) filter.name = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [teachers, subjects, load] = await Promise.all([
    User.find(filter).select(SAFE).sort({ active: -1, name: 1 }).lean(),
    Subject.find({ schoolId }).select('name teacherIds').lean(),
    TimetableSlot.aggregate([
      { $match: { schoolId: new Types.ObjectId(schoolId), year: req.school.currentYear, teacherId: { $ne: null } } },
      { $group: { _id: '$teacherId', lessons: { $sum: 1 }, classes: { $addToSet: '$classId' } } },
    ]),
  ]);
  const l = new Map(load.map((x) => [String(x._id), x]));
  const items = teachers.map((t) => ({
    ...t,
    subjects: subjects.filter((s) => s.teacherIds?.some((id) => String(id) === String(t._id))).map((s) => s.name),
    lessons: l.get(String(t._id))?.lessons || 0,
    classes: l.get(String(t._id))?.classes.length || 0,
  }));
  res.json({ items, total: items.length, page: 1, limit: items.length });
}));

r.get('/:id', wrap(async (req, res) => {
  const t = await findTeacher(req);
  const schoolId = tenant(req);
  const [subjects, classes, slots, periods, notes] = await Promise.all([
    Subject.find({ schoolId, teacherIds: t._id }).populate('classIds', 'name section').select('name classIds').lean(),
    ClassRoom.find({ schoolId, teacherIds: t._id }).select('name section stage').sort({ stage: 1, name: 1 }).lean(),
    TimetableSlot.find({ schoolId, year: req.school.currentYear, teacherId: t._id })
      .populate('classId', 'name section').populate('subjectId', 'name').sort({ day: 1, period: 1 }).lean(),
    Period.find({ schoolId }).sort({ number: 1 }).lean(),
    StudentNote.countDocuments({ schoolId, teacherId: t._id }),
  ]);
  let compliance = null;
  if (hasModule(req.school.plan as Plan, 'teacherPortal')) {
    const to = new Date(), from = new Date(Date.now() - 29 * 864e5);
    compliance = (await teacherCompliance(req, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10), String(t._id)))[0] || null;
  }
  res.json({
    teacher: t,
    subjects: subjects.map((s: any) => ({ _id: s._id, name: s.name, classes: (s.classIds || []).map(className) })),
    classes: classes.map((c) => ({ _id: c._id, name: className(c), stage: c.stage })),
    timetable: { slots, periods, days: req.school.schoolDays ?? [0, 1, 2, 3, 4] },
    stats: { lessons: slots.length, classes: new Set(slots.map((s: any) => String(s.classId?._id))).size || classes.length, subjects: subjects.length, notes },
    compliance,
    canEdit: isMgr(req) || String(t._id) === req.user!.id,
  });
}));

const profileSchema = z.object({
  name: z.string().trim().min(2).optional(),
  phone: z.string().trim().max(30).optional(),
  profile: z.object({
    title: z.string().trim().max(80).optional(), specialization: z.string().trim().max(80).optional(),
    qualification: z.string().trim().max(160).optional(), experienceYears: z.number().int().min(0).max(60).optional(),
    bio: z.string().trim().max(1500).optional(), hireDate: z.coerce.date().optional(),
  }).optional(),
});

r.put('/:id', wrap(async (req, res) => {
  const t = await findTeacher(req);
  if (!isMgr(req) && String(t._id) !== req.user!.id) throw new HttpError(403, 'ليس لديك صلاحية');
  const d = profileSchema.parse(req.body);
  const set: any = {};
  if (d.name) set.name = d.name;
  if (d.phone !== undefined) set.phone = d.phone || undefined;
  for (const [k, v] of Object.entries(d.profile || {})) set[`profile.${k}`] = v;
  const u = await User.findByIdAndUpdate(t._id, { $set: set }, { new: true, runValidators: true }).select(SAFE).lean();
  audit(req, 'update', 'teacher', t._id);
  res.json(u);
}));

r.put('/:id/photo', wrap(async (req, res) => {
  const t = await findTeacher(req);
  if (!isMgr(req) && String(t._id) !== req.user!.id) throw new HttpError(403, 'ليس لديك صلاحية');
  const { photo } = photoSchema.parse(req.body);
  await User.updateOne({ _id: t._id }, photo ? { photo } : { $unset: { photo: 1 } });
  audit(req, 'photo', 'teacher', t._id);
  res.json({ ok: true });
}));

export default r;
