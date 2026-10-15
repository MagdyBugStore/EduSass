import { useQuery } from '@tanstack/react-query';
import { Download, Eye } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import ResourcePage, { FieldDef } from '../components/ResourcePage';
import { Badge } from '../components/ui';
import { api, toastErr } from '../lib/api';

const className = (c: any) => (c ? `${c.name} ${c.section || ''} — ${c.stage}` : '—');

const fields: FieldDef[] = [
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
  const [status, setStatus] = useState('active');
  const exportCsv = async () => {
    try {
      const r = await api.get('/export/students.csv', { responseType: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(r.data); a.download = 'students.csv'; a.click();
    } catch (e) { toastErr(e); }
  };
  useQuery({ queryKey: ['noop'], queryFn: async () => null, enabled: false });
  return (
    <ResourcePage
      title="الطلاب" sub="الطلاب النشطون فقط يُحتسبون على شريحة الباقة" url="/students" noun="طالب" fields={fields}
      filters={{ status: status || undefined }}
      extraActions={<>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">النشطون</option><option value="">الكل</option><option value="graduated">المتخرجون</option><option value="archived">المؤرشفون</option><option value="withdrawn">المنسحبون</option>
        </select>
        <button className="btn-ghost" onClick={exportCsv}><Download size={16} />تصدير</button>
      </>}
      rowActions={(r) => <Link to={`/students/${r._id}`} className="inline-block rounded p-1.5 hover:bg-slate-200" aria-label="الملف"><Eye size={15} /></Link>}
    />
  );
}
