import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Copy, Plus, Printer, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Empty, Field, Locked, Modal, PageHeader, Spinner, Table } from '../components/ui';
import { api, errMsg, toastErr } from '../lib/api';
import { className, DAYS_AR } from '../lib/format';
import { useAuth } from '../store/auth';

type View = { kind: 'class' | 'teacher'; id: string };

export default function Timetable() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const mgr = me!.role === 'owner' || me!.role === 'admin';
  const isTeacher = me!.role === 'teacher';
  const [view, setView] = useState<View>({ kind: isTeacher ? 'teacher' : 'class', id: isTeacher ? me!.id : '' });
  const [cell, setCell] = useState<{ day: number; period: number; slot?: any } | null>(null);
  const [bells, setBells] = useState(false);
  const [copy, setCopy] = useState(false);

  const periods = useQuery({ queryKey: ['tt-periods'], queryFn: async () => (await api.get('/timetable/periods')).data, retry: false });
  const classes = useQuery({ queryKey: ['classes-all'], queryFn: async () => (await api.get('/classes', { params: { limit: 200 } })).data.items });
  const teachers = useQuery({ queryKey: ['teachers'], enabled: mgr, queryFn: async () => (await api.get('/users', { params: { role: 'teacher' } })).data });
  const grid = useQuery({
    queryKey: ['tt', view.kind, view.id], enabled: !!view.id,
    queryFn: async () => (await api.get('/timetable', { params: view.kind === 'class' ? { classId: view.id } : { teacherId: view.id } })).data,
  });
  const overview = useQuery({ queryKey: ['tt-overview'], enabled: mgr && !!periods.data, queryFn: async () => (await api.get('/timetable/overview')).data });

  useEffect(() => { // open on the first class so the page is never blank
    if (!view.id && classes.data?.length) setView({ kind: 'class', id: classes.data[0]._id });
  }, [classes.data, view.id]);

  if ((periods.error as any)?.response?.status === 402) return <Locked what="جدول الحصص" />;
  if (periods.isLoading) return <Spinner />;
  const days: number[] = periods.data?.days || [];
  const pers: any[] = periods.data?.periods || [];
  const at = (d: number, p: number) => (grid.data || []).find((s: any) => s.day === d && s.period === p);
  const editable = mgr && view.kind === 'class';
  const viewName = view.kind === 'class'
    ? className(classes.data?.find((c: any) => c._id === view.id))
    : (teachers.data?.find((t: any) => t._id === view.id)?.name || me!.name);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['tt'] }); qc.invalidateQueries({ queryKey: ['tt-overview'] }); };

  return (
    <div>
      <PageHeader title="جدول الحصص" sub={view.id ? `${view.kind === 'class' ? 'جدول فصل' : 'جدول'} ${viewName}` : undefined} actions={<span className="no-print flex flex-wrap gap-2">
        {mgr && <button className="btn-ghost" onClick={() => setBells(true)}><Clock size={16} />مواعيد الحصص</button>}
        {editable && view.id && <button className="btn-ghost" onClick={() => setCopy(true)}><Copy size={16} />نسخ من فصل</button>}
        {view.id && pers.length > 0 && <button className="btn-ghost" onClick={() => window.print()}><Printer size={16} />طباعة</button>}
      </span>} />

      <div className="no-print mb-4 flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded border border-rule bg-white p-0.5 text-sm" role="group" aria-label="نوع الجدول">
          {(['class', 'teacher'] as const).map((k) => (
            <button key={k} aria-pressed={view.kind === k} onClick={() => setView({ kind: k, id: k === 'teacher' && isTeacher ? me!.id : '' })}
              className={`rounded-sm px-4 py-1.5 ${view.kind === k ? 'bg-brand text-white' : 'text-graphite hover:text-brand'}`}>{k === 'class' ? 'جدول فصل' : isTeacher ? 'جدولي' : 'جدول معلم'}</button>
          ))}
        </div>
        {view.kind === 'class' && (
          <select className="input w-auto min-w-48" value={view.id} onChange={(e) => setView({ kind: 'class', id: e.target.value })} aria-label="الفصل">
            <option value="">اختار الفصل</option>
            {classes.data?.map((c: any) => <option key={c._id} value={c._id}>{className(c)}، {c.stage}</option>)}
          </select>
        )}
        {view.kind === 'teacher' && mgr && (
          <select className="input w-auto min-w-48" value={view.id} onChange={(e) => setView({ kind: 'teacher', id: e.target.value })} aria-label="المعلم">
            <option value="">اختار المعلم</option>
            {teachers.data?.map((t: any) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {!pers.length ? (
        <div className="card text-center">
          <p className="text-sm text-pencil">{mgr ? 'ابدأ بتحديد مواعيد الحصص وأيام الدراسة، وبعدين املأ الجدول.' : 'الإدارة لسه ما حددتش مواعيد الحصص.'}</p>
          {mgr && <button className="btn-primary mt-4" onClick={() => setBells(true)}><Clock size={16} />حدد مواعيد الحصص</button>}
        </div>
      ) : !view.id ? <Empty text={view.kind === 'class' ? 'اختار فصل' : 'اختار معلم'} /> : grid.isLoading ? <Spinner /> : (
        <div className="timetable overflow-x-auto rounded-sm border border-rule bg-white">
          <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="th w-24">اليوم</th>
                {pers.map((p) => <th key={p.number} className="th text-center"><span className="block text-graphite">الحصة {p.number}</span><span className="num text-[11px] font-normal">{p.start}–{p.end}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d}>
                  <th scope="row" className="px-3 py-2 text-right text-sm font-medium text-brand">{DAYS_AR[d]}</th>
                  {pers.map((p) => {
                    const s = at(d, p.number);
                    const body = s ? (
                      <>
                        <span className="block font-medium text-graphite">{s.subjectId?.name}</span>
                        <span className="block truncate text-xs text-pencil">{view.kind === 'class' ? (s.teacherId?.name || 'بدون معلم') : className(s.classId)}</span>
                      </>
                    ) : editable ? <Plus size={14} className="mx-auto text-rule" aria-hidden /> : null;
                    return (
                      <td key={p.number} className={`h-16 border-r border-rule-soft p-0 text-center align-middle ${s && !s.teacherId ? 'bg-amber-50' : ''}`}>
                        {editable ? (
                          <button className="h-full w-full px-2 py-1.5 hover:bg-marker/30 focus-visible:bg-marker/30" onClick={() => setCell({ day: d, period: p.number, slot: s })}
                            aria-label={`${DAYS_AR[d]}، الحصة ${p.number}${s ? `، ${s.subjectId?.name}` : '، فاضية'}`}>{body}</button>
                        ) : <div className="px-2 py-1.5">{body || <span className="text-rule">—</span>}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mgr && overview.data && pers.length > 0 && (
        <div className="no-print mt-8 grid gap-6 lg:grid-cols-2">
          <div className="card p-0">
            <h3 className="sheet-title px-4 pt-4">نصاب المعلمين في الأسبوع</h3>
            {!overview.data.teachers.length ? <Empty text="مفيش معلمين. ضيفهم من المستخدمين والصلاحيات." /> : (
              <Table head={['المعلم', 'عدد الحصص']}>
                {overview.data.teachers.map((t: any) => (
                  <tr key={t._id}><td className="td"><button className="text-brand hover:underline" onClick={() => setView({ kind: 'teacher', id: t._id })}>{t.name}</button></td><td className="td num">{t.lessons}</td></tr>
                ))}
              </Table>
            )}
          </div>
          <div className="card p-0">
            <h3 className="sheet-title px-4 pt-4">الحصص الفاضية في كل فصل</h3>
            <Table head={['الفصل', 'المتسجل', 'فاضي']}>
              {overview.data.classes.map((c: any) => (
                <tr key={c._id}>
                  <td className="td"><button className="text-brand hover:underline" onClick={() => setView({ kind: 'class', id: c._id })}>{c.name}</button></td>
                  <td className="td num">{c.filled} / {c.total}</td>
                  <td className={`td num ${c.total - c.filled > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{c.total - c.filled}</td>
                </tr>
              ))}
            </Table>
          </div>
        </div>
      )}

      {cell && <SlotModal cell={cell} classId={view.id} teachers={teachers.data || []} onClose={() => setCell(null)} onDone={() => { setCell(null); refresh(); }} />}
      {bells && <BellsModal data={periods.data} onClose={() => setBells(false)} onDone={() => { setBells(false); qc.invalidateQueries({ queryKey: ['tt-periods'] }); refresh(); }} />}
      {copy && <CopyModal toClassId={view.id} classes={classes.data || []} onClose={() => setCopy(false)} onDone={() => { setCopy(false); refresh(); }} />}
    </div>
  );
}

function SlotModal({ cell, classId, teachers, onClose, onDone }: { cell: { day: number; period: number; slot?: any }; classId: string; teachers: any[]; onClose: () => void; onDone: () => void }) {
  const subjects = useQuery({ queryKey: ['subjects-all'], queryFn: async () => (await api.get('/subjects', { params: { limit: 200 } })).data.items });
  const s = cell.slot;
  const [f, setF] = useState({ subjectId: s?.subjectId?._id || '', teacherId: s?.teacherId?._id || '', room: s?.room || '' });
  const forClass = (subjects.data || []).filter((x: any) => !x.classIds?.length || x.classIds.some((c: any) => (c._id || c) === classId));
  const save = useMutation({
    mutationFn: async () => api.put('/timetable/slot', { day: cell.day, period: cell.period, classId, subjectId: f.subjectId, teacherId: f.teacherId || null, room: f.room || undefined }),
    onSuccess: () => { toast.success('اتحفظت الحصة'); onDone(); },
  });
  const del = useMutation({ mutationFn: async () => api.delete(`/timetable/slot/${s._id}`), onSuccess: () => { toast.success('اتمسحت الحصة'); onDone(); }, onError: toastErr });
  return (
    <Modal title={`${DAYS_AR[cell.day]}، الحصة ${cell.period}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="المادة *">
          <select className="input" required value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })} autoFocus>
            <option value="">اختار المادة</option>
            {forClass.map((x: any) => <option key={x._id} value={x._id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="المعلم">
          <select className="input" value={f.teacherId} onChange={(e) => setF({ ...f, teacherId: e.target.value })}>
            <option value="">بدون معلم لسه</option>
            {teachers.map((t: any) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="الفصل أو المعمل (اختياري)"><input className="input" value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} maxLength={40} /></Field>
        {save.isError && <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{errMsg(save.error)}</p>}
        <div className="flex items-center justify-between gap-2 pt-2">
          {s ? <button type="button" className="btn-ghost text-red-700 hover:border-red-400 hover:text-red-700" onClick={() => del.mutate()} disabled={del.isPending}><Trash2 size={15} />امسح الحصة</button> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>إلغاء</button>
            <button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'جارٍ الحفظ…' : 'حفظ الحصة'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function BellsModal({ data, onClose, onDone }: { data: any; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState<number[]>(data?.days?.length ? data.days : [0, 1, 2, 3, 4]);
  const [rows, setRows] = useState<{ start: string; end: string }[]>(
    data?.periods?.length ? data.periods.map((p: any) => ({ start: p.start, end: p.end })) : [{ start: '08:00', end: '08:45' }],
  );
  const save = useMutation({
    mutationFn: async () => api.put('/timetable/periods', { days, periods: rows.map((r, i) => ({ number: i + 1, ...r })) }),
    onSuccess: () => { toast.success('اتحفظت مواعيد الحصص'); onDone(); }, onError: toastErr,
  });
  const addRow = () => {
    const last = rows[rows.length - 1];
    const plus = (t: string, m: number) => { const [h, mm] = t.split(':').map(Number); const x = h * 60 + mm + m; return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
    setRows([...rows, last ? { start: plus(last.end, 5), end: plus(last.end, 50) } : { start: '08:00', end: '08:45' }]);
  };
  return (
    <Modal title="مواعيد الحصص وأيام الدراسة" onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-pencil">أيام الدراسة</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS_AR.map((n, d) => {
              const on = days.includes(d);
              return (
                <label key={d} className={`cursor-pointer rounded-sm border px-3 py-1.5 text-sm ${on ? 'border-brand bg-brand-light text-brand' : 'border-rule'}`}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setDays(on ? days.filter((x) => x !== d) : [...days, d].sort())} />{n}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="mt-5 text-xs font-medium text-pencil">الحصص</div>
        <div className="mt-2 divide-y divide-rule-soft rounded-sm border border-rule">
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="w-20 text-sm font-medium text-brand">الحصة {i + 1}</span>
              <label className="flex items-center gap-2 text-xs text-pencil">من<input type="time" className="input w-32" required value={r.start} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} /></label>
              <label className="flex items-center gap-2 text-xs text-pencil">إلى<input type="time" className="input w-32" required value={r.end} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} /></label>
              {rows.length > 1 && i === rows.length - 1 && <button type="button" className="mr-auto rounded p-1.5 text-red-700 hover:bg-red-50" onClick={() => setRows(rows.slice(0, -1))} aria-label="امسح آخر حصة"><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
        {rows.length < 12 && <button type="button" className="btn-ghost mt-3" onClick={addRow}><Plus size={15} />ضيف حصة</button>}
        <p className="mt-4 text-xs text-pencil">لو شلت يوم أو حصة، الحصص المتسجلة فيهم في الجدول هتتمسح.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" disabled={save.isPending || !days.length}>{save.isPending ? 'جارٍ الحفظ…' : 'حفظ المواعيد'}</button>
        </div>
      </form>
    </Modal>
  );
}

function CopyModal({ toClassId, classes, onClose, onDone }: { toClassId: string; classes: any[]; onClose: () => void; onDone: () => void }) {
  const [from, setFrom] = useState('');
  const to = classes.find((c) => c._id === toClassId);
  const run = useMutation({
    mutationFn: async () => (await api.post('/timetable/copy', { fromClassId: from, toClassId })).data,
    onSuccess: (d: any) => { toast.success(`اتنسخت ${d.copied} حصة`); onDone(); }, onError: toastErr,
  });
  return (
    <Modal title={`نسخ جدول إلى ${className(to)}`} onClose={onClose}>
      <Field label="انسخ المواد من فصل">
        <select className="input" value={from} onChange={(e) => setFrom(e.target.value)} autoFocus>
          <option value="">اختار الفصل</option>
          {classes.filter((c) => c._id !== toClassId).map((c) => <option key={c._id} value={c._id}>{className(c)}، {c.stage}</option>)}
        </select>
      </Field>
      <p className="mt-3 text-sm text-pencil">المواد ومكانها في الجدول بس هي اللي هتتنسخ، من غير المعلمين، عشان مايحصلش تعارض. جدول {className(to)} الحالي هيتمسح.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>إلغاء</button>
        <button className="btn-primary" disabled={!from || run.isPending} onClick={() => run.mutate()}>{run.isPending ? 'جارٍ النسخ…' : 'انسخ الجدول'}</button>
      </div>
    </Modal>
  );
}
