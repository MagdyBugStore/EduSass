import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import ResourcePage from '../components/ResourcePage';
import { Badge, Empty, Locked, Spinner } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { dateAr, money, today } from '../lib/format';

function StaffAttendance() {
  const [date, setDate] = useState(today());
  const q = useQuery({ queryKey: ['staff-att', date], queryFn: async () => (await api.get('/employees/attendance', { params: { date } })).data });
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { if (q.data) setRows(q.data.map((r: any) => ({ ...r, status: r.status || 'present' }))); }, [q.data]);
  const save = useMutation({
    mutationFn: async () => api.post('/employees/attendance', { date, records: rows.map((r) => ({ employeeId: r.employeeId, status: r.status })) }),
    onSuccess: () => toast.success('تم الحفظ'), onError: toastErr,
  });
  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-3"><input className="input w-auto" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {rows.length > 0 && <button className="btn-primary" onClick={() => save.mutate()}>حفظ</button>}</div>
      {q.isLoading ? <Spinner /> : !rows.length ? <Empty text="لا يوجد موظفون" /> : rows.map((r, i) => (
        <div key={r.employeeId} className="flex items-center gap-3 border-b py-2 text-sm"><span className="flex-1">{r.name} <span className="text-xs text-slate-400">{r.jobTitle}</span></span>
          <select className="input w-32" value={r.status} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, status: e.target.value } : x)))}>
            <option value="present">حاضر</option><option value="absent">غائب</option><option value="late">متأخر</option><option value="leave">إجازة</option></select></div>
      ))}
    </div>
  );
}

function Leaves() {
  const qc = useQueryClient();
  const decide = useMutation({
    mutationFn: async ({ id, status }: any) => api.post(`/employees/leaves/${id}/decide`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/employees/leaves'] }), onError: toastErr,
  });
  return (
    <ResourcePage title="طلبات الإجازات" url="/employees/leaves" noun="طلب إجازة" fields={[
      { key: 'employeeId', label: 'الموظف', required: true, optionsFrom: { url: '/employees', label: (e) => e.name }, list: (r) => r.employeeId?.name },
      { key: 'type', label: 'النوع', type: 'select', options: [{ value: 'annual', label: 'اعتيادية' }, { value: 'sick', label: 'مرضية' }, { value: 'unpaid', label: 'بدون أجر' }, { value: 'other', label: 'أخرى' }], list: true },
      { key: 'from', label: 'من', type: 'date', required: true, list: (r) => dateAr(r.from) },
      { key: 'to', label: 'إلى', type: 'date', required: true, list: (r) => dateAr(r.to) },
      { key: 'note', label: 'ملاحظة' },
      { key: 'status', label: 'الحالة', noEdit: true, createOnly: true, list: (r) => <Badge status={r.status} /> },
    ]} search={false} canDelete={false} rowActions={(r) => r.status === 'pending' && (<>
      <button className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50" onClick={() => decide.mutate({ id: r._id, status: 'approved' })} aria-label="موافقة"><Check size={16} /></button>
      <button className="rounded p-1.5 text-red-600 hover:bg-red-50" onClick={() => decide.mutate({ id: r._id, status: 'rejected' })} aria-label="رفض"><X size={16} /></button></>)} />
  );
}

export default function HR() {
  const [tab, setTab] = useState<'emp' | 'att' | 'leave'>('emp');
  const probe = useQuery({ queryKey: ['hr-probe'], queryFn: async () => (await api.get('/employees', { params: { limit: 1 } })).data });
  if ((probe.error as any)?.response?.status === 402) return <Locked what="الموارد البشرية" />;
  return (
    <div>
      <div className="mb-4 flex gap-2">
        {([['emp', 'الموظفون'], ['att', 'حضور الموظفين'], ['leave', 'الإجازات']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'emp' && <ResourcePage title="الموظفون" sub="حسابات الموظفين غير محدودة ولا تُحتسب على الباقة" url="/employees" noun="موظف" fields={[
        { key: 'name', label: 'الاسم', required: true, list: true },
        { key: 'jobTitle', label: 'الوظيفة', list: true },
        { key: 'phone', label: 'الهاتف', list: true },
        { key: 'nationalId', label: 'الرقم القومي' },
        { key: 'baseSalary', label: 'الراتب الأساسي', type: 'number', list: (r) => money(r.baseSalary) },
        { key: 'hireDate', label: 'تاريخ التعيين', type: 'date' },
        { key: 'status', label: 'الحالة', type: 'select', options: [{ value: 'active', label: 'نشط' }, { value: 'inactive', label: 'غير نشط' }], list: (r) => <Badge status={r.status} /> },
      ]} />}
      {tab === 'att' && <StaffAttendance />}
      {tab === 'leave' && <Leaves />}
    </div>
  );
}
