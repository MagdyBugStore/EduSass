export const money = (n?: number | null) => `${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.م`;
export const dateAr = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const today = () => new Date().toISOString().slice(0, 10);
export const ymd = (d?: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export const ROLE_AR: Record<string, string> = {
  superadmin: 'مدير المنصة', owner: 'المالك', admin: 'مدير', teacher: 'معلم', accountant: 'محاسب', hr: 'موارد بشرية', receptionist: 'استقبال', parent: 'ولي أمر',
};
export const PLAN_AR: Record<string, string> = { core: 'Core — أساسي', mgmt: 'Management — الإدارة', biz: 'Business — الأعمال', ent: 'Enterprise — المؤسسات' };
export const STATUS_AR: Record<string, string> = {
  active: 'نشط', graduated: 'متخرج', archived: 'مؤرشف', withdrawn: 'منسحب',
  present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'بعذر', leave: 'إجازة',
  unpaid: 'غير مدفوعة', partial: 'مدفوعة جزئيًا', paid: 'مدفوعة', cancelled: 'ملغاة',
  pending: 'قيد المراجعة', approved: 'موافق عليها', rejected: 'مرفوضة', draft: 'مسودة', inactive: 'غير نشط',
  trial: 'تجريبي', suspended: 'موقوف',
};
