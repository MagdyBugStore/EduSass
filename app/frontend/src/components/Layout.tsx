import {
  BarChart3, BookOpen, Briefcase, Presentation, CalendarRange, NotebookTabs, Calculator, CalendarCheck, CreditCard, FileText, GraduationCap, LayoutDashboard,
  LogOut, Lock, Megaphone, Menu, Moon, Receipt, School, Settings, ShieldCheck, UserCog, Wallet, X,
} from 'lucide-react';
import { ReactNode, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { PLAN_AR, ROLE_AR } from '../lib/format';
import { useTheme } from '../lib/theme';
import { PoweredBy } from './PoweredBy';
import { useAuth } from '../store/auth';
import { Avatar } from './Avatar';
import Notifications from './Notifications';

interface Item { to: string; label: string; icon: ReactNode; roles?: string[]; module?: string; group?: string; only?: string[] }

// owner/admin see everything their plan allows; others per `roles`.
const ITEMS: Item[] = [
  { to: '/', label: 'لوحة التحكم', icon: <LayoutDashboard size={16} /> },
  { to: '/students', label: 'الطلاب', icon: <GraduationCap size={16} />, roles: ['teacher', 'accountant', 'receptionist', 'hr'], group: 'اليوم الدراسي' },
  { to: '/teachers', label: 'المعلمين', icon: <Presentation size={16} />, roles: ['hr'], group: 'اليوم الدراسي' },
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

function ThemeSwitch() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button role="switch" aria-checked={dark} onClick={toggle} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-pencil hover:text-graphite">
      <Moon size={16} />
      <span className="flex-1 text-right">الوضع الليلي</span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${dark ? 'bg-go' : 'bg-rule'}`}>
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
  const sections = [{ name: 'الرئيسية', items: items.filter((i) => !i.group) }, ...GROUPS.map((g) => ({ name: g, items: items.filter((i) => i.group === g) }))].filter((g) => g.items.length);
  const schoolName = me.school?.name || 'EduSaaS';

  const link = (i: Item) => {
    const locked = i.module && me.school && !me.school.modules.includes(i.module);
    return (
      <NavLink key={i.to} to={i.to} end={i.to === '/'}
        className={({ isActive }) => `flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${isActive
          ? 'bg-sunken font-medium text-go dark:bg-white/[.04]'
          : 'text-graphite/75 hover:text-graphite'}`}>
        <span className={locked ? 'opacity-50' : ''}>{i.icon}</span>
        <span className={`flex-1 truncate ${locked ? 'opacity-60' : ''}`}>{i.label}</span>
        {locked && <Lock size={12} className="text-pencil" aria-label="غير متاحة في باقتك" />}
      </NavLink>
    );
  };

  return (
    <div className="flex min-h-screen bg-app">
      <aside className={`fixed inset-y-0 right-0 z-40 flex w-64 transform flex-col bg-sidebar shadow-[0_0_40px_-12px_rgb(0_0_0/.35)] transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none ${open ? '' : 'translate-x-full'}`}>
        <div className="flex items-start justify-between px-6 pb-2 pt-7">
          <div className="min-w-0">
            <div className="text-[22px] font-bold leading-none">إدارة <span className="text-brand">المدرسة</span></div>
            <div className="mt-2 truncate text-xs text-pencil">{schoolName}{me.school && `، باقة ${PLAN_AR[me.school.plan]?.split(' — ')[1] || me.school.plan}`}</div>
          </div>
          <button className="-mt-1 rounded-lg p-1.5 text-pencil hover:text-graphite lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X size={18} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" onClick={() => setOpen(false)}>
          {sections.map((g) => (
            <div key={g.name} className="space-y-0.5">
              <div className="px-3 pb-2 pt-6 text-[13px] text-pencil">{g.name}</div>
              {g.items.map(link)}
            </div>
          ))}
        </nav>
        <div className="border-t border-rule-soft px-3 py-3"><ThemeSwitch /><PoweredBy className="mt-3 px-3" /></div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between gap-3 px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button className="rounded-lg p-2 text-graphite hover:bg-sunken lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة"><Menu size={20} /></button>
            <div className="hidden truncate text-[13px] text-pencil sm:block">{DATE.format(new Date())}</div>
          </div>
          <div className="flex items-center gap-1">
            {(() => {
              const who = <>
                <Avatar name={me.name} photo={me.photo} className="h-9 w-9 text-sm" />
                <span className="mx-2 hidden leading-tight sm:block">
                  <span className="block text-sm font-medium">{me.name}</span>
                  <span className="block text-xs text-pencil">{ROLE_AR[me.role]}</span>
                </span>
              </>;
              // a teacher's name opens their own CV page
              return me.role === 'teacher'
                ? <Link to={`/teachers/${me.id}`} className="flex items-center rounded-full pe-1 hover:bg-sunken" title="ملفي">{who}</Link>
                : <div className="flex items-center">{who}</div>;
            })()}
            {me.role !== 'superadmin' && <Notifications />}
            <button className="rounded-lg p-2 text-pencil hover:text-graphite" onClick={logout} aria-label="تسجيل الخروج" title="خروج"><LogOut size={18} /></button>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 pb-10 lg:px-8"><Outlet /></main>
      </div>
    </div>
  );
}
