import { Download, Phone } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import ResourcePage, { FieldDef } from '../components/ResourcePage';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { useAuth } from '../store/auth';

const className = (c: any) => (c ? `${c.name} ${c.section || ''} — ${c.stage}` : '—');
const classShort = (c: any) => (c ? `${c.name} ${c.section || ''}`.trim() : 'بدون فصل');

export const studentFields: FieldDef[] = [
  { key: 'code', label: 'الكود', list: true, noEdit: false },
  { key: 'name', label: 'الاسم', required: true, list: (r) => <Link to={`/students/${r._id}`} className="font-medium text-brand">{r.name}</Link> },
  { key: 'classId', label: 'الفصل', optionsFrom: { url: '/classes', label: className }, list: (r) => className(r.classId) },
  { key: 'gender', label: 'النوع', type: 'select', options: [{ value: 'male', label: 'ذكر' }, { value: 'female', label: 'أنثى' }] },
  { key: 'birthDate', label: 'تاريخ الميلاد', type: 'date' },
  { key: 'nationalId', label: 'الرقم القومي' },
  { key: 'guardian.name', label: 'اسم ولي الأمر', list: (r) => r.guardian?.name || '—' },
  { key: 'guardian.phone', label: 'هاتف ولي الأمر', list: (r) => <span className="num">{r.guardian?.phone || '—'}</span> },
  { key: 'guardian.relation', label: 'صلة القرابة' },
  { key: 'status', label: 'الحالة', type: 'select', options: [{ value: 'active', label: 'نشط' }, { value: 'graduated', label: 'متخرج' }, { value: 'archived', label: 'مؤرشف' }, { value: 'withdrawn', label: 'منسحب' }], list: (r) => <Badge status={r.status} /> },
  { key: 'address', label: 'العنوان' },
  { key: 'notes', label: 'ملاحظات', type: 'textarea' },
];

export default function Students() {
  const { me } = useAuth();
  const mgr = me!.role === 'owner' || me!.role === 'admin';
  const canWrite = mgr || me!.role === 'receptionist'; // matches the API: teachers/accountants read only
  const [status, setStatus] = useState('active');
  const exportCsv = async () => {
    try {
      const r = await api.get('/export/students.csv', { responseType: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(r.data); a.download = 'students.csv'; a.click();
    } catch (e) { toastErr(e); }
  };
  return (
    <ResourcePage
      title="الطلاب" sub="الطلاب النشطون فقط يُحتسبون على شريحة الباقة" url="/students" noun="طالب" fields={studentFields} pageSize={24}
      renderCard={(r) => <StudentCard s={r} />}
      filters={{ status: status || undefined }} canWrite={canWrite}
      extraActions={<>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">النشطون</option><option value="">الكل</option><option value="graduated">المتخرجون</option><option value="archived">المؤرشفون</option><option value="withdrawn">المنسحبون</option>
        </select>
        {mgr && <button className="btn-ghost" onClick={exportCsv}><Download size={16} />تصدير</button>}
      </>}
    />
  );
}

/** Grid card: photo on top, the few facts staff look for underneath. The whole card opens the profile. */
export function StudentCard({ s }: { s: any }) {
  return (
    <Link to={`/students/${s._id}`} className="card group flex h-full flex-col items-center p-0 text-center transition hover:-translate-y-0.5 hover:ring-2 hover:ring-brand/40">
      <div className="w-full rounded-t-xl px-4 pb-3 pt-6" style={{ backgroundImage: 'linear-gradient(180deg, rgb(var(--accent) / .16), transparent)' }}>
        <Avatar name={s.name} photo={s.photo} className="mx-auto h-24 w-24 text-3xl ring-4 ring-surface" />
      </div>
      <div className="flex w-full flex-1 flex-col items-center px-4 pb-4">
        <div className="line-clamp-1 text-[15px] font-medium group-hover:text-brand">{s.name}</div>
        <div className="mt-0.5 text-[13px] text-pencil">{classShort(s.classId)}{s.classId?.stage && `، ${s.classId.stage}`}</div>
        <div className="mt-3 flex items-center gap-2">
          <span className="num rounded-full bg-sunken px-2.5 py-0.5 text-xs text-pencil">{s.code}</span>
          <Badge status={s.status} />
        </div>
        {s.guardian?.phone && <div className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-pencil"><Phone size={12} /><span className="num">{s.guardian.phone}</span></div>}
      </div>
    </Link>
  );
}
