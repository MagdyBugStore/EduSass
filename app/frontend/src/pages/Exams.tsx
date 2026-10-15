import { useQuery } from '@tanstack/react-query';
import { ArrowDownUp, ClipboardCheck, Eye, FileText, PencilLine, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FieldDef, RecordForm } from '../components/ResourcePage';
import { Empty, Locked, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { className, dateAr } from '../lib/format';
import { useAuth } from '../store/auth';
import { classColor, subjectColor } from './Classes';

export const examFields: FieldDef[] = [
  { key: 'name', label: 'اسم الامتحان', required: true },
  { key: 'subjectId', label: 'المادة', required: true, optionsFrom: { url: '/subjects', label: (s) => s.name } },
  { key: 'classId', label: 'الفصل', required: true, optionsFrom: { url: '/classes', label: className } },
  { key: 'term', label: 'الفصل الدراسي (مثلًا: الترم الأول)' },
  { key: 'date', label: 'التاريخ', type: 'date' },
  { key: 'maxScore', label: 'الدرجة العظمى', type: 'number', required: true },
];

/** Status pills (solid, like the reference): scheduled, waiting for grades, graded. */
export const STATUS = {
  upcoming: { label: 'مجدول', cls: 'bg-blue-600 text-white', row: '' },
  pending: { label: 'مستني رصد', cls: 'bg-amber-500 text-white', row: 'bg-amber-50/70 ring-amber-300/50 dark:bg-amber-50/40' },
  graded: { label: 'اترصد', cls: 'bg-emerald-600 text-white', row: '' },
} as const;
type Status = keyof typeof STATUS;

const SORTS = { 'date-desc': 'الأحدث', 'date-asc': 'الأقدم', name: 'الاسم', avg: 'الأقل متوسطًا' } as const;

/** Exam management: one row per exam with status, date, grading progress and actions. */
export default function Exams() {
  const { me } = useAuth();
  const canWrite = ['owner', 'admin', 'teacher'].includes(me!.role);
  const [f, setF] = useState({ q: '', term: '', classId: '', subjectId: '', status: '' as '' | Status, sort: 'date-desc' as keyof typeof SORTS });
  const [form, setForm] = useState<any>(null);
  const params = { term: f.term || undefined, classId: f.classId || undefined, subjectId: f.subjectId || undefined };
  const list = useQuery({ queryKey: ['/exams', 'overview', params], queryFn: async () => (await api.get('/exams/overview', { params })).data, retry: false });
  const classes = useQuery({ queryKey: ['classes-all'], queryFn: async () => (await api.get('/classes', { params: { limit: 200 } })).data.items });
  const subjects = useQuery({ queryKey: ['subjects-all'], queryFn: async () => (await api.get('/subjects', { params: { limit: 200 } })).data.items });
  const all: any[] = useMemo(() => list.data?.items || [], [list.data]);

  const items = useMemo(() => {
    const byDate = (e: any) => (e.date ? +new Date(e.date) : 0);
    const rows = all.filter((e) => (!f.status || e.status === f.status) && (!f.q || e.name.includes(f.q) || e.subject?.name.includes(f.q)));
    const cmp: Record<string, (a: any, b: any) => number> = {
      'date-desc': (a, b) => byDate(b) - byDate(a), 'date-asc': (a, b) => byDate(a) - byDate(b),
      name: (a, b) => a.name.localeCompare(b.name, 'ar'), avg: (a, b) => (a.averageScore ?? 101) - (b.averageScore ?? 101),
    };
    return [...rows].sort(cmp[f.sort]);
  }, [all, f]);

  if ((list.error as any)?.response?.status === 402) return <Locked what="الامتحانات والدرجات" />;
  const count = (s: Status) => all.filter((e) => e.status === s).length;
  const tabs: [string, '' | Status, number][] = [['الكل', '', all.length], ['مجدول', 'upcoming', count('upcoming')], ['مستني رصد', 'pending', count('pending')], ['اترصد', 'graded', count('graded')]];
  const openEdit = async (id: string) => setForm((await api.get(`/exams/${id}`)).data);

  return (
    <div>
      <PageHeader title="إدارة الامتحانات" sub={list.data?.totals.averageScore != null ? `متوسط الدرجات في كل الامتحانات المرصودة ${list.data.totals.averageScore}%` : 'كل امتحان وحالته ونسبة الرصد'}
        actions={canWrite && <button className="btn-primary" onClick={() => setForm({ maxScore: 100 })}><Plus size={16} />امتحان جديد</button>} />

      <section className="card p-0" aria-label="الامتحانات">
        {/* status tabs with counts, then filters and sorting */}
        <div className="flex flex-wrap items-center gap-3 border-b border-rule-soft p-4 dark:border-white/[.06]">
          <div className="inline-flex flex-wrap gap-1 rounded-full bg-sunken p-1 text-[13px]" role="tablist" aria-label="الحالة">
            {tabs.map(([label, key, n]) => (
              <button key={label} role="tab" aria-selected={f.status === key} onClick={() => setF({ ...f, status: key })}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${f.status === key ? 'bg-surface font-medium text-graphite shadow' : 'text-pencil hover:text-graphite'}`}>
                {label}<span className={`num rounded-full px-1.5 text-[11px] ${f.status === key ? 'bg-brand-light text-brand' : 'bg-surface/60'}`}>{n}</span>
              </button>
            ))}
          </div>
          <label className="ms-auto flex items-center gap-2 text-[13px] text-pencil">
            <ArrowDownUp size={14} />
            <select className="input h-9 w-auto" aria-label="ترتيب" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as any })}>
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>ترتيب: {v}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <input className="input max-w-[240px]" type="search" placeholder="بحث باسم الامتحان أو المادة…" aria-label="بحث في الامتحانات" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <select className="input w-auto" aria-label="الترم" value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })}>
            <option value="">كل الترمات</option>{list.data?.terms.map((t: string) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="input w-auto" aria-label="الفصل" value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>
            <option value="">كل الفصول</option>{classes.data?.map((c: any) => <option key={c._id} value={c._id}>{className(c)}</option>)}
          </select>
          <select className="input w-auto" aria-label="المادة" value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
            <option value="">كل المواد</option>{subjects.data?.map((s: any) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </div>

        {/* column headings (desktop) */}
        <div className="hidden grid-cols-[minmax(0,2.2fr)_1fr_110px_120px_150px_auto] items-center gap-4 border-y border-rule-soft px-8 py-2.5 text-xs text-pencil lg:grid dark:border-white/[.06]">
          <span>الامتحان</span><span>الفصل</span><span>الحالة</span><span>التاريخ</span><span>الرصد والمتوسط</span><span className="w-[310px] text-left">الإجراءات</span>
        </div>

        {list.isLoading ? <Spinner /> : !items.length ? (
          <Empty text={all.length ? 'مفيش امتحانات بالفلتر ده.' : canWrite ? 'مفيش امتحانات لسه. ابدأ بـ "امتحان جديد".' : 'مفيش امتحانات لسه.'} />
        ) : (
          <ul className="space-y-2 p-3">
            {items.map((e) => <ExamRow key={e._id} e={e} canWrite={canWrite} onEdit={() => openEdit(e._id)} />)}
          </ul>
        )}
      </section>

      {form && <RecordForm url="/exams" fields={examFields} row={form} noun="امتحان" onClose={() => setForm(null)} onSaved={() => list.refetch()} />}
    </div>
  );
}

function ExamRow({ e, canWrite, onEdit }: { e: any; canWrite: boolean; onEdit: () => void }) {
  const color = e.subject ? subjectColor(e.subject._id) : '#4F6BF5';
  const st = STATUS[e.status as Status];
  const done = e.students ? Math.round((e.graded / e.students) * 100) : 0;
  // the third action follows the exam's state
  const next = e.status === 'upcoming'
    ? (canWrite && <button className="btn-ghost h-8 px-3" onClick={onEdit}>تغيير الموعد</button>)
    : e.status === 'pending'
      ? <Link to={`/exams/${e._id}`} className="btn h-8 border border-amber-300/70 bg-amber-50 px-3 text-amber-700 hover:brightness-105"><ClipboardCheck size={14} />{canWrite ? 'رصد الدرجات' : 'التفاصيل'}</Link>
      : <Link to={`/exams/${e._id}`} className="btn h-8 border border-emerald-300/70 bg-emerald-50 px-3 text-emerald-700 hover:brightness-105">النتائج</Link>;

  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 rounded-xl border border-rule/70 px-4 py-3 ring-1 ring-transparent transition hover:border-brand/40 lg:grid-cols-[minmax(0,2.2fr)_1fr_110px_120px_150px_auto] lg:px-5 dark:border-white/[.06] ${st.row}`}>
      <Link to={`/exams/${e._id}`} className="flex min-w-0 items-center gap-3 hover:text-brand">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: `${color}1F`, color }} aria-hidden><FileText size={19} /></span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium">{e.name}</span>
          <span className="block truncate text-xs text-pencil"><span className="font-medium" style={{ color }}>{e.subject?.name}</span>، {e.term || 'بدون ترم'}، من <span className="num">{e.maxScore}</span></span>
        </span>
      </Link>

      <span className={`justify-self-end rounded-full px-3 py-1 text-xs font-medium lg:hidden ${st.cls}`}>{st.label}</span>

      <span className="flex items-center gap-2 text-[13px]">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.class ? classColor(e.class._id) : undefined }} aria-hidden />{e.class?.name}
      </span>
      <span className="hidden lg:block"><span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span></span>
      <span className="num text-[13px] text-graphite/85">{e.date ? dateAr(e.date) : <span className="text-pencil">بدون تاريخ</span>}</span>

      <span className="col-span-2 lg:col-span-1">
        <span className="flex items-baseline justify-between text-xs text-pencil">
          <span className="num">{e.graded} / {e.students}</span>
          <span className={`num font-medium ${e.averageScore != null && e.averageScore < 50 ? 'text-danger' : 'text-graphite'}`}>{e.averageScore == null ? '—' : `${e.averageScore}%`}</span>
        </span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full" style={{ width: `${done}%`, background: color }} /></span>
      </span>

      <span className="col-span-2 flex flex-wrap justify-end gap-2 lg:col-span-1 lg:w-[310px] lg:flex-nowrap">
        <Link to={`/exams/${e._id}`} className="btn-ghost h-8 px-3"><Eye size={14} />عرض</Link>
        {canWrite && <button className="btn-ghost h-8 px-3" onClick={onEdit}><PencilLine size={14} />تعديل</button>}
        {next}
      </span>
    </li>
  );
}
