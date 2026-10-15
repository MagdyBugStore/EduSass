import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Badge, Empty, Locked, PageHeader, Spinner, Table } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { money } from '../lib/format';

export default function Payroll() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [items, setItems] = useState<any[]>([]);
  const list = useQuery({ queryKey: ['payroll'], queryFn: async () => (await api.get('/payroll')).data });
  const cur = useQuery({ queryKey: ['payroll', month], retry: false, queryFn: async () => (await api.get(`/payroll/${month}`)).data });
  useEffect(() => { setItems(cur.data?.items || []); }, [cur.data]);

  const inv = () => { qc.invalidateQueries({ queryKey: ['payroll'] }); };
  const gen = useMutation({ mutationFn: async () => api.post('/payroll/generate', { month }), onSuccess: () => { toast.success('تم احتساب الرواتب'); inv(); }, onError: toastErr });
  const saveAdj = useMutation({
    mutationFn: async () => api.put(`/payroll/${month}`, { items: items.map((i) => ({ employeeId: i.employeeId, additions: Number(i.additions) || 0, deductions: Number(i.deductions) || 0 })) }),
    onSuccess: () => { toast.success('تم الحفظ'); inv(); }, onError: toastErr,
  });
  const pay = useMutation({ mutationFn: async () => api.post(`/payroll/${month}/pay`), onSuccess: () => { toast.success('تم صرف الرواتب وترحيلها محاسبيًا'); inv(); }, onError: toastErr });

  if ((list.error as any)?.response?.status === 402) return <Locked what="الرواتب" />;
  const p = cur.data;
  const upd = (i: number, k: string, v: number) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v, net: +((x.base || 0) + (k === 'additions' ? v : Number(x.additions) || 0) - (k === 'deductions' ? v : Number(x.deductions) || 0)).toFixed(2) } : x)));

  return (
    <div>
      <PageHeader title="الرواتب" sub="الغياب غير المبرر يُخصم تلقائيًا من حضور الموظفين" actions={<>
        <input className="input w-auto" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button className="btn-ghost" onClick={() => gen.mutate()} disabled={p?.status === 'paid'}>احتساب</button></>} />
      <div className="card p-0">
        {cur.isLoading ? <Spinner /> : !p ? <Empty text="لم تُحتسب رواتب هذا الشهر بعد" /> : (
          <>
            <div className="flex items-center justify-between border-b p-3 text-sm"><span>الحالة: <Badge status={p.status} /></span><span>الإجمالي: <b>{money(items.reduce((s, i) => s + (i.net || 0), 0))}</b></span></div>
            <Table head={['الموظف', 'الأساسي', 'إضافات', 'خصومات', 'الصافي']}>
              {items.map((it, i) => (
                <tr key={it.employeeId}><td className="td">{it.name}</td><td className="td">{money(it.base)}</td>
                  <td className="td"><input className="input w-24" type="number" min={0} disabled={p.status === 'paid'} value={it.additions} onChange={(e) => upd(i, 'additions', Number(e.target.value))} /></td>
                  <td className="td"><input className="input w-24" type="number" min={0} disabled={p.status === 'paid'} value={it.deductions} onChange={(e) => upd(i, 'deductions', Number(e.target.value))} /></td>
                  <td className="td font-medium">{money(it.net)}</td></tr>
              ))}
            </Table>
            {p.status === 'draft' && <div className="flex justify-end gap-2 border-t p-3"><button className="btn-ghost" onClick={() => saveAdj.mutate()}>حفظ التعديلات</button><button className="btn-primary" onClick={() => confirm('صرف الرواتب؟ لا يمكن التراجع.') && pay.mutate()}>صرف</button></div>}
          </>
        )}
      </div>
    </div>
  );
}
