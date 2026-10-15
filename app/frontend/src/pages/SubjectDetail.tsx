import { useQuery } from '@tanstack/react-query';
import { BookOpen, CalendarRange, ClipboardList, Pencil, School, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Section } from '../components/Profile';
import { RecordForm } from '../components/ResourcePage';
import { Empty, Spinner, Table } from '../components/ui';
import { api } from '../lib/api';
import { dateAr, DAYS_AR } from '../lib/format';
import { useAuth } from '../store/auth';
import { classColor, subjectColor, subjectFields, subjectIcon } from './Classes';

const lessonsLabel = (n: number) => (n === 0 ? 'مش في الجدول' : `${n} ${n > 2 && n < 11 ? 'حصص' : 'حصة'} في الأسبوع`);
const Pct = ({ v }: { v: number | null }) => (v == null ? <span className="text-pencil">—</span> : <span className={`num font-medium ${v < 50 ? 'text-danger' : v < 65 ? 'text-amber-700' : ''}`}>{v}%</span>);

/** One subject: who teaches it, which classes take it, where it sits in the week, and how its exams went. */
export default function SubjectDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const [editing, setEditing] = useState(false);
  const mgr = me!.role === 'owner' || me!.role === 'admin';
  const q = useQuery({ queryKey: ['/subjects', 'details', id], queryFn: async () => (await api.get(`/subjects/${id}/details`)).data });
  const raw = useQuery({ queryKey: ['/subjects', id], enabled: editing, queryFn: async () => (await api.get(`/subjects/${id}`)).data });

  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Empty text="المادة غير موجودة" />;
  const { subject: s, stats, teachers, classes, timetable, exams } = q.data;
  const color = subjectColor(s._id);
  const { Icon, text } = subjectIcon(s.name);
  // one color per class inside the timetable so the same class is easy to follow across the week
  const colorOf = new Map<string, string>(classes.map((c: any) => [String(c._id), classColor(c._id)]));
  const cell = (d: number, p: number) => timetable.slots.filter((x: any) => x.day === d && x.period === p);

  return (
    <div>
      <header className="card overflow-hidden p-0" style={{ boxShadow: `inset 0 4px 0 ${color}, var(--shadow-card)` }}>
        <div className="flex flex-wrap items-center gap-5 px-6 pb-5 pt-7">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-bold" style={{ background: `${color}1F`, color }} aria-hidden>
            {Icon ? <Icon size={32} strokeWidth={2.2} /> : <span className={text!.length > 1 ? 'text-xl' : 'text-3xl'}>{text}</span>}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] font-bold leading-tight">{s.name}</h1>
            <div className="mt-1 text-sm text-pencil">{s.code ? <span className="num">{s.code}</span> : 'بدون كود'}{s.allClasses && '، بتتدرس لكل الفصول'}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {mgr && <button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={15} />تعديل المادة</button>}
            <Link to="/classes" className="btn-ghost">كل المواد</Link>
          </div>
        </div>
        <dl className="grid grid-cols-2 border-t border-rule-soft sm:grid-cols-5 dark:border-white/[.06]">
          {([
            ['المعلمين', stats.teachers], ['الفصول', stats.classes], ['حصص في الأسبوع', stats.lessons], ['امتحانات', stats.exams],
            ['متوسط الدرجات', stats.averageScore == null ? '—' : `${stats.averageScore}%`],
          ] as [string, any][]).map(([k, v]) => (
            <div key={k} className="px-6 py-4"><dt className="text-xs text-pencil">{k}</dt><dd className="num mt-1 text-2xl font-light">{v}</dd></div>
          ))}
        </dl>
        {stats.averageScore != null && <div className="h-1.5 bg-sunken"><span className="block h-full" style={{ width: `${stats.averageScore}%`, background: color }} /></div>}
      </header>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Section icon={<School size={16} />} title="الفصول اللي بتاخد المادة">
            {!classes.length ? <p className="text-sm text-pencil">مفيش فصول. حدد الفصول من "تعديل المادة" أو حط المادة في جدول الحصص.</p> : (
              <div className="-mx-5 -mb-5 overflow-x-auto"><div className="min-w-[600px]">
                <Table head={['الفصل', 'المعلم', 'الحصص', 'الطلاب', 'متوسط الدرجات']}>
                  {classes.map((c: any) => (
                    <tr key={c._id}>
                      <td className="td">
                        <Link to={`/classes/${c._id}`} className="flex items-center gap-2 font-medium hover:text-brand">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf.get(String(c._id)) }} aria-hidden />{c.name}
                        </Link>
                        <span className="ms-[18px] text-xs text-pencil">{c.stage}</span>
                      </td>
                      <td className="td">{c.teachers.length ? c.teachers.map((t: any) => (
                        <Link key={t._id} to={`/teachers/${t._id}`} className="flex items-center gap-2 hover:text-brand"><Avatar name={t.name} photo={t.photo} className="h-6 w-6 text-[10px]" />{t.name}</Link>
                      )) : <span className="text-pencil">مش متحدد في الجدول</span>}</td>
                      <td className="td text-pencil">{lessonsLabel(c.lessons)}</td>
                      <td className="td num">{c.students}</td>
                      <td className="td"><Pct v={c.averageScore} /></td>
                    </tr>
                  ))}
                </Table>
              </div></div>
            )}
          </Section>

          <Section icon={<CalendarRange size={16} />} title="جدول المادة لكل الفصول">
            {!timetable.periods.length || !timetable.slots.length ? <p className="text-sm text-pencil">المادة مش موجودة في جدول الحصص لسه.</p> : (
              <div className="-mx-5 -mb-5 overflow-x-auto">
                <table className="w-full min-w-[640px] table-fixed text-xs">
                  <thead><tr><th className="th w-20">اليوم</th>{timetable.periods.map((p: any) => <th key={p.number} className="th text-center">الحصة {p.number}<span className="num block font-normal">{p.start}</span></th>)}</tr></thead>
                  <tbody>
                    {timetable.days.map((d: number) => (
                      <tr key={d}>
                        <th scope="row" className="px-3 py-2 text-right text-[13px] font-medium">{DAYS_AR[d]}</th>
                        {timetable.periods.map((p: any) => {
                          const here = cell(d, p.number);
                          return (
                            <td key={p.number} className="px-1 py-1.5 align-top">
                              {!here.length ? <span className="block py-2 text-center text-rule">—</span> : (
                                <div className="space-y-1">
                                  {here.map((x: any) => {
                                    const cc = colorOf.get(String(x.class._id)) || classColor(x.class._id);
                                    return (
                                      <div key={x.class._id} className="rounded-md px-1.5 py-1 text-center" style={{ background: `${cc}22`, boxShadow: `inset 0 0 0 1px ${cc}55` }}>
                                        <span className="block truncate font-medium" style={{ color: cc }}>{x.class.name}</span>
                                        {x.teacher && <span className="block truncate text-[11px] text-pencil">{x.teacher.name}</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section icon={<Users size={16} />} title="معلمو المادة">
            {!teachers.length ? <p className="text-sm text-pencil">مفيش معلم للمادة دي لسه.</p> : (
              <ul className="space-y-3">
                {teachers.map((t: any) => (
                  <li key={t._id}>
                    <Link to={`/teachers/${t._id}`} className="flex items-start gap-3 rounded-xl p-2 -m-2 hover:bg-sunken">
                      <Avatar name={t.name} photo={t.photo} className="h-11 w-11 text-sm" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{t.name}</div>
                        <div className="text-xs text-pencil">{t.title || 'معلم'}{t.lessons > 0 && `، ${lessonsLabel(t.lessons)}`}</div>
                        {t.classes.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{t.classes.map((c: string) => <span key={c} className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-pencil">{c}</span>)}</div>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section icon={<ClipboardList size={16} />} title="الامتحانات">
            {!exams.length ? <p className="text-sm text-pencil">مفيش امتحانات للمادة دي.</p> : (
              <ul className="divide-y divide-rule-soft dark:divide-white/[.06]">
                {exams.map((e: any) => (
                  <li key={e._id} className="flex items-center gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{e.name}</div>
                      <div className="text-xs text-pencil">{e.class}{e.date && `، ${dateAr(e.date)}`}</div>
                    </div>
                    <Pct v={e.averageScore} />
                  </li>
                ))}
              </ul>
            )}
            <Link to="/exams" className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-brand hover:underline"><BookOpen size={14} />الامتحانات والدرجات</Link>
          </Section>
        </div>
      </div>

      {editing && raw.data && <RecordForm url="/subjects" fields={subjectFields} row={raw.data} noun="مادة" onClose={() => setEditing(false)} onSaved={() => q.refetch()} />}
    </div>
  );
}
