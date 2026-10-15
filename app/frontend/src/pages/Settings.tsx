import { useMutation, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Field, PageHeader, Spinner } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { useAuth } from '../store/auth';

export default function SettingsPage() {
  const { load } = useAuth();
  const q = useQuery({ queryKey: ['school'], queryFn: async () => (await api.get('/school')).data });
  const [f, setF] = useState<any>({});
  const [pw, setPw] = useState({ current: '', password: '' });
  useEffect(() => { if (q.data) setF({ name: q.data.name, phone: q.data.phone || '', email: q.data.email || '', address: q.data.address || '', currentYear: q.data.currentYear }); }, [q.data]);

  const save = useMutation({ mutationFn: async () => api.put('/school', f), onSuccess: () => { toast.success('تم الحفظ'); load(); }, onError: toastErr });
  const chPw = useMutation({ mutationFn: async () => api.post('/auth/change-password', pw), onSuccess: () => { toast.success('تم تغيير كلمة المرور'); setPw({ current: '', password: '' }); }, onError: toastErr });
  const backup = async () => {
    try {
      const r = await api.get('/export/backup', { responseType: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(r.data); a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    } catch (e) { toastErr(e); }
  };
  if (q.isLoading) return <Spinner />;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <PageHeader title="الإعدادات" />
      <form className="card grid max-w-2xl gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="اسم المدرسة"><input className="input" value={f.name || ''} onChange={set('name')} required /></Field>
        <Field label="العام الدراسي الحالي"><input className="input" value={f.currentYear || ''} onChange={set('currentYear')} /></Field>
        <Field label="الهاتف"><input className="input" value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label="البريد"><input className="input" value={f.email || ''} onChange={set('email')} /></Field>
        <div className="sm:col-span-2"><Field label="العنوان"><input className="input" value={f.address || ''} onChange={set('address')} /></Field></div>
        <div className="sm:col-span-2"><button className="btn-primary" disabled={save.isPending}>حفظ</button></div>
      </form>
      <form className="card grid max-w-2xl gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); chPw.mutate(); }}>
        <h3 className="font-bold sm:col-span-2">تغيير كلمة المرور</h3>
        <Field label="الحالية"><input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
        <Field label="الجديدة (8+)"><input className="input" type="password" minLength={8} value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} required /></Field>
        <div className="sm:col-span-2"><button className="btn-primary" disabled={chPw.isPending}>تغيير</button></div>
      </form>
      <div className="card max-w-2xl">
        <h3 className="mb-1 font-bold">نسخة احتياطية</h3>
        <p className="mb-3 text-sm text-slate-500">حمّل بيانات مدرستك الكاملة بصيغة JSON في أي وقت.</p>
        <button className="btn-ghost" onClick={backup}><Download size={16} />تنزيل النسخة</button>
      </div>
    </div>
  );
}
