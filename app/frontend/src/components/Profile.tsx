import { ReactNode } from 'react';

/** CV-style page: cover band, overlapping photo, name block, then a side column and a main column. */
export function ProfileHeader({ photo, name, subtitle, badges, actions }: { photo: ReactNode; name: string; subtitle?: ReactNode; badges?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="card overflow-hidden p-0">
      <div className="h-32 sm:h-36" aria-hidden
        style={{ backgroundImage: 'radial-gradient(120% 140% at 85% 0%, rgb(var(--accent-2) / .9), transparent 55%), linear-gradient(120deg, rgb(var(--accent)), rgb(var(--accent-strong)))' }} />
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 px-5 pb-5 sm:px-8">
        <div className="-mt-16 sm:-mt-20">{photo}</div>
        <div className="min-w-0 flex-1 pb-1">
          <h1 className="truncate text-[26px] font-medium leading-tight">{name}</h1>
          {subtitle && <div className="mt-1 text-sm text-pencil">{subtitle}</div>}
          {badges && <div className="mt-2 flex flex-wrap gap-2">{badges}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 pb-1">{actions}</div>}
      </div>
    </header>
  );
}

export function ProfileBody({ side, children }: { side: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-6">{side}</aside>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

/** Main-column section with an icon heading, like a CV block. */
export function Section({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-light text-brand">{icon}</span>
        <h2 className="flex-1 text-base font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Side-column block: a darker panel of label / value rows. */
export function SideBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2 className="mb-2 text-[13px] text-graphite/80">{title}</h2>
      {children}
    </section>
  );
}

export function InfoRow({ icon, label, value }: { icon?: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-rule-soft py-2.5 last:border-0 dark:border-white/[.06]">
      {icon && <span className="mt-0.5 text-pencil">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="text-xs text-pencil">{label}</div>
        <div className="break-words text-[13px] text-value">{value || '—'}</div>
      </div>
    </div>
  );
}

/** Label/value grid for the main column. */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-pencil">{k}</dt>
          <dd className="mt-0.5 text-sm">{v || <span className="text-pencil">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A thin bar split into colored parts (attendance mix), with a legend. */
export function SplitBar({ parts }: { parts: { label: string; value: number; className: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-sunken" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join('، ')}>
        {total > 0 && parts.map((p) => p.value > 0 && <span key={p.label} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${p.className}`} />{p.label} <b className="num font-medium">{p.value}</b></li>
        ))}
      </ul>
    </div>
  );
}
