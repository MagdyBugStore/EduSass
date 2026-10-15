import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ReactNode, useState } from 'react';
import toast from 'react-hot-toast';
import { api, errMsg, toastErr } from '../lib/api';
import { Empty, Field, Locked, Modal, PageHeader, Spinner, Table } from './ui';

export interface FieldDef {
  key: string; // supports dotted keys, e.g. guardian.name
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'multi' | 'textarea' | 'email' | 'password';
  options?: { value: string; label: string }[];
  optionsFrom?: { url: string; label: (r: any) => string }; // remote select
  required?: boolean;
  list?: boolean | ((row: any) => ReactNode); // show as column
  noEdit?: boolean; // only when creating
  createOnly?: boolean;
}

const get = (o: any, k: string) => k.split('.').reduce((a, p) => a?.[p], o);
const set = (o: any, k: string, v: any) => {
  const ps = k.split('.'); let c = o;
  ps.slice(0, -1).forEach((p) => (c = c[p] ??= {}));
  c[ps[ps.length - 1]] = v;
};

interface Props {
  title: string; sub?: string; url: string; fields: FieldDef[];
  canWrite?: boolean; canDelete?: boolean; search?: boolean; lockedLabel?: string;
  extraActions?: ReactNode; rowActions?: (row: any) => ReactNode;
  filters?: Record<string, any>; noun?: string; mapOut?: (d: any) => any; createLabel?: string;
}

/** Generic table + create/edit modal bound to a tenant CRUD endpoint. */
export default function ResourcePage(p: Props) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<any | null>(null); // null closed; {} new; {_id} edit

  const list = useQuery({
    queryKey: [p.url, q, page, p.filters],
    queryFn: async () => (await api.get(p.url, { params: { q: q || undefined, page, limit: 20, ...p.filters } })).data,
  });

  const save = useMutation({
    mutationFn: async (d: any) => {
      const body = p.mapOut ? p.mapOut(d) : d;
      return d._id ? api.put(`${p.url}/${d._id}`, strip(body)) : api.post(p.url, strip(body));
    },
    onSuccess: () => { toast.success('تم الحفظ'); setForm(null); qc.invalidateQueries({ queryKey: [p.url] }); },
    onError: toastErr,
  });
  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`${p.url}/${id}`),
    onSuccess: () => { toast.success('تم الحذف'); qc.invalidateQueries({ queryKey: [p.url] }); },
    onError: toastErr,
  });

  if ((list.error as any)?.response?.status === 402) return <Locked what={p.lockedLabel || p.title} />;
  const cols = p.fields.filter((f) => f.list);
  const items: any[] = list.data?.items || [];
  const pages = Math.max(1, Math.ceil((list.data?.total || 0) / 20));

  return (
    <div>
      <PageHeader title={p.title} sub={p.sub} actions={<>
        {p.extraActions}
        {p.canWrite !== false && <button className="btn-primary" onClick={() => setForm({})}><Plus size={16} />{p.createLabel || 'إضافة'}</button>}
      </>} />
      <div className="card p-0">
        {p.search !== false && (
          <div className="border-b p-3"><input className="input max-w-xs" placeholder="بحث…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        )}
        {list.isLoading ? <Spinner /> : !items.length ? <Empty /> : (
          <Table head={[...cols.map((c) => c.label), '']}>
            {items.map((r) => (
              <tr key={r._id} className="hover:bg-sunken">
                {cols.map((c) => <td key={c.key} className="td">{typeof c.list === 'function' ? c.list(r) : String(get(r, c.key) ?? '—')}</td>)}
                <td className="td whitespace-nowrap text-left">
                  {p.rowActions?.(r)}
                  {p.canWrite !== false && <button className="rounded p-1.5 hover:bg-sunken" onClick={() => setForm(toForm(r, p.fields))} aria-label="تعديل"><Pencil size={15} /></button>}
                  {p.canDelete !== false && p.canWrite !== false && (
                    <button className="rounded p-1.5 text-red-600 hover:bg-red-50" aria-label="حذف"
                      onClick={() => confirm('تأكيد الحذف؟') && del.mutate(r._id)}><Trash2 size={15} /></button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 border-t p-3 text-sm">
            <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
            <span>{page} / {pages}</span>
            <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</button>
          </div>
        )}
      </div>

      {form && (
        <Modal title={form._id ? `تعديل ${p.noun || ''}` : `إضافة ${p.noun || ''}`} onClose={() => setForm(null)}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
            {p.fields.filter((f) => !(form._id && (f.noEdit || f.createOnly))).map((f) => (
              <div key={f.key} className={f.type === 'textarea' || f.type === 'multi' ? 'sm:col-span-2' : ''}>
                <Field label={f.label + (f.required ? ' *' : '')}>
                  <Input f={f} value={get(form, f.key) ?? ''} onChange={(v) => { const n = structuredClone(form); set(n, f.key, v); setForm(n); }} />
                </Field>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>إلغاء</button>
              <button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'جارٍ الحفظ…' : 'حفظ'}</button>
            </div>
            {save.isError && <p className="text-sm text-red-600 sm:col-span-2">{errMsg(save.error)}</p>}
          </form>
        </Modal>
      )}
    </div>
  );
}

function Input({ f, value, onChange }: { f: FieldDef; value: any; onChange: (v: any) => void }) {
  const remote = useQuery({
    queryKey: ['opt', f.optionsFrom?.url],
    enabled: !!f.optionsFrom,
    queryFn: async () => (await api.get(f.optionsFrom!.url, { params: { limit: 200 } })).data,
  });
  if (f.type === 'multi') {
    const opts = (remote.data?.items || remote.data || []).map((r: any) => ({ value: r._id, label: f.optionsFrom!.label(r) }));
    const sel: string[] = Array.isArray(value) ? value : [];
    if (!opts.length) return <p className="text-sm text-pencil">{remote.isLoading ? 'جارٍ التحميل…' : 'مفيش اختيارات لسه'}</p>;
    return (
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded border border-rule p-2">
        {opts.map((o: any) => {
          const on = sel.includes(o.value);
          return (
            <label key={o.value} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-sm ${on ? 'border-brand bg-brand-light text-brand' : 'border-rule-soft'}`}>
              <input type="checkbox" className="accent-brand" checked={on} onChange={() => onChange(on ? sel.filter((x) => x !== o.value) : [...sel, o.value])} />
              {o.label}
            </label>
          );
        })}
      </div>
    );
  }
  if (f.type === 'textarea') return <textarea className="input" rows={3} value={value} onChange={(e) => onChange(e.target.value)} required={f.required} />;
  if (f.type === 'select' || f.optionsFrom) {
    const opts = f.options || (remote.data?.items || remote.data || []).map((r: any) => ({ value: r._id, label: f.optionsFrom!.label(r) }));
    return (
      <select className="input" value={value?._id ?? value} onChange={(e) => onChange(e.target.value)} required={f.required}>
        <option value="">— اختر —</option>
        {opts.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input className="input" type={f.type || 'text'} value={value} required={f.required} step={f.type === 'number' ? 'any' : undefined}
      onChange={(e) => onChange(f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />
  );
}

// populated refs -> ids, dates -> yyyy-mm-dd
function toForm(row: any, fields: FieldDef[]) {
  const f = structuredClone(row);
  for (const d of fields) {
    const v = get(f, d.key);
    if (d.type === 'date' && v) set(f, d.key, String(v).slice(0, 10));
    if (d.type === 'multi') set(f, d.key, (v || []).map((x: any) => (typeof x === 'object' ? x._id : x)));
    else if ((d.type === 'select' || d.optionsFrom) && v && typeof v === 'object') set(f, d.key, v._id);
  }
  return f;
}

// drop empty strings & server-managed keys before sending
function strip(d: any): any {
  const o: any = {};
  for (const [k, v] of Object.entries(d)) {
    if (['_id', 'createdAt', 'updatedAt', '__v', 'schoolId', 'code'].includes(k) || v === '' || v == null) continue;
    o[k] = v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) ? strip(v) : v;
  }
  return o;
}
