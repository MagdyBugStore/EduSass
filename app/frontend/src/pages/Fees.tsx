import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import ResourcePage from '../components/ResourcePage';
import { Badge, Empty, Field, Modal, PageHeader, Spinner, Table } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { dateAr, money } from '../lib/format';
import { useAuth } from '../store/auth';

function NewInvoice({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { has } = useAuth();
  const adv = has('exams'); // advanced fees = Management+
  const [studentId, setStudentId] = useState('');
  const [items, setItems] = useState([{ title: 'مصروفات دراسية', kind: 'tuition', amount: 0 }]);
  const [discountId, setDiscountId] = useState('');
  const [insN, setInsN] = useState(0);
  const students = useQuery({ queryKey: ['stud-opt'], queryFn: async () => (await api.get('/students', { params: { limit: 200, status: 'active' } })).data.items });
  const discounts = useQuery({ queryKey: ['disc'], enabled: adv, queryFn: async () => (await api.get('/discounts', { params: { limit: 100 } })).data.items });
  const sub = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const dc = discounts.data?.find((d: any) => d._id === discountId);
  const disc = dc ? (dc.type === 'percent' ? (sub * dc.value) / 100 : dc.value) : 0;
  const total = Math.max(0, sub - disc);

  const save = useMutation({
    mutationFn: async () => {
      const installments = insN > 1 ? Array.from({ length: insN }, (_, i) => {
        const d = new Date(); d.setMonth(d.getMonth() + i);
        const amt = i === insN - 1 ? +(total - +(total / insN).toFixed(2) * (insN - 1)).toFixed(2) : +(total / insN).toFixed(2);
        return { dueDate: d.toISOString().slice(0, 10), amount: amt };
      }) : undefined;
      return api.post('/invoices', { studentId, items: items.map((i) => ({ ...i, amount: Number(i.amount) })), discountId: discountId || undefined, installments });
    },
    onSuccess: () => { toast.success('تم إنشاء الفاتورة'); qc.invalidateQueries({ queryKey: ['invoices'] }); onClose(); }, onError: toastErr,
  });

  return (
    <Modal wide title="فاتورة جديدة" onClose={onClose}>
      <div className="space-y-3">
        <Field label="الطالب"><select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">— اختر —</option>{students.data?.map((s: any) => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}</select></Field>
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <input className="input" placeholder="البند" value={it.title} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            {adv && <select className="input w-32" value={it.kind} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}>
              <option value="tuition">مصروفات</option><option value="bus">باص</option><option value="books">كتب</option><option value="uniform">زي</option><option value="other">أخرى</option></select>}
            <input className="input w-32" type="number" min={0} placeholder="المبلغ" value={it.amount || ''} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} />
            {items.length > 1 && <button className="rounded p-2 text-red-600" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={16} /></button>}
          </div>
        ))}
        {adv ? (
          <>
            <button className="btn-ghost" onClick={() => setItems([...items, { title: '', kind: 'other', amount: 0 }])}><Plus size={14} />بند</button>
            <div className="grid grid-cols-2 gap-3">
              <Field label="خصم"><select className="input" value={discountId} onChange={(e) => setDiscountId(e.target.value)}><option value="">بدون</option>
                {discounts.data?.map((d: any) => <option key={d._id} value={d._id}>{d.name} ({d.type === 'percent' ? `${d.value}%` : money(d.value)})</option>)}</select></Field>
              <Field label="عدد الأقساط (شهريًا)"><input className="input" type="number" min={0} max={12} value={insN} onChange={(e) => setInsN(Number(e.target.value))} /></Field>
            </div>
          </>
        ) : <p className="text-xs text-slate-500">الخصومات والأقساط وأنواع الرسوم المتعددة متاحة من باقة Management.</p>}
        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-sm">الإجمالي: <b>{money(total)}</b>{disc > 0 && <span className="text-xs text-slate-500"> (خصم {money(disc)})</span>}</div>
          <button className="btn-primary" disabled={!studentId || total <= 0 || save.isPending} onClick={() => save.mutate()}>إنشاء</button>
        </div>
      </div>
    </Modal>
  );
}

function Pay({ inv, onClose }: { inv: any; onClose: () => void }) {
  const qc = useQueryClient();
  const rest = inv.total - inv.paid;
  const [amount, setAmount] = useState(rest);
  const [method, setMethod] = useState('cash');
  const pay = useMutation({
    mutationFn: async () => (await api.post('/payments', { invoiceId: inv._id, amount, method })).data,
    onSuccess: (d) => { toast.success(`تم التحصيل — إيصال ${d.payment.receiptNo}`); qc.invalidateQueries({ queryKey: ['invoices'] }); onClose(); }, onError: toastErr,
  });
  return (
    <Modal title={`تحصيل — ${inv.number}`} onClose={onClose}>
      <p className="mb-3 text-sm">المتبقي: <b>{money(rest)}</b></p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="المبلغ"><input className="input" type="number" min={0.01} max={rest} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
        <Field label="الطريقة"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">نقدي</option><option value="bank">تحويل بنكي</option><option value="card">بطاقة</option><option value="wallet">محفظة</option></select></Field>
      </div>
      <div className="mt-4 flex justify-end"><button className="btn-primary" disabled={pay.isPending || amount <= 0 || amount > rest} onClick={() => pay.mutate()}>تحصيل</button></div>
    </Modal>
  );
}

export default function Fees() {
  const { has } = useAuth();
  const [tab, setTab] = useState<'invoices' | 'discounts'>('invoices');
  const [status, setStatus] = useState('');
  const [newInv, setNewInv] = useState(false);
  const [pay, setPay] = useState<any>(null);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['invoices', status], queryFn: async () => (await api.get('/invoices', { params: { status: status || undefined, limit: 100 } })).data });
  const cancel = useMutation({ mutationFn: async (id: string) => api.post(`/invoices/${id}/cancel`), onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }), onError: toastErr });

  return (
    <div>
      <PageHeader title="الرسوم والمدفوعات" actions={tab === 'invoices' && <button className="btn-primary" onClick={() => setNewInv(true)}><Plus size={16} />فاتورة جديدة</button>} />
      <div className="mb-4 flex gap-2">
        <button className={tab === 'invoices' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('invoices')}>الفواتير</button>
        {has('exams') && <button className={tab === 'discounts' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('discounts')}>الخصومات</button>}
      </div>
      {tab === 'discounts' ? (
        <ResourcePage title="الخصومات" url="/discounts" noun="خصم" fields={[
          { key: 'name', label: 'الاسم', required: true, list: true },
          { key: 'type', label: 'النوع', type: 'select', required: true, options: [{ value: 'percent', label: 'نسبة %' }, { value: 'fixed', label: 'مبلغ ثابت' }], list: (r) => (r.type === 'percent' ? 'نسبة' : 'ثابت') },
          { key: 'value', label: 'القيمة', type: 'number', required: true, list: true },
        ]} />
      ) : (
        <div className="card p-0">
          <div className="border-b p-3"><select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الحالات</option><option value="unpaid">غير مدفوعة</option><option value="partial">جزئية</option><option value="paid">مدفوعة</option><option value="cancelled">ملغاة</option></select></div>
          {list.isLoading ? <Spinner /> : !list.data.items.length ? <Empty text="لا توجد فواتير" /> : (
            <Table head={['الرقم', 'الطالب', 'التاريخ', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', '']}>
              {list.data.items.map((i: any) => (
                <tr key={i._id}>
                  <td className="td num">{i.number}</td><td className="td">{i.studentId?.name}</td><td className="td">{dateAr(i.createdAt)}</td>
                  <td className="td">{money(i.total)}</td><td className="td">{money(i.paid)}</td><td className="td">{money(i.total - i.paid)}</td>
                  <td className="td"><Badge status={i.status} /></td>
                  <td className="td whitespace-nowrap">
                    {(i.status === 'unpaid' || i.status === 'partial') && <button className="btn-ghost py-1" onClick={() => setPay(i)}><Banknote size={14} />تحصيل</button>}
                    {i.status === 'unpaid' && <button className="rounded p-1.5 text-red-600 hover:bg-red-50" onClick={() => confirm('إلغاء الفاتورة؟') && cancel.mutate(i._id)}>إلغاء</button>}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}
      {newInv && <NewInvoice onClose={() => setNewInv(false)} />}
      {pay && <Pay inv={pay} onClose={() => setPay(null)} />}
    </div>
  );
}
