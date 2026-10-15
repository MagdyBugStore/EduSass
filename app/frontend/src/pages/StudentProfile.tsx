import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useParams } from 'react-router-dom';
import { Badge, Empty, Modal, PageHeader, Spinner, Stat, StatStrip, Table } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { dateAr, money } from '../lib/format';
import StudentNotes from '../components/StudentNotes';
import { useAuth } from '../store/auth';

export default function StudentProfile() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { has } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cred, setCred] = useState<{ phone: string; password?: string } | null>(null);

  const q = useQuery({ queryKey: ['profile', id], queryFn: async () => (await api.get(`/students/${id}/profile`)).data });
  const docs = useQuery({ queryKey: ['docs', id], enabled: has('documents'), queryFn: async () => (await api.get(`/students/${id}/documents`)).data });

  const parentAcc = useMutation({
    mutationFn: async () => (await api.post(`/students/${id}/parent-account`, {})).data,
    onSuccess: (d) => { setCred(d); qc.invalidateQueries({ queryKey: ['profile', id] }); },
    onError: toastErr,
  });
  const upload = useMutation({
    mutationFn: async (f: File) => { const fd = new FormData(); fd.append('file', f); fd.append('title', f.name); return api.post(`/students/${id}/documents`, fd); },
    onSuccess: () => { toast.success('تم الرفع'); qc.invalidateQueries({ queryKey: ['docs', id] }); }, onError: toastErr,
  });
  const rmDoc = useMutation({
    mutationFn: async (d: string) => api.delete(`/students/documents/${d}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docs', id] }), onError: toastErr,
  });
  const download = async (d: any) => {
    const r = await api.get(`/students/documents/${d._id}/file`, { responseType: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(r.data); a.download = d.title; a.click();
  };

  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Empty text="الطالب غير موجود" />;
  const { student: s, attendance: a, invoices, marks, parents } = q.data;
  const due = invoices.filter((i: any) => i.status !== 'cancelled').reduce((t: number, i: any) => t + i.total - i.paid, 0);

  return (
    <div>
      <PageHeader title={s.name} sub={`${s.code} • ${s.classId ? `${s.classId.name} ${s.classId.section || ''}` : 'بدون فصل'}`}
        actions={<><Badge status={s.status} />{has('parentPortal') && <button className="btn-primary" onClick={() => parentAcc.mutate()}>حساب ولي الأمر</button>}<Link to="/students" className="btn-ghost">رجوع</Link></>} />
      <StatStrip>
        <Stat label="حضور" value={a.present || 0} /><Stat label="غياب" value={a.absent || 0} tone="text-red-600" />
        <Stat label="تأخير" value={a.late || 0} tone="text-amber-700" /><Stat label="المستحق" value={money(due)} />
      </StatStrip>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-2 text-sm font-bold">ولي الأمر</h3>
          <dl className="space-y-1 text-sm">
            <div>الاسم: {s.guardian?.name || '—'} ({s.guardian?.relation || '—'})</div>
            <div>الهاتف: <span className="num">{s.guardian?.phone || '—'}</span></div>
            <div>حسابات التطبيق: {parents.length ? parents.map((p: any) => p.phone).join('، ') : 'لا يوجد'}</div>
          </dl>
        </div>
        <div className="card">
          <h3 className="mb-2 text-sm font-bold">الدرجات</h3>
          {!marks.length ? <Empty text="لا توجد درجات" /> : marks.map((m: any) => (
            <div key={m._id} className="flex justify-between border-b py-1 text-sm"><span>{m.examId?.subjectId?.name} — {m.examId?.name}</span><span className="num">{m.score}/{m.examId?.maxScore}</span></div>
          ))}
        </div>
      </div>

      <div className="card mt-4 p-0">
        <h3 className="p-4 pb-2 text-sm font-bold">الفواتير</h3>
        {!invoices.length ? <Empty text="لا توجد فواتير" /> : (
          <Table head={['الرقم', 'التاريخ', 'الإجمالي', 'المدفوع', 'الحالة']}>
            {invoices.map((i: any) => <tr key={i._id}><td className="td num">{i.number}</td><td className="td">{dateAr(i.createdAt)}</td><td className="td">{money(i.total)}</td><td className="td">{money(i.paid)}</td><td className="td"><Badge status={i.status} /></td></tr>)}
          </Table>
        )}
      </div>

      {has('documents') && (
        <div className="card mt-4">
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold">المستندات</h3>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}><Upload size={16} />رفع ملف</button>
            <input ref={fileRef} type="file" hidden accept=".pdf,image/*" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
          </div>
          {!docs.data?.length ? <Empty text="لا توجد مستندات" /> : docs.data.map((d: any) => (
            <div key={d._id} className="flex items-center justify-between border-b py-2 text-sm"><span>{d.title}</span>
              <span><button className="rounded p-1.5 hover:bg-slate-100" onClick={() => download(d)} aria-label="تنزيل"><Download size={15} /></button>
                <button className="rounded p-1.5 text-red-600 hover:bg-red-50" onClick={() => confirm('حذف المستند؟') && rmDoc.mutate(d._id)} aria-label="حذف"><Trash2 size={15} /></button></span></div>
          ))}
        </div>
      )}

      {has('teacherPortal') && (
        <div className="card mt-4">
          <h3 className="sheet-title">ملاحظات المعلمين</h3>
          <StudentNotes studentId={s._id} />
        </div>
      )}

      {cred && (
        <Modal title="بيانات دخول ولي الأمر" onClose={() => setCred(null)}>
          <p className="text-sm">رقم الدخول: <b className="num">{cred.phone}</b></p>
          {cred.password ? <p className="mt-2 text-sm">كلمة المرور المؤقتة: <b className="num">{cred.password}</b><br /><span className="text-xs text-red-600">تظهر مرة واحدة فقط — سلّمها لولي الأمر.</span></p>
            : <p className="mt-2 text-sm">الحساب موجود وتم ربط الطالب به.</p>}
        </Modal>
      )}
    </div>
  );
}
