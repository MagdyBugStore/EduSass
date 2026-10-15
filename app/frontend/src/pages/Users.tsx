import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import toast from 'react-hot-toast';
import { Badge, Field, Modal, PageHeader, Spinner, Table } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { ROLE_AR } from '../lib/format';

const ROLES = ['admin', 'teacher', 'accountant', 'hr', 'receptionist'];

export default function UsersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', role: 'teacher' });
  const list = useQuery({ queryKey: ['users'], queryFn: async () => (await api.get('/users')).data });
  const create = useMutation({
    mutationFn: async () => api.post('/users', { ...f, email: f.email || undefined, phone: f.phone || undefined }),
    onSuccess: () => { toast.success('تم إنشاء المستخدم'); setOpen(false); setF({ name: '', email: '', phone: '', password: '', role: 'teacher' }); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: toastErr,
  });
  const toggle = useMutation({
    mutationFn: async (u: any) => api.put(`/users/${u._id}`, { active: !u.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }), onError: toastErr,
  });
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };

  return (
    <div>
      <PageHeader title="المستخدمون والصلاحيات" sub="حسابات الموظفين غير محدودة في كل الباقات" actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} />مستخدم جديد</button>} />
      <div className="card p-0">
        {list.isLoading ? <Spinner /> : (
          <Table head={['الاسم', 'الدخول', 'الدور', 'الحالة', '']}>
            {list.data.map((u: any) => (
              <tr key={u._id}><td className="td">{u.name}</td><td className="td num">{u.email || u.phone}</td><td className="td">{ROLE_AR[u.role]}</td>
                <td className="td"><Badge status={u.active ? 'active' : 'inactive'} /></td>
                <td className="td">{u.role !== 'owner' && <button className="btn-ghost py-1" onClick={() => toggle.mutate(u)}>{u.active ? 'تعطيل' : 'تفعيل'}</button>}</td></tr>
            ))}
          </Table>
        )}
      </div>
      <div className="card mt-4 text-sm text-pencil">
        <b>الأدوار:</b> المالك/المدير: كل شيء • المعلم: الطلاب والحضور والامتحانات • المحاسب: الرسوم والمصروفات والمحاسبة • الموارد البشرية: الموظفون والإجازات والرواتب • الاستقبال: الطلاب والمستندات والإعلانات.
      </div>
      {open && (
        <Modal title="مستخدم جديد" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Field label="الاسم"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="الدور"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_AR[r]}</option>)}</select></Field>
            <Field label="البريد"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="الهاتف"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="كلمة المرور (8 أحرف+)"><input className="input" type="password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field></div>
            <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>إلغاء</button><button className="btn-primary" disabled={create.isPending}>إنشاء</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
