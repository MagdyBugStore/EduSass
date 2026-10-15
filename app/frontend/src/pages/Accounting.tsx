import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Empty, Field, Locked, Modal, PageHeader, Spinner, Table } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { dateAr, money } from '../lib/format';

const TYPE_AR: Record<string, string> = { asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' };

function Entry({ accounts, onClose }: { accounts: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState([{ accountId: '', debit: 0, credit: 0 }, { accountId: '', debit: 0, credit: 0 }]);
  const dr = lines.reduce((s, l) => s + (l.debit || 0), 0), cr = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const ok = dr > 0 && Math.abs(dr - cr) < 0.005 && lines.every((l) => l.accountId);
  const save = useMutation({
    mutationFn: async () => api.post('/accounting/journal', { memo, lines }),
    onSuccess: () => { toast.success('تم ترحيل القيد'); qc.invalidateQueries({ queryKey: ['journal'] }); qc.invalidateQueries({ queryKey: ['tb'] }); onClose(); }, onError: toastErr,
  });
  const upd = (i: number, p: any) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <Modal wide title="قيد يومية" onClose={onClose}>
      <Field label="البيان"><input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
      <div className="mt-3 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <select className="input" value={l.accountId} onChange={(e) => upd(i, { accountId: e.target.value })}><option value="">— حساب —</option>{accounts.map((a) => <option key={a._id} value={a._id}>{a.code} {a.name}</option>)}</select>
            <input className="input w-28" type="number" min={0} placeholder="مدين" value={l.debit || ''} onChange={(e) => upd(i, { debit: Number(e.target.value), credit: 0 })} />
            <input className="input w-28" type="number" min={0} placeholder="دائن" value={l.credit || ''} onChange={(e) => upd(i, { credit: Number(e.target.value), debit: 0 })} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button className="btn-ghost" onClick={() => setLines([...lines, { accountId: '', debit: 0, credit: 0 }])}><Plus size={14} />سطر</button>
        <span className={`text-sm ${ok ? 'text-emerald-600' : 'text-red-600'}`}>مدين {money(dr)} / دائن {money(cr)}</span>
        <button className="btn-primary" disabled={!ok || save.isPending} onClick={() => save.mutate()}>ترحيل</button>
      </div>
    </Modal>
  );
}

export default function Accounting() {
  const [tab, setTab] = useState<'tb' | 'journal' | 'accounts'>('tb');
  const [entry, setEntry] = useState(false);
  const accts = useQuery({ queryKey: ['accts'], queryFn: async () => (await api.get('/accounting/accounts')).data });
  const tb = useQuery({ queryKey: ['tb'], enabled: tab === 'tb', queryFn: async () => (await api.get('/accounting/trial-balance')).data });
  const jr = useQuery({ queryKey: ['journal'], enabled: tab === 'journal', queryFn: async () => (await api.get('/accounting/journal')).data });
  if ((accts.error as any)?.response?.status === 402) return <Locked what="المحاسبة" />;

  return (
    <div>
      <PageHeader title="المحاسبة" sub="الفواتير والتحصيل والمصروفات والرواتب تُرحَّل تلقائيًا إلى القيود" actions={<button className="btn-primary" onClick={() => setEntry(true)}><Plus size={16} />قيد يدوي</button>} />
      <div className="mb-4 flex gap-2">
        {([['tb', 'ميزان المراجعة'], ['journal', 'قيود اليومية'], ['accounts', 'دليل الحسابات']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <div className="card p-0">
        {tab === 'tb' && (tb.isLoading ? <Spinner /> : (
          <Table head={['الكود', 'الحساب', 'النوع', 'مدين', 'دائن', 'الرصيد']}>
            {tb.data.rows.map((r: any) => <tr key={r.code}><td className="td num">{r.code}</td><td className="td">{r.name}</td><td className="td">{TYPE_AR[r.type]}</td><td className="td">{money(r.debit)}</td><td className="td">{money(r.credit)}</td><td className="td font-medium">{money(r.balance)}</td></tr>)}
            <tr className="bg-sunken font-bold"><td className="td" colSpan={3}>الإجمالي</td><td className="td">{money(tb.data.totalDebit)}</td><td className="td">{money(tb.data.totalCredit)}</td><td className="td">{tb.data.totalDebit === tb.data.totalCredit ? '✓ متوازن' : '✗ غير متوازن'}</td></tr>
          </Table>
        ))}
        {tab === 'journal' && (jr.isLoading ? <Spinner /> : !jr.data.length ? <Empty text="لا توجد قيود" /> : (
          <div className="divide-y">{jr.data.map((j: any) => (
            <div key={j._id} className="p-3 text-sm"><div className="mb-1 flex justify-between"><b>{j.memo || j.ref}</b><span className="text-pencil">{dateAr(j.date)}</span></div>
              {j.lines.map((l: any, i: number) => <div key={i} className="flex justify-between text-pencil"><span>{l.accountId?.code} {l.accountId?.name}</span><span className="num">{l.debit ? `مدين ${l.debit}` : `دائن ${l.credit}`}</span></div>)}</div>
          ))}</div>
        ))}
        {tab === 'accounts' && (
          <Table head={['الكود', 'الاسم', 'النوع']}>{accts.data?.map((a: any) => <tr key={a._id}><td className="td num">{a.code}</td><td className="td">{a.name}</td><td className="td">{TYPE_AR[a.type]}</td></tr>)}</Table>
        )}
      </div>
      {entry && <Entry accounts={accts.data || []} onClose={() => setEntry(false)} />}
    </div>
  );
}
