import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Pencil, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { RecordForm } from '../components/ResourcePage';
import { Empty, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { today } from '../lib/format';
import { useAuth } from '../store/auth';
import { AttendanceMeter, CLASS_COLORS, classFields } from './Classes';
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
  const students = useQuery({ queryKey: ['/students', 'class', id], queryFn: async () => (await api.get('/students', { params: { classId: id, status: 'active', limit: 200 } })).data.items });

  if (cls.isLoading || overview.isLoading) return <Spinner />;
  if (!cls.data) return <Empty text="الفصل غير موجود" />;
  const k = cls.data;
  const idx = Math.max(0, overview.data?.items.findIndex((x: any) => x._id === id) ?? 0);
  const color = CLASS_COLORS[idx % CLASS_COLORS.length];
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
            {has('timetable') && <Link to="/timetable" className="btn border border-white/40 bg-white/10 text-white hover:bg-white/20"><CalendarRange size={15} />جدول الفصل</Link>}
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

      <section className="mt-6" aria-labelledby="h-teachers">
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
