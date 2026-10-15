import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CalendarCheck, Download, FileText, Mail, MapPin, NotebookPen, Pencil, Phone, Receipt, Smartphone, Trash2, Upload, User, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useParams } from 'react-router-dom';
import { PhotoEditor } from '../components/Avatar';
import { Facts, InfoRow, ProfileBody, ProfileHeader, Section, SideBlock, SplitBar } from '../components/Profile';
import { RecordForm } from '../components/ResourcePage';
import StudentNotes from '../components/StudentNotes';
import { Badge, Empty, Modal, Spinner, Table } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { dateAr, money } from '../lib/format';
import { useAuth } from '../store/auth';
import { studentFields } from './Students';

const GENDER: Record<string, string> = { male: 'ذكر', female: 'أنثى' };
const age = (d?: string) => { if (!d) return null; const b = new Date(d), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };

export default function StudentProfile() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { has, me } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cred, setCred] = useState<{ phone: string; password?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const role = me!.role;
  const canWrite = ['owner', 'admin', 'receptionist'].includes(role);

  const q = useQuery({ queryKey: ['profile', id], queryFn: async () => (await api.get(`/students/${id}/profile`)).data });
  const docs = useQuery({ queryKey: ['docs', id], enabled: has('documents'), queryFn: async () => (await api.get(`/students/${id}/documents`)).data });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['profile', id] }); qc.invalidateQueries({ queryKey: ['/students'] }); };

  const parentAcc = useMutation({
    mutationFn: async () => (await api.post(`/students/${id}/parent-account`, {})).data,
    onSuccess: (d) => { setCred(d); refresh(); }, onError: toastErr,
  });
  const upload = useMutation({
    mutationFn: async (f: File) => { const fd = new FormData(); fd.append('file', f); fd.append('title', f.name); return api.post(`/students/${id}/documents`, fd); },
    onSuccess: () => { toast.success('اترفع الملف'); qc.invalidateQueries({ queryKey: ['docs', id] }); }, onError: toastErr,
  });
  const rmDoc = useMutation({ mutationFn: async (d: string) => api.delete(`/students/documents/${d}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['docs', id] }), onError: toastErr });
  const download = async (d: any) => {
    const r = await api.get(`/students/documents/${d._id}/file`, { responseType: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(r.data); a.download = d.title; a.click();
  };

  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Empty text="الطالب غير موجود" />;
  const { student: s, attendance: a, invoices, marks, parents } = q.data;
  const due = invoices.filter((i: any) => i.status !== 'cancelled').reduce((t: number, i: any) => t + i.total - i.paid, 0);
  const attTotal = (a.present || 0) + (a.absent || 0) + (a.late || 0) + (a.excused || 0);
  const attRate = attTotal ? Math.round(((a.present || 0) + (a.late || 0)) / attTotal * 100) : null;
  const scored = marks.filter((m: any) => m.examId?.maxScore);
  const avg = scored.length ? Math.round(scored.reduce((t: number, m: any) => t + m.score / m.examId.maxScore * 100, 0) / scored.length) : null;
  const cls = s.classId ? `${s.classId.name} ${s.classId.section || ''}`.trim() : 'بدون فصل';
  const years = age(s.birthDate);

  return (
    <div>
      <ProfileHeader
        photo={<PhotoEditor name={s.name} photo={s.photo} url={`/students/${s._id}/photo`} canEdit={canWrite} onSaved={refresh} className="h-28 w-28 text-4xl sm:h-32 sm:w-32" />}
        name={s.name}
        subtitle={<>{cls}{s.classId?.stage && `، ${s.classId.stage}`}{years != null && `، ${years} سنة`}</>}
        badges={<><span className="num rounded-full bg-sunken px-2.5 py-0.5 text-xs text-pencil">{s.code}</span><Badge status={s.status} /></>}
        actions={<>
          {canWrite && <button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={15} />تعديل البيانات</button>}
          {has('parentPortal') && canWrite && <button className="btn-primary" onClick={() => parentAcc.mutate()} disabled={parentAcc.isPending}><Smartphone size={15} />حساب ولي الأمر</button>}
          <Link to="/students" className="btn-ghost">كل الطلاب</Link>
        </>}
      />

      <ProfileBody side={<>
        <SideBlock title="باختصار">
          <div className="grid grid-cols-3 gap-2 py-1 text-center">
            <div><div className="num text-2xl font-light">{attRate == null ? '—' : `${attRate}%`}</div><div className="text-xs text-pencil">الحضور</div></div>
            <div><div className="num text-2xl font-light">{avg == null ? '—' : `${avg}%`}</div><div className="text-xs text-pencil">الدرجات</div></div>
            <div><div className={`num text-2xl font-light ${due > 0 ? 'text-danger' : ''}`}>{due.toLocaleString('en-US')}</div><div className="text-xs text-pencil">مستحق ج.م</div></div>
          </div>
        </SideBlock>
        <SideBlock title="ولي الأمر">
          <InfoRow icon={<User size={15} />} label={s.guardian?.relation || 'الاسم'} value={s.guardian?.name} />
          <InfoRow icon={<Phone size={15} />} label="الهاتف" value={s.guardian?.phone && <a href={`tel:${s.guardian.phone}`} className="num hover:underline">{s.guardian.phone}</a>} />
          {s.guardian?.email && <InfoRow icon={<Mail size={15} />} label="البريد" value={s.guardian.email} />}
          {s.guardian?.job && <InfoRow icon={<Users size={15} />} label="الوظيفة" value={s.guardian.job} />}
          <InfoRow icon={<MapPin size={15} />} label="العنوان" value={s.address} />
          <InfoRow icon={<Smartphone size={15} />} label="حسابات التطبيق" value={parents.length ? <span className="num">{parents.map((p: any) => p.phone).join('، ')}</span> : 'لا يوجد'} />
        </SideBlock>
      </>}>
        <Section icon={<User size={16} />} title="البيانات الشخصية">
          <Facts items={[
            ['النوع', GENDER[s.gender]],
            ['تاريخ الميلاد', s.birthDate && dateAr(s.birthDate)],
            ['الرقم القومي', s.nationalId && <span className="num">{s.nationalId}</span>],
            ['الفصل', cls],
            ['تاريخ الالتحاق', dateAr(s.joinedAt || s.createdAt)],
            ['الكود', <span className="num">{s.code}</span>],
          ]} />
          {s.notes && <p className="mt-4 whitespace-pre-line border-t border-rule-soft pt-4 text-sm text-graphite/85">{s.notes}</p>}
        </Section>

        <Section icon={<CalendarCheck size={16} />} title="الحضور" action={<span className="text-xs text-pencil">كل الأيام المسجلة</span>}>
          {!attTotal ? <p className="text-sm text-pencil">مفيش حضور متسجل للطالب ده لسه.</p> : (
            <SplitBar parts={[
              { label: 'حاضر', value: a.present || 0, className: 'bg-emerald-600' },
              { label: 'متأخر', value: a.late || 0, className: 'bg-amber-500' },
              { label: 'بعذر', value: a.excused || 0, className: 'bg-blue-600' },
              { label: 'غائب', value: a.absent || 0, className: 'bg-red-600' },
            ]} />
          )}
        </Section>

        <Section icon={<BookOpen size={16} />} title="الدرجات">
          {!marks.length ? <p className="text-sm text-pencil">مفيش درجات متسجلة.</p> : (
            <div className="-mx-5 -mb-5"><Table head={['المادة', 'الامتحان', 'الدرجة', 'النسبة']}>
              {marks.map((m: any) => {
                const pct = m.examId?.maxScore ? Math.round(m.score / m.examId.maxScore * 100) : null;
                return (
                  <tr key={m._id}>
                    <td className="td">{m.examId?.subjectId?.name || '—'}</td>
                    <td className="td text-pencil">{m.examId?.name}</td>
                    <td className="td num">{m.score} / {m.examId?.maxScore}</td>
                    <td className={`td num ${pct != null && pct < 50 ? 'text-danger' : ''}`}>{pct == null ? '—' : `${pct}%`}</td>
                  </tr>
                );
              })}
            </Table></div>
          )}
        </Section>

        {['owner', 'admin', 'accountant', 'receptionist'].includes(role) && (
          <Section icon={<Receipt size={16} />} title="الفواتير" action={due > 0 && <span className="text-[13px] text-danger">مستحق {money(due)}</span>}>
            {!invoices.length ? <p className="text-sm text-pencil">مفيش فواتير.</p> : (
              <div className="-mx-5 -mb-5"><Table head={['الرقم', 'التاريخ', 'الإجمالي', 'المدفوع', 'الحالة']}>
                {invoices.map((i: any) => <tr key={i._id}><td className="td num">{i.number}</td><td className="td">{dateAr(i.createdAt)}</td><td className="td">{money(i.total)}</td><td className="td">{money(i.paid)}</td><td className="td"><Badge status={i.status} /></td></tr>)}
              </Table></div>
            )}
          </Section>
        )}

        {has('documents') && (
          <Section icon={<FileText size={16} />} title="المستندات" action={canWrite && <>
            <button className="btn-ghost h-8" onClick={() => fileRef.current?.click()} disabled={upload.isPending}><Upload size={14} />رفع ملف</button>
            <input ref={fileRef} type="file" hidden accept=".pdf,image/*" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
          </>}>
            {!docs.data?.length ? <p className="text-sm text-pencil">مفيش مستندات. ارفع شهادة الميلاد أو أوراق التحويل.</p> : (
              <ul className="divide-y divide-rule-soft">
                {docs.data.map((d: any) => (
                  <li key={d._id} className="flex items-center gap-3 py-2.5 text-sm">
                    <FileText size={16} className="text-pencil" />
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    <span className="text-xs text-pencil">{dateAr(d.createdAt)}</span>
                    <button className="rounded-lg p-1.5 text-pencil hover:text-graphite" onClick={() => download(d)} aria-label={`تنزيل ${d.title}`}><Download size={15} /></button>
                    {canWrite && <button className="rounded-lg p-1.5 text-pencil hover:text-danger" onClick={() => rmDoc.mutate(d._id)} aria-label={`حذف ${d.title}`}><Trash2 size={15} /></button>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {has('teacherPortal') && (
          <Section icon={<NotebookPen size={16} />} title="ملاحظات المعلمين"><StudentNotes studentId={s._id} /></Section>
        )}
      </ProfileBody>

      {editing && <RecordForm url="/students" fields={studentFields} row={s} noun="طالب" onClose={() => setEditing(false)} onSaved={refresh} />}
      {cred && (
        <Modal title="بيانات دخول ولي الأمر" onClose={() => setCred(null)}>
          <p className="text-sm">رقم الدخول: <b className="num">{cred.phone}</b></p>
          {cred.password ? <p className="mt-2 text-sm">كلمة المرور المؤقتة: <b className="num">{cred.password}</b><br /><span className="text-xs text-danger">بتظهر مرة واحدة بس، سلّمها لولي الأمر.</span></p>
            : <p className="mt-2 text-sm">الحساب موجود، واتربط الطالب بيه.</p>}
        </Modal>
      )}
    </div>
  );
}
