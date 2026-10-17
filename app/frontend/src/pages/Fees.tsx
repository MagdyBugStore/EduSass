import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Avatar } from '../components/Avatar';
import ResourcePage from '../components/ResourcePage';
import { Empty, Field, Modal, PageHeader, Spinner } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { dateAr, money, STATUS_AR, today } from '../lib/format';
import { CHART, useTheme } from '../lib/theme';
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
    onSuccess: () => { toast.success('اتعملت الفاتورة'); qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['fees-overview'] }); onClose(); }, onError: toastErr,
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
            {items.length > 1 && <button className="rounded-lg p-2 text-pencil hover:text-danger" aria-label="امسح البند" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={16} /></button>}
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
        ) : <p className="text-xs text-pencil">الخصومات والأقساط وأنواع الرسوم المتعددة متاحة من باقة Management.</p>}
        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-sm">الإجمالي: <b>{money(total)}</b>{disc > 0 && <span className="text-xs text-pencil"> (خصم {money(disc)})</span>}</div>
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
    onSuccess: (d) => { toast.success(`اتحصّل المبلغ، إيصال ${d.payment.receiptNo}`); qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['fees-overview'] }); qc.invalidateQueries({ queryKey: ['payments'] }); onClose(); }, onError: toastErr,
  });
  return (
    <Modal title={`تحصيل فاتورة ${inv.number}`} onClose={onClose}>
      <p className="mb-3 text-sm">المتبقي: <b>{money(rest)}</b></p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="المبلغ"><input className="input" type="number" min={0.01} max={rest} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
        <Field label="الطريقة"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">نقدي</option><option value="bank">تحويل بنكي</option><option value="card">بطاقة</option><option value="wallet">محفظة</option></select></Field>
      </div>
      <div className="mt-4 flex justify-end"><button className="btn-primary" disabled={pay.isPending || amount <= 0 || amount > rest} onClick={() => pay.mutate()}>تحصيل</button></div>
    </Modal>
  );
}

const METHOD: Record<string, string> = { cash: 'نقدي', bank: 'تحويل بنكي', card: 'بطاقة', wallet: 'محفظة' };
const KIND: Record<string, string> = { tuition: 'مصروفات', bus: 'باص', books: 'كتب', uniform: 'زي', other: 'أخرى' };
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const num = (n: number) => Math.round(n).toLocaleString('en-US');
const STATUS_PILL: Record<string, string> = {
  paid: 'bg-emerald-600 text-white', partial: 'bg-amber-500 text-white', unpaid: 'bg-red-600 text-white', cancelled: 'bg-sunken text-pencil',
};

type Tab = 'dashboard' | 'invoices' | 'payments' | 'discounts';

export default function Fees() {
  const { has, me } = useAuth();
  const fin = ['owner', 'admin', 'accountant'].includes(me!.role);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [newInv, setNewInv] = useState(false);
  const [pay, setPay] = useState<any>(null);
  const tabs: [Tab, string][] = [['dashboard', 'لوحة الرسوم'], ['invoices', 'الفواتير'], ...(fin ? [['payments', 'المدفوعات'] as [Tab, string]] : []), ...(has('exams') && fin ? [['discounts', 'الخصومات'] as [Tab, string]] : [])];

  return (
    <div>
      <PageHeader title="الرسوم والمدفوعات" sub="التحصيل والمستحقات وحركة المدفوعات" actions={<>
        <div className="inline-flex flex-wrap rounded-full border border-rule bg-surface p-1 text-sm" role="tablist" aria-label="أقسام الرسوم">
          {tabs.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`rounded-full px-4 py-1 transition ${tab === k ? 'bg-brand text-white' : 'text-pencil hover:text-graphite'}`}>{l}</button>
          ))}
        </div>
        {fin && <button className="btn-primary" onClick={() => setNewInv(true)}><Plus size={16} />فاتورة جديدة</button>}
      </>} />

      {tab === 'dashboard' && <Dashboard onPay={fin ? setPay : undefined} openTab={setTab} />}
      {tab === 'invoices' && <Invoices fin={fin} onPay={setPay} />}
      {tab === 'payments' && <Payments />}
      {tab === 'discounts' && (
        <ResourcePage title="الخصومات" url="/discounts" noun="خصم" fields={[
          { key: 'name', label: 'الاسم', required: true, list: true },
          { key: 'type', label: 'النوع', type: 'select', required: true, options: [{ value: 'percent', label: 'نسبة %' }, { value: 'fixed', label: 'مبلغ ثابت' }], list: (r) => (r.type === 'percent' ? 'نسبة' : 'ثابت') },
          { key: 'value', label: 'القيمة', type: 'number', required: true, list: (r) => (r.type === 'percent' ? `${r.value}%` : money(r.value)) },
        ]} />
      )}
      {newInv && <NewInvoice onClose={() => setNewInv(false)} />}
      {pay && <Pay inv={pay} onClose={() => setPay(null)} />}
    </div>
  );
}

/** The reference's three solid tiles, the year chart, the collection donut, the payments log and who owes most. */
function Dashboard({ onPay, openTab }: { onPay?: (inv: any) => void; openTab: (t: Tab) => void }) {
  const c = CHART[useTheme((t) => t.theme)];
  const q = useQuery({ queryKey: ['fees-overview'], queryFn: async () => (await api.get('/invoices/overview', { params: { date: today() } })).data });
  if (q.isLoading) return <Spinner />;
  const d = q.data;
  const collected = d.totals.billed ? Math.round((d.totals.paid / d.totals.billed) * 100) : 0;
  const tiles = [
    { label: 'إجمالي المحصّل', value: `${num(d.totals.paid)} ج.م`, sub: `مستحق خلال 30 يوم: ${num(d.upcoming.sum)} ج.م`, bg: 'linear-gradient(135deg,#0A4A43,#0F5F56)', idx: '1' },
    { label: 'مدفوعات النهارده', value: `${d.today.count} ${d.today.count > 2 && d.today.count < 11 ? 'دفعات' : 'دفعة'}`, sub: `بإجمالي ${num(d.today.sum)} ج.م${d.today.last ? `، آخر دفعة ${new Date(d.today.last).toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' })}` : ''}`, bg: 'linear-gradient(135deg,#172E6E,#1E3A8A)', idx: '2' },
    { label: 'مواعيد استحقاق قريبة', value: `${d.upcoming.count} ${d.upcoming.count > 2 && d.upcoming.count < 11 ? 'أقساط' : 'قسط'}`, sub: d.upcoming.next ? `أقربها ${dateAr(d.upcoming.next)}${d.overdue.count ? `، ومتأخر ${d.overdue.count}` : ''}` : d.overdue.count ? `متأخر ${d.overdue.count} بقيمة ${num(d.overdue.sum)} ج.م` : 'مفيش مستحقات قريبة', bg: 'linear-gradient(135deg,#A9884A,#C9A96A)', idx: '3' },
  ];
  const chart = d.months.map((m: any) => ({ ...m, label: MONTHS[Number(m.month.slice(5)) - 1] }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="relative overflow-hidden rounded-xl p-5 text-white" style={{ backgroundImage: t.bg, boxShadow: '0 14px 30px -16px rgb(0 0 0 / .5)' }}>
            <span className="num absolute left-4 top-3 text-lg font-light text-white/60" aria-hidden>{t.idx}</span>
            <div className="text-[13px] text-white/90">{t.label}</div>
            <div className="num mt-1 text-[1.9rem] font-bold leading-tight">{t.value}</div>
            <div className="mt-1 text-xs text-white/85">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card" aria-labelledby="h-year">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 id="h-year" className="text-base font-medium">{d.hasExpenses ? 'الإيرادات مقابل المصروفات' : 'التحصيل الشهري'}</h2>
            <span className="text-xs text-pencil">آخر 12 شهر</span>
          </div>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="2 4" />
                <XAxis dataKey="label" tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-30} textAnchor="end" height={44} />
                <YAxis tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} width={40} />
                <Tooltip cursor={{ fill: c.grid, opacity: 0.3 }} formatter={(v: number, n: string) => [`${num(v)} ج.م`, n]} contentStyle={{ background: c.tipBg, border: `1px solid ${c.tipBorder}`, borderRadius: 10, color: c.tipText }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="الإيرادات" fill="#16A34A" radius={[4, 4, 0, 0]} maxBarSize={18} />
                {d.hasExpenses && <Bar dataKey="expenses" name="المصروفات" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={18} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card" aria-labelledby="h-status">
          <h2 id="h-status" className="text-base font-medium">حالة التحصيل</h2>
          <div className="relative mx-auto mt-3 h-44 w-44">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={[{ v: d.totals.paid }, { v: d.totals.outstanding }]} dataKey="v" innerRadius={56} outerRadius={80} stroke="none" startAngle={90} endAngle={-270}>
                  <Cell fill="#16A34A" /><Cell fill="#E24C65" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div><div className="num text-2xl font-bold">{collected}%</div><div className="text-[11px] text-pencil">اتحصّل</div></div>
            </div>
          </div>
          <ul className="mt-3 space-y-2 text-[13px]">
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#16A34A]" /><span className="flex-1">اتحصّل</span><b className="num font-medium">{num(d.totals.paid)} ج.م</b></li>
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#E24C65]" /><span className="flex-1">مستحق</span><b className="num font-medium">{num(d.totals.outstanding)} ج.م</b></li>
            <li className="flex items-center gap-2 border-t border-rule-soft pt-2 text-pencil dark:border-white/[.06]"><span className="flex-1">إجمالي الفواتير</span><b className="num font-medium text-graphite">{num(d.totals.billed)} ج.م</b></li>
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card p-0" aria-labelledby="h-tx">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 id="h-tx" className="text-base font-medium">آخر المدفوعات</h2>
            {onPay && <button className="text-[13px] text-brand hover:underline" onClick={() => openTab('payments')}>كل المدفوعات</button>}
          </div>
          {!d.recent.length ? <Empty text="مفيش مدفوعات لسه." /> : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead><tr><th className="th">التاريخ</th><th className="th">الطالب</th><th className="th">الإيصال</th><th className="th">نوع الرسوم</th><th className="th">الطريقة</th><th className="th">المبلغ</th><th className="th">حالة الفاتورة</th></tr></thead>
                <tbody>
                  {d.recent.map((p: any) => (
                    <tr key={p._id}>
                      <td className="td whitespace-nowrap">{dateAr(p.date)}</td>
                      <td className="td">{p.student && <Link to={`/students/${p.student._id}`} className="flex items-center gap-2 whitespace-nowrap hover:text-brand"><Avatar name={p.student.name} photo={p.student.photo} className="h-7 w-7 text-[11px]" />{p.student.name}</Link>}</td>
                      <td className="td num whitespace-nowrap text-pencil">{p.receiptNo}</td>
                      <td className="td whitespace-nowrap">{(p.invoice?.kinds || []).map((k: string) => KIND[k] || k).join('، ') || '—'}</td>
                      <td className="td">{METHOD[p.method] || p.method}</td>
                      <td className="td num whitespace-nowrap font-medium">{num(p.amount)} ج.م</td>
                      <td className="td">{p.invoice && <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${STATUS_PILL[p.invoice.status]}`}>{STATUS_AR[p.invoice.status]}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="h-due">
          <h2 id="h-due" className="text-base font-medium">مستحقات الطلاب</h2>
          {!d.topDue.length ? <p className="mt-3 text-sm text-pencil">مفيش مستحقات على حد.</p> : (
            <ul className="mt-3 space-y-3.5">
              {d.topDue.map((t: any) => {
                const pct = t.total ? Math.round((t.paid / t.total) * 100) : 0;
                return (
                  <li key={t.student._id}>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={t.student.name} photo={t.student.photo} className="h-8 w-8 text-xs" />
                      <Link to={`/students/${t.student._id}`} className="min-w-0 flex-1 truncate text-[13px] font-medium hover:text-brand">{t.student.name}</Link>
                      <span className="num whitespace-nowrap text-[13px] font-medium text-danger">{num(t.due)} ج.م</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 ps-[42px]">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 75 ? '#16A34A' : pct >= 40 ? '#F59E0B' : '#E24C65' }} /></span>
                      <span className="num w-9 text-left text-[11px] text-pencil">{pct}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <button className="btn-ghost mt-4 w-full" onClick={() => openTab('invoices')}>كل الفواتير</button>
        </section>
      </div>
    </div>
  );
}

function Invoices({ fin, onPay }: { fin: boolean; onPay: (inv: any) => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [cancelling, setCancelling] = useState<any>(null);
  const list = useQuery({ queryKey: ['invoices', status], queryFn: async () => (await api.get('/invoices', { params: { status: status || undefined, limit: 100 } })).data });
  const cancel = useMutation({
    mutationFn: async (id: string) => api.post(`/invoices/${id}/cancel`),
    onSuccess: () => { toast.success('اتلغت الفاتورة'); setCancelling(null); qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['fees-overview'] }); },
    onError: toastErr,
  });
  const tabs: [string, string][] = [['', 'الكل'], ['unpaid', 'غير مدفوعة'], ['partial', 'مدفوعة جزئيًا'], ['paid', 'مدفوعة'], ['cancelled', 'ملغاة']];
  return (
    <section className="card p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule-soft p-4 dark:border-white/[.06]">
        <div className="inline-flex flex-wrap gap-1 rounded-full bg-sunken p-1 text-[13px]" role="tablist" aria-label="حالة الفاتورة">
          {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={status === k} onClick={() => setStatus(k)} className={`rounded-full px-3.5 py-1.5 ${status === k ? 'bg-surface font-medium text-graphite shadow' : 'text-pencil hover:text-graphite'}`}>{l}</button>)}
        </div>
        <span className="ms-auto text-[13px] text-pencil"><span className="num">{list.data?.total ?? 0}</span> فاتورة</span>
      </div>
      {list.isLoading ? <Spinner /> : !list.data.items.length ? <Empty text="مفيش فواتير بالحالة دي." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead><tr><th className="th">الرقم</th><th className="th">الطالب</th><th className="th">التاريخ</th><th className="th">الإجمالي</th><th className="th w-48">المدفوع</th><th className="th">الحالة</th><th className="th" /></tr></thead>
            <tbody>
              {list.data.items.map((i: any) => {
                const pct = i.total ? Math.round((i.paid / i.total) * 100) : 0;
                return (
                  <tr key={i._id}>
                    <td className="td num text-pencil">{i.number}</td>
                    <td className="td">{i.studentId && <Link to={`/students/${i.studentId._id}`} className="flex items-center gap-2 whitespace-nowrap hover:text-brand"><Avatar name={i.studentId.name} photo={i.studentId.photo} className="h-7 w-7 text-[11px]" />{i.studentId.name}</Link>}</td>
                    <td className="td whitespace-nowrap">{dateAr(i.createdAt)}</td>
                    <td className="td num whitespace-nowrap">{num(i.total)} ج.م</td>
                    <td className="td">
                      <div className="flex items-center justify-between text-xs"><span className="num">{num(i.paid)}</span><span className="num text-pencil">باقي {num(i.total - i.paid)}</span></div>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} /></span>
                    </td>
                    <td className="td"><span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${STATUS_PILL[i.status]}`}>{STATUS_AR[i.status]}</span></td>
                    <td className="td whitespace-nowrap text-left">
                      {fin && (i.status === 'unpaid' || i.status === 'partial') && <button className="btn-ghost h-8 px-3" onClick={() => onPay(i)}><Banknote size={14} />تحصيل</button>}
                      {fin && i.status === 'unpaid' && <button className="ms-1 rounded-lg p-1.5 text-pencil hover:text-danger" onClick={() => setCancelling(i)} aria-label={`إلغاء ${i.number}`} title="إلغاء الفاتورة"><Trash2 size={15} /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {cancelling && (
        <Modal title="إلغاء الفاتورة" onClose={() => setCancelling(null)}>
          <p className="text-sm">هتتلغى الفاتورة <span className="num">{cancelling.number}</span> لـ {cancelling.studentId?.name} بقيمة <span className="num">{num(cancelling.total)}</span> ج.م. الفاتورة الملغاة مش بتتحسب في المستحقات.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setCancelling(null)}>رجوع</button>
            <button className="btn-danger" onClick={() => cancel.mutate(cancelling._id)} disabled={cancel.isPending}>{cancel.isPending ? 'جارٍ الإلغاء…' : 'إلغاء الفاتورة'}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function Payments() {
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['payments', page], queryFn: async () => (await api.get('/payments', { params: { page, limit: 25 } })).data });
  const pages = Math.max(1, Math.ceil((list.data?.total || 0) / 25));
  return (
    <section className="card p-0">
      {list.isLoading ? <Spinner /> : !list.data.items.length ? <Empty text="مفيش مدفوعات لسه." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead><tr><th className="th">التاريخ</th><th className="th">الطالب</th><th className="th">الإيصال</th><th className="th">الفاتورة</th><th className="th">نوع الرسوم</th><th className="th">الطريقة</th><th className="th">المبلغ</th></tr></thead>
            <tbody>
              {list.data.items.map((p: any) => (
                <tr key={p._id}>
                  <td className="td whitespace-nowrap">{dateAr(p.date)}</td>
                  <td className="td">{p.studentId && <Link to={`/students/${p.studentId._id}`} className="flex items-center gap-2 whitespace-nowrap hover:text-brand"><Avatar name={p.studentId.name} photo={p.studentId.photo} className="h-7 w-7 text-[11px]" />{p.studentId.name}</Link>}</td>
                  <td className="td num whitespace-nowrap text-pencil">{p.receiptNo}</td>
                  <td className="td num">{p.invoiceId?.number}</td>
                  <td className="td">{[...new Set((p.invoiceId?.items || []).map((x: any) => KIND[x.kind] || x.kind))].join('، ') || '—'}</td>
                  <td className="td">{METHOD[p.method] || p.method}</td>
                  <td className="td num whitespace-nowrap font-medium">{num(p.amount)} ج.م</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 border-t border-rule-soft p-3 text-sm dark:border-white/[.06]">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span className="num">{page} / {pages}</span>
          <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}
    </section>
  );
}
