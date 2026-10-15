import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Empty, PageHeader, Spinner } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { today } from '../lib/format';
import { useAuth } from '../store/auth';

const ST = [['present', 'حاضر', 'bg-emerald-600'], ['absent', 'غائب', 'bg-red-600'], ['late', 'متأخر', 'bg-amber-500'], ['excused', 'بعذر', 'bg-blue-600']] as const;

export default function Attendance() {
  const { has } = useAuth();
  const qc = useQueryClient();
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(today());
  const [period, setPeriod] = useState(0);
  const [rows, setRows] = useState<any[]>([]);

  const classes = useQuery({ queryKey: ['classes-all'], queryFn: async () => (await api.get('/classes', { params: { limit: 200 } })).data.items });
  const sheet = useQuery({
    queryKey: ['sheet', classId, date, period], enabled: !!classId,
    queryFn: async () => (await api.get('/attendance/sheet', { params: { classId, date, period } })).data,
  });
  useEffect(() => { if (sheet.data) setRows(sheet.data.map((r: any) => ({ ...r, status: r.status || 'present' }))); }, [sheet.data]);

  const save = useMutation({
    mutationFn: async () => api.post('/attendance/sheet', { classId, date, period, records: rows.map((r) => ({ studentId: r._id, status: r.status, reason: r.reason || undefined })) }),
    onSuccess: () => { toast.success('تم حفظ الحضور'); qc.invalidateQueries({ queryKey: ['sheet'] }); }, onError: toastErr,
  });
  const setAll = (status: string) => setRows(rows.map((r) => ({ ...r, status })));

  return (
    <div>
      <PageHeader title="الحضور والغياب" sub="تسجيل حضور يومي لكل فصل" actions={rows.length > 0 && <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>حفظ</button>} />
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs">الفصل<select className="input mt-1" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">— اختر —</option>{classes.data?.map((c: any) => <option key={c._id} value={c._id}>{c.name} {c.section} — {c.stage}</option>)}</select></label>
        <label className="text-xs">التاريخ<input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {has('exams') && <label className="text-xs">الحصة<select className="input mt-1" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
          <option value={0}>يومي</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((p) => <option key={p} value={p}>الحصة {p}</option>)}</select></label>}
        {rows.length > 0 && <div className="mr-auto flex gap-2">{ST.map(([k, l]) => <button key={k} className="btn-ghost" onClick={() => setAll(k)}>الكل {l}</button>)}</div>}
      </div>
      {!classId ? <Empty text="اختر فصلًا" /> : sheet.isLoading ? <Spinner /> : !rows.length ? <Empty text="لا يوجد طلاب نشطون في هذا الفصل" /> : (
        <div className="card divide-y p-0">
          {rows.map((r, i) => (
            <div key={r._id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-40 flex-1 text-sm font-medium">{r.name} <span className="text-xs text-slate-400">{r.code}</span></div>
              <div className="flex gap-1">{ST.map(([k, l, c]) => (
                <button key={k} onClick={() => setRows(rows.map((x, j) => (j === i ? { ...x, status: k } : x)))}
                  className={`rounded-lg px-3 py-1 text-xs ${r.status === k ? `${c} text-white` : 'bg-slate-100 text-slate-600'}`}>{l}</button>))}</div>
              {r.status !== 'present' && <input className="input w-48" placeholder="السبب" value={r.reason || ''} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
