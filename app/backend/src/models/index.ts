// Barrel file: defines every model. Each tenant-owned doc carries schoolId.
import { Schema, Types, model } from 'mongoose';

const opts = { timestamps: true } as const;
const oid = (ref: string, extra: object = {}) => ({ type: Schema.Types.ObjectId, ref, ...extra });
const tenantIdx = <T extends Schema>(s: T) => s;

export const School = model('School', new Schema({
  name: { type: String, required: true },
  phone: String, email: String, address: String, logo: String, color: String,
  plan: { type: String, enum: ['core', 'mgmt', 'biz', 'ent'], default: 'core' },
  tier: { type: Number, default: 100 },
  maxStudents: { type: Number, default: 100 },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  status: { type: String, enum: ['trial', 'active', 'suspended'], default: 'trial' },
  subscriptionEnds: Date,
  currentYear: { type: String, default: '2026/2027' },
  studentSeq: { type: Number, default: 0 },
  invoiceSeq: { type: Number, default: 0 },
  receiptSeq: { type: Number, default: 0 },
}, opts));

export const User = model('User', new Schema({
  schoolId: oid('School', { index: true }),
  name: { type: String, required: true },
  email: { type: String, lowercase: true, trim: true, sparse: true, unique: true },
  phone: { type: String, trim: true, sparse: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['superadmin', 'owner', 'admin', 'teacher', 'accountant', 'hr', 'receptionist', 'parent'], required: true },
  active: { type: Boolean, default: true },
  studentIds: [oid('Student')],
  deviceTokens: [String],
  lastLogin: Date,
}, opts));

export const ClassRoom = model('ClassRoom', tenantIdx(new Schema({
  schoolId: oid('School', { required: true, index: true }),
  stage: { type: String, required: true }, // e.g. ابتدائي
  name: { type: String, required: true }, // e.g. الصف الأول
  section: { type: String, default: '' }, // الشعبة
  year: String,
  teacherIds: [oid('User')],
  capacity: Number,
}, opts)));

export const Subject = model('Subject', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  name: { type: String, required: true },
  classIds: [oid('ClassRoom')],
  teacherIds: [oid('User')],
}, opts));

export const Student = model('Student', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  code: String,
  name: { type: String, required: true },
  gender: { type: String, enum: ['male', 'female'] },
  birthDate: Date,
  nationalId: String,
  classId: oid('ClassRoom', { index: true }),
  status: { type: String, enum: ['active', 'graduated', 'archived', 'withdrawn'], default: 'active', index: true },
  guardian: { name: String, phone: String, email: String, relation: String, job: String },
  address: String,
  notes: String,
  joinedAt: { type: Date, default: Date.now },
}, opts).index({ schoolId: 1, code: 1 }, { unique: true, sparse: true }));

export const Attendance = model('Attendance', new Schema({
  schoolId: oid('School', { required: true }),
  studentId: oid('Student', { required: true }),
  classId: oid('ClassRoom', { required: true }),
  date: { type: String, required: true }, // YYYY-MM-DD
  period: { type: Number, default: 0 }, // 0 = daily; >0 per-lesson (Management+)
  status: { type: String, enum: ['present', 'absent', 'late', 'excused'], required: true },
  reason: String,
  markedBy: oid('User'),
}, opts).index({ schoolId: 1, studentId: 1, date: 1, period: 1 }, { unique: true }).index({ schoolId: 1, classId: 1, date: 1 }));

export const Exam = model('Exam', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  name: { type: String, required: true },
  classId: oid('ClassRoom', { required: true }),
  subjectId: oid('Subject', { required: true }),
  term: String,
  date: Date,
  maxScore: { type: Number, default: 100 },
}, opts));

export const Mark = model('Mark', new Schema({
  schoolId: oid('School', { required: true }),
  examId: oid('Exam', { required: true }),
  studentId: oid('Student', { required: true }),
  score: { type: Number, required: true },
  notes: String,
}, opts).index({ examId: 1, studentId: 1 }, { unique: true }));

export const Discount = model('Discount', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  name: { type: String, required: true },
  type: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  value: { type: Number, required: true },
}, opts));

const installment = new Schema({ dueDate: Date, amount: Number, paid: { type: Number, default: 0 } }, { _id: true });

export const Invoice = model('Invoice', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  studentId: oid('Student', { required: true, index: true }),
  number: String,
  year: String,
  items: [{ title: String, kind: { type: String, default: 'tuition' }, amount: Number }],
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  discountNote: String,
  total: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  status: { type: String, enum: ['unpaid', 'partial', 'paid', 'cancelled'], default: 'unpaid', index: true },
  dueDate: Date,
  installments: [installment],
}, opts).index({ schoolId: 1, number: 1 }, { unique: true, sparse: true }));

export const Payment = model('Payment', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  invoiceId: oid('Invoice', { required: true, index: true }),
  studentId: oid('Student', { required: true, index: true }),
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, enum: ['cash', 'bank', 'card', 'wallet'], default: 'cash' },
  date: { type: Date, default: Date.now },
  receiptNo: String,
  note: String,
  receivedBy: oid('User'),
}, opts));

export const Expense = model('Expense', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  category: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, default: Date.now },
  vendor: String,
  description: String,
  createdBy: oid('User'),
}, opts));

export const StudentDocument = model('StudentDocument', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  studentId: oid('Student', { required: true, index: true }),
  title: { type: String, required: true },
  file: { type: String, required: true },
  mime: String,
  size: Number,
  uploadedBy: oid('User'),
}, opts));

// ---- Accounting (Business) ----
export const Account = model('Account', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  code: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['asset', 'liability', 'equity', 'revenue', 'expense'], required: true },
}, opts).index({ schoolId: 1, code: 1 }, { unique: true }));

export const JournalEntry = model('JournalEntry', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  date: { type: Date, default: Date.now },
  memo: String,
  ref: String, // e.g. payment:<id>
  lines: [{ accountId: oid('Account', { required: true }), debit: { type: Number, default: 0 }, credit: { type: Number, default: 0 } }],
  createdBy: oid('User'),
}, opts));

// ---- HR (Business) ----
export const Employee = model('Employee', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  userId: oid('User'),
  name: { type: String, required: true },
  jobTitle: String,
  phone: String,
  nationalId: String,
  baseSalary: { type: Number, default: 0 },
  hireDate: Date,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, opts));

export const StaffAttendance = model('StaffAttendance', new Schema({
  schoolId: oid('School', { required: true }),
  employeeId: oid('Employee', { required: true }),
  date: { type: String, required: true },
  checkIn: String,
  checkOut: String,
  status: { type: String, enum: ['present', 'absent', 'late', 'leave'], default: 'present' },
}, opts).index({ schoolId: 1, employeeId: 1, date: 1 }, { unique: true }));

export const LeaveRequest = model('LeaveRequest', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  employeeId: oid('Employee', { required: true }),
  type: { type: String, enum: ['annual', 'sick', 'unpaid', 'other'], default: 'annual' },
  from: { type: Date, required: true },
  to: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  note: String,
  decidedBy: oid('User'),
}, opts));

export const Payroll = model('Payroll', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  month: { type: String, required: true }, // YYYY-MM
  items: [{ employeeId: oid('Employee'), name: String, base: Number, additions: { type: Number, default: 0 }, deductions: { type: Number, default: 0 }, net: Number }],
  total: Number,
  status: { type: String, enum: ['draft', 'paid'], default: 'draft' },
}, opts).index({ schoolId: 1, month: 1 }, { unique: true }));

// ---- Comms ----
export const Notification = model('Notification', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  userId: oid('User', { index: true }), // recipient (parent/staff); null = broadcast
  studentId: oid('Student'),
  title: { type: String, required: true },
  body: String,
  type: { type: String, enum: ['absence', 'fee', 'exam', 'announcement', 'general'], default: 'general' },
  channel: { type: String, enum: ['app', 'whatsapp'], default: 'app' },
  readAt: Date,
}, opts));

export const Announcement = model('Announcement', new Schema({
  schoolId: oid('School', { required: true, index: true }),
  title: { type: String, required: true },
  body: String,
  classId: oid('ClassRoom'), // null = whole school
  createdBy: oid('User'),
}, opts));

export const AuditLog = model('AuditLog', new Schema({
  schoolId: oid('School', { index: true }),
  userId: oid('User'),
  action: String,
  entity: String,
  entityId: Schema.Types.Mixed,
  meta: Schema.Types.Mixed,
}, opts));

export type Id = Types.ObjectId;
