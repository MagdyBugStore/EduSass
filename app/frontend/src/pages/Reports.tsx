import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Empty, Locked, PageHeader, Spinner, Table } from '../components/ui';
import { api } from '../lib/api';
import { money, today } from '../lib/format';
import { useAuth } from '../store/auth';

export default function Reports() {
  const { has, me } = useAuth();
  const fin = ['owner', 'admin', 'accountant'].includes(me!.role);
  const [tab, setTab] = useState<'out' | 'att' | 'fin'>(fin ? 'out' : 'att');
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const out = useQuery({ queryKey: ['r-out'], enabled: tab === 'out' && fin, queryFn: async () => (await api.get('/reports/outstanding')).data });
  const att = useQuery({ queryKey: ['r-att', from, to], enabled: tab === 'att', queryFn: async () => (await api.get('/attendance/report', { params: { from, to } })).data });
  const fr = useQuery({ queryKey: ['r-fin', from, to], enabled: tab === 'fin' && has('financeReports'), queryFn: async () => (await api.get('/reports/financial', { params: { from, to } })).data });

  return (
    <div>
      <PageHeader title="التقارير" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {fin && <button className={tab === 'out' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('out')}>المتأخرات</button>}
        <button className={tab === 'att' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('att')}>الحضور</button>
        {fin && <button className={tab === 'fin' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('fin')}>مالي {!has('financeReports') && '🔒'}</button>}
        {tab !== 'out' && <><input className="input w-auto" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><input className="input w-auto" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></>}
      </div>
      <div className="card p-0">
        {tab === 'out' && (out.isLoading ? <Spinner /> : !out.data.length ? <Empty text="لا توجد متأخرات 🎉" /> : (
          <Table head={['الطالب', 'الكود', 'الهاتف', 'فواتير', 'المستحق']}>{out.data.map((r: any) => <tr key={r._id}><td className="td">{r.name}</td><td className="td num">{r.code}</td><td className="td num">{r.phone || '—'}</td><td className="td">{r.invoices}</td><td className="td font-medium text-amber-700">{money(r.due)}</td></tr>)}</Table>
        ))}
        {tab === 'att' && (att.isLoading ? <Spinner /> : !att.data.length ? <Empty /> : (
          <Table head={['الطالب', 'حاضر', 'غائب', 'متأخر', 'بعذر']}>{att.data.map((r: any) => <tr key={r._id}><td className="td">{r.name}</td><td className="td">{r.counts.present || 0}</td><td className="td text-red-600">{r.counts.absent || 0}</td><td className="td">{r.counts.late || 0}</td><td className="td">{r.counts.excused || 0}</td></tr>)}</Table>
        ))}
        {tab === 'fin' && (!has('financeReports') ? <Locked what="التقارير المالية" /> : fr.isLoading ? <Spinner /> : (
          <div className="p-4">
            <div className="mb-4 flex gap-6 text-sm"><span>الإيرادات: <b>{money(fr.data.totals.income)}</b></span><span>المصروفات: <b>{money(fr.data.totals.expenses)}</b></span><span>الصافي: <b>{money(fr.data.totals.income - fr.data.totals.expenses)}</b></span></div>
            <div className="h-72" dir="ltr"><ResponsiveContainer><BarChart data={fr.data.rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
              <Bar dataKey="income" name="الإيرادات" fill="#1C3F94" /><Bar dataKey="expenses" name="المصروفات" fill="#D93A3F" /></BarChart></ResponsiveContainer></div>
          </div>
        ))}
      </div>
    </div>
  );
}
