import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import ResourcePage from '../components/ResourcePage';
import { Field, Modal } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { useAuth } from '../store/auth';

/** Teachers directory: photo cards; the card opens the teacher's CV-style profile. */
export default function Teachers() {
  const { me } = useAuth();
  const [adding, setAdding] = useState(false);
  const mgr = me!.role === 'owner' || me!.role === 'admin';
  return (
    <>
      <ResourcePage title="المعلمين" sub="حسابات المعلمين غير محدودة في كل الباقات" url="/teachers" noun="معلم" fields={[]} canWrite={false}
        extraActions={mgr && <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} />إضافة معلم</button>}
        renderCard={(t) => <TeacherCard t={t} />} />
      {adding && <AddTeacher onClose={() => setAdding(false)} />}
    </>
  );
}

function TeacherCard({ t }: { t: any }) {
  const role = [t.profile?.title, t.profile?.specialization].filter(Boolean).join('، ') || 'معلم';
  return (
    <Link to={`/teachers/${t._id}`} className={`card group flex h-full flex-col items-center p-0 text-center transition hover:-translate-y-0.5 hover:ring-2 hover:ring-brand/40 ${t.active ? '' : 'opacity-60'}`}>
      <div className="w-full rounded-t-xl px-4 pb-3 pt-6" style={{ backgroundImage: 'linear-gradient(180deg, rgb(var(--go) / .16), transparent)' }}>
        <Avatar name={t.name} photo={t.photo} className="mx-auto h-24 w-24 text-3xl ring-4 ring-surface" />
      </div>
      <div className="flex w-full flex-1 flex-col items-center px-4 pb-4">
        <div className="line-clamp-1 text-[15px] font-medium group-hover:text-brand">{t.name}</div>
        <div className="mt-0.5 line-clamp-1 text-[13px] text-pencil">{role}</div>
        {t.subjects.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {t.subjects.slice(0, 3).map((s: string) => <span key={s} className="rounded-full bg-brand-light px-2.5 py-0.5 text-xs text-brand">{s}</span>)}
            {t.subjects.length > 3 && <span className="rounded-full bg-sunken px-2 py-0.5 text-xs text-pencil">+{t.subjects.length - 3}</span>}
          </div>
        )}
        <div className="mt-auto grid w-full grid-cols-2 gap-2 border-t border-rule-soft pt-3 text-xs text-pencil dark:border-white/[.06]">
          <div><b className="num block text-base font-medium text-graphite">{t.lessons}</b>حصة في الأسبوع</div>
          <div><b className="num block text-base font-medium text-graphite">{t.classes}</b>فصل</div>
        </div>
        {!t.active && <span className="mt-2 text-xs text-danger">الحساب متوقف</span>}
      </div>
    </Link>
  );
}

function AddTeacher({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const create = useMutation({
    mutationFn: async () => api.post('/users', { ...f, role: 'teacher', email: f.email || undefined, phone: f.phone || undefined }),
    onSuccess: () => { toast.success('اتضاف المعلم'); qc.invalidateQueries({ queryKey: ['/teachers'] }); onClose(); },
    onError: toastErr,
  });
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };
  return (
    <Modal title="إضافة معلم" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="الاسم *"><input className="input" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field></div>
        <Field label="البريد الإلكتروني"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="الهاتف"><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="كلمة المرور، 8 أحرف على الأقل *"><input className="input" type="password" minLength={8} required autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field></div>
        <p className="text-xs text-pencil sm:col-span-2">لازم بريد أو هاتف عشان المعلم يدخل بيه. المؤهلات والصورة بتتضاف من ملفه بعد الإضافة.</p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" disabled={create.isPending}>{create.isPending ? 'جارٍ الإضافة…' : 'إضافة المعلم'}</button>
        </div>
      </form>
    </Modal>
  );
}
