import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, PageHeader, Spinner, Stat, StatStrip } from '../components/ui';
import { api } from '../lib/api';
import { className, dateAr, today } from '../lib/format';
import { useAuth } from '../store/auth';

const DATE = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
const mins = (t?: string) => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** The teacher's start page: today's lessons in order, which attendance sheets are still open. */
export default function TeacherHome() {
  const { me } = useAuth();
  const date = today();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const q = useQuery({ queryKey: ['teacher-day', date], queryFn: async () => (await api.get('/teacher/day', { params: { date } })).data, refetchInterval: 120_000 });

  if (q.isLoading) return <Spinner />;
  const d = q.data;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const lessons: any[] = d?.lessons || [];
  const stateOf = (l: any) => (nowMin >= mins(l.end) ? 'past' : nowMin >= mins(l.start) ? 'now' : 'next');
  const overdue = lessons.filter((l) => stateOf(l) === 'past' && !l.attendanceDone);
  const done = lessons.filter((l) => l.attendanceDone).length;

  return (
    <div>
      <PageHeader title="يومي" sub={`${DATE.format(now)}، ${me!.name}`} actions={<>
        <Link to="/timetable" className="btn-ghost">جدولي</Link>
        <Link to="/my-classes" className="btn-ghost">فصولي</Link>
      </>} />

      {overdue.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-sm border border-margin/40 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <b>{overdue.length === 1 ? 'فيه كشف حضور ما اتسجلش' : `فيه ${overdue.length} كشوف حضور ما اتسجلتش`}</b>
            <span className="block text-red-700">{overdue.map((l) => `الحصة ${l.period} مع ${className(l.class)}`).join('، ')}</span>
          </div>
        </div>
      )}

      <StatStrip cols={3}>
        <Stat label="حصص النهارده" value={lessons.length} />
        <Stat label="اتسجل حضورها" value={done} tone="text-emerald-700" />
        <Stat label="فاضل" value={lessons.length - done} mark={lessons.length - done > 0} />
      </StatStrip>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-0 lg:col-span-2" aria-labelledby="h-lessons">
          <h2 id="h-lessons" className="sheet-title px-5 pt-5">حصص النهارده</h2>
          {!d?.schoolDay ? <Empty text="النهارده مش يوم دراسة." /> : !lessons.length ? <Empty text="مفيش حصص ليك النهارده في الجدول." /> : (
            <ol>
              {lessons.map((l) => {
                const st = stateOf(l);
                const late = st === 'past' && !l.attendanceDone;
                return (
                  <li key={l._id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule-soft px-5 py-3 ${st === 'now' ? 'bg-marker/25' : ''}`}>
                    <div className="w-24 shrink-0">
                      <div className="text-sm font-medium text-brand">الحصة {l.period}</div>
                      <div className="num text-right text-xs text-pencil">{l.start}–{l.end}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{l.subject?.name} <span className="text-pencil">مع</span> {className(l.class)}</div>
                      <div className="text-xs text-pencil">
                        {st === 'now' ? <span className="hl font-medium text-graphite">شغالة دلوقتي</span> : st === 'past' ? 'خلصت' : 'جاية'}
                        {l.room && `، ${l.room}`}
                      </div>
                    </div>
                    {l.attendanceDone ? (
                      <Link to={`/attendance?classId=${l.class._id}&period=${l.period}&date=${d.date}`} className="flex items-center gap-1 text-sm text-emerald-700 hover:underline"><Check size={16} />الحضور اتسجل</Link>
                    ) : (
                      <Link to={`/attendance?classId=${l.class._id}&period=${l.period}&date=${d.date}`} className={late ? 'btn-danger' : st === 'now' ? 'btn-primary' : 'btn-ghost'}>سجّل الحضور</Link>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="card" aria-labelledby="h-news">
          <h2 id="h-news" className="sheet-title">آخر الإعلانات</h2>
          {!d?.announcements?.length ? <p className="text-sm text-pencil">مفيش إعلانات.</p> : (
            <ul className="space-y-4">
              {d.announcements.map((a: any) => (
                <li key={a._id}>
                  <div className="text-sm font-medium">{a.title}</div>
                  {a.body && <p className="mt-0.5 line-clamp-3 text-sm text-pencil">{a.body}</p>}
                  <div className="mt-1 text-xs text-pencil">{dateAr(a.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
