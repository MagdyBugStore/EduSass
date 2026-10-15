export const money = (n?: number | null) => `${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.م`;
export const dateAr = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
/** The local calendar day (not UTC), so late-evening work lands on the right date. */
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const ymd = (d?: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export const ROLE_AR: Record<string, string> = {
  superadmin: 'مدير المنصة', owner: 'المالك', admin: 'مدير', teacher: 'معلم', accountant: 'محاسب', hr: 'موارد بشرية', receptionist: 'استقبال', parent: 'ولي أمر',
};
export const PLAN_AR: Record<string, string> = { core: 'Core — أساسي', mgmt: 'Management — الإدارة', biz: 'Business — الأعمال', acad: 'Academic — الأكاديمي', ent: 'Enterprise — المؤسسات' };
export const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const className = (c: any) => (c ? `${c.name} ${c.section || ''}`.trim() : '—');

export const STATUS_AR: Record<string, string> = {
  active: 'نشط', graduated: 'متخرج', archived: 'مؤرشف', withdrawn: 'منسحب',
  present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'بعذر', leave: 'إجازة',
  unpaid: 'غير مدفوعة', partial: 'مدفوعة جزئيًا', paid: 'مدفوعة', cancelled: 'ملغاة',
  pending: 'قيد المراجعة', approved: 'موافق عليها', rejected: 'مرفوضة', draft: 'مسودة', inactive: 'غير نشط',
  trial: 'تجريبي', suspended: 'موقوف',
};
