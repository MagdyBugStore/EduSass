import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bell, Clock, Megaphone, Receipt } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { dateAr, today } from '../lib/format';
import { useAuth } from '../store/auth';

interface Item { id: string; kind: 'alert' | 'warning' | 'info' | 'announcement'; title: string; body?: string; link?: string; at: string }

const KIND = {
  alert: { icon: AlertTriangle, cls: 'bg-red-50 text-red-700' },
  warning: { icon: Clock, cls: 'bg-amber-50 text-amber-700' },
  info: { icon: Receipt, cls: 'bg-blue-50 text-blue-600' },
  announcement: { icon: Megaphone, cls: 'bg-brand-light text-brand' },
} as const;

const when = (iso: string) => {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'النهارده';
  if (d.toDateString() === new Date(now.getTime() - 864e5).toDateString()) return 'امبارح';
  return dateAr(d);
};

// what this person has already seen, kept in their browser
const seenKey = (uid: string) => `inbox-seen:${uid}`;
const loadSeen = (uid: string): string[] => { try { return JSON.parse(localStorage.getItem(seenKey(uid)) || '[]'); } catch { return []; } };
const saveSeen = (uid: string, ids: string[]) => { try { localStorage.setItem(seenKey(uid), JSON.stringify(ids.slice(-200))); } catch { /* storage off: badge just won't remember */ } };

/** Header bell with a dropdown of role-specific alerts and the latest announcements. */
export default function Notifications() {
  const { me } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>(() => loadSeen(me!.id));
  const box = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ['inbox'], refetchInterval: 120_000,
    queryFn: async () => {
      const d = new Date();
      const now = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return (await api.get('/inbox', { params: { date: today(), now } })).data as Item[];
    },
  });
  const items = q.data || [];
  const unread = items.filter((i) => !seen.includes(i.id)).length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  const markAll = () => { const ids = [...new Set([...seen, ...items.map((i) => i.id)])]; setSeen(ids); saveSeen(me!.id, ids); };
  const go = (i: Item) => {
    const ids = [...new Set([...seen, i.id])]; setSeen(ids); saveSeen(me!.id, ids);
    setOpen(false);
    if (i.link) nav(i.link);
  };

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={unread ? `الإشعارات، ${unread} جديد` : 'الإشعارات'}
        className={`relative rounded-lg p-2 transition ${open ? 'bg-sunken text-graphite ring-1 ring-brand/50' : 'text-pencil hover:text-graphite'}`}>
        <Bell size={18} />
        {unread > 0 && <span className="num absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-app">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="الإشعارات"
          className="fixed inset-x-3 top-16 z-50 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[380px] origin-top-left overflow-hidden rounded-xl border border-rule bg-surface shadow-2xl shadow-black/30 dark:border-white/[.06]">
          <div className="flex items-center justify-between border-b border-rule-soft px-4 py-3 dark:border-white/[.06]">
            <h2 className="text-[15px] font-medium">الإشعارات</h2>
            {unread > 0 && <button className="text-xs text-brand hover:underline" onClick={markAll}>تعليم الكل كمقروء</button>}
          </div>
          <div className="max-h-[min(70vh,440px)] overflow-y-auto">
            {q.isLoading ? <p className="p-6 text-center text-sm text-pencil">جارٍ التحميل…</p>
              : !items.length ? (
                <div className="p-8 text-center">
                  <Bell size={22} className="mx-auto text-pencil" />
                  <p className="mt-2 text-sm text-pencil">مفيش إشعارات دلوقتي.</p>
                </div>
              ) : (
                <ul>
                  {items.map((i) => {
                    const k = KIND[i.kind], Icon = k.icon, isNew = !seen.includes(i.id);
                    return (
                      <li key={i.id}>
                        <button onClick={() => go(i)} className={`flex w-full gap-3 px-4 py-3 text-right transition hover:bg-sunken ${isNew ? 'bg-brand-light/40 dark:bg-white/[.03]' : ''}`}>
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${k.cls}`}><Icon size={16} /></span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[13px] leading-snug ${isNew ? 'font-medium' : 'text-graphite/85'}`}>{i.title}</span>
                            {i.body && <span className="mt-0.5 line-clamp-2 block text-xs text-pencil">{i.body}</span>}
                            <span className="mt-1 block text-[11px] text-pencil">{when(i.at)}</span>
                          </span>
                          {isNew && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="جديد" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
          {me!.school?.modules.includes('notifications') && (
            <Link to="/announcements" onClick={() => setOpen(false)} className="block border-t border-rule-soft py-2.5 text-center text-[13px] text-brand hover:bg-sunken dark:border-white/[.06]">كل الإعلانات</Link>
          )}
        </div>
      )}
    </div>
  );
}
