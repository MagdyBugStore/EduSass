import { Lock, X } from 'lucide-react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_AR } from '../lib/format';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`mt-10 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-sm border border-rule border-t-[3px] border-t-brand bg-white p-5`}>
        <div className="mb-4 flex items-center justify-between border-b border-rule-soft pb-3">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-pencil hover:bg-brand-light hover:text-brand" aria-label="إغلاق"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-pencil">{label}</span>
      {children}
    </label>
  );
}

const TONE: Record<string, string> = {
  green: 'border-emerald-300 bg-emerald-50 text-emerald-800', red: 'border-red-300 bg-red-50 text-red-700', amber: 'border-amber-300 bg-amber-50 text-amber-800',
  blue: 'border-blue-300 bg-blue-50 text-brand', gray: 'border-slate-300 bg-slate-50 text-pencil',
};
const STATUS_TONE: Record<string, string> = {
  active: 'green', paid: 'green', present: 'green', approved: 'green',
  absent: 'red', unpaid: 'red', rejected: 'red', cancelled: 'gray', suspended: 'red',
  partial: 'amber', late: 'amber', pending: 'amber', trial: 'amber', draft: 'amber', excused: 'blue', leave: 'blue',
};
export function Badge({ status, tone }: { status: string; tone?: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium ${TONE[tone || STATUS_TONE[status] || 'gray']}`}>{STATUS_AR[status] || status}</span>;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-4">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {sub && <p className="mt-1 text-sm text-pencil">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

export function Empty({ text = 'لا توجد بيانات' }: { text?: string }) {
  return <div className="py-12 text-center text-sm text-pencil">{text}</div>;
}

export function Spinner() {
  return <div className="py-12 text-center text-sm text-pencil" role="status">جارٍ التحميل…</div>;
}

/** One ledger sheet split into cells by hairline rules: wrap a row of <Stat>s in it. */
export function StatStrip({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const lg = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }[cols];
  return <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-rule bg-rule ${lg}`}>{children}</div>;
}

export function Stat({ label, value, hint, tone, mark }: { label: string; value: ReactNode; hint?: string; tone?: string; mark?: boolean }) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="text-xs font-medium text-pencil">{label}</div>
      <div className={`mt-2 text-[1.75rem] font-light leading-none sm:text-[2rem] ${tone || 'text-graphite'}`}><span className={mark ? 'hl' : ''}>{value}</span></div>
      {hint && <div className="mt-2 text-xs text-pencil">{hint}</div>}
    </div>
  );
}

/** Shown when the school's package doesn't include a module (API returns 402). */
export function Locked({ what }: { what: string }) {
  return (
    <div className="card mx-auto mt-10 max-w-md text-center">
      <Lock className="mx-auto mb-3 text-pencil" />
      <h2 className="font-bold">{what} غير متاحة في باقتك الحالية</h2>
      <p className="mt-1 text-sm text-pencil">قم بترقية الباقة لتفعيل هذه الميزة. بياناتك كلها محفوظة.</p>
      <Link to="/subscription" className="btn-primary mt-4">عرض الباقات</Link>
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead><tr>{head.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
