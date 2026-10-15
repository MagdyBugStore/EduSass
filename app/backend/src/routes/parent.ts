import { NextFunction, Request, Response, Router } from 'express';
import { requireModule } from '../middleware/auth';
import { Attendance, Exam, Invoice, Mark, Notification, Payment, Student, Announcement } from '../models';
import { HttpError, wrap } from '../utils/http';

/** Parent portal API. Parents can ONLY see students linked to their own account. */
const r = Router();
r.use(requireModule('parentPortal'));
r.use((req: Request, _res: Response, next: NextFunction) =>
  req.user?.role === 'parent' ? next() : next(new HttpError(403, 'لأولياء الأمور فقط')));

const child = async (req: Request) => {
  const id = req.params.id;
  if (!req.user!.studentIds.includes(id)) throw new HttpError(403, 'غير مصرح');
  const s = await Student.findOne({ _id: id, schoolId: req.user!.schoolId }).populate('classId', 'stage name section').lean();
  if (!s) throw new HttpError(404, 'غير موجود');
  return s;
};

r.get('/children', wrap(async (req, res) => {
  const kids = await Student.find({ _id: { $in: req.user!.studentIds }, schoolId: req.user!.schoolId }).populate('classId', 'stage name section').select('name code classId gender status').lean();
  const dues = await Invoice.aggregate([
    { $match: { studentId: { $in: kids.map((k) => k._id) }, status: { $in: ['unpaid', 'partial'] } } },
    { $group: { _id: '$studentId', due: { $sum: { $subtract: ['$total', '$paid'] } } } },
  ]);
  const d = new Map(dues.map((x) => [String(x._id), x.due]));
  res.json(kids.map((k) => ({ ...k, due: d.get(String(k._id)) || 0 })));
}));

r.get('/children/:id/overview', wrap(async (req, res) => {
  const s = await child(req);
  const [att, last, due] = await Promise.all([
    Attendance.aggregate([{ $match: { studentId: s._id, period: 0 } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Mark.find({ studentId: s._id }).sort({ createdAt: -1 }).limit(3).populate({ path: 'examId', select: 'name maxScore subjectId', populate: { path: 'subjectId', select: 'name' } }).lean(),
    Invoice.aggregate([{ $match: { studentId: s._id, status: { $in: ['unpaid', 'partial'] } } }, { $group: { _id: null, due: { $sum: { $subtract: ['$total', '$paid'] } } } }]),
  ]);
  res.json({ student: s, attendance: Object.fromEntries(att.map((a) => [a._id, a.n])), latestMarks: last, due: due[0]?.due || 0 });
}));

r.get('/children/:id/attendance', wrap(async (req, res) => {
  const s = await child(req);
  const month = String(req.query.month || '');
  const q: any = { studentId: s._id, period: 0 };
  if (/^\d{4}-\d{2}$/.test(month)) q.date = { $regex: `^${month}` };
  res.json(await Attendance.find(q).sort({ date: -1 }).limit(200).select('date status reason').lean());
}));

r.get('/children/:id/marks', wrap(async (req, res) => {
  const s = await child(req);
  const marks = await Mark.find({ studentId: s._id }).populate({ path: 'examId', select: 'name maxScore term date subjectId', populate: { path: 'subjectId', select: 'name' } }).lean();
  res.json(marks.sort((a: any, b: any) => +new Date(b.examId?.date || 0) - +new Date(a.examId?.date || 0)));
}));

r.get('/children/:id/invoices', wrap(async (req, res) => {
  const s = await child(req);
  const invoices = await Invoice.find({ studentId: s._id, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).lean();
  const payments = await Payment.find({ studentId: s._id }).sort({ date: -1 }).select('amount date method receiptNo invoiceId').lean();
  res.json({ invoices, payments });
}));

r.get('/notifications', wrap(async (req, res) => {
  res.json(await Notification.find({ userId: req.user!.id, channel: 'app' }).sort({ createdAt: -1 }).limit(100).lean());
}));
r.post('/notifications/:id/read', wrap(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, userId: req.user!.id }, { readAt: new Date() });
  res.json({ ok: true });
}));
r.post('/notifications/read-all', wrap(async (req, res) => {
  await Notification.updateMany({ userId: req.user!.id, readAt: null }, { readAt: new Date() });
  res.json({ ok: true });
}));

r.get('/announcements', wrap(async (req, res) => {
  res.json(await Announcement.find({ schoolId: req.user!.schoolId }).sort({ createdAt: -1 }).limit(50).select('title body createdAt').lean());
}));

void Exam;
export default r;
