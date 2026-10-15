import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, GraduationCap, Pencil, School, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader, Spinner, Stat, StatStrip } from '../components/ui';
import { api } from '../lib/api';
import { dateAr, money, PLAN_AR } from '../lib/format';
import { CHART, useTheme } from '../lib/theme';
import { useAuth } from '../store/auth';

type Palette = (typeof CHART)['light' | 'dark'];

const chartKit = (c: Palette) => ({
  AXIS: { fontSize: 11, tick: { fill: c.axis }, tickLine: false, axisLine: false },
  TIP: { contentStyle: { background: c.tipBg, border: `1px solid ${c.tipBorder}`, borderRadius: 10, fontFamily: 'Tajawal', fontSize: 12, color: c.tipText }, labelStyle: { color: c.tipText, fontWeight: 700 }, itemStyle: { color: c.accent } },
});

/** Progress ring (reference's "السنة 1 / 2" rings): track + gradient arc, label in the middle. */
function Ring({ value, label, c, id }: { value: number | null; label: string; c: Palette; id: string }) {
  const r = 38, len = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <figure className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 100 100" className="h-[88px] w-[88px] -rotate-90 sm:h-24 sm:w-24" role="img" aria-label={`${label}: ${value ?? 'لا توجد بيانات'}%`}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c.go} /><stop offset="1" stopColor={c.accent} /></linearGradient></defs>
        <circle cx="50" cy="50" r={r + 7} fill={c.track} opacity={0.55} />
        <circle cx="50" cy="50" r={r} fill="none" stroke={c.grid} strokeWidth="5" />
        {v > 0 && <circle cx="50" cy="50" r={r} fill="none" stroke={`url(#${id})`} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(v / 100) * len} ${len}`} />}
        <text x="50" y="50" transform="rotate(90 50 50)" textAnchor="middle" dominantBaseline="central" fill="currentColor" className="text-graphite" fontSize="17" fontWeight="500">
          {value == null ? '—' : `${value}%`}
        </text>
      </svg>
      <figcaption className="text-[13px] text-pencil">{label}</figcaption>
    </figure>
  );
}

/** Open gauge (reference's 80% dial). */
function Gauge({ used, max, c }: { used: number; max: number; c: Palette }) {
  const pct = max ? Math.round((used / max) * 100) : 0;
  const r = 40, len = 2 * Math.PI * r, arc = len * 0.75, fill = arc * Math.min(1, pct / 100);
  return (
    <svg viewBox="0 0 100 100" className="mx-auto h-40 w-40 rotate-[135deg]" role="img" aria-label={`استخدام الباقة ${pct}%`}>
      <defs><linearGradient id="gauge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={c.go} /><stop offset="1" stopColor={c.accent} /></linearGradient></defs>
      <circle cx="50" cy="50" r={r} fill="none" stroke={c.grid} strokeWidth="6" strokeDasharray={`${arc} ${len}`} strokeLinecap="round" />
      {pct > 0 && <circle cx="50" cy="50" r={r} fill="none" stroke={pct >= 90 ? c.danger : 'url(#gauge)'} strokeWidth="6" strokeDasharray={`${fill} ${len}`} strokeLinecap="round" />}
      <text x="50" y="50" transform="rotate(-135 50 50)" textAnchor="middle" dominantBaseline="central" fill="currentColor" className="text-graphite" fontSize="20" fontWeight="400">{pct}%</text>
    </svg>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-rule-soft py-3 dark:border-white/[.06]">
      <dt className="text-[13px] text-graphite/80">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-value">{value}</dd>
    </div>
  );
}

export default function Dashboard() {
  const { me, has } = useAuth();
  const c = CHART[useTheme((t) => t.theme)];
  const { AXIS, TIP } = chartKit(c);
  const sum = useQuery({ queryKey: ['summary'], queryFn: async () => (await api.get('/reports/summary')).data });
  const byClass = useQuery({ queryKey: ['by-class'], queryFn: async () => (await api.get('/reports/students-by-class')).data });
  const kpi = useQuery({ queryKey: ['kpi'], enabled: has('kpi'), queryFn: async () => (await api.get('/reports/kpi')).data });
  const school = useQuery({ queryKey: ['school'], queryFn: async () => (await api.get('/school')).data });
  if (sum.isLoading) return <Spinner />;
  const s = sum.data;
  const a = s?.attendanceToday || {};
  const role = me!.role;
  const mgr = role === 'owner' || role === 'admin';
  const canFees = mgr || role === 'accountant';
  const sc = school.data;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <PageHeader title="الملخص" sub={`أهلاً ${me!.name}`} actions={(mgr || role === 'receptionist') && <>
          <Link to="/reports" className="btn-ghost">تقرير الحضور</Link>
          <Link to="/students" className="btn-primary">إضافة طالب</Link>
        </>} />

        <StatStrip cols={canFees ? 4 : 3}>
          <Stat mark label="الطلاب النشطون" value={<span className="num">{s.students}</span>} hint={`من ${s.maxStudents} في الباقة`} icon={<GraduationCap size={18} />} />
          <Stat label="حضور اليوم" value={<span className="num">{a.present || 0}</span>} hint={`غياب ${a.absent || 0}، تأخير ${a.late || 0}`} icon={<CalendarCheck size={18} />} />
          <Stat label="الفصول" value={<span className="num">{s.classes}</span>} icon={<School size={18} />} />
          {canFees && <Stat label="المتأخرات (ج.م)" value={<span className="num">{money(s.fees.outstanding).replace(' ج.م', '')}</span>} hint={`محصّل ${money(s.fees.paid)}`} tone={s.fees.outstanding > 0 ? 'text-danger' : undefined} icon={<Wallet size={18} />} />}
        </StatStrip>

        <section className="card mt-6" aria-labelledby="h-trend">
          <h2 id="h-trend" className="sheet-title">{kpi.data ? 'نسبة الحضور، آخر 30 يوم' : 'الطلاب حسب الفصل'}</h2>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer>
              {kpi.data ? (
                <AreaChart data={kpi.data.attendanceTrend} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.accent} stopOpacity={0.35} /><stop offset="1" stopColor={c.accent} stopOpacity={0} /></linearGradient>
                    <filter id="glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                  </defs>
                  <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="2 4" />
                  <XAxis dataKey="date" {...AXIS} tickFormatter={(d) => String(d).slice(5)} />
                  <YAxis domain={[0, 100]} {...AXIS} />
                  <Tooltip {...TIP} />
                  <Area type="monotone" dataKey="rate" name="حضور %" stroke={c.accent} strokeWidth={3} fill="url(#trend)" filter="url(#glow)" dot={false} activeDot={{ r: 5, fill: c.danger, stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              ) : (
                <BarChart data={byClass.data || []} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="2 4" />
                  <XAxis dataKey="name" {...AXIS} /><YAxis allowDecimals={false} {...AXIS} />
                  <Tooltip {...TIP} cursor={{ fill: c.grid, opacity: 0.3 }} />
                  <Bar dataKey="n" name="طلاب" fill={c.accent} maxBarSize={44} radius={[8, 8, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="card" aria-labelledby="h-rates">
            <h2 id="h-rates" className="sheet-title">نسب الأداء</h2>
            {kpi.data ? (
              <div className="flex justify-between gap-2 pt-2">
                <Ring id="r1" c={c} value={kpi.data.attendanceRate} label="الحضور" />
                <Ring id="r2" c={c} value={kpi.data.collectionRate} label="التحصيل" />
                <Ring id="r3" c={c} value={kpi.data.averageScore} label="متوسط الدرجات" />
              </div>
            ) : <p className="py-8 text-center text-sm text-pencil">نسب الحضور والتحصيل والدرجات متاحة من باقة الأعمال.</p>}
          </section>
          <section className="card" aria-labelledby="h-usage">
            <h2 id="h-usage" className="sheet-title">استخدام الباقة</h2>
            <Gauge used={s.students} max={s.maxStudents} c={c} />
            <p className="-mt-4 text-center text-[13px] text-pencil"><span className="num">{s.students}</span> طالب نشط من <span className="num">{s.maxStudents}</span></p>
          </section>
        </div>
      </div>

      <aside className="panel h-fit xl:sticky xl:top-4" aria-labelledby="h-school">
        <div className="flex items-start justify-between">
          <div>
            <div id="h-school" className="text-[13px] text-graphite/80">العام الدراسي</div>
            <div className="num mt-1 text-right text-2xl font-medium">{sc?.currentYear || '—'}</div>
          </div>
          {mgr && <Link to="/settings" className="rounded-lg p-1.5 text-pencil hover:text-graphite" aria-label="تعديل بيانات المدرسة"><Pencil size={15} /></Link>}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 border-t border-rule-soft pt-1 dark:border-white/[.06]">
          <div className="col-span-2"><Row label="اسم المدرسة" value={sc?.name || me!.school?.name} /></div>
          <Row label="الباقة" value={sc ? PLAN_AR[sc.plan]?.split(' — ')[1] : '—'} />
          <Row label="الشريحة" value={sc ? `حتى ${sc.tier} طالب` : '—'} />
          <Row label="حالة الاشتراك" value={sc ? (sc.status === 'trial' ? 'تجريبي' : sc.status === 'active' ? 'نشط' : 'موقوف') : '—'} />
          <Row label="ينتهي في" value={sc ? dateAr(sc.subscriptionEnds) : '—'} />
          <Row label="الفوترة" value={sc ? (sc.billingCycle === 'yearly' ? 'سنوي' : 'شهري') : '—'} />
          <Row label="السعر" value={sc?.price != null ? money(sc.price) : '—'} />
          {sc?.phone && <div className="col-span-2"><Row label="هاتف المدرسة" value={<span className="num">{sc.phone}</span>} /></div>}
          {sc?.email && <div className="col-span-2"><Row label="البريد" value={sc.email} /></div>}
        </dl>
        {mgr && <Link to="/subscription" className="btn-ghost mt-4 w-full">إدارة الاشتراك</Link>}
      </aside>
    </div>
  );
}
