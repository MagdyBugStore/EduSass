import {
  BarChart3, BookOpen, Briefcase, CalendarRange, NotebookTabs, Calculator, CalendarCheck, CreditCard, FileText, GraduationCap, LayoutDashboard,
  LogOut, Lock, Megaphone, Menu, Moon, Receipt, School, Settings, ShieldCheck, UserCog, Wallet, X,
} from 'lucide-react';
import { ReactNode, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { PLAN_AR, ROLE_AR } from '../lib/format';
import { useTheme } from '../lib/theme';
import { useAuth } from '../store/auth';

interface Item { to: string; label: string; icon: ReactNode; roles?: string[]; module?: string; group?: string; only?: string[] }

// owner/admin see everything their plan allows; others per `roles`.
const ITEMS: Item[] = [
  { to: '/', label: 'لوحة التحكم', icon: <LayoutDashboard size={16} /> },
  { to: '/students', label: 'الطلاب', icon: <GraduationCap size={16} />, roles: ['teacher', 'accountant', 'receptionist', 'hr'], group: 'اليوم الدراسي' },
  { to: '/classes', label: 'الفصول والمواد', icon: <School size={16} />, roles: ['teacher', 'receptionist', 'accountant'], group: 'اليوم الدراسي' },
  { to: '/timetable', label: 'جدول الحصص', icon: <CalendarRange size={16} />, roles: ['teacher', 'receptionist'], module: 'timetable', group: 'اليوم الدراسي' },
  { to: '/my-classes', label: 'فصولي', icon: <NotebookTabs size={16} />, roles: ['teacher'], module: 'teacherPortal', group: 'اليوم الدراسي', only: ['teacher'] },
  { to: '/attendance', label: 'الحضور والغياب', icon: <CalendarCheck size={16} />, roles: ['teacher', 'receptionist'], group: 'اليوم الدراسي' },
  { to: '/exams', label: 'الامتحانات والدرجات', icon: <BookOpen size={16} />, roles: ['teacher'], module: 'exams', group: 'اليوم الدراسي' },
  { to: '/fees', label: 'الرسوم والمدفوعات', icon: <CreditCard size={16} />, roles: ['accountant', 'receptionist'], group: 'المالية' },
  { to: '/expenses', label: 'المصروفات', icon: <Wallet size={16} />, roles: ['accountant'], module: 'expenses', group: 'المالية' },
  { to: '/accounting', label: 'المحاسبة', icon: <Calculator size={16} />, roles: ['accountant'], module: 'accounting', group: 'المالية' },
  { to: '/hr', label: 'الموارد البشرية', icon: <Briefcase size={16} />, roles: ['hr', 'accountant'], module: 'hr', group: 'الإدارة' },
  { to: '/payroll', label: 'الرواتب', icon: <Receipt size={16} />, roles: ['hr', 'accountant'], module: 'payroll', group: 'المالية' },
  { to: '/announcements', label: 'الإعلانات والإشعارات', icon: <Megaphone size={16} />, roles: ['teacher', 'receptionist'], module: 'notifications', group: 'اليوم الدراسي' },
  { to: '/reports', label: 'التقارير', icon: <BarChart3 size={16} />, roles: ['teacher', 'accountant', 'receptionist', 'hr'], group: 'الإدارة' },
  { to: '/users', label: 'المستخدمون والصلاحيات', icon: <UserCog size={16} />, roles: [], group: 'الإدارة' },
  { to: '/subscription', label: 'الاشتراك والباقة', icon: <FileText size={16} />, roles: [], group: 'الإدارة' },
  { to: '/settings', label: 'الإعدادات', icon: <Settings size={16} />, roles: [], group: 'الإدارة' },
];

const GROUPS = ['اليوم الدراسي', 'المالية', 'الإدارة'];
const DATE = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** School mark: its first letter on the accent tile, like a product logo. */
function Mark({ name }: { name: string }) {
  const letter = name.replace(/^(مدرسة|مدارس)\s+(ال)?/, '').trim().charAt(0) || 'م';
  return <div aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-brand to-brand-dark text-base font-bold text-white shadow-[0_6px_16px_-6px_rgb(var(--accent)/.8)]">{letter}</div>;
}

function ThemeSwitch() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button role="switch" aria-checked={dark} onClick={toggle} className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] text-pencil hover:bg-sunken hover:text-graphite">
      <Moon size={16} />
      <span className="flex-1 text-right">الوضع الليلي</span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${dark ? 'bg-brand' : 'bg-rule'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${dark ? 'left-0.5' : 'left-[18px]'}`} />
      </span>
    </button>
  );
}

export default function Layout() {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const mgr = me.role === 'owner' || me.role === 'admin';
  const items = me.role === 'superadmin'
    ? [{ to: '/platform', label: 'المدارس (المنصة)', icon: <ShieldCheck size={16} /> } as Item]
    : ITEMS.filter((i) => (!i.only || i.only.includes(me.role)) && (i.to === '/' || mgr || i.roles?.includes(me.role)))
      .map((i) => (i.to === '/' && me.role === 'teacher' && me.school?.modules.includes('teacherPortal') ? { ...i, label: 'يومي' } : i));
  const sections = [{ name: '', items: items.filter((i) => !i.group) }, ...GROUPS.map((g) => ({ name: g, items: items.filter((i) => i.group === g) }))].filter((g) => g.items.length);
  const schoolName = me.school?.name || 'EduSaaS';

  const link = (i: Item) => {
    const locked = i.module && me.school && !me.school.modules.includes(i.module);
    return (
      <NavLink key={i.to} to={i.to} end={i.to === '/'}
        className={({ isActive }) => `group flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors ${isActive
          ? 'bg-brand-light font-medium text-graphite dark:bg-sunken'
          : 'text-pencil hover:bg-sunken hover:text-graphite'}`}>
        {({ isActive }) => (<>
          <span className={isActive ? 'text-brand' : locked ? 'opacity-50' : ''}>{i.icon}</span>
          <span className={`flex-1 truncate ${locked ? 'opacity-60' : ''}`}>{i.label}</span>
          {locked && <Lock size={12} aria-label="غير متاحة في باقتك" />}
        </>)}
      </NavLink>
    );
  };

  return (
    <div className="min-h-screen lg:p-3">
      <div className="app-frame flex min-h-screen overflow-clip lg:min-h-[calc(100vh-1.5rem)] lg:rounded-[18px] lg:border">
        <aside className={`fixed inset-y-0 right-0 z-40 flex w-60 transform flex-col border-l bg-sidebar transition-transform lg:sticky lg:top-3 lg:h-[calc(100vh-1.5rem)] lg:translate-x-0 ${open ? '' : 'translate-x-full'}`}>
          <div className="flex h-16 items-center gap-3 px-4">
            <Mark name={schoolName} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{schoolName}</div>
              {me.school && <div className="truncate text-xs text-pencil">باقة {PLAN_AR[me.school.plan]?.split(' — ')[1] || me.school.plan}</div>}
            </div>
            <button className="rounded-lg p-1.5 text-pencil hover:bg-sunken lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X size={18} /></button>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" onClick={() => setOpen(false)}>
            {sections.map((g) => (
              <div key={g.name || 'home'} className="space-y-0.5">
                {g.name && <div className="px-3 pb-1.5 pt-5 text-xs text-pencil/80">{g.name}</div>}
                {g.items.map(link)}
              </div>
            ))}
          </nav>
          <div className="space-y-1 border-t px-3 py-3">
            <ThemeSwitch />
            <div className="flex items-center gap-3 rounded-lg px-3 py-2">
              <div aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunken text-xs font-semibold text-graphite">{me.name.replace(/^أ\.\s*/, '').charAt(0)}</div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[13px] font-medium">{me.name}</div>
                <div className="truncate text-xs text-pencil">{ROLE_AR[me.role]}</div>
              </div>
              <button className="rounded-lg p-1.5 text-pencil hover:bg-sunken hover:text-graphite" onClick={logout} aria-label="تسجيل الخروج" title="خروج"><LogOut size={16} /></button>
            </div>
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-app/85 px-4 backdrop-blur lg:px-8">
            <button className="rounded-lg p-2 text-graphite hover:bg-sunken lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة"><Menu size={20} /></button>
            <div className="truncate text-[13px] text-pencil">{DATE.format(new Date())}</div>
          </header>
          <main className="mx-auto max-w-7xl p-4 lg:px-8 lg:py-7"><Outlet /></main>
        </div>
      </div>
    </div>
  );
}
