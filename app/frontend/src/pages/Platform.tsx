import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, PageHeader, Spinner, Table } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { dateAr, money, PLAN_AR } from '../lib/format';

/** Platform super-admin: all tenant schools. */
export default function Platform() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['sa-schools'], queryFn: async () => (await api.get('/superadmin/schools')).data });
  const upd = useMutation({
    mutationFn: async ({ id, ...b }: any) => api.put(`/superadmin/schools/${id}`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sa-schools'] }), onError: toastErr,
  });
  if (q.isLoading) return <Spinner />;
  const mrr = q.data.filter((s: any) => s.status === 'active' && s.billingCycle === 'monthly').reduce((t: number, s: any) => t + (s.price || 0), 0);
  return (
    <div>
      <PageHeader title="المدارس على المنصة" sub={`${q.data.length} مدرسة • إيراد شهري تقريبي ${money(mrr)}`} />
      <div className="card p-0">
        <Table head={['المدرسة', 'الباقة', 'الشريحة', 'طلاب نشطون', 'الحالة', 'ينتهي', '']}>
          {q.data.map((s: any) => (
            <tr key={s._id}><td className="td font-medium">{s.name}</td><td className="td">{PLAN_AR[s.plan]}</td><td className="td">{s.maxStudents}</td><td className="td">{s.activeStudents}</td>
              <td className="td"><Badge status={s.status} /></td><td className="td">{dateAr(s.subscriptionEnds)}</td>
              <td className="td"><button className="btn-ghost py-1" onClick={() => upd.mutate({ id: s._id, status: s.status === 'suspended' ? 'active' : 'suspended' })}>{s.status === 'suspended' ? 'تفعيل' : 'إيقاف'}</button></td></tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
