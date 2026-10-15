import { useQuery } from '@tanstack/react-query';
import { Clock, GraduationCap, Plus, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Avatar } from '../components/Avatar';
import ResourcePage, { FieldDef, RecordForm } from '../components/ResourcePage';
import { Empty, Locked, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { className, today } from '../lib/format';
import { CHART, useTheme } from '../lib/theme';
import { useAuth } from '../store/auth';

/** One band color per class, cycled in display order (reference: teal, green, blue, orange). */
export const CLASS_COLORS = ['#2F8FA3', '#3E9E7A', '#4F6BF5', '#E07B4F', '#7C5CD6', '#D2577A'];

const names = (xs: any[] | undefined) => (xs?.length ? xs.map((x) => ('section' in x ? className(x) : x.name)).join('، ') : '—');
const teachersOpt = { url: '/users?role=teacher', label: (u: any) => u.name };
export const classFields: FieldDef[] = [
  { key: 'stage', label: 'المرحلة', required: true },
  { key: 'name', label: 'الصف', required: true },
  { key: 'section', label: 'الشعبة' },
  { key: 'year', label: 'العام الدراسي' },
  { key: 'capacity', label: 'السعة (عدد الطلاب)', type: 'number' },
  { key: 'teacherIds', label: 'معلمو الفصل (الأول هو رائد الفصل)', type: 'multi', optionsFrom: teachersOpt },
];

/** Ten-step meter like the reference: filled steps = rate / 10, colored by how healthy the rate is. */
export function AttendanceMeter({ rate }: { rate: number | null }) {
  const filled = rate == null ? 0 : Math.round(rate / 10);
  const tone = rate == null ? '' : rate >= 90 ? 'bg-go' : rate >= 75 ? 'bg-amber-500' : 'bg-danger';
  return (
    <div className="flex gap-[3px]" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => <span key={i} className={`h-2.5 flex-1 rounded-[2px] ${i < filled ? tone : 'bg-sunken'}`} />)}
    </div>
  );
}

export default function Classes() {
  const { me } = useAuth();
  const mgr = me!.role === 'owner' || me!.role === 'admin';
  const [tab, setTab] = useState<'classes' | 'subjects'>('classes');
  const [adding, setAdding] = useState(false);

  const tabs = (
    <div className="inline-flex rounded-full border border-rule bg-surface p-1 text-sm" role="tablist" aria-label="الفصول أو المواد">
      {([['classes', 'الفصول'], ['subjects', 'المواد']] as const).map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
          className={`rounded-full px-4 py-1 transition ${tab === k ? 'bg-brand text-white' : 'text-pencil hover:text-graphite'}`}>{l}</button>
      ))}
    </div>
  );

  return (
    <div>
      {tab === 'classes' ? <ClassesBoard mgr={mgr} tabs={tabs} onAdd={() => setAdding(true)} /> : (
        <ResourcePage title="المواد الدراسية" url="/subjects" noun="مادة" canWrite={mgr} extraActions={tabs} fields={[
          { key: 'name', label: 'اسم المادة', required: true, list: true },
          { key: 'classIds', label: 'الفصول اللي بتدرس المادة', type: 'multi', optionsFrom: { url: '/classes', label: className }, list: (r) => names(r.classIds) },
          ...(mgr ? [{ key: 'teacherIds', label: 'معلمو المادة', type: 'multi' as const, optionsFrom: teachersOpt, list: (r: any) => names(r.teacherIds) }] : []),
        ]} />
      )}
      {adding && <RecordForm url="/classes" fields={classFields} row={{}} noun="فصل" onClose={() => setAdding(false)} />}
    </div>
  );
}

function ClassesBoard({ mgr, tabs, onAdd }: { mgr: boolean; tabs: React.ReactNode; onAdd: () => void }) {
  const c = CHART[useTheme((t) => t.theme)];
  const date = today();
  const q = useQuery({ queryKey: ['/classes', 'overview', date], queryFn: async () => (await api.get('/reports/classes-overview', { params: { date } })).data, retry: false });
  if ((q.error as any)?.response?.status === 402) return <Locked what="الفصول" />;
  if (q.isLoading) return <Spinner />;
  const { items, totals, byStage } = q.data;
  const tiles: { label: string; value: string; tint: string; hint?: string }[] = [
    { label: 'حضور المدرسة النهارده', value: totals.attendanceRate == null ? '—' : `${totals.attendanceRate}%`, tint: '61 220 151', hint: totals.marked ? `${totals.marked} طالب اتسجل` : 'لسه ما اتسجلش حضور' },
    { label: 'الطلاب النشطين', value: String(totals.students), tint: '91 115 255' },
    { label: 'المعلمين', value: String(totals.teachers), tint: '76 141 246' },
    totals.pendingLeaves != null
      ? { label: 'طلبات إجازة مستنية', value: String(totals.pendingLeaves), tint: '224 123 79' }
      : { label: 'متأخرين النهارده', value: String(totals.late), tint: '224 123 79' },
  ];

  return (
    <>
      <PageHeader title="الفصول" sub="ملخص الفصول النهارده" actions={<>{tabs}{mgr && <button className="btn-primary" onClick={onAdd}><Plus size={16} />إضافة فصل</button>}</>} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl p-4 text-center" style={{ background: `rgb(${t.tint} / .14)`, boxShadow: `inset 0 0 0 1px rgb(${t.tint} / .25)` }}>
            <div className="text-[13px] text-graphite/85">{t.label}</div>
            <div className="num mt-1 text-[2rem] font-light leading-tight" style={{ color: `rgb(${t.tint})` }}>{t.value}</div>
            {t.hint && <div className="text-xs text-pencil">{t.hint}</div>}
          </div>
        ))}
      </div>

      {!items.length ? <div className="card"><Empty text={mgr ? 'مفيش فصول لسه. ابدأ بإضافة أول فصل.' : 'مفيش فصول مرتبطة بيك لسه.'} /></div> : (
        <ul className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((k: any, i: number) => <li key={k._id}><ClassCard k={k} color={CLASS_COLORS[i % CLASS_COLORS.length]} /></li>)}
        </ul>
      )}

      {byStage.length > 1 && (
        <section className="card mt-6" aria-labelledby="h-stage">
          <h2 id="h-stage" className="sheet-title">الحضور حسب المرحلة</h2>
          <div className="h-56" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={byStage} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="stage" tick={{ fill: c.axis, fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: c.grid, opacity: 0.3 }} contentStyle={{ background: c.tipBg, border: `1px solid ${c.tipBorder}`, borderRadius: 10, color: c.tipText }} />
                <Bar dataKey="rate" name="حضور %" radius={[6, 6, 0, 0]} maxBarSize={44}>
                  {byStage.map((_: any, i: number) => <Cell key={i} fill={CLASS_COLORS[i % CLASS_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </>
  );
}

function ClassCard({ k, color }: { k: any; color: string }) {
  const a = k.attendance;
  const label = `${k.name} ${k.section || ''}`.trim();
  return (
    <article className="card flex h-full flex-col overflow-hidden p-0">
      <header className="flex items-center justify-between px-5 py-3 text-white" style={{ background: color }}>
        <h3 className="text-base font-bold !text-white">{label}</h3>
        <span className="text-[13px] text-white/85">{k.stage}</span>
      </header>
      <div className="grid flex-1 grid-cols-2">
        <div className="flex items-center gap-3 border-b border-l border-rule-soft p-4 dark:border-white/[.06]">
          {k.teacher ? <Avatar name={k.teacher.name} photo={k.teacher.photo} className="h-10 w-10 text-sm" /> : <span className="grid h-10 w-10 place-items-center rounded-full bg-sunken text-pencil"><UserRound size={18} /></span>}
          <div className="min-w-0">
            <div className="text-xs text-pencil">رائد الفصل</div>
            {k.teacher ? <Link to={`/teachers/${k.teacher._id}`} className="block truncate text-sm font-medium hover:text-brand">{k.teacher.name}</Link> : <span className="text-sm text-pencil">مش متحدد</span>}
          </div>
        </div>
        <div className="border-b border-rule-soft p-4 dark:border-white/[.06]">
          <div className="flex items-baseline justify-between"><span className="text-xs text-pencil">الحضور النهارده</span><span className="num text-xl font-medium">{a.rate == null ? '—' : `${a.rate}%`}</span></div>
          <div className="mt-2"><AttendanceMeter rate={a.rate} /></div>
        </div>
        <div className="flex items-center gap-3 border-l border-rule-soft p-4 dark:border-white/[.06]">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-sunken text-pencil"><GraduationCap size={18} /></span>
          <div>
            <div className="text-xs text-pencil">الطلاب</div>
            <div className="num text-xl font-medium">{k.students}{k.capacity && <span className="text-xs font-normal text-pencil"> / {k.capacity}</span>}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-sunken text-pencil"><Clock size={18} /></span>
          <div>
            <div className="text-xs text-pencil">المتأخرين</div>
            <div className={`num text-xl font-medium ${a.late ? 'text-amber-700' : ''}`}>{a.late || 0}</div>
            {a.absent > 0 && <div className="text-xs text-danger">غياب <span className="num">{a.absent}</span></div>}
          </div>
        </div>
      </div>
      <Link to={`/classes/${k._id}`} className="flex items-center justify-center gap-1 py-2.5 text-[13px] font-medium transition hover:brightness-110" style={{ background: `${color}22`, color }}>
        عرض التفاصيل
      </Link>
    </article>
  );
}
