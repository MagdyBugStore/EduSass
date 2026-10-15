import { useQuery } from '@tanstack/react-query';
import { BookHeart, BookOpen, Clock, Dumbbell, FlaskConical, Globe2, GraduationCap, Landmark, LucideIcon, Monitor, Music, Palette, Pencil, Plus, Sigma, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Avatar } from '../components/Avatar';
import { FieldDef, RecordForm } from '../components/ResourcePage';
import { Empty, Locked, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { className, today } from '../lib/format';
import { CHART, useTheme } from '../lib/theme';
import { useAuth } from '../store/auth';

/** One band color per class, cycled in display order (reference: teal, green, blue, orange). */
export const CLASS_COLORS = ['#2F8FA3', '#3E9E7A', '#4F6BF5', '#E07B4F', '#7C5CD6', '#D2577A'];

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
        <SubjectsBoard mgr={mgr} tabs={tabs} />
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

// ---------------- Subjects board ----------------
const SUBJECT_COLORS = ['#2EAD6B', '#2F86D6', '#E9862F', '#8B4FD1', '#D9443E', '#D9A514'];
export const subjectFields: FieldDef[] = [
  { key: 'name', label: 'اسم المادة', required: true },
  { key: 'code', label: 'كود المادة (مثلًا MATH301)' },
  { key: 'classIds', label: 'الفصول اللي بتدرس المادة (فاضي = كل الفصول)', type: 'multi', optionsFrom: { url: '/classes', label: className } },
  { key: 'teacherIds', label: 'معلمو المادة', type: 'multi', optionsFrom: teachersOpt },
];

/** Icon picked from the subject's name; letters stand in for the language subjects. */
function subjectIcon(name: string): { Icon?: LucideIcon; text?: string } {
  const n = name.replace(/\s+/g, ' ');
  const map: [RegExp, LucideIcon | string][] = [
    [/رياض|حساب|جبر|هندس/, Sigma], [/علوم|كيمياء|فيزياء|أحياء|احياء/, FlaskConical], [/عرب/, 'ض'], [/إنجليز|انجليز|english/i, 'Aa'],
    [/فرنس/, 'Fr'], [/ألمان|الماني/, 'De'], [/تاريخ|دراسات|اجتماع/, Landmark], [/جغراف/, Globe2], [/دين|قرآن|قران|إسلام|اسلام|مسيح/, BookHeart],
    [/حاسب|كمبيوتر|برمج|تكنولوج/, Monitor], [/رسم|فن|تربية فنية/, Palette], [/رياضة|بدنية|تربية رياضية/, Dumbbell], [/موسيق/, Music],
  ];
  const hit = map.find(([rx]) => rx.test(n));
  if (!hit) return { Icon: BookOpen };
  return typeof hit[1] === 'string' ? { text: hit[1] } : { Icon: hit[1] };
}

function SubjectsBoard({ mgr, tabs }: { mgr: boolean; tabs: React.ReactNode }) {
  const [q, setQ] = useState('');
  const [form, setForm] = useState<any>(null);
  const list = useQuery({ queryKey: ['/subjects', 'overview'], queryFn: async () => (await api.get('/reports/subjects-overview')).data, retry: false });
  const all = useQuery({ queryKey: ['/subjects', 'raw'], enabled: mgr, queryFn: async () => (await api.get('/subjects', { params: { limit: 200 } })).data.items });
  if ((list.error as any)?.response?.status === 402) return <Locked what="المواد" />;
  const items = (list.data || []).filter((s: any) => !q || s.name.includes(q) || s.code?.toLowerCase().includes(q.toLowerCase()));
  const edit = (id: string) => setForm(all.data?.find((x: any) => x._id === id) || null);

  return (
    <>
      <PageHeader title="المواد الدراسية" sub="المعلمين والفصول ومتوسط الدرجات لكل مادة" actions={<>{tabs}{mgr && <button className="btn-primary" onClick={() => setForm({})}><Plus size={16} />إضافة مادة</button>}</>} />
      <div className="mb-5 flex items-center justify-between gap-3">
        <input className="input max-w-xs" type="search" placeholder="بحث بالاسم أو الكود…" aria-label="بحث في المواد" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="whitespace-nowrap text-[13px] text-pencil"><span className="num">{items.length}</span> {items.length > 2 && items.length < 11 ? 'مواد' : 'مادة'}</span>
      </div>
      {list.isLoading ? <Spinner /> : !items.length ? <div className="card"><Empty text={q ? 'مفيش مادة بالاسم ده' : 'مفيش مواد لسه.'} /></div> : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((s: any, i: number) => <li key={s._id}><SubjectCard s={s} color={SUBJECT_COLORS[i % SUBJECT_COLORS.length]} onEdit={mgr ? () => edit(s._id) : undefined} /></li>)}
        </ul>
      )}
      {form && <RecordForm url="/subjects" fields={subjectFields} row={form} noun="مادة" onClose={() => setForm(null)} />}
    </>
  );
}

function SubjectCard({ s, color, onEdit }: { s: any; color: string; onEdit?: () => void }) {
  const { Icon, text } = subjectIcon(s.name);
  const pct = s.averageScore;
  return (
    <article className="card relative flex h-full flex-col overflow-hidden p-5" style={{ boxShadow: `inset 0 3px 0 ${color}, var(--shadow-card)` }}>
      <header className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-xl font-bold" style={{ background: `${color}1F`, color }} aria-hidden>
          {Icon ? <Icon size={24} strokeWidth={2.2} /> : <span className={text!.length > 1 ? 'text-base' : 'text-2xl'}>{text}</span>}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[17px] font-bold leading-tight">{s.name}</h3>
          <div className="num mt-0.5 text-right text-xs text-pencil">{s.code || '—'}</div>
        </div>
        {onEdit && <button onClick={onEdit} className="rounded-lg p-1.5 text-pencil hover:bg-sunken hover:text-graphite" aria-label={`تعديل ${s.name}`}><Pencil size={15} /></button>}
      </header>

      <div className="mt-4 flex items-center border-y border-rule-soft py-2.5 text-[13px] dark:border-white/[.06]">
        <span className="flex-1 text-pencil">المعلمين: <b className="num font-semibold text-graphite">{s.teachers}</b></span>
        <span className="h-4 w-px bg-rule" aria-hidden />
        <span className="flex-1 text-left text-pencil">الفصول: <b className="num font-semibold text-graphite">{s.allClasses ? 'كل الفصول' : s.classes}</b></span>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-pencil">متوسط الدرجات</span>
          <b className="num text-[15px] font-semibold">{pct == null ? '—' : `${pct}%`}</b>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={`متوسط درجات ${s.name}`}>
          {pct != null && <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />}
        </div>
        <div className="mt-2 flex justify-between text-xs text-pencil">
          <span>{s.lessons ? `${s.lessons} ${s.lessons <= 10 && s.lessons > 1 ? 'حصص' : 'حصة'} في الأسبوع` : 'مش في الجدول'}</span>
          <span>{s.exams ? `${s.exams} ${s.exams <= 10 && s.exams > 1 ? 'امتحانات' : 'امتحان'}` : 'لسه مفيش درجات'}</span>
        </div>
      </div>
    </article>
  );
}
