import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FieldDef, RecordForm } from '../components/ResourcePage';
import { Empty, Locked, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { className, dateAr } from '../lib/format';
import { useAuth } from '../store/auth';
import { classColor, subjectColor, subjectIcon } from './Classes';

export const examFields: FieldDef[] = [
  { key: 'name', label: 'اسم الامتحان', required: true },
  { key: 'subjectId', label: 'المادة', required: true, optionsFrom: { url: '/subjects', label: (s) => s.name } },
  { key: 'classId', label: 'الفصل', required: true, optionsFrom: { url: '/classes', label: className } },
  { key: 'term', label: 'الفصل الدراسي (مثلًا: الترم الأول)' },
  { key: 'date', label: 'التاريخ', type: 'date' },
  { key: 'maxScore', label: 'الدرجة العظمى', type: 'number', required: true },
];

export const STATUS = {
  upcoming: { label: 'جاي', cls: 'border-blue-300/60 bg-blue-50 text-blue-600' },
  pending: { label: 'مستني رصد', cls: 'border-amber-300/60 bg-amber-50 text-amber-700' },
  graded: { label: 'اترصد', cls: 'border-emerald-300/60 bg-emerald-50 text-emerald-700' },
} as const;

/** Exams board: summary tiles, filters, one card per exam; the card opens the exam's grade sheet. */
export default function Exams() {
  const { me } = useAuth();
  const canCreate = ['owner', 'admin', 'teacher'].includes(me!.role);
  const [f, setF] = useState({ q: '', term: '', classId: '', subjectId: '', status: '' });
  const [adding, setAdding] = useState(false);
  const params = { term: f.term || undefined, classId: f.classId || undefined, subjectId: f.subjectId || undefined };
  const list = useQuery({ queryKey: ['/exams', 'overview', params], queryFn: async () => (await api.get('/exams/overview', { params })).data, retry: false });
  const classes = useQuery({ queryKey: ['classes-all'], queryFn: async () => (await api.get('/classes', { params: { limit: 200 } })).data.items });
  const subjects = useQuery({ queryKey: ['subjects-all'], queryFn: async () => (await api.get('/subjects', { params: { limit: 200 } })).data.items });

  if ((list.error as any)?.response?.status === 402) return <Locked what="الامتحانات والدرجات" />;
  const d = list.data;
  const items = (d?.items || []).filter((e: any) => (!f.status || e.status === f.status) && (!f.q || e.name.includes(f.q) || e.subject?.name.includes(f.q)));
  const tiles: { label: string; value: any; tint: string; status: string | null }[] | undefined = d && [
    { label: 'الامتحانات', value: d.totals.exams, tint: '91 115 255', status: '' },
    { label: 'مستنية رصد', value: d.totals.pending, tint: '224 123 79', status: 'pending' },
    { label: 'جاية', value: d.totals.upcoming, tint: '76 141 246', status: 'upcoming' },
    { label: 'متوسط الدرجات', value: d.totals.averageScore == null ? '—' : `${d.totals.averageScore}%`, tint: '61 220 151', status: null },
  ];

  return (
    <div>
      <PageHeader title="الامتحانات والدرجات" sub="كل امتحان ونسبة الرصد ومتوسط الدرجات" actions={canCreate && <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} />امتحان جديد</button>} />

      {tiles && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((t) => {
            const on = t.status !== null && f.status === t.status && t.status !== '';
            const body = <>
              <div className="text-[13px] text-graphite/85">{t.label}</div>
              <div className="num mt-1 text-[2rem] font-light leading-tight" style={{ color: `rgb(${t.tint})` }}>{t.value}</div>
            </>;
            const style = { background: `rgb(${t.tint} / ${on ? '.24' : '.14'})`, boxShadow: `inset 0 0 0 ${on ? 2 : 1}px rgb(${t.tint} / ${on ? '.7' : '.25'})` };
            // tiles with a status double as quick filters
            return t.status === null
              ? <div key={t.label} className="rounded-xl p-4 text-center" style={style}>{body}</div>
              : <button key={t.label} aria-pressed={on} onClick={() => setF({ ...f, status: on || t.status === '' ? '' : t.status! })} className="rounded-xl p-4 text-center transition hover:brightness-110" style={style}>{body}</button>;
          })}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input className="input max-w-[220px]" type="search" placeholder="بحث باسم الامتحان أو المادة…" aria-label="بحث في الامتحانات" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select className="input w-auto" aria-label="الترم" value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })}>
          <option value="">كل الترمات</option>{d?.terms.map((t: string) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input w-auto" aria-label="الفصل" value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>
          <option value="">كل الفصول</option>{classes.data?.map((c: any) => <option key={c._id} value={c._id}>{className(c)}</option>)}
        </select>
        <select className="input w-auto" aria-label="المادة" value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
          <option value="">كل المواد</option>{subjects.data?.map((s: any) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <span className="ms-auto whitespace-nowrap text-[13px] text-pencil"><span className="num">{items.length}</span> {items.length > 2 && items.length < 11 ? 'امتحانات' : 'امتحان'}</span>
      </div>

      {list.isLoading ? <Spinner /> : !items.length ? (
        <div className="card"><Empty text={d?.items.length ? 'مفيش امتحانات بالفلتر ده.' : canCreate ? 'مفيش امتحانات لسه. ابدأ بـ "امتحان جديد".' : 'مفيش امتحانات لسه.'} /></div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((e: any) => <li key={e._id}><ExamCard e={e} /></li>)}
        </ul>
      )}

      {adding && <RecordForm url="/exams" fields={examFields} row={{ maxScore: 100 }} noun="امتحان" onClose={() => setAdding(false)} onSaved={() => list.refetch()} />}
    </div>
  );
}

function ExamCard({ e }: { e: any }) {
  const color = e.subject ? subjectColor(e.subject._id) : '#4F6BF5';
  const { Icon, text } = subjectIcon(e.subject?.name || '');
  const st = STATUS[e.status as keyof typeof STATUS];
  const done = e.students ? Math.round((e.graded / e.students) * 100) : 0;
  return (
    <Link to={`/exams/${e._id}`} className="card group relative flex h-full flex-col p-5 transition hover:-translate-y-0.5" style={{ boxShadow: `inset 0 3px 0 ${color}, var(--shadow-card)` }}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-bold" style={{ background: `${color}1F`, color }} aria-hidden>
          {Icon ? <Icon size={22} strokeWidth={2.2} /> : <span className={text!.length > 1 ? 'text-sm' : 'text-xl'}>{text}</span>}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs text-pencil">{e.subject?.name}{e.subject?.code && <span className="num rounded bg-sunken px-1.5 py-px text-[11px]">{e.subject.code}</span>}</div>
          <h3 className="mt-0.5 line-clamp-2 text-[16px] font-bold leading-snug group-hover:text-brand">{e.name}</h3>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {e.class && <span className="flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1"><span className="h-2 w-2 rounded-full" style={{ background: classColor(e.class._id) }} aria-hidden />{e.class.name}</span>}
        {e.date && <span className="flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 text-pencil"><CalendarDays size={12} />{dateAr(e.date)}</span>}
        {e.term && <span className="rounded-full bg-sunken px-2.5 py-1 text-pencil">{e.term}</span>}
      </div>

      <div className="mt-auto pt-4">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-pencil">الرصد <span className="num">{e.graded} / {e.students}</span></span>
          <span className="text-pencil">من <span className="num">{e.maxScore}</span></span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full" style={{ width: `${done}%`, background: color }} /></div>
        <div className="mt-3 grid grid-cols-2 border-t border-rule-soft pt-3 text-center dark:border-white/[.06]">
          <div><div className={`num text-xl font-medium ${e.averageScore != null && e.averageScore < 50 ? 'text-danger' : ''}`}>{e.averageScore == null ? '—' : `${e.averageScore}%`}</div><div className="text-xs text-pencil">المتوسط</div></div>
          <div><div className="num text-xl font-medium">{e.passRate == null ? '—' : `${e.passRate}%`}</div><div className="text-xs text-pencil">نسبة النجاح</div></div>
        </div>
      </div>
    </Link>
  );
}
