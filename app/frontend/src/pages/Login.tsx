import { FormEvent, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { Field } from '../components/ui';
import { PoweredBy } from '../components/PoweredBy';
import { useTheme } from '../lib/theme';
import { api, toastErr } from '../lib/api';
import { useAuth } from '../store/auth';

declare global { interface Window { google?: any } }

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <ThemeButton />
      <div className="mb-8 text-center">
        <div aria-hidden className="mx-auto mb-5 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-dark text-lg font-bold text-white shadow-[0_8px_24px_-8px_rgb(var(--accent)/.9)]">ق</div>
        <h1 className="text-[1.7rem] font-bold leading-snug sm:text-[2rem]">قرطبة</h1>
        <p className="mt-1 text-[13px] text-pencil">نظام إدارة المدارس</p>
        <p className="mt-2 text-sm text-pencil">{title}</p>
      </div>
      <div className="app-frame w-full max-w-sm rounded-[18px] border p-6 sm:p-7">
        {children}
      </div>
      <p className="mt-6 text-[12px] text-pencil">
        <a href="/privacy.html" className="hover:text-graphite">سياسة الخصوصية</a> · <a href="/terms.html" className="hover:text-graphite">شروط الاستخدام</a>
      </p>
      <PoweredBy className="mt-3" />
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

// Google Identity Services script, loaded once.
let gsi: Promise<void> | null = null;
const loadGsi = () => gsi ??= new Promise<void>((ok, fail) => {
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
  s.onload = () => ok();
  s.onerror = () => { gsi = null; s.remove(); fail(new Error('تعذّر تحميل جوجل، تأكد من الاتصال')); };
  document.head.appendChild(s);
});

function GoogleButton({ clientId, onCredential }: { clientId: string; onCredential: (c: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential); cb.current = onCredential;
  const { theme } = useTheme();
  useEffect(() => {
    let live = true;
    loadGsi().then(() => {
      if (!live || !box.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: (r: any) => cb.current(r.credential), ux_mode: 'popup' });
      box.current.innerHTML = '';
      window.google.accounts.id.renderButton(box.current, {
        type: 'standard', theme: theme === 'dark' ? 'filled_black' : 'outline', size: 'large', shape: 'pill',
        text: 'continue_with', locale: 'ar', width: Math.min(box.current.clientWidth || 300, 400),
      });
    }).catch(toastErr);
    return () => { live = false; };
  }, [clientId, theme]);
  // Google's iframe paints an opaque white box when it inherits a dark color-scheme
  return <div ref={box} style={{ colorScheme: 'light' }} className="flex min-h-[44px] w-full justify-center" />;
}

// Email/password form, kept for local development only: the demo accounts aren't Google accounts.
function DevPasswordLogin() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ login: '', password: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await login(f.login, f.password); nav('/'); } catch (x) { toastErr(x); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="mt-6 space-y-3 border-t border-dashed pt-5">
      <p className="text-[12px] text-pencil">دخول بكلمة المرور (بيئة التطوير فقط)</p>
      <input className="input" placeholder="البريد أو الهاتف" autoComplete="username" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} required />
      <input className="input" type="password" placeholder="كلمة المرور" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
      <button className="btn-ghost h-9 w-full" disabled={busy}>دخول</button>
    </form>
  );
}

type Signup = { signup: string; profile: { email: string; name: string; picture: string | null } };

export function Login() {
  const { session } = useAuth();
  const nav = useNavigate();
  const [clientId, setClientId] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [signup, setSignup] = useState<Signup | null>(null);

  useEffect(() => {
    api.get('/auth/config').then((r) => setClientId(r.data.googleClientId)).catch(() => setClientId(null));
  }, []);

  const onCredential = async (credential: string) => {
    setBusy(true);
    try {
      const { data } = await api.post('/auth/google', { credential });
      if (data.token) { session(data); nav('/'); } else setSignup(data);
    } catch (x) { toastErr(x); } finally { setBusy(false); }
  };

  if (signup) return <SchoolSignup s={signup} onBack={() => setSignup(null)} />;

  return (
    <Shell title="ادخل بحساب جوجل بتاعك">
      {clientId === undefined ? <div className="h-11 animate-pulse rounded-full bg-paper" />
        : clientId ? <GoogleButton clientId={clientId} onCredential={onCredential} />
        : <p className="text-center text-sm text-pencil">الدخول بجوجل لسه ما اتفعّلش على السيرفر.</p>}
      {busy && <p className="mt-3 text-center text-[13px] text-pencil">جارٍ الدخول…</p>}
      <p className="mt-5 text-center text-[13px] leading-relaxed text-pencil">مدرسة جديدة؟ ادخل بجوجل وهنكمّل بيانات مدرستك، وتقدر تجرّب النظام 7 أيام مجاناً.</p>
      {import.meta.env.DEV && <DevPasswordLogin />}
    </Shell>
  );
}

function SchoolSignup({ s, onBack }: { s: Signup; onBack: () => void }) {
  const { session } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ schoolName: '', name: s.profile.name, phone: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data } = await api.post('/auth/google/register-school', { signup: s.signup, ...f, phone: f.phone || undefined });
      session(data); nav('/');
    } catch (x) { toastErr(x); } finally { setBusy(false); }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Shell title="حساب مدرسة جديدة، وبعدها تختار باقتك أو تجرّب 7 أيام مجاناً">
      <div className="mb-5 flex items-center gap-3 rounded-xl bg-paper p-3">
        {s.profile.picture && <img src={s.profile.picture} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full" />}
        <div className="min-w-0 text-[13px]"><div className="font-medium">{s.profile.name}</div><div className="truncate text-pencil" dir="ltr">{s.profile.email}</div></div>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="اسم المدرسة"><input className="input" value={f.schoolName} onChange={set('schoolName')} required minLength={2} autoFocus /></Field>
        <Field label="اسمك"><input className="input" autoComplete="name" value={f.name} onChange={set('name')} required minLength={2} /></Field>
        <Field label="الهاتف (اختياري)"><input className="input" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></Field>
        <button className="btn-primary h-10 w-full" disabled={busy}>{busy ? 'جارٍ الإنشاء…' : 'إنشاء حساب المدرسة'}</button>
      </form>
      <button onClick={onBack} className="mt-4 w-full text-center text-[13px] text-pencil hover:text-graphite">دخول بحساب جوجل تاني</button>
    </Shell>
  );
}

export function Register() {
  return <Navigate to="/login" replace />;
}
