import {
  BarChart3, BookOpen, Briefcase, Calculator, CalendarCheck, CreditCard, FileText, GraduationCap, LayoutDashboard,
  LogOut, Lock, Megaphone, Menu, Receipt, School, Settings, ShieldCheck, UserCog, Wallet, X,
} from 'lucide-react';
import { ReactNode, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { PLAN_AR, ROLE_AR } from '../lib/format';
import { useAuth } from '../store/auth';

interface Item { to: string; label: string; icon: ReactNode; roles?: string[]; module?: string; group?: string }

// owner/admin see everything their plan allows; others per `roles`.
const ITEMS: Item[] = [
  { to: '/', label: 'لوحة التحكم', icon: <LayoutDashboard size={18} /> },
  { to: '/students', label: 'الطلاب', icon: <GraduationCap size={18} />, roles: ['teacher', 'accountant', 'receptionist', 'hr'], group: 'اليوم الدراسي' },
  { to: '/classes', label: 'الفصول والمواد', icon: <School size={18} />, roles: ['teacher', 'receptionist', 'accountant'], group: 'اليوم الدراسي' },
  { to: '/attendance', label: 'الحضور والغياب', icon: <CalendarCheck size={18} />, roles: ['teacher', 'receptionist'], group: 'اليوم الدراسي' },
  { to: '/exams', label: 'الامتحانات والدرجات', icon: <BookOpen size={18} />, roles: ['teacher'], module: 'exams', group: 'اليوم الدراسي' },
  { to: '/fees', label: 'الرسوم والمدفوعات', icon: <CreditCard size={18} />, roles: ['accountant', 'receptionist'], group: 'المالية' },
  { to: '/expenses', label: 'المصروفات', icon: <Wallet size={18} />, roles: ['accountant'], module: 'expenses', group: 'المالية' },
  { to: '/accounting', label: 'المحاسبة', icon: <Calculator size={18} />, roles: ['accountant'], module: 'accounting', group: 'المالية' },
  { to: '/hr', label: 'الموارد البشرية', icon: <Briefcase size={18} />, roles: ['hr', 'accountant'], module: 'hr', group: 'الإدارة' },
  { to: '/payroll', label: 'الرواتب', icon: <Receipt size={18} />, roles: ['hr', 'accountant'], module: 'payroll', group: 'المالية' },
  { to: '/announcements', label: 'الإعلانات والإشعارات', icon: <Megaphone size={18} />, roles: ['teacher', 'receptionist'], module: 'notifications', group: 'اليوم الدراسي' },
  { to: '/reports', label: 'التقارير', icon: <BarChart3 size={18} />, roles: ['teacher', 'accountant', 'receptionist', 'hr'], group: 'الإدارة' },
  { to: '/users', label: 'المستخدمون والصلاحيات', icon: <UserCog size={18} />, roles: [], group: 'الإدارة' },
  { to: '/subscription', label: 'الاشتراك والباقة', icon: <FileText size={18} />, roles: [], group: 'الإدارة' },
  { to: '/settings', label: 'الإعدادات', icon: <Settings size={18} />, roles: [], group: 'الإدارة' },
];

const GROUPS = ['اليوم الدراسي', 'المالية', 'الإدارة'];
const DATE = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** The school's stamp: its first letter inside a double ink ring. */
function Stamp({ name }: { name: string }) {
  const letter = name.replace(/^(مدرسة|مدارس)\s+(ال)?/, '').trim().charAt(0) || 'م';
  return (
    <div aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-brand p-[3px]">
      <div className="grid h-full w-full place-items-center rounded-full border border-brand/60 font-ruqaa text-2xl font-bold leading-none text-brand">{letter}</div>
    </div>
  );
}

export default function Layout() {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const mgr = me.role === 'owner' || me.role === 'admin';
  const items = me.role === 'superadmin'
    ? [{ to: '/platform', label: 'المدارس (المنصة)', icon: <ShieldCheck size={18} /> } as Item]
    : ITEMS.filter((i) => i.to === '/' || mgr || i.roles?.includes(me.role));
  const sections = [{ name: '', items: items.filter((i) => !i.group) }, ...GROUPS.map((g) => ({ name: g, items: items.filter((i) => i.group === g) }))].filter((g) => g.items.length);
  const schoolName = me.school?.name || 'EduSaaS';

  const link = (i: Item) => {
    const locked = i.module && me.school && !me.school.modules.includes(i.module);
    return (
      <NavLink key={i.to} to={i.to} end={i.to === '/'}
        className={({ isActive }) => `flex h-10 items-center gap-3 border-b border-rule-soft border-r-[3px] px-3 text-sm ${isActive ? 'border-r-margin bg-marker/70 font-medium text-brand' : 'border-r-transparent text-graphite/80 hover:bg-brand-light hover:text-brand'} ${locked ? 'text-pencil/70' : ''}`}>
        <span className={locked ? 'opacity-60' : 'text-brand/80'}>{i.icon}</span>
        <span className="flex-1 truncate">{i.label}</span>
        {locked && <Lock size={13} className="text-pencil" aria-label="غير متاحة في باقتك" />}
      </NavLink>
    );
  };

  return (
    <div className="flex min-h-screen">
      <aside className={`fixed inset-y-0 right-0 z-40 flex w-64 transform flex-col border-l border-rule bg-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? '' : 'translate-x-full'}`}>
        <div className="flex h-[4.5rem] items-center gap-3 border-b-2 border-brand px-4">
          <Stamp name={schoolName} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-brand">{schoolName}</div>
            {me.school && <div className="truncate text-xs text-pencil">باقة {PLAN_AR[me.school.plan]}</div>}
          </div>
          <button className="rounded p-1.5 text-pencil hover:bg-brand-light lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X size={18} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto pb-6" onClick={() => setOpen(false)}>
          {sections.map((g) => (
            <div key={g.name || 'home'}>
              {g.name && <div className="px-4 pb-1 pt-5 text-xs font-bold text-margin/90">{g.name}</div>}
              {g.items.map(link)}
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-graphite/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[4.5rem] items-center justify-between gap-3 border-b border-rule bg-white/95 px-4 backdrop-blur lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button className="rounded p-2 text-brand hover:bg-brand-light lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة"><Menu /></button>
            <div className="hidden truncate text-sm text-pencil sm:block">التاريخ: <span className="font-medium text-graphite">{DATE.format(new Date())}</span></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-left text-sm leading-tight"><div className="font-medium">{me.name}</div><div className="text-xs text-pencil">{ROLE_AR[me.role]}</div></div>
            <button className="btn-ghost px-3" onClick={logout} aria-label="تسجيل الخروج"><LogOut size={16} /><span className="hidden sm:inline">خروج</span></button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
