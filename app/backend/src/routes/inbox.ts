import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { hasModule, Plan } from '../config/plans';
import { tenant } from '../middleware/auth';
import { Announcement, Attendance, Invoice, LeaveRequest, Period, Student, TimetableSlot } from '../models';
import { wrap } from '../utils/http';

/**
 * The staff bell: a feed built for the caller's role from live data.
 * Alerts (things to act on) come first; announcements follow. `at` lets the browser track what's new.
 */
interface Item { id: string; kind: 'alert' | 'warning' | 'info' | 'announcement'; title: string; body?: string; link?: string; at: string }

const r = Router();
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

r.get('/', wrap(async (req, res) => {
  const schoolId = tenant(req), sid = new Types.ObjectId(schoolId);
  const q = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), now: z.string().regex(/^\d{2}:\d{2}$/) }).parse(req.query);
  const role = req.user!.role, plan = req.school.plan as Plan;
  const mgr = role === 'owner' || role === 'admin';
  const items: Item[] = [];
  const startOfDay = new Date(`${q.date}T00:00:00`).toISOString();

  // teacher: lessons that ended today without an attendance sheet
  if (role === 'teacher' && hasModule(plan, 'teacherPortal')) {
    const day = new Date(`${q.date}T12:00:00Z`).getUTCDay();
    const [slots, periods] = await Promise.all([
      TimetableSlot.find({ schoolId, year: req.school.currentYear, teacherId: req.user!.id, day }).populate('classId', 'name section').lean() as Promise<any[]>,
      Period.find({ schoolId }).lean(),
    ]);
    const ended = slots.filter((s) => { const p = periods.find((x) => x.number === s.period); return p && mins(p.end) <= mins(q.now); });
    if (ended.length) {
      const done = await Attendance.aggregate([
        { $match: { schoolId: sid, date: q.date, period: { $in: ended.map((s) => s.period) }, classId: { $in: ended.map((s) => s.classId._id) } } },
        { $group: { _id: { c: '$classId', p: '$period' } } },
      ]);
      const has = new Set(done.map((d) => `${d._id.c}:${d._id.p}`));
      const late = ended.filter((s) => !has.has(`${s.classId._id}:${s.period}`));
      if (late.length) items.push({
        id: `att-${q.date}`, kind: 'alert', link: '/',
        title: late.length === 1 ? 'كشف حضور ما اتسجلش' : `${late.length} كشوف حضور ما اتسجلتش`,
        body: late.map((s) => `الحصة ${s.period} مع ${s.classId.name} ${s.classId.section || ''}`.trim()).join('، '),
        at: startOfDay,
      });
    }
  }

  // HR / management: leave requests waiting for a decision
  if ((mgr || role === 'hr') && hasModule(plan, 'hr')) {
    const pending = await LeaveRequest.find({ schoolId, status: 'pending' }).sort({ createdAt: -1 }).select('createdAt').lean();
    if (pending.length) items.push({ id: `leave-${pending.length}-${pending[0].createdAt?.toISOString()}`, kind: 'warning', title: `${pending.length} طلب إجازة مستني قرار`, link: '/hr', at: pending[0].createdAt!.toISOString() });
  }

  // finance: unpaid balances
  if (mgr || role === 'accountant') {
    const due = await Invoice.aggregate([
      { $match: { schoolId: sid, status: { $in: ['unpaid', 'partial'] } } },
      { $group: { _id: null, n: { $sum: 1 }, due: { $sum: { $subtract: ['$total', '$paid'] } }, last: { $max: '$createdAt' } } },
    ]);
    if (due[0]?.n) items.push({
      id: `due-${due[0].n}-${Math.round(due[0].due)}`, kind: 'info', link: '/reports',
      title: `${due[0].n} فاتورة عليها مستحقات`, body: `الإجمالي ${Math.round(due[0].due).toLocaleString('en-US')} ج.م`, at: due[0].last.toISOString(),
    });
  }

  // owner/admin: plan capacity and renewal
  if (mgr) {
    const active = await Student.countDocuments({ schoolId, status: 'active' });
    const max = req.school.maxStudents;
    if (max && active / max >= 0.9) items.push({
      id: `cap-${active}-${max}`, kind: active >= max ? 'alert' : 'warning', link: '/subscription', at: startOfDay,
      title: active >= max ? 'وصلت لحد الطلاب في الباقة' : 'قربت توصل لحد الطلاب في الباقة', body: `${active} طالب نشط من ${max}`,
    });
    const ends = req.school.subscriptionEnds ? new Date(req.school.subscriptionEnds) : null;
    if (ends) {
      const left = Math.ceil((ends.getTime() - Date.now()) / 864e5);
      if (left <= 7) items.push({
        id: `sub-${ends.toISOString().slice(0, 10)}`, kind: left <= 0 ? 'alert' : 'warning', link: '/subscription', at: startOfDay,
        title: left <= 0 ? 'الاشتراك انتهى' : `الاشتراك بينتهي بعد ${left} ${left === 1 ? 'يوم' : 'أيام'}`,
      });
    }
  }

  // everyone: latest announcements
  const news = await Announcement.find({ schoolId }).sort({ createdAt: -1 }).limit(8).select('title body createdAt').lean();
  for (const a of news) items.push({ id: `ann-${a._id}`, kind: 'announcement', title: a.title, body: a.body || undefined, link: '/announcements', at: (a as any).createdAt.toISOString() });

  res.json(items);
}));

export default r;
