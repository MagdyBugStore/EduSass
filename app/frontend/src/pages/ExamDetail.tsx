import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Save, Trash2, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Avatar } from '../components/Avatar';
import { RecordForm } from '../components/ResourcePage';
import { Empty, Modal, Spinner } from '../components/ui';
import { api, errMsg, toastErr } from '../lib/api';
import { dateAr } from '../lib/format';
import { CHART, useTheme } from '../lib/theme';
import { useAuth } from '../store/auth';
import { classColor, subjectColor, subjectIcon } from './Classes';
import { examFields } from './Exams';

const BANDS = [
  { label: 'أقل من 50', from: 0, to: 50, color: '#E24C65' },
  { label: '50–64', from: 50, to: 65, color: '#E9862F' },
  { label: '65–74', from: 65, to: 75, color: '#D9A514' },
  { label: '75–84', from: 75, to: 85, color: '#2F86D6' },
  { label: '85–100', from: 85, to: 101, color: '#2EAD6B' },
];

/** One exam: its numbers, the grade sheet (Enter moves down), how scores spread, and the top of the class. */
export default function ExamDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { me } = useAuth();
  const c = CHART[useTheme((t) => t.theme)];
  const [rows, setRows] = useState<any[]>([]);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const q = useQuery({ queryKey: ['marks', id], queryFn: async () => (await api.get(`/exams/marks/${id}`)).data, retry: false });
  useEffect(() => { if (q.data) { setRows(q.data.rows.map((r: any) => ({ ...r, score: r.score ?? '' }))); setDirty(false); } }, [q.data]);
  const canEdit = ['owner', 'admin', 'teacher'].includes(me!.role);

  const save = useMutation({
    mutationFn: async () => api.post(`/exams/marks/${id}`, {
      rows: rows.filter((r) => r.score !== '' && r.score != null).map((r) => ({ studentId: r._id, score: Number(r.score), notes: r.notes || undefined })),
    }),
    onSuccess: () => { toast.success('اتحفظت الدرجات'); qc.invalidateQueries({ queryKey: ['marks', id] }); qc.invalidateQueries({ queryKey: ['/exams'] }); },
    onError: toastErr,
  });
  const del = useMutation({
    mutationFn: async () => api.delete(`/exams/${id}`),
    onSuccess: () => { toast.success('اتمسح الامتحان'); qc.invalidateQueries({ queryKey: ['/exams'] }); nav('/exams'); },
    onError: toastErr,
  });

  const exam = q.data?.exam;
  const max = exam?.maxScore || 100;
  const stats = useMemo(() => {
    const s = rows.filter((r) => r.score !== '' && r.score != null).map((r) => Number(r.score));
    const pct = s.map((v) => (v / max) * 100);
    return {
      graded: s.length, total: rows.length,
      avg: pct.length ? Math.round(pct.reduce((t, p) => t + p, 0) / pct.length) : null,
      hi: s.length ? Math.max(...s) : null, lo: s.length ? Math.min(...s) : null,
      pass: pct.length ? Math.round((pct.filter((p) => p >= 50).length / pct.length) * 100) : null,
      bands: BANDS.map((b) => ({ ...b, n: pct.filter((p) => p >= b.from && p < b.to).length })),
      top: rows.filter((r) => r.score !== '' && r.score != null).sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 3),
    };
  }, [rows, max]);

  if (q.isLoading) return <Spinner />;
  if ((q.error as any)?.response?.status === 403) return <div className="card"><Empty text={errMsg(q.error)} /></div>;
  if (!exam) return <Empty text="الامتحان غير موجود" />;
  const color = subjectColor(exam.subjectId._id);
  const { Icon, text } = subjectIcon(exam.subjectId.name);
  const cls = `${exam.classId.name} ${exam.classId.section || ''}`.trim();
  const setScore = (i: number, v: string) => { setRows(rows.map((x, j) => (j === i ? { ...x, score: v } : x))); setDirty(true); };
  const invalid = rows.some((r) => r.score !== '' && (Number(r.score) < 0 || Number(r.score) > max));

  return (
    <div>
      <header className="card overflow-hidden p-0" style={{ boxShadow: `inset 0 4px 0 ${color}, var(--shadow-card)` }}>
        <div className="flex flex-wrap items-center gap-5 px-6 pb-5 pt-7">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-bold" style={{ background: `${color}1F`, color }} aria-hidden>
            {Icon ? <Icon size={32} strokeWidth={2.2} /> : <span className={text!.length > 1 ? 'text-xl' : 'text-3xl'}>{text}</span>}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-bold leading-tight">{exam.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-pencil">
              <Link to={`/subjects/${exam.subjectId._id}`} className="hover:text-brand">{exam.subjectId.name}</Link>
              <Link to={`/classes/${exam.classId._id}`} className="flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-0.5 hover:text-brand"><span className="h-2 w-2 rounded-full" style={{ background: classColor(exam.classId._id) }} />{cls}</Link>
              {exam.date && <span className="rounded-full bg-sunken px-2.5 py-0.5">{dateAr(exam.date)}</span>}
              {exam.term && <span className="rounded-full bg-sunken px-2.5 py-0.5">{exam.term}</span>}
              <span className="rounded-full bg-sunken px-2.5 py-0.5">من <span className="num">{max}</span></span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && <button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={15} />تعديل</button>}
            {canEdit && <button className="btn-ghost hover:text-danger" onClick={() => setDeleting(true)}><Trash2 size={15} />مسح</button>}
            <Link to="/exams" className="btn-ghost">كل الامتحانات</Link>
          </div>
        </div>
        <dl className="grid grid-cols-2 border-t border-rule-soft sm:grid-cols-5 dark:border-white/[.06]">
          {([
            ['المتوسط', stats.avg == null ? '—' : `${stats.avg}%`], ['أعلى درجة', stats.hi ?? '—'], ['أقل درجة', stats.lo ?? '—'],
            ['نسبة النجاح', stats.pass == null ? '—' : `${stats.pass}%`], ['اترصد', `${stats.graded} / ${stats.total}`],
          ] as [string, any][]).map(([k, v]) => <div key={k} className="px-6 py-4"><dt className="text-xs text-pencil">{k}</dt><dd className="num mt-1 text-2xl font-light">{v}</dd></div>)}
        </dl>
        <div className="h-1.5 bg-sunken"><span className="block h-full transition-all" style={{ width: `${stats.total ? (stats.graded / stats.total) * 100 : 0}%`, background: color }} /></div>
      </header>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card p-0" aria-labelledby="h-sheet">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <h2 id="h-sheet" className="text-base font-medium">كشف الدرجات</h2>
            {canEdit && <span className="text-xs text-pencil">اكتب الدرجة واضغط Enter تروح للطالب اللي بعده</span>}
          </div>
          {!rows.length ? <Empty text="مفيش طلاب نشطين في الفصل ده." /> : (
            <ol className="mt-3">
              {rows.map((r, i) => {
                const v = r.score === '' ? null : Number(r.score), pct = v == null ? null : Math.round((v / max) * 100), bad = v != null && (v < 0 || v > max);
                return (
                  <li key={r._id} className="flex flex-wrap items-center gap-3 border-t border-rule-soft px-5 py-2.5 dark:border-white/[.06]">
                    <span className="num w-6 text-center text-xs text-pencil">{i + 1}</span>
                    <Avatar name={r.name} photo={r.photo} className="h-9 w-9 text-xs" />
                    <Link to={`/students/${r._id}`} className="min-w-0 flex-1 hover:text-brand">
                      <span className="block truncate text-sm font-medium">{r.name}</span>
                      <span className="num block text-xs text-pencil">{r.code}</span>
                    </Link>
                    <div className="hidden w-28 sm:block" aria-hidden>
                      <div className="h-1.5 overflow-hidden rounded-full bg-sunken">{pct != null && !bad && <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: pct < 50 ? c.danger : color }} />}</div>
                    </div>
                    <span className={`num w-12 text-left text-xs ${pct != null && pct < 50 ? 'text-danger' : 'text-pencil'}`}>{pct == null || bad ? '' : `${pct}%`}</span>
                    {canEdit ? (
                      <input type="number" inputMode="decimal" min={0} max={max} step="any" data-mark={i} aria-label={`درجة ${r.name}`} aria-invalid={bad}
                        className={`input h-9 w-20 text-center ${bad ? 'border-danger focus:border-danger focus:ring-danger/25' : ''}`}
                        value={r.score} onChange={(e) => setScore(i, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (document.querySelector(`[data-mark="${i + 1}"]`) as HTMLInputElement | null)?.focus(); } }} />
                    ) : <span className="num w-20 text-center text-sm">{v ?? '—'}</span>}
                  </li>
                );
              })}
            </ol>
          )}
          {canEdit && rows.length > 0 && (
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-rule-soft bg-surface/95 px-5 py-3 backdrop-blur dark:border-white/[.06]">
              <span className={`text-[13px] ${invalid ? 'text-danger' : 'text-pencil'}`}>{invalid ? `فيه درجة أكبر من ${max} أو أقل من صفر` : dirty ? 'فيه تعديلات ما اتحفظتش' : 'كل الدرجات محفوظة'}</span>
              <button className="btn-primary" onClick={() => save.mutate()} disabled={!dirty || invalid || save.isPending}><Save size={15} />{save.isPending ? 'جارٍ الحفظ…' : 'حفظ الدرجات'}</button>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="card" aria-labelledby="h-dist">
            <h2 id="h-dist" className="sheet-title">توزيع الدرجات</h2>
            {!stats.graded ? <p className="text-sm text-pencil">لسه مفيش درجات مرصودة.</p> : (
              <div className="h-48" dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={stats.bands} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: c.grid, opacity: 0.3 }} formatter={(v) => [v, 'طالب']} contentStyle={{ background: c.tipBg, border: `1px solid ${c.tipBorder}`, borderRadius: 10, color: c.tipText }} />
                    <Bar dataKey="n" radius={[6, 6, 0, 0]} maxBarSize={36}>{stats.bands.map((b) => <Cell key={b.label} fill={b.color} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
          <section className="card" aria-labelledby="h-top">
            <h2 id="h-top" className="sheet-title flex items-center gap-2"><Trophy size={16} className="text-amber-500" />الأوائل</h2>
            {!stats.top.length ? <p className="text-sm text-pencil">هيظهروا بعد رصد الدرجات.</p> : (
              <ol className="space-y-3">
                {stats.top.map((r, i) => (
                  <li key={r._id} className="flex items-center gap-3">
                    <span className={`num grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${i === 0 ? 'bg-amber-500 text-white' : 'bg-sunken text-pencil'}`}>{i + 1}</span>
                    <Avatar name={r.name} photo={r.photo} className="h-8 w-8 text-xs" />
                    <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                    <span className="num text-sm font-medium">{r.score} / {max}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      {editing && <RecordForm url="/exams" fields={examFields} row={{ ...exam, subjectId: exam.subjectId._id, classId: exam.classId._id }} noun="امتحان" onClose={() => setEditing(false)} onSaved={() => qc.invalidateQueries({ queryKey: ['marks', id] })} />}
      {deleting && (
        <Modal title="مسح الامتحان" onClose={() => setDeleting(false)}>
          <p className="text-sm">هيتمسح "{exam.name}" لـ {cls} وكل الدرجات المرصودة فيه ({stats.graded} درجة). مفيش رجوع بعد المسح.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setDeleting(false)}>إلغاء</button>
            <button className="btn-danger" onClick={() => del.mutate()} disabled={del.isPending}>{del.isPending ? 'جارٍ المسح…' : 'امسح الامتحان'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
