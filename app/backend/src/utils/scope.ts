import { Request } from 'express';
import { tenant } from '../middleware/auth';
import { ClassRoom, Subject, TimetableSlot } from '../models';
import { HttpError } from './http';

/** A teacher teaches `subjectId` to `classId`. */
export interface Pair { classId: string; subjectId: string }
export interface TeacherScope { classIds: string[]; subjectIds: string[]; pairs: Pair[] }

/**
 * What a teacher is allowed to touch. The same subject is often split between teachers by class
 * (math: Khaled for 1A, Mona for 2A), so rights are worked out per (class, subject) pair:
 *  1. timetable lessons they teach,
 *  2. per-class subject assignments (subject.assignments),
 *  3. legacy fallback: listed on a subject (subject.teacherIds) that has no per-class assignments
 *     and isn't on their timetable -> all of that subject's classes.
 * Being listed on a class (class.teacherIds) opens the class (roster, attendance) but no subject's exams.
 * Returns null for every other role (no restriction). Cached per request.
 */
export async function teacherScope(req: Request): Promise<TeacherScope | null> {
  if (req.user?.role !== 'teacher') return null;
  const cached = (req as any)._teacherScope as TeacherScope | undefined;
  if (cached) return cached;
  const schoolId = tenant(req), me = req.user.id;
  const [cls, subs, slots] = await Promise.all([
    ClassRoom.find({ schoolId, teacherIds: me }).select('_id').lean(),
    Subject.find({ schoolId, $or: [{ teacherIds: me }, { 'assignments.teacherId': me }] }).select('_id classIds assignments').lean(),
    TimetableSlot.find({ schoolId, teacherId: me }).select('classId subjectId').lean(),
  ]);
  const pairs = new Map<string, Pair>();
  const add = (classId: unknown, subjectId: unknown) => pairs.set(`${classId}:${subjectId}`, { classId: String(classId), subjectId: String(subjectId) });
  for (const s of slots) add(s.classId, s.subjectId);
  for (const sub of subs) {
    const all = sub.assignments || [];
    const mine = all.filter((a) => String(a.teacherId) === me);
    for (const a of mine) add(a.classId, sub._id);
    const onTimetable = slots.some((s) => String(s.subjectId) === String(sub._id));
    if (!all.length && !onTimetable) for (const c of sub.classIds || []) add(c, sub._id);
  }
  const list = [...pairs.values()];
  const scope = {
    pairs: list,
    classIds: [...new Set([...cls.map((c) => String(c._id)), ...list.map((p) => p.classId)])],
    subjectIds: [...new Set([...subs.map((s) => String(s._id)), ...list.map((p) => p.subjectId)])],
  };
  (req as any)._teacherScope = scope;
  return scope;
}

/** Throws 403 when a teacher reaches for a class that is not theirs. No-op for other roles. */
export async function assertTeacherClass(req: Request, classId: unknown) {
  const s = await teacherScope(req);
  if (s && !s.classIds.includes(String(classId))) throw new HttpError(403, 'الفصل ده مش من فصولك');
}

/** Throws 403 unless the teacher teaches this subject to this class (exams and marks). */
export async function assertTeacherPair(req: Request, classId: unknown, subjectId: unknown) {
  const s = await teacherScope(req);
  if (s && !s.pairs.some((p) => p.classId === String(classId) && p.subjectId === String(subjectId)))
    throw new HttpError(403, 'المادة دي في الفصل ده مش معاك');
}

/** Mongo filter fragment limiting `field` to the teacher's classes (null for other roles). */
export async function teacherClassFilter(req: Request, field = 'classId') {
  const s = await teacherScope(req);
  return s ? { [field]: { $in: s.classIds } } : null;
}

/** Mongo filter limiting class+subject documents (exams) to the teacher's pairs (null for other roles). */
export async function teacherPairFilter(req: Request) {
  const s = await teacherScope(req);
  if (!s) return null;
  return s.pairs.length ? { $or: s.pairs.map((p) => ({ classId: p.classId, subjectId: p.subjectId })) } : { _id: null };
}
