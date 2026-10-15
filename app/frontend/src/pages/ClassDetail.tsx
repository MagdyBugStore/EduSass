import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CalendarRange, Pencil, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { RecordForm } from '../components/ResourcePage';
import { Empty, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { today } from '../lib/format';
import { useAuth } from '../store/auth';
import { AttendanceMeter, classColor, classFields } from './Classes';
import { StudentCard } from './Students';

/** One class: today's numbers, its teachers, and its students as photo cards. */
export default function ClassDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { me, has } = useAuth();
  const [editing, setEditing] = useState(false);
  const mgr = me!.role === 'owner' || me!.role === 'admin';
  const date = today();
  const overview = useQuery({ queryKey: ['/classes', 'overview', date], queryFn: async () => (await api.get('/reports/classes-overview', { params: { date } })).data });
  const cls = useQuery({ queryKey: ['/classes', id], queryFn: async () => (await api.get(`/classes/${id}`)).data });
  const subjects = useQuery({ queryKey: ['/subjects', 'all'], queryFn: async () => (await api.get('/subjects', { params: { limit: 200 } })).data.items });
  const slots = useQuery({ queryKey: ['tt', 'class', id], enabled: has('timetable'), queryFn: async () => (await api.get('/timetable', { params: { classId: id } })).data });
  const students = useQuery({ queryKey: ['/students', 'class', id], queryFn: async () => (await api.get('/students', { params: { classId: id, status: 'active', limit: 200 } })).data.items });

  if (cls.isLoading || overview.isLoading) return <Spinner />;
  if (!cls.data) return <Empty text="الفصل غير موجود" />;
  const k = cls.data;
  const color = classColor(id!);
  const o = overview.data?.items.find((x: any) => x._id === id);
  const a = o?.attendance || {};
  const label = `${k.name} ${k.section || ''}`.trim();

  return (
    <div>
      <header className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-5 pt-8 text-white" style={{ background: `linear-gradient(120deg, ${color}, ${color}cc)` }}>
          <div>
            <div className="text-sm text-white/85">{k.stage}{k.year && `، ${k.year}`}</div>
            <h1 className="mt-1 text-[28px] font-bold leading-tight !text-white">{label}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {has('timetable') && <Link to={`/timetable?classId=${id}`} className="btn border border-white/40 bg-white/10 text-white hover:bg-white/20"><CalendarRange size={15} />جدول الفصل</Link>}
            {mgr && <button className="btn border border-white/40 bg-white/10 text-white hover:bg-white/20" onClick={() => setEditing(true)}><Pencil size={15} />تعديل الفصل</button>}
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-rule-soft sm:grid-cols-4 sm:divide-x sm:divide-x-reverse dark:divide-white/[.06]">
          <div className="p-5"><dt className="text-xs text-pencil">الطلاب</dt><dd className="num mt-1 text-2xl font-light">{o?.students ?? students.data?.length ?? 0}{k.capacity && <span className="text-sm text-pencil"> / {k.capacity}</span>}</dd></div>
          <div className="p-5"><dt className="text-xs text-pencil">الحضور النهارده</dt><dd className="num mt-1 text-2xl font-light">{a.rate == null ? '—' : `${a.rate}%`}</dd><div className="mt-2"><AttendanceMeter rate={a.rate ?? null} /></div></div>
          <div className="p-5"><dt className="text-xs text-pencil">متأخرين</dt><dd className={`num mt-1 text-2xl font-light ${a.late ? 'text-amber-700' : ''}`}>{a.late || 0}</dd></div>
          <div className="p-5"><dt className="text-xs text-pencil">غياب</dt><dd className={`num mt-1 text-2xl font-light ${a.absent ? 'text-danger' : ''}`}>{a.absent || 0}</dd></div>
        </dl>
      </header>

      <section className="mt-6" aria-labelledby="h-subjects">
        <h2 id="h-subjects" className="sheet-title flex items-center gap-2"><BookOpen size={16} className="text-pencil" />مواد الفصل</h2>
        {(() => {
          // a subject belongs to this class if it lists the class, lists no classes at all, or sits on the class timetable
          const onTimetable = new Map<string, { n: number; teachers: Map<string, any> }>();
          for (const s of slots.data || []) {
            const e = onTimetable.get(s.subjectId?._id) || { n: 0, teachers: new Map() };
            e.n++; if (s.teacherId) e.teachers.set(s.teacherId._id, s.teacherId);
            onTimetable.set(s.subjectId?._id, e);
          }
          const list = (subjects.data || []).filter((s: any) => onTimetable.has(s._id) || !s.classIds?.length || s.classIds.some((c: any) => (c._id || c) === id));
          if (subjects.isLoading) return <Spinner />;
          if (!list.length) return <p className="text-sm text-pencil">مفيش مواد مقررة على الفصل ده.{mgr && ' ضيفها من تبويب "المواد" في صفحة الفصول.'}</p>;
          return (
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
              {list.map((s: any) => {
                const tt = onTimetable.get(s._id);
                // prefer who actually teaches it here (timetable), else the subject's assigned teachers
                const teachers = tt?.teachers.size ? [...tt.teachers.values()] : (s.teacherIds || []);
                return (
                  <li key={s._id} className="card flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[15px] font-medium">{s.name}</span>
                      {has('timetable') && <span className={`num shrink-0 rounded-full px-2.5 py-0.5 text-xs ${tt ? 'bg-brand-light text-brand' : 'bg-sunken text-pencil'}`}>{tt ? `${tt.n} ${tt.n === 1 ? 'حصة' : tt.n <= 10 ? 'حصص' : 'حصة'} في الأسبوع` : 'مش في الجدول'}</span>}
                    </div>
                    {teachers.length ? (
                      <div className="flex flex-wrap gap-2">
                        {teachers.map((t: any) => (
                          <Link key={t._id} to={`/teachers/${t._id}`} className="flex items-center gap-2 rounded-full bg-sunken py-1 pe-3 ps-1 text-[13px] hover:text-brand">
                            <Avatar name={t.name} photo={t.photo} className="h-6 w-6 text-[10px]" />{t.name}
                          </Link>
                        ))}
                      </div>
                    ) : <span className="text-[13px] text-pencil">بدون معلم</span>}
                  </li>
                );
              })}
            </ul>
          );
        })()}
      </section>

      <section className="mt-8" aria-labelledby="h-teachers">
        <h2 id="h-teachers" className="sheet-title flex items-center gap-2"><Users size={16} className="text-pencil" />معلمو الفصل</h2>
        {!k.teacherIds?.length ? <p className="text-sm text-pencil">مفيش معلمين مربوطين بالفصل ده.{mgr && ' ضيفهم من "تعديل الفصل" أو من جدول الحصص.'}</p> : (
          <ul className="flex flex-wrap gap-3">
            {k.teacherIds.map((t: any, i: number) => (
              <li key={t._id}>
                <Link to={`/teachers/${t._id}`} className="card flex items-center gap-3 px-4 py-3 hover:ring-2 hover:ring-brand/40">
                  <Avatar name={t.name} photo={t.photo} className="h-10 w-10 text-sm" />
                  <div><div className="text-sm font-medium">{t.name}</div><div className="text-xs text-pencil">{i === 0 ? 'رائد الفصل' : 'معلم'}</div></div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="h-students">
        <h2 id="h-students" className="sheet-title">الطلاب <span className="num text-pencil">({students.data?.length ?? 0})</span></h2>
        {students.isLoading ? <Spinner /> : !students.data?.length ? <div className="card"><Empty text="مفيش طلاب نشطين في الفصل ده." /></div> : (
          <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {students.data.map((s: any) => <li key={s._id}><StudentCard s={{ ...s, classId: s.classId || k }} /></li>)}
          </ul>
        )}
      </section>

      {editing && <RecordForm url="/classes" fields={classFields} row={k} noun="فصل" onClose={() => setEditing(false)} onSaved={() => qc.invalidateQueries({ queryKey: ['/classes'] })} />}
    </div>
  );
}
