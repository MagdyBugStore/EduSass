import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Field } from '../components/ui';
import { toastErr } from '../lib/api';
import { useAuth } from '../store/auth';

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md border-t-[3px] border-t-brand px-6 pb-8 pt-7 sm:ps-12">
        <h1 className="font-ruqaa text-[2.5rem] font-bold leading-none text-brand">نظام إدارة المدارس</h1>
        <p className="mb-7 mt-3 text-sm text-pencil">{title}</p>
        {children}
      </div>
    </main>
  );
}

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ login: '', password: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await login(f.login, f.password); nav('/'); } catch (x) { toastErr(x); } finally { setBusy(false); }
  };
  return (
    <Shell title="تسجيل الدخول">
      <form onSubmit={submit} className="space-y-4">
        <Field label="البريد الإلكتروني أو رقم الهاتف"><input className="input" autoComplete="username" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} required autoFocus /></Field>
        <Field label="كلمة المرور"><input className="input" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
      </form>
      <p className="mt-6 text-sm text-pencil">مدرسة جديدة؟ <Link to="/register" className="font-medium text-brand underline decoration-marker decoration-[3px] underline-offset-4">أنشئ حساب مدرستك، 14 يوم تجربة مجانية</Link></p>
    </Shell>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ schoolName: '', name: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await register(f); nav('/'); } catch (x) { toastErr(x); } finally { setBusy(false); }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Shell title="حساب مدرسة جديدة على باقة Core، مع 14 يوم تجربة مجانية">
      <form onSubmit={submit} className="space-y-4">
        <Field label="اسم المدرسة"><input className="input" value={f.schoolName} onChange={set('schoolName')} required autoFocus /></Field>
        <Field label="اسمك"><input className="input" autoComplete="name" value={f.name} onChange={set('name')} required /></Field>
        <Field label="البريد الإلكتروني"><input className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></Field>
        <Field label="الهاتف (اختياري)"><input className="input" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="كلمة المرور، 8 أحرف على الأقل"><input className="input" type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={set('password')} required /></Field>
        <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}</button>
      </form>
      <p className="mt-6 text-sm text-pencil">عندك حساب؟ <Link to="/login" className="font-medium text-brand underline decoration-marker decoration-[3px] underline-offset-4">سجّل الدخول</Link></p>
    </Shell>
  );
}
