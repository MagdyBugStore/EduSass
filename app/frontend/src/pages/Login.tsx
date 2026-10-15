import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { Field } from '../components/ui';
import { useTheme } from '../lib/theme';
import { toastErr } from '../lib/api';
import { useAuth } from '../store/auth';

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <ThemeButton />
      <div className="mb-8 text-center">
        <div aria-hidden className="mx-auto mb-5 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-dark text-lg font-bold text-white shadow-[0_8px_24px_-8px_rgb(var(--accent)/.9)]">م</div>
        <h1 className="text-[1.7rem] font-bold leading-snug sm:text-[2rem]">نظام إدارة المدارس</h1>
        <p className="mt-2 text-sm text-pencil">{title}</p>
      </div>
      <div className="app-frame w-full max-w-sm rounded-[18px] border p-6 sm:p-7">
        {children}
      </div>
    </main>
  );
}

function ThemeButton() {
  const { theme, toggle } = useTheme();
  return (
    <button onClick={toggle} className="absolute left-4 top-4 rounded-lg border bg-surface p-2 text-pencil hover:text-graphite" aria-label={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الليلي'}>
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
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
        <button className="btn-primary h-10 w-full" disabled={busy}>{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
      </form>
      <p className="mt-5 text-center text-[13px] text-pencil">مدرسة جديدة؟ <Link to="/register" className="font-medium text-brand hover:underline">أنشئ حساب مدرستك، 14 يوم تجربة مجانية</Link></p>
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
        <button className="btn-primary h-10 w-full" disabled={busy}>{busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}</button>
      </form>
      <p className="mt-5 text-center text-[13px] text-pencil">عندك حساب؟ <Link to="/login" className="font-medium text-brand hover:underline">سجّل الدخول</Link></p>
    </Shell>
  );
}
