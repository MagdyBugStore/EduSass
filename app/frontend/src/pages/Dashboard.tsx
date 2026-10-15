import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader, Spinner, Stat, StatStrip } from '../components/ui';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { useAuth } from '../store/auth';

const AXIS = { fontSize: 11, tick: { fill: '#6B7385' }, tickLine: false, axisLine: { stroke: '#C9D6EA' } };
const TIP = { contentStyle: { border: '1px solid #C9D6EA', borderRadius: 2, fontFamily: 'Alexandria', fontSize: 12 }, labelStyle: { color: '#1C3F94', fontWeight: 500 } };

export default function Dashboard() {
  const { me, has } = useAuth();
  const sum = useQuery({ queryKey: ['summary'], queryFn: async () => (await api.get('/reports/summary')).data });
  const byClass = useQuery({ queryKey: ['by-class'], queryFn: async () => (await api.get('/reports/students-by-class')).data });
  const kpi = useQuery({ queryKey: ['kpi'], enabled: has('kpi'), queryFn: async () => (await api.get('/reports/kpi')).data });
  if (sum.isLoading) return <Spinner />;
  const s = sum.data;
  const a = s?.attendanceToday || {};
  const canFees = ['owner', 'admin', 'accountant'].includes(me!.role);

  return (
    <div>
      <PageHeader title={`أهلاً ${me!.name}`} sub={me!.school?.name} />
      <StatStrip cols={canFees ? 4 : 3}>
        <Stat label="الطلاب النشطون" value={<span className="num">{s.students} / {s.maxStudents}</span>} hint="يُحتسب النشطون فقط على الباقة" mark tone={s.students >= s.maxStudents ? 'text-red-600' : undefined} />
        <Stat label="الفصول" value={s.classes} />
        <Stat label="حضور اليوم" value={a.present || 0} hint={`غياب ${a.absent || 0}، تأخير ${a.late || 0}`} />
        {canFees && <Stat label="المتأخرات" value={money(s.fees.outstanding)} hint={`محصّل ${money(s.fees.paid)}`} tone="text-amber-700" />}
      </StatStrip>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="sheet-title">الطلاب حسب الفصل</h3>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={byClass.data || []} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#E4EBF5" /><XAxis dataKey="name" {...AXIS} /><YAxis allowDecimals={false} {...AXIS} /><Tooltip {...TIP} cursor={{ fill: '#FFFBE0' }} /><Bar dataKey="n" name="طلاب" fill="#1C3F94" maxBarSize={56} radius={[2, 2, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        {kpi.data && (
          <div className="card">
            <h3 className="sheet-title">مؤشرات الأداء (آخر 30 يومًا)</h3>
            <dl className="mb-4 grid grid-cols-3 gap-3 border-b border-rule-soft pb-4">
              {([['نسبة الحضور', kpi.data.attendanceRate], ['نسبة التحصيل', kpi.data.collectionRate], ['متوسط الدرجات', kpi.data.averageScore]] as [string, number | null][]).map(([l, v]) => (
                <div key={l}><dt className="text-xs text-pencil">{l}</dt><dd className="mt-1 text-2xl font-light"><span className="num">{v ?? '—'}{v != null && '%'}</span></dd></div>
              ))}
            </dl>
            <div className="h-40" dir="ltr">
              <ResponsiveContainer><LineChart data={kpi.data.attendanceTrend} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#E4EBF5" /><XAxis dataKey="date" {...AXIS} /><YAxis domain={[0, 100]} {...AXIS} /><Tooltip {...TIP} /><Line dataKey="rate" name="حضور %" stroke="#1C3F94" strokeWidth={2} dot={{ r: 3, fill: '#1C3F94' }} /></LineChart></ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
