import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import toast from 'react-hot-toast';
import { api, toastErr } from '../lib/api';
import { dateAr } from '../lib/format';
import { useAuth } from '../store/auth';
import { Field } from './ui';

const KIND = { behavior: 'سلوك', academic: 'تحصيل' } as const;

/** Write a note on a student and read the earlier ones. Used in "فصولي" and the student profile. */
export default function StudentNotes({ studentId }: { studentId: string }) {
  const { me, has } = useAuth();
  const qc = useQueryClient();
  const key = ['notes', studentId];
  const list = useQuery({ queryKey: key, queryFn: async () => (await api.get('/teacher/notes', { params: { studentId } })).data });
  const [f, setF] = useState({ kind: 'academic' as keyof typeof KIND, body: '', sendToParent: has('parentPortal') });
  const add = useMutation({
    mutationFn: async () => api.post('/teacher/notes', { studentId, ...f }),
    onSuccess: () => { toast.success(f.sendToParent ? 'اتحفظت الملاحظة واتبعتت لولي الأمر' : 'اتحفظت الملاحظة'); setF({ ...f, body: '' }); qc.invalidateQueries({ queryKey: key }); },
    onError: toastErr,
  });
  const del = useMutation({ mutationFn: async (id: string) => api.delete(`/teacher/notes/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: key }), onError: toastErr });
  const submit = (e: FormEvent) => { e.preventDefault(); if (f.body.trim().length >= 2) add.mutate(); };
  const mgr = me!.role === 'owner' || me!.role === 'admin';

  return (
    <div>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-2" role="radiogroup" aria-label="نوع الملاحظة">
          {(Object.keys(KIND) as (keyof typeof KIND)[]).map((k) => (
            <label key={k} className={`cursor-pointer rounded-sm border px-3 py-1.5 text-sm ${f.kind === k ? 'border-brand bg-brand-light text-brand' : 'border-rule'}`}>
              <input type="radio" name={`kind-${studentId}`} className="sr-only" checked={f.kind === k} onChange={() => setF({ ...f, kind: k })} />{KIND[k]}
            </label>
          ))}
        </div>
        <Field label="الملاحظة"><textarea className="input" rows={3} maxLength={1000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required /></Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {has('parentPortal') ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[#1C3F94]" checked={f.sendToParent} onChange={(e) => setF({ ...f, sendToParent: e.target.checked })} />
              ابعتها لولي الأمر على التطبيق
            </label>
          ) : <span />}
          <button className="btn-primary" disabled={add.isPending || f.body.trim().length < 2}>{add.isPending ? 'جارٍ الحفظ…' : 'حفظ الملاحظة'}</button>
        </div>
      </form>

      <div className="mt-5 border-t border-rule-soft pt-3">
        <div className="mb-2 text-xs font-medium text-pencil">الملاحظات السابقة</div>
        {list.isLoading ? <p className="text-sm text-pencil">جارٍ التحميل…</p> : !list.data?.length ? <p className="text-sm text-pencil">مفيش ملاحظات على الطالب ده.</p> : (
          <ul className="max-h-64 space-y-3 overflow-y-auto">
            {list.data.map((n: any) => (
              <li key={n._id} className="border-r-2 border-brand/40 pr-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-line">{n.body}</p>
                  {(mgr || n.teacherId?._id === me!.id) && <button className="shrink-0 rounded p-1 text-pencil hover:bg-red-50 hover:text-red-700" onClick={() => del.mutate(n._id)} aria-label="امسح الملاحظة"><Trash2 size={14} /></button>}
                </div>
                <div className="mt-1 text-xs text-pencil">{KIND[n.kind as keyof typeof KIND]}، {n.teacherId?.name}، {dateAr(n.createdAt)}{n.sentToParent && '، اتبعتت لولي الأمر'}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
