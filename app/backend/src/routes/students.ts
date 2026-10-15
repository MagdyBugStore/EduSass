import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { env } from '../config/env';
import { allow, requireModule, tenant } from '../middleware/auth';
import { Attendance, Invoice, Mark, Student, StudentDocument, User } from '../models';
import { audit } from '../utils/audit';
import { crud } from '../utils/crud';
import { HttpError, wrap } from '../utils/http';
import { assertTeacherClass, teacherClassFilter } from '../utils/scope';
import { photoSchema } from '../utils/photo';
import { nextStudentCode } from '../utils/services';

const guardian = z.object({
  name: z.string().optional(), phone: z.string().optional(), email: z.string().optional(),
  relation: z.string().optional(), job: z.string().optional(),
}).optional();

const schema = z.object({
  name: z.string().min(2),
  gender: z.enum(['male', 'female']).optional(),
  birthDate: z.coerce.date().optional(),
  nationalId: z.string().optional(),
  classId: z.string().optional(),
  status: z.enum(['active', 'graduated', 'archived', 'withdrawn']).optional(),
  guardian,
  address: z.string().optional(),
  notes: z.string().optional(),
});

const ROLES = ['receptionist'] as const;

/** Only ACTIVE students count against the plan tier. */
async function assertCapacity(req: Request, adding = 1) {
  const active = await Student.countDocuments({ schoolId: tenant(req), status: 'active' });
  if (active + adding > req.school.maxStudents)
    throw new HttpError(402, `تجاوزت حد الباقة (${req.school.maxStudents} طالب نشط). قم بترقية الشريحة.`, 'TIER_LIMIT');
}

const base = crud(Student, {
  name: 'student',
  module: 'students',
  read: ['teacher', 'accountant', 'hr', ...ROLES],
  write: [...ROLES],
  schema,
  search: ['name', 'code', 'guardian.phone', 'nationalId'],
  filters: ['classId', 'status'],
  populate: { path: 'classId', select: 'stage name section' },
  beforeCreate: async (req, data) => {
    if ((data.status || 'active') === 'active') await assertCapacity(req);
    data.code = await nextStudentCode(data.schoolId);
    return data;
  },
  beforeUpdate: async (req, data) => {
    if (data.status === 'active') {
      const cur = await Student.findOne({ _id: req.params.id, schoolId: tenant(req) }).lean();
      if (cur && cur.status !== 'active') await assertCapacity(req);
    }
    return data;
  },
  scope: (req) => teacherClassFilter(req),
  beforeDelete: async (_req, doc: any) => {
    if (await Invoice.exists({ studentId: doc._id })) throw new HttpError(409, 'للطالب فواتير. قم بأرشفته بدلاً من الحذف.');
  },
});

const r = Router();

// Full profile: student + attendance summary + invoices + marks
r.get('/:id/profile', allow('teacher', 'accountant', 'receptionist'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const s = await Student.findOne({ _id: req.params.id, schoolId }).populate('classId', 'stage name section').lean();
  if (!s) throw new HttpError(404, 'غير موجود');
  await assertTeacherClass(req, (s.classId as any)?._id);
  const [att, invoices, marks, parents] = await Promise.all([
    Attendance.aggregate([{ $match: { schoolId: s.schoolId, studentId: s._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Invoice.find({ schoolId, studentId: s._id }).sort({ createdAt: -1 }).lean(),
    Mark.find({ schoolId, studentId: s._id }).populate({ path: 'examId', select: 'name maxScore subjectId term date', populate: { path: 'subjectId', select: 'name' } }).lean(),
    User.find({ schoolId, role: 'parent', studentIds: s._id }).select('name phone email').lean(),
  ]);
  res.json({ student: s, attendance: Object.fromEntries(att.map((a) => [a._id, a.n])), invoices, marks, parents });
}));

// Profile photo (small data: URL); receptionist/admin
r.put('/:id/photo', allow('receptionist'), wrap(async (req, res) => {
  const { photo } = photoSchema.parse(req.body);
  const s = await Student.findOneAndUpdate({ _id: req.params.id, schoolId: tenant(req) }, photo ? { photo } : { $unset: { photo: 1 } }, { new: true }).select('_id').lean();
  if (!s) throw new HttpError(404, 'غير موجود');
  audit(req, 'photo', 'student', s._id);
  res.json({ ok: true });
}));

// Create/link a parent account for the guardian (Business: parent portal)
r.post('/:id/parent-account', requireModule('parentPortal'), allow('receptionist'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const s = await Student.findOne({ _id: req.params.id, schoolId });
  if (!s) throw new HttpError(404, 'غير موجود');
  const d = z.object({ name: z.string().optional(), phone: z.string().min(8).optional(), email: z.string().email().optional() }).parse(req.body);
  const phone = d.phone || s.guardian?.phone;
  if (!phone) throw new HttpError(400, 'رقم هاتف ولي الأمر مطلوب');
  let parent = await User.findOne({ phone });
  let password: string | undefined;
  if (parent) {
    if (String(parent.schoolId) !== schoolId || parent.role !== 'parent') throw new HttpError(409, 'الرقم مستخدم في حساب آخر');
    if (!parent.studentIds.some((i) => String(i) === String(s._id))) parent.studentIds.push(s._id);
    await parent.save();
  } else {
    password = crypto.randomBytes(4).toString('hex'); // shown once to the admin
    parent = await User.create({
      schoolId, role: 'parent', name: d.name || s.guardian?.name || 'ولي أمر', phone, email: d.email,
      passwordHash: await bcrypt.hash(password, 12), studentIds: [s._id],
    });
  }
  audit(req, 'parent-account', 'student', s._id);
  res.status(201).json({ parentId: parent._id, phone, password });
}));

// ---- Documents (Management+) ----
const dir = path.resolve(env.uploadDir);
fs.mkdirSync(dir, { recursive: true });
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (_q, f, cb) => cb(null, `${crypto.randomUUID()}${path.extname(f.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_q, f, cb) => (ALLOWED.has(f.mimetype) ? cb(null, true) : cb(new Error('نوع الملف غير مدعوم') as any, false)),
});

r.get('/:id/documents', requireModule('documents'), allow('teacher', 'accountant', 'receptionist'), wrap(async (req, res) => {
  await assertTeacherClass(req, (await Student.findOne({ _id: req.params.id, schoolId: tenant(req) }).select('classId').lean())?.classId);
  res.json(await StudentDocument.find({ schoolId: tenant(req), studentId: req.params.id }).sort({ createdAt: -1 }).lean());
}));

r.post('/:id/documents', requireModule('documents'), allow('receptionist'), upload.single('file'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  if (!req.file) throw new HttpError(400, 'الملف مطلوب');
  if (!(await Student.exists({ _id: req.params.id, schoolId }))) throw new HttpError(404, 'غير موجود');
  const doc = await StudentDocument.create({
    schoolId, studentId: req.params.id, title: req.body.title || req.file.originalname,
    file: req.file.filename, mime: req.file.mimetype, size: req.file.size, uploadedBy: req.user!.id,
  });
  res.status(201).json(doc);
}));

// Authenticated download (files are NOT served statically)
r.get('/documents/:docId/file', requireModule('documents'), allow('teacher', 'accountant', 'receptionist'), wrap(async (req, res) => {
  const d = await StudentDocument.findOne({ _id: req.params.docId, schoolId: tenant(req) }).lean();
  if (!d) throw new HttpError(404, 'غير موجود');
  await assertTeacherClass(req, (await Student.findById(d.studentId).select('classId').lean())?.classId);
  res.sendFile(path.join(dir, path.basename(d.file)));
}));

r.delete('/documents/:docId', requireModule('documents'), allow('receptionist'), wrap(async (req, res) => {
  const d = await StudentDocument.findOneAndDelete({ _id: req.params.docId, schoolId: tenant(req) });
  if (d) fs.promises.unlink(path.join(dir, path.basename(d.file))).catch(() => {});
  res.json({ ok: true });
}));

// Promote a whole class to another (new academic year)
r.post('/promote', allow('receptionist'), wrap(async (req, res) => {
  const d = z.object({ fromClassId: z.string(), toClassId: z.string().nullable(), graduate: z.boolean().optional() }).parse(req.body);
  const filter = { schoolId: tenant(req), classId: d.fromClassId, status: 'active' };
  const upd = d.graduate ? { status: 'graduated' } : { classId: d.toClassId };
  const out = await Student.updateMany(filter, upd);
  res.json({ modified: out.modifiedCount });
}));

r.use('/', base);
export default r;
