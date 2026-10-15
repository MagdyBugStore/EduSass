import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, FileCheck2, Save, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { Avatar } from '../components/Avatar';
import { Empty, PageHeader, Spinner } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { dateAr, today } from '../lib/format';
import { useAuth } from '../store/auth';
import { AttendanceMeter, classColor } from './Classes';

type St = 'present' | 'late' | 'absent' | 'excused';
/** The four marks, in the order a teacher reads them; colors match the reference (green, red, amber). */
const MARKS: { key: St; label: string; icon: typeof Check; on: string; dot: string; row: string; hex: string }[] = [
  { key: 'present', label: 'حاضر', icon: Check, on: 'bg-emerald-600 text-white border-emerald-600', dot: 'bg-emerald-600', row: 'bg-emerald-600/[.06]', hex: '#16A34A' },
  { key: 'late', label: 'متأخر', icon: Clock, on: 'bg-amber-500 text-white border-amber-500', dot: 'bg-amber-500', row: 'bg-amber-500/[.12]', hex: '#F59E0B' },
  { key: 'absent', label: 'غائب', icon: X, on: 'bg-red-600 text-white border-red-600', dot: 'bg-red-600', row: 'bg-red-600/[.10]', hex: '#DC2626' },
  { key: 'excused', label: 'بعذر', icon: FileCheck2, on: 'bg-blue-600 text-white border-blue-600', dot: 'bg-blue-600', row: 'bg-blue-600/[.10]', hex: '#2563EB' },
];
const DATE = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function Attendance() {
  const [tab, setTab] = useState<'sheet' | 'all'>('sheet');
  const [params] = useSearchParams();
  const [date, setDate] = useState(params.get('date') || today());
  const [classId, setClassId] = useState(params.get('classId') || '');
  const tabs = (
    <div className="inline-flex rounded-full border border-rule bg-surface p-1 text-sm" role="tablist" aria-label="عرض الحضور">
      {([['sheet', 'تسجيل الحضور'], ['all', 'كل الفصول']] as const).map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
          className={`rounded-full px-4 py-1 transition ${tab === k ? 'bg-brand text-white' : 'text-pencil hover:text-graphite'}`}>{l}</button>
      ))}
    </div>
  );
  return (
    <div>
      <PageHeader title="الحضور والغياب" sub={DATE.format(new Date(`${date}T12:00:00`))} actions={tabs} />
      {tab === 'sheet'
        ? <Sheet date={date} setDate={setDate} classId={classId} setClassId={setClassId} initialPeriod={Number(params.get('period')) || 0} />
        : <AllClasses date={date} setDate={setDate} open={(id) => { setClassId(id); setTab('sheet'); }} />}
    </div>
  );
}

/** Every class for the chosen day: recorded or not, and how it went. */
function AllClasses({ date, setDate, open }: { date: string; setDate: (d: string) => void; open: (id: string) => void }) {
  const q = useQuery({ queryKey: ['/classes', 'overview', date], queryFn: async () => (await api.get('/reports/classes-overview', { params: { date } })).data });
  const items: any[] = q.data?.items || [];
  const done = items.filter((c) => c.attendance.marked > 0).length;
  return (
    <section className="card p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule-soft p-4 dark:border-white/[.06]">
        <label className="flex items-center gap-2 text-[13px] text-pencil">التاريخ<input className="input h-9 w-auto" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
        <span className="ms-auto text-[13px] text-pencil">اتسجل الحضور في <b className="num text-graphite">{done}</b> من <b className="num text-graphite">{items.length}</b> فصل</span>
      </div>
      {q.isLoading ? <Spinner /> : !items.length ? <Empty text="مفيش فصول." /> : (
        <ul className="divide-y divide-rule-soft dark:divide-white/[.06]">
          {items.map((c) => {
            const a = c.attendance, marked = a.marked > 0;
            return (
              <li key={c._id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <span className="h-9 w-1.5 rounded-full" style={{ background: classColor(c._id) }} aria-hidden />
                <div className="min-w-36 flex-1">
                  <div className="text-sm font-medium">{c.name} {c.section}</div>
                  <div className="text-xs text-pencil">{c.stage}، <span className="num">{c.students}</span> طالب</div>
                </div>
                <div className="w-40"><AttendanceMeter rate={a.rate} /></div>
                <span className="num w-12 text-left text-sm font-medium">{a.rate == null ? '—' : `${a.rate}%`}</span>
                <span className="flex gap-3 text-xs text-pencil">
                  <span>غياب <b className="num text-red-700">{a.absent || 0}</b></span>
                  <span>تأخير <b className="num text-amber-700">{a.late || 0}</b></span>
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${marked ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>{marked ? 'اتسجل' : 'لسه'}</span>
                <button className="btn-ghost h-8 px-3" onClick={() => open(c._id)}>{marked ? 'عرض' : 'سجّل الحضور'}</button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Sheet({ date, setDate, classId, setClassId, initialPeriod }: { date: string; setDate: (d: string) => void; classId: string; setClassId: (id: string) => void; initialPeriod: number }) {
  const { has } = useAuth();
  const qc = useQueryClient();
  const [period, setPeriod] = useState(initialPeriod);
  const [stage, setStage] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [dirty, setDirty] = useState(false);

  const overview = useQuery({ queryKey: ['/classes', 'overview', date], queryFn: async () => (await api.get('/reports/classes-overview', { params: { date } })).data });
  const bells = useQuery({ queryKey: ['tt-periods'], enabled: has('timetable'), queryFn: async () => (await api.get('/timetable/periods')).data });
  const sheet = useQuery({
    queryKey: ['sheet', classId, date, period], enabled: !!classId,
    queryFn: async () => (await api.get('/attendance/sheet', { params: { classId, date, period } })).data,
  });
  const classes: any[] = overview.data?.items || [];
  const stages = [...new Set(classes.map((c) => c.stage))];
  const shown = classes.filter((c) => !stage || c.stage === stage);
  const recorded = (sheet.data || []).some((r: any) => r.status);

  useEffect(() => { if (!classId && shown.length) setClassId(shown[0]._id); }, [classId, shown, setClassId]);
  useEffect(() => { if (sheet.data) { setRows(sheet.data.map((r: any) => ({ ...r, status: (r.status || 'present') as St }))); setDirty(!sheet.data.some((r: any) => r.status)); } }, [sheet.data]);

  const save = useMutation({
    mutationFn: async () => api.post('/attendance/sheet', { classId, date, period, records: rows.map((r) => ({ studentId: r._id, status: r.status, reason: r.reason || undefined })) }),
    onSuccess: () => { toast.success('اتحفظ الحضور'); setDirty(false); qc.invalidateQueries({ queryKey: ['sheet'] }); qc.invalidateQueries({ queryKey: ['/classes'] }); qc.invalidateQueries({ queryKey: ['inbox'] }); },
    onError: toastErr,
  });
  const mark = (id: string, status: St) => { setRows(rows.map((r) => (r._id === id ? { ...r, status } : r))); setDirty(true); };
  const setAll = (status: St) => { setRows(rows.map((r) => ({ ...r, status }))); setDirty(true); };
  const counts = useMemo(() => Object.fromEntries(MARKS.map((m) => [m.key, rows.filter((r) => r.status === m.key).length])) as Record<St, number>, [rows]);
  const visible = rows.filter((r) => !q || r.name.includes(q) || r.code?.includes(q));
  const periodOpts: { n: number; label: string }[] = bells.data?.periods?.length
    ? bells.data.periods.map((p: any) => ({ n: p.number, label: `الحصة ${p.number} (${p.start})` }))
    : [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ n, label: `الحصة ${n}` }));
  const cls = classes.find((c) => c._id === classId);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 pb-28 xl:grid-cols-[minmax(0,1fr)_300px] xl:pb-0">
      <section className="card p-0" aria-label="كشف الحضور">
        {/* what is being recorded */}
        <div className="grid gap-3 border-b border-rule-soft p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-white/[.06]">
          <label className="text-xs text-pencil">التاريخ<input className="input mt-1" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="text-xs text-pencil">المرحلة
            <select className="input mt-1" value={stage} onChange={(e) => { setStage(e.target.value); setClassId(''); }}>
              <option value="">كل المراحل</option>{stages.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs text-pencil">الفصل
            <select className="input mt-1" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {!shown.length && <option value="">مفيش فصول</option>}
              {shown.map((c) => <option key={c._id} value={c._id}>{c.name} {c.section}، {c.students} طالب{c.attendance.marked ? '، اتسجل' : ''}</option>)}
            </select>
          </label>
          {has('exams') ? (
            <label className="text-xs text-pencil">الحصة
              <select className="input mt-1" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
                <option value={0}>حضور اليوم كله</option>{periodOpts.map((p) => <option key={p.n} value={p.n}>{p.label}</option>)}
              </select>
            </label>
          ) : <div />}
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-pencil" />
            <input className="input w-56 pr-9" type="search" placeholder="بحث بالاسم أو الكود…" aria-label="بحث في الطلاب" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {rows.length > 0 && (
            <div className="ms-auto flex flex-wrap items-center gap-1.5 text-[13px]">
              <span className="text-pencil">علّم الكل:</span>
              {MARKS.map((m) => <button key={m.key} className="btn-ghost h-8 px-3" onClick={() => setAll(m.key)}><span className={`h-2 w-2 rounded-full ${m.dot}`} />{m.label}</button>)}
            </div>
          )}
        </div>

        {!classId ? <Empty text="اختار فصل" /> : sheet.isLoading ? <Spinner /> : !rows.length ? <Empty text="مفيش طلاب نشطين في الفصل ده." /> : (
          <>
          <ul className="space-y-2 px-3 pb-3 md:hidden">
            {visible.map((r) => {
              const cur = MARKS.find((m) => m.key === r.status)!;
              return (
                <li key={r._id} className={`rounded-xl border border-rule/70 p-3 dark:border-white/[.06] ${cur.row}`}>
                  <Link to={`/students/${r._id}`} className="flex items-center gap-2.5">
                    <Avatar name={r.name} photo={r.photo} className="h-9 w-9 text-xs" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.name}</span><span className="num block text-xs text-pencil">{r.code}</span></span>
                  </Link>
                  <div className="mt-2.5 grid grid-cols-4 gap-1.5" role="group" aria-label={`حضور ${r.name}`}>
                    {MARKS.map((m) => {
                      const on = r.status === m.key, Icon = m.icon;
                      return (
                        <button key={m.key} onClick={() => mark(r._id, m.key)} aria-pressed={on}
                          className={`flex h-9 items-center justify-center gap-1 rounded-lg border text-xs transition ${on ? m.on : 'border-rule bg-surface text-pencil'}`}>
                          {on && <Icon size={12} strokeWidth={3} />}{m.label}
                        </button>
                      );
                    })}
                  </div>
                  {r.status !== 'present' && <input className="input mt-2 h-9" placeholder={r.status === 'excused' ? 'سبب العذر' : 'ملاحظة'} value={r.reason || ''} onChange={(e) => { setRows(rows.map((x) => (x._id === r._id ? { ...x, reason: e.target.value } : x))); setDirty(true); }} />}
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr>
                  <th className="th w-24">الكود</th><th className="th">الطالب</th>
                  {MARKS.map((m) => <th key={m.key} className="th w-24 text-center">{m.label}</th>)}
                  <th className="th">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const cur = MARKS.find((m) => m.key === r.status)!;
                  return (
                    <tr key={r._id} className={cur.row}>
                      <td className="td num text-pencil">{r.code}</td>
                      <td className="td">
                        <Link to={`/students/${r._id}`} className="flex items-center gap-2.5 hover:text-brand">
                          <Avatar name={r.name} photo={r.photo} className="h-8 w-8 text-xs" /><span className="whitespace-nowrap font-medium">{r.name}</span>
                        </Link>
                      </td>
                      {MARKS.map((m) => {
                        const on = r.status === m.key, Icon = m.icon;
                        return (
                          <td key={m.key} className="td text-center">
                            <button onClick={() => mark(r._id, m.key)} aria-pressed={on} aria-label={`${r.name}: ${m.label}`}
                              className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition ${on ? m.on : 'border-rule text-pencil hover:border-graphite/40 hover:text-graphite'}`}>
                              <span className={`grid h-4 w-4 place-items-center rounded-full ${on ? 'bg-white/25' : 'border border-current'}`}>{on && <Icon size={11} strokeWidth={3} />}</span>
                              {m.label}
                            </button>
                          </td>
                        );
                      })}
                      <td className="td">
                        {r.status !== 'present'
                          ? <input className="input h-8 min-w-36" placeholder={r.status === 'excused' ? 'سبب العذر' : 'ملاحظة'} value={r.reason || ''} onChange={(e) => { setRows(rows.map((x) => (x._id === r._id ? { ...x, reason: e.target.value } : x))); setDirty(true); }} />
                          : <span className="text-pencil">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <aside className="space-y-4 xl:sticky xl:top-4">
        <section className="card" aria-labelledby="h-sum">
          <h2 id="h-sum" className="sheet-title">ملخص اليوم</h2>
          <div className="text-xs text-pencil">{cls ? `${cls.name} ${cls.section || ''}`.trim() : '—'}{period > 0 && `، الحصة ${period}`}، {dateAr(date)}</div>
          <div className="relative mx-auto mt-2 h-40 w-40">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={rows.length ? MARKS.map((m) => ({ name: m.label, value: counts[m.key] })) : [{ name: '—', value: 1 }]} dataKey="value" innerRadius={52} outerRadius={72} paddingAngle={rows.length ? 2 : 0} stroke="none" startAngle={90} endAngle={-270}>
                  {rows.length ? MARKS.map((m) => <Cell key={m.key} fill={m.hex} />) : <Cell fill="rgb(var(--sunken))" />}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div><div className="num text-2xl font-medium">{rows.length ? `${Math.round(((counts.present + counts.late) / rows.length) * 100)}%` : '—'}</div><div className="text-[11px] text-pencil">حضور</div></div>
            </div>
          </div>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {MARKS.map((m) => (
              <li key={m.key} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} /><span className="flex-1">{m.label}</span><b className="num font-medium">{counts[m.key]}</b></li>
            ))}
            <li className="flex items-center gap-2 border-t border-rule-soft pt-1.5 dark:border-white/[.06]"><span className="flex-1 text-pencil">الإجمالي</span><b className="num font-medium">{rows.length}</b></li>
          </ul>
        </section>
        {rows.length > 0 && (
          <div className="card fixed inset-x-3 bottom-3 z-30 p-3 shadow-2xl xl:static xl:p-4 xl:shadow-none">
            <p className={`mb-2 text-[13px] xl:mb-3 ${dirty ? 'text-amber-700' : 'text-pencil'}`}>
              {dirty ? (recorded ? 'فيه تعديلات ما اتحفظتش' : 'الكشف ده لسه ما اتسجلش') : 'الكشف محفوظ'}
            </p>
            <button className="btn-primary w-full" onClick={() => save.mutate()} disabled={!dirty || save.isPending}><Save size={15} />{save.isPending ? 'جارٍ الحفظ…' : 'حفظ الحضور'}</button>
            {has('notifications') && counts.absent > 0 && <p className="mt-2 hidden text-xs text-pencil xl:block">أولياء أمور الغايبين هيوصلهم إشعار.</p>}
          </div>
        )}
      </aside>
    </div>
  );
}
