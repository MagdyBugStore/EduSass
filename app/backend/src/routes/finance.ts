import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { hasModule, Plan } from '../config/plans';
import { allow, tenant } from '../middleware/auth';
import { Discount, Expense, Invoice, Payment, School, Student } from '../models';
import { audit } from '../utils/audit';
import { crud } from '../utils/crud';
import { HttpError, pageParams, wrap } from '../utils/http';
import { notifyGuardians, postJournal } from '../utils/services';

const FIN = ['accountant'] as const;
const item = z.object({ title: z.string().min(1), kind: z.string().default('tuition'), amount: z.number().positive() });

// ---------------- Invoices ----------------
export const invoices = Router();

// Fees dashboard: collected vs outstanding, today's payments, what falls due soon, the year by month,
// latest payments and the students who owe most. `date` comes from the browser (the school's local day).
invoices.get('/overview', allow(...FIN, 'receptionist'), wrap(async (req, res) => {
  const schoolId = tenant(req), sid = new Types.ObjectId(schoolId);
  const q = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.query);
  const day = q.date ? new Date(`${q.date}T00:00:00`) : new Date(new Date().setHours(0, 0, 0, 0));
  const dayEnd = new Date(day.getTime() + 864e5);
  const soon = new Date(day.getTime() + 30 * 864e5);
  const yearAgo = new Date(day.getFullYear(), day.getMonth() - 11, 1);

  const [totals, today, open, income, spend, recent] = await Promise.all([
    Invoice.aggregate([{ $match: { schoolId: sid, status: { $ne: 'cancelled' } } }, { $group: { _id: null, billed: { $sum: '$total' }, paid: { $sum: '$paid' }, n: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { schoolId: sid, date: { $gte: day, $lt: dayEnd } } }, { $group: { _id: null, n: { $sum: 1 }, sum: { $sum: '$amount' }, last: { $max: '$createdAt' } } }]),
    Invoice.find({ schoolId, status: { $in: ['unpaid', 'partial'] } }).select('studentId total paid dueDate installments number').lean(),
    Payment.aggregate([{ $match: { schoolId: sid, date: { $gte: yearAgo } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, sum: { $sum: '$amount' } } }]),
    hasModule(req.school.plan as Plan, 'expenses')
      ? Expense.aggregate([{ $match: { schoolId: sid, date: { $gte: yearAgo } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, sum: { $sum: '$amount' } } }])
      : Promise.resolve(null),
    Payment.find({ schoolId }).sort({ date: -1, createdAt: -1 }).limit(8)
      .populate('studentId', 'name code photo').populate('invoiceId', 'number status items').lean(),
  ]);

  // what is still owed, and when: installments when the invoice has them, otherwise the invoice due date
  const dues: { date: Date; amount: number; studentId: string; number?: string | null }[] = [];
  for (const inv of open) {
    const left = inv.total - inv.paid;
    if (inv.installments?.length) {
      for (const ins of inv.installments) if (ins.dueDate && (ins.amount || 0) - (ins.paid || 0) > 0.005)
        dues.push({ date: ins.dueDate, amount: (ins.amount || 0) - (ins.paid || 0), studentId: String(inv.studentId), number: inv.number });
    } else if (inv.dueDate) dues.push({ date: inv.dueDate, amount: left, studentId: String(inv.studentId), number: inv.number });
  }
  const upcoming = dues.filter((d) => d.date >= day && d.date < soon).sort((a, b) => +a.date - +b.date);
  const overdue = dues.filter((d) => d.date < day);

  // students who owe most
  const owed = new Map<string, { total: number; paid: number; invoices: number }>();
  for (const inv of open) {
    const k = String(inv.studentId), o = owed.get(k) || { total: 0, paid: 0, invoices: 0 };
    o.total += inv.total; o.paid += inv.paid; o.invoices++; owed.set(k, o);
  }
  const topIds = [...owed].sort((a, b) => (b[1].total - b[1].paid) - (a[1].total - a[1].paid)).slice(0, 6);
  const studs = await Student.find({ _id: { $in: topIds.map(([k]) => k) } }).select('name code photo').lean();
  const studById = new Map(studs.map((x) => [String(x._id), x]));

  const months: { month: string; income: number; expenses: number | null }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(day.getFullYear(), day.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ month: k, income: income.find((x) => x._id === k)?.sum || 0, expenses: spend ? spend.find((x) => x._id === k)?.sum || 0 : null });
  }
  const t = totals[0] || { billed: 0, paid: 0, n: 0 };
  res.json({
    totals: { billed: t.billed, paid: t.paid, outstanding: t.billed - t.paid, invoices: t.n, open: open.length },
    today: { count: today[0]?.n || 0, sum: today[0]?.sum || 0, last: today[0]?.last || null },
    upcoming: { count: upcoming.length, sum: upcoming.reduce((x, d) => x + d.amount, 0), next: upcoming[0]?.date || null },
    overdue: { count: overdue.length, sum: overdue.reduce((x, d) => x + d.amount, 0) },
    months, hasExpenses: spend !== null,
    recent: recent.map((p: any) => ({
      _id: p._id, date: p.date, amount: p.amount, method: p.method, receiptNo: p.receiptNo,
      student: p.studentId && { _id: p.studentId._id, name: p.studentId.name, code: p.studentId.code, photo: p.studentId.photo },
      invoice: p.invoiceId && { _id: p.invoiceId._id, number: p.invoiceId.number, status: p.invoiceId.status, kinds: [...new Set((p.invoiceId.items || []).map((i: any) => i.kind))] },
    })),
    topDue: topIds.map(([k, o]) => ({ student: studById.get(k), total: o.total, paid: o.paid, due: o.total - o.paid, invoices: o.invoices })).filter((x) => x.student),
  });
}));

invoices.get('/', allow(...FIN, 'receptionist'), wrap(async (req, res) => {
  const q: any = { schoolId: tenant(req) };
  for (const f of ['studentId', 'status', 'year']) if (req.query[f]) q[f] = req.query[f];
  const { page, limit, skip } = pageParams(req.query);
  const [items, total] = await Promise.all([
    Invoice.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('studentId', 'name code photo').lean(),
    Invoice.countDocuments(q),
  ]);
  res.json({ items, total, page, limit });
}));

invoices.get('/:id', allow(...FIN, 'receptionist'), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const inv = await Invoice.findOne({ _id: req.params.id, schoolId }).populate('studentId', 'name code guardian').lean();
  if (!inv) throw new HttpError(404, 'غير موجود');
  res.json({ invoice: inv, payments: await Payment.find({ schoolId, invoiceId: inv._id }).sort({ date: -1 }).lean() });
}));

const recalc = (inv: any) => {
  inv.subtotal = inv.items.reduce((s: number, i: any) => s + i.amount, 0);
  inv.total = Math.max(0, inv.subtotal - (inv.discount || 0));
  const unpaid = inv.total - inv.paid;
  inv.status = inv.status === 'cancelled' ? 'cancelled' : unpaid <= 0.005 ? 'paid' : inv.paid > 0 ? 'partial' : 'unpaid';
};

invoices.post('/', allow(...FIN), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const plan = req.school.plan as Plan;
  const adv = hasModule(plan, 'exams'); // advanced fees = Management+
  const d = z.object({
    studentId: z.string(), year: z.string().optional(), dueDate: z.coerce.date().optional(),
    items: z.array(item).min(1),
    discountId: z.string().optional(), discount: z.number().min(0).optional(), discountNote: z.string().optional(),
    installments: z.array(z.object({ dueDate: z.coerce.date(), amount: z.number().positive() })).optional(),
  }).parse(req.body);
  if (!adv && (d.discountId || d.discount || d.installments?.length || d.items.length > 1 || d.items.some((i) => i.kind !== 'tuition')))
    throw new HttpError(402, 'الخصومات والأقساط وأنواع الرسوم المتعددة متاحة من باقة Management', 'UPGRADE_REQUIRED');
  const st = await Student.findOne({ _id: d.studentId, schoolId }).lean();
  if (!st) throw new HttpError(404, 'الطالب غير موجود');

  const subtotal = d.items.reduce((s, i) => s + i.amount, 0);
  let discount = d.discount || 0;
  if (d.discountId) {
    const dc = await Discount.findOne({ _id: d.discountId, schoolId }).lean();
    if (!dc) throw new HttpError(404, 'الخصم غير موجود');
    discount = dc.type === 'percent' ? subtotal * dc.value / 100 : dc.value;
  }
  discount = Math.min(discount, subtotal);
  const total = subtotal - discount;
  if (d.installments && Math.abs(d.installments.reduce((s, i) => s + i.amount, 0) - total) > 0.01)
    throw new HttpError(400, 'مجموع الأقساط لا يساوي إجمالي الفاتورة');

  const sch = await School.findByIdAndUpdate(schoolId, { $inc: { invoiceSeq: 1 } }, { new: true }).lean();
  const inv = await Invoice.create({
    schoolId, studentId: d.studentId, year: d.year || req.school.currentYear, dueDate: d.dueDate, items: d.items,
    subtotal, discount, discountNote: d.discountNote, total, installments: d.installments || [],
    number: `INV-${String(sch!.invoiceSeq).padStart(6, '0')}`,
  });
  await postJournal(req.school, `فاتورة ${inv.number}`, `invoice:${inv._id}`, [{ code: '1100', debit: total }, { code: '4000', credit: total }], req.user!.id);
  audit(req, 'create', 'invoice', inv._id);
  res.status(201).json(inv);
}));

invoices.post('/:id/cancel', allow(...FIN), wrap(async (req, res) => {
  const inv = await Invoice.findOne({ _id: req.params.id, schoolId: tenant(req) });
  if (!inv) throw new HttpError(404, 'غير موجود');
  if (inv.paid > 0) throw new HttpError(409, 'الفاتورة عليها مدفوعات');
  inv.status = 'cancelled';
  await inv.save();
  await postJournal(req.school, `إلغاء فاتورة ${inv.number}`, `invoice-cancel:${inv._id}`, [{ code: '4000', debit: inv.total }, { code: '1100', credit: inv.total }]);
  res.json(inv);
}));

// ---------------- Payments ----------------
export const payments = Router();

payments.get('/', allow(...FIN), wrap(async (req, res) => {
  const q: any = { schoolId: tenant(req) };
  if (req.query.studentId) q.studentId = req.query.studentId;
  if (req.query.from || req.query.to) q.date = { ...(req.query.from && { $gte: new Date(String(req.query.from)) }), ...(req.query.to && { $lte: new Date(String(req.query.to) + 'T23:59:59') }) };
  const { page, limit, skip } = pageParams(req.query);
  const [items, total] = await Promise.all([
    Payment.find(q).sort({ date: -1 }).skip(skip).limit(limit).populate('studentId', 'name code photo').populate('invoiceId', 'number status items').lean(),
    Payment.countDocuments(q),
  ]);
  res.json({ items, total, page, limit });
}));

payments.post('/', allow(...FIN), wrap(async (req, res) => {
  const schoolId = tenant(req);
  const d = z.object({
    invoiceId: z.string(), amount: z.number().positive(),
    method: z.enum(['cash', 'bank', 'card', 'wallet']).default('cash'), date: z.coerce.date().optional(), note: z.string().optional(),
  }).parse(req.body);

  const inv = await Invoice.findOne({ _id: d.invoiceId, schoolId });
  if (!inv) throw new HttpError(404, 'الفاتورة غير موجودة');
  if (inv.status === 'cancelled') throw new HttpError(409, 'الفاتورة ملغاة');
  const remaining = inv.total - inv.paid;
  if (d.amount > remaining + 0.005) throw new HttpError(400, `المبلغ أكبر من المتبقي (${remaining})`);

  // atomic guard against concurrent over-payment
  const upd = await Invoice.findOneAndUpdate({ _id: inv._id, paid: inv.paid }, { $inc: { paid: d.amount } }, { new: true });
  if (!upd) throw new HttpError(409, 'تم تحديث الفاتورة، أعد المحاولة');
  recalc(upd);
  // allocate to installments in order
  let left = d.amount;
  for (const ins of upd.installments) { const room = ins.amount! - (ins.paid || 0); const t = Math.min(room, left); ins.paid = (ins.paid || 0) + t; left -= t; if (left <= 0) break; }
  await upd.save();

  const sch = await School.findByIdAndUpdate(schoolId, { $inc: { receiptSeq: 1 } }, { new: true }).lean();
  const pay = await Payment.create({
    schoolId, invoiceId: inv._id, studentId: inv.studentId, amount: d.amount, method: d.method, date: d.date, note: d.note,
    receiptNo: `R-${String(sch!.receiptSeq).padStart(6, '0')}`, receivedBy: req.user!.id,
  });
  await postJournal(req.school, `سداد ${pay.receiptNo}`, `payment:${pay._id}`,
    [{ code: d.method === 'cash' ? '1000' : '1010', debit: d.amount }, { code: '1100', credit: d.amount }], req.user!.id);
  const st = await Student.findById(inv.studentId).select('name guardian.phone').lean();
  if (st) notifyGuardians(req.school, String(inv.studentId), { title: 'تم استلام دفعة', body: `تم استلام ${d.amount} ج.م من رسوم ${st.name} (إيصال ${pay.receiptNo})`, type: 'fee', guardianPhone: st.guardian?.phone ?? undefined }).catch(() => {});
  audit(req, 'create', 'payment', pay._id);
  res.status(201).json({ payment: pay, invoice: upd });
}));

// ---------------- Discounts & Expenses (Management+) ----------------
export const discounts = crud(Discount, {
  name: 'discount', module: 'exams', read: ['accountant'], write: ['accountant'],
  schema: z.object({ name: z.string().min(1), type: z.enum(['percent', 'fixed']), value: z.number().positive() }),
});

export const expenses = crud(Expense, {
  name: 'expense', module: 'expenses', read: ['accountant'], write: ['accountant'],
  schema: z.object({ category: z.string().min(1), amount: z.number().positive(), date: z.coerce.date().optional(), vendor: z.string().optional(), description: z.string().optional() }),
  search: ['category', 'vendor', 'description'], filters: ['category'], sort: { date: -1 },
  beforeCreate: (req, data) => ({ ...data, createdBy: req.user!.id }),
  afterCreate: (req, doc) => postJournal(req.school, `مصروف: ${doc.category}`, `expense:${doc._id}`, [{ code: '5000', debit: doc.amount }, { code: '1000', credit: doc.amount }], req.user!.id),
});

