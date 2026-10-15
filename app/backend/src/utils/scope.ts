import { Request } from 'express';
import { tenant } from '../middleware/auth';
import { ClassRoom, Subject, TimetableSlot } from '../models';
import { HttpError } from './http';

export interface TeacherScope { classIds: string[]; subjectIds: string[] }

/**
 * What a teacher is allowed to touch: classes they are assigned to (class.teacherIds),
 * classes of subjects they teach (subject.teacherIds), and anything on their timetable.
 * Returns null for every other role (no restriction). Cached per request.
 */
export async function teacherScope(req: Request): Promise<TeacherScope | null> {
  if (req.user?.role !== 'teacher') return null;
  const cached = (req as any)._teacherScope as TeacherScope | undefined;
  if (cached) return cached;
  const schoolId = tenant(req), me = req.user.id;
  const [cls, subs, slots] = await Promise.all([
    ClassRoom.find({ schoolId, teacherIds: me }).select('_id').lean(),
    Subject.find({ schoolId, teacherIds: me }).select('_id classIds').lean(),
    TimetableSlot.find({ schoolId, teacherId: me }).select('classId subjectId').lean(),
  ]);
  const classIds = new Set<string>([
    ...cls.map((c) => String(c._id)),
    ...subs.flatMap((s) => (s.classIds || []).map(String)),
    ...slots.map((s) => String(s.classId)),
  ]);
  const subjectIds = new Set<string>([...subs.map((s) => String(s._id)), ...slots.map((s) => String(s.subjectId))]);
  const scope = { classIds: [...classIds], subjectIds: [...subjectIds] };
  (req as any)._teacherScope = scope;
  return scope;
}

/** Throws 403 when a teacher reaches for a class that is not theirs. No-op for other roles. */
export async function assertTeacherClass(req: Request, classId: unknown) {
  const s = await teacherScope(req);
  if (s && !s.classIds.includes(String(classId))) throw new HttpError(403, 'الفصل ده مش من فصولك');
}

/** Mongo filter fragment limiting `field` to the teacher's classes (null for other roles). */
export async function teacherClassFilter(req: Request, field = 'classId') {
  const s = await teacherScope(req);
  return s ? { [field]: { $in: s.classIds } } : null;
}
