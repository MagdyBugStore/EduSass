import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { Modal, PageHeader, Spinner } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { dateAr, money, PLAN_AR } from '../lib/format';
import { useAuth } from '../store/auth';

const PLANS = ['core', 'mgmt', 'biz', 'acad', 'ent'];
const BLURB: Record<string, string> = {
  core: 'طلاب، فصول، معلمون، حضور، رسوم أساسية، تقارير أساسية',
  mgmt: 'امتحانات ودرجات، خصومات وأقساط، مصروفات، تقارير مالية، مستندات',
  biz: 'محاسبة، موارد بشرية ورواتب، بوابة أولياء الأمور، إشعارات، واتساب، KPI',
  acad: 'كل الأعمال + جدول الحصص، بوابة المعلمين، ملاحظات المعلمين، متابعة الالتزام',
  ent: 'متعدد الفروع، API وWebhooks، هوية بصرية، دعم مخصص — حسب الطلب',
};

export default function Subscription() {
  const { me, load } = useAuth();
  const nav = useNavigate();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [pick, setPick] = useState<{ plan: string; tier: number; price: number } | null>(null);
  const [trialOpen, setTrialOpen] = useState(true);
  const plans = useQuery({ queryKey: ['plans'], queryFn: async () => (await api.get('/plans')).data });
  const school = useQuery({ queryKey: ['school'], queryFn: async () => (await api.get('/school')).data });
  const change = useMutation({
    mutationFn: async (v: { plan: string; tier: number }) => api.post('/school/subscription', { ...v, billingCycle: cycle }),
    onSuccess: async () => { toast.success('تم تحديث الاشتراك'); setPick(null); await done(); }, onError: toastErr,
  });
  const trial = useMutation({
    mutationFn: async () => api.post('/school/trial'),
    onSuccess: async () => { toast.success(`التجربة المجانية اتفعّلت لمدة ${school.data?.trialDays ?? 7} أيام`); await done(); }, onError: toastErr,
  });
  // a school that had no plan goes to its dashboard once it has one
  const done = async () => {
    const wasBlocked = school.data?.needsPlan;
    await load(); await school.refetch();
    if (wasBlocked) nav('/', { replace: true });
  };
  if (plans.isLoading || school.isLoading) return <Spinner />;
  const { tiers, prices } = plans.data;
  const s = school.data;
  const owner = me!.role === 'owner';
  const pending = s.status === 'pending';
  const canTrial = owner && pending && !s.trialUsed;
  const days = s.trialDays ?? 7;

  return (
    <div>
      {s.needsPlan ? (
        <>
          <PageHeader title="اختار باقة مدرستك"
            sub={pending ? `مدرستك اتعملت. اختار الباقة اللي تناسبك، أو جرّب كل المميزات ${days} أيام مجاناً.`
              : `انتهت ${s.status === 'trial' ? 'التجربة المجانية' : 'مدة الاشتراك'}. اختار باقة عشان تكمّل، وكل بيانات مدرستك محفوظة.`} />
          {canTrial && (
            <button onClick={() => setTrialOpen(true)} className="card mb-4 flex w-full items-center gap-3 text-right hover:border-brand">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-light text-brand"><Gift size={18} /></span>
              <span className="flex-1"><b>جرّب {days} أيام مجاناً</b><span className="block text-sm text-pencil">كل مميزات النظام لحد 100 طالب، من غير دفع.</span></span>
              <span className="btn-primary">فعّل التجربة</span>
            </button>
          )}
          {!owner && <div className="card mb-4 text-sm">صاحب المدرسة بس هو اللي يقدر يختار الباقة. كلّمه عشان يفعّلها.</div>}
        </>
      ) : <PageHeader title="الاشتراك والباقة" sub="السعر = شريحة الطلاب النشطين × الباقة. الموظفون غير محسوبين." />}
      {!pending && <div className="card mb-4 text-sm">
        الباقة الحالية: <b>{PLAN_AR[s.plan]}</b> • الشريحة: حتى <b>{s.tier}</b> طالب • مستخدَم <b>{s.activeStudents}</b> • الحالة: {s.status === 'trial' ? 'تجريبي' : 'نشط'} • ينتهي {dateAr(s.subscriptionEnds)}
        {s.price != null && <> • <b>{money(s.price)}</b> / {s.billingCycle === 'yearly' ? 'سنة' : 'شهر'}</>}
      </div>}
      <div className="mb-3 flex gap-2">
        <button className={cycle === 'monthly' ? 'btn-primary' : 'btn-ghost'} onClick={() => setCycle('monthly')}>شهري</button>
        <button className={cycle === 'yearly' ? 'btn-primary' : 'btn-ghost'} onClick={() => setCycle('yearly')}>سنوي (شهرين مجانًا)</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead><tr><th className="th">الطلاب النشطون</th>{PLANS.map((p) => <th key={p} className="th">{PLAN_AR[p]}<div className="mt-1 whitespace-normal text-[11px] font-normal leading-snug text-pencil">{BLURB[p]}</div></th>)}</tr></thead>
          <tbody>
            {tiers.map((t: number, ti: number) => (
              <tr key={t} className="border-t">
                <td className="td font-medium">حتى {t}</td>
                {PLANS.map((p, pi) => {
                  const m = prices[ti][pi];
                  const current = !s.needsPlan && s.plan === p && s.tier === t;
                  const tooSmall = s.activeStudents > t;
                  return (
                    <td key={p} className="td">
                      {m == null ? <span className="text-pencil">حسب الطلب</span> : (
                        <button disabled={!owner || current || tooSmall || change.isPending} title={tooSmall ? 'عدد طلابك النشطين أكبر من الشريحة' : undefined}
                          className={`w-full rounded-lg border px-3 py-2 ${current ? 'border-brand bg-brand-light font-bold' : 'hover:border-brand'} disabled:opacity-40`}
                          onClick={() => setPick({ plan: p, tier: t, price: cycle === 'yearly' ? m * 10 : m })}>
                          {money(cycle === 'yearly' ? m * 10 : m)}{current && ' ✓'}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t"><td className="td font-medium">أكثر من 1,000</td><td className="td text-pencil" colSpan={5}>حسب الطلب — تواصل معنا</td></tr>
          </tbody>
        </table>
      </div>
      {pick && (
        <Modal title={pending ? 'تأكيد الاشتراك' : 'تأكيد تغيير الباقة'} onClose={() => !change.isPending && setPick(null)}>
          <dl className={`grid ${pending ? '' : 'grid-cols-2'} gap-px overflow-hidden rounded-lg border border-rule bg-rule text-sm`}>
            {!pending && <div className="bg-surface p-4">
              <dt className="text-xs text-pencil">الباقة الحالية</dt>
              <dd className="mt-1 font-medium">{PLAN_AR[s.plan]}</dd>
              <dd className="mt-1 text-pencil">حتى <span className="num">{s.tier}</span> طالب</dd>
              {s.price != null && <dd className="mt-2 text-lg font-light"><span className="num">{money(s.price)}</span> <span className="text-xs text-pencil">/ {s.billingCycle === 'yearly' ? 'سنة' : 'شهر'}</span></dd>}
            </div>}
            <div className="bg-marker/30 p-4">
              <dt className="text-xs text-pencil">{pending ? 'الباقة' : 'الباقة الجديدة'}</dt>
              <dd className="mt-1 font-medium text-brand">{PLAN_AR[pick.plan]}</dd>
              <dd className="mt-1 text-pencil">حتى <span className="num">{pick.tier}</span> طالب</dd>
              <dd className="mt-2 text-lg font-light"><span className="hl num">{money(pick.price)}</span> <span className="text-xs text-pencil">/ {cycle === 'yearly' ? 'سنة' : 'شهر'}</span></dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-pencil">التغيير يتطبق فورًا، وفترة الاشتراك تبدأ من النهارده لمدة {cycle === 'yearly' ? 'سنة' : 'شهر'}. بيانات المدرسة كلها محفوظة.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setPick(null)} disabled={change.isPending}>إلغاء</button>
            <button className="btn-primary" autoFocus disabled={change.isPending} onClick={() => change.mutate({ plan: pick.plan, tier: pick.tier })}>
              {change.isPending ? 'جارٍ التحويل…' : 'تأكيد التحويل'}
            </button>
          </div>
        </Modal>
      )}
      {canTrial && trialOpen && (
        <Modal title="ابدأ تجربتك المجانية" onClose={() => !trial.isPending && setTrialOpen(false)}>
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-light text-brand"><Gift size={22} /></span>
            <div className="text-sm leading-relaxed">
              <p className="text-base font-semibold">جرّب النظام كله {days} أيام مجاناً</p>
              <p className="mt-1 text-pencil">هتشتغل على باقة الأكاديمي كاملة لحد 100 طالب، من غير ما تدفع حاجة. بعد التجربة تختار الباقة اللي تناسبك، وكل البيانات اللي دخلتها بتفضل محفوظة.</p>
            </div>
          </div>
          <ul className="mt-4 grid gap-2 rounded-xl bg-paper p-4 text-sm sm:grid-cols-2">
            {['الطلاب والفصول والحضور', 'الامتحانات والدرجات', 'الرسوم والمحاسبة والرواتب', 'جدول الحصص وبوابة المعلمين'].map((x) => <li key={x}>✓ {x}</li>)}
          </ul>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setTrialOpen(false)} disabled={trial.isPending}>لا، هختار باقة</button>
            <button className="btn-primary" autoFocus disabled={trial.isPending} onClick={() => trial.mutate()}>
              {trial.isPending ? 'جارٍ التفعيل…' : `فعّل ${days} أيام مجاناً`}
            </button>
          </div>
        </Modal>
      )}
      {!owner && !s.needsPlan && <p className="mt-3 text-sm text-pencil">تغيير الاشتراك متاح للمالك فقط.</p>}
      <p className="mt-3 text-xs text-pencil">خدمات خارجية مثل واتساب وبوابات الدفع قد يكون لها تكلفة استخدام منفصلة. الدفع الإلكتروني للاشتراك يُربط مع مزوّد الدفع قبل الإطلاق.</p>
    </div>
  );
}
