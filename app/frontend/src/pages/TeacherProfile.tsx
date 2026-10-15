import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, BookOpen, Briefcase, CalendarRange, ClipboardCheck, Clock, Mail, Pencil, Phone, User } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PhotoEditor } from '../components/Avatar';
import { Facts, InfoRow, ProfileBody, ProfileHeader, Section, SideBlock } from '../components/Profile';
import { FieldDef, RecordForm } from '../components/ResourcePage';
import { Empty, Spinner } from '../components/ui';
import { className, dateAr, DAYS_AR } from '../lib/format';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'الاسم', required: true },
  { key: 'phone', label: 'الهاتف' },
  { key: 'profile.title', label: 'المسمى الوظيفي (مثلًا: معلم أول رياضيات)' },
  { key: 'profile.specialization', label: 'التخصص' },
  { key: 'profile.qualification', label: 'المؤهل الدراسي' },
  { key: 'profile.experienceYears', label: 'سنين الخبرة', type: 'number' },
  { key: 'profile.hireDate', label: 'تاريخ التعيين', type: 'date' },
  { key: 'profile.bio', label: 'نبذة', type: 'textarea' },
];

export default function TeacherProfile() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { me } = useAuth();
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ['teacher', id], queryFn: async () => (await api.get(`/teachers/${id}`)).data });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['teacher', id] }); qc.invalidateQueries({ queryKey: ['/teachers'] }); };

  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Empty text="المعلم غير موجود" />;
  const { teacher: t, subjects, classes, timetable, stats, compliance, canEdit } = q.data;
  const p = t.profile || {};
  const mgr = me!.role === 'owner' || me!.role === 'admin' || me!.role === 'hr';
  const at = (d: number, n: number) => timetable.slots.find((s: any) => s.day === d && s.period === n);

  return (
    <div>
      <ProfileHeader
        photo={<PhotoEditor name={t.name} photo={t.photo} url={`/teachers/${t._id}/photo`} canEdit={canEdit} onSaved={refresh} className="h-28 w-28 text-4xl sm:h-32 sm:w-32" />}
        name={t.name}
        subtitle={[p.title || 'معلم', p.specialization].filter(Boolean).join('، ')}
        badges={!t.active && <span className="rounded-full border border-red-300/60 bg-red-50 px-2.5 py-0.5 text-xs text-red-700">الحساب متوقف</span>}
        actions={<>
          {canEdit && <button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={15} />تعديل الملف</button>}
          {mgr && <Link to="/teachers" className="btn-ghost">كل المعلمين</Link>}
        </>}
      />

      <ProfileBody side={<>
        <SideBlock title="باختصار">
          <div className="grid grid-cols-2 gap-y-4 py-1 text-center">
            <div><div className="num text-2xl font-light">{stats.lessons}</div><div className="text-xs text-pencil">حصة في الأسبوع</div></div>
            <div><div className="num text-2xl font-light">{stats.classes}</div><div className="text-xs text-pencil">فصل</div></div>
            <div><div className="num text-2xl font-light">{stats.subjects}</div><div className="text-xs text-pencil">مادة</div></div>
            <div><div className="num text-2xl font-light">{stats.notes}</div><div className="text-xs text-pencil">ملاحظة على طلاب</div></div>
          </div>
        </SideBlock>
        <SideBlock title="التواصل">
          <InfoRow icon={<Mail size={15} />} label="البريد" value={t.email} />
          <InfoRow icon={<Phone size={15} />} label="الهاتف" value={t.phone && <a href={`tel:${t.phone}`} className="num hover:underline">{t.phone}</a>} />
          <InfoRow icon={<Clock size={15} />} label="آخر دخول" value={t.lastLogin ? dateAr(t.lastLogin) : 'لسه ما دخلش'} />
        </SideBlock>
        {compliance && (
          <SideBlock title="تسجيل الحضور، آخر 30 يوم">
            {compliance.rate == null ? <p className="py-2 text-sm text-pencil">مفيش حصص في الجدول في الفترة دي.</p> : <>
              <div className="flex items-baseline justify-between py-1">
                <span className={`num text-2xl font-light ${compliance.rate < 80 ? 'text-danger' : compliance.rate < 95 ? 'text-amber-700' : 'text-go'}`}>{compliance.rate}%</span>
                <span className="text-xs text-pencil"><span className="num">{compliance.done}</span> من <span className="num">{compliance.expected}</span> حصة</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full bg-go" style={{ width: `${compliance.rate}%` }} /></div>
            </>}
          </SideBlock>
        )}
      </>}>
        <Section icon={<User size={16} />} title="نبذة">
          {p.bio ? <p className="whitespace-pre-line text-sm leading-7 text-graphite/90">{p.bio}</p>
            : <p className="text-sm text-pencil">{canEdit ? 'مفيش نبذة لسه. اضغط "تعديل الملف" واكتب سطرين عن الخبرة وطريقة التدريس.' : 'مفيش نبذة لسه.'}</p>}
        </Section>

        <Section icon={<Award size={16} />} title="المؤهلات والخبرة">
          <Facts items={[
            ['المؤهل', p.qualification],
            ['التخصص', p.specialization],
            ['سنين الخبرة', p.experienceYears != null && <span className="num">{p.experienceYears} سنة</span>],
            ['تاريخ التعيين', p.hireDate && dateAr(p.hireDate)],
            ['في النظام من', dateAr(t.createdAt)],
          ]} />
        </Section>

        <Section icon={<BookOpen size={16} />} title="المواد والفصول">
          {!subjects.length && !classes.length ? <p className="text-sm text-pencil">مش مربوط بمواد أو فصول لسه. الإدارة بتربطه من جدول الحصص أو صفحة الفصول والمواد.</p> : (
            <ul className="space-y-3">
              {subjects.map((s: any) => (
                <li key={s._id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-28 text-sm font-medium">{s.name}</span>
                  {s.classes.length ? s.classes.map((c: string) => <span key={c} className="rounded-full bg-sunken px-2.5 py-0.5 text-xs text-pencil">{c}</span>) : <span className="text-xs text-pencil">كل الفصول</span>}
                </li>
              ))}
              {!subjects.length && classes.map((c: any) => <li key={c._id} className="text-sm">{c.name}، {c.stage}</li>)}
            </ul>
          )}
        </Section>

        <Section icon={<CalendarRange size={16} />} title="الجدول الأسبوعي" action={stats.lessons > 0 && <Link to="/timetable" className="text-[13px] text-brand hover:underline">افتح الجدول</Link>}>
          {!timetable.periods.length || !timetable.slots.length ? <p className="text-sm text-pencil">مفيش حصص ليه في الجدول.</p> : (
            <div className="-mx-5 -mb-5 overflow-x-auto">
              <table className="w-full min-w-[560px] table-fixed text-xs">
                <thead><tr><th className="th w-20">اليوم</th>{timetable.periods.map((pr: any) => <th key={pr.number} className="th text-center">ح{pr.number}<span className="num block font-normal">{pr.start}</span></th>)}</tr></thead>
                <tbody>
                  {timetable.days.map((d: number) => (
                    <tr key={d}>
                      <th scope="row" className="px-3 py-2 text-right font-medium text-graphite/85">{DAYS_AR[d]}</th>
                      {timetable.periods.map((pr: any) => {
                        const s = at(d, pr.number);
                        return <td key={pr.number} className={`px-1 py-2 text-center ${s ? 'bg-brand-light/60' : ''}`}>
                          {s ? <><span className="block truncate font-medium">{s.subjectId?.name}</span><span className="block truncate text-pencil">{className(s.classId)}</span></> : <span className="text-rule">—</span>}
                        </td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {compliance?.missing?.length > 0 && (
          <Section icon={<ClipboardCheck size={16} />} title="كشوف حضور ما اتسجلتش">
            <ul className="flex flex-wrap gap-2">
              {compliance.missing.slice(0, 12).map((m: any) => (
                <li key={`${m.date}-${m.period}-${m.class}`} className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-700"><span className="num">{m.date.slice(5)}</span>، الحصة {m.period}، {m.class}</li>
              ))}
            </ul>
          </Section>
        )}

        {!p.title && !p.qualification && canEdit && (
          <p className="flex items-center gap-2 text-[13px] text-pencil"><Briefcase size={14} />ملف كامل بيساعد الإدارة وأولياء الأمور يعرفوا خبرة المعلم.</p>
        )}
      </ProfileBody>

      {editing && <RecordForm url="/teachers" fields={FIELDS} row={t} noun="ملف المعلم" onClose={() => setEditing(false)} onSaved={refresh} />}
    </div>
  );
}
