import { Types } from 'mongoose';
import { env } from '../config/env';
import { hasModule, Plan } from '../config/plans';
import { Account, JournalEntry, Notification, School, User } from '../models';

// ---------- Accounting ----------
const DEFAULT_CHART: [string, string, string][] = [
  ['1000', 'الصندوق', 'asset'],
  ['1010', 'البنك', 'asset'],
  ['1100', 'مستحقات رسوم الطلاب', 'asset'],
  ['2000', 'مستحقات الموردين', 'liability'],
  ['2100', 'رواتب مستحقة', 'liability'],
  ['3000', 'رأس المال', 'equity'],
  ['4000', 'إيرادات الرسوم الدراسية', 'revenue'],
  ['4100', 'إيرادات أخرى', 'revenue'],
  ['5000', 'مصروفات تشغيلية', 'expense'],
  ['5100', 'الرواتب', 'expense'],
];

export async function ensureChart(schoolId: string) {
  if (await Account.exists({ schoolId })) return;
  await Account.insertMany(DEFAULT_CHART.map(([code, name, type]) => ({ schoolId, code, name, type })));
}

const acct = async (schoolId: string, code: string) => {
  const a = await Account.findOne({ schoolId, code }).lean();
  return a?._id as Types.ObjectId | undefined;
};

/** Auto-post to the ledger only for schools whose plan includes accounting. */
export async function postJournal(school: any, memo: string, ref: string, lines: { code: string; debit?: number; credit?: number }[], by?: string) {
  if (!hasModule(school.plan as Plan, 'accounting')) return;
  const schoolId = String(school._id);
  await ensureChart(schoolId);
  const out = [];
  for (const l of lines) {
    const accountId = await acct(schoolId, l.code);
    if (accountId) out.push({ accountId, debit: l.debit || 0, credit: l.credit || 0 });
  }
  if (out.length) await JournalEntry.create({ schoolId, memo, ref, lines: out, createdBy: by });
}

// ---------- Notifications ----------
async function sendWhatsApp(to: string, text: string) {
  if (!env.whatsappToken || !env.whatsappPhoneId) return false;
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${env.whatsappPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.whatsappToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'text', text: { body: text } }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Notify the parent accounts linked to a student (in-app; plus WhatsApp if enabled). No-op below Business. */
export async function notifyGuardians(school: any, studentId: string, n: { title: string; body?: string; type?: string; guardianPhone?: string }) {
  if (!hasModule(school.plan as Plan, 'notifications')) return;
  const parents = await User.find({ schoolId: school._id, role: 'parent', studentIds: studentId, active: true }).select('_id').lean();
  if (parents.length)
    await Notification.insertMany(
      parents.map((p) => ({ schoolId: school._id, userId: p._id, studentId, title: n.title, body: n.body, type: n.type || 'general' })),
    );
  if (n.guardianPhone && hasModule(school.plan as Plan, 'whatsapp')) {
    const ok = await sendWhatsApp(n.guardianPhone, `${n.title}\n${n.body || ''}`);
    if (ok) await Notification.create({ schoolId: school._id, studentId, title: n.title, body: n.body, type: n.type || 'general', channel: 'whatsapp' });
  }
}

// ---------- Sequences ----------
export async function nextStudentCode(schoolId: string) {
  const s = await School.findByIdAndUpdate(schoolId, { $inc: { studentSeq: 1 } }, { new: true }).lean();
  return `S${String(s!.studentSeq).padStart(5, '0')}`;
}
