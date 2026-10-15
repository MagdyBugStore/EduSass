import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import ResourcePage from '../components/ResourcePage';
import { Empty, Locked, Modal, Spinner } from '../components/ui';
import { api, toastErr } from '../lib/api';
import { dateAr } from '../lib/format';

const cls = (c: any) => (c ? `${c.name} ${c.section || ''}` : '—');

function Marks({ exam, onClose }: { exam: any; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['marks', exam._id], queryFn: async () => (await api.get(`/exams/marks/${exam._id}`)).data });
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { if (q.data) setRows(q.data.rows); }, [q.data]);
  const save = useMutation({
    mutationFn: async () => api.post(`/exams/marks/${exam._id}`, { rows: rows.filter((r) => r.score !== null && r.score !== '').map((r) => ({ studentId: r._id, score: Number(r.score), notes: r.notes || undefined })) }),
    onSuccess: () => { toast.success('تم حفظ الدرجات'); qc.invalidateQueries({ queryKey: ['marks', exam._id] }); onClose(); }, onError: toastErr,
  });
  return (
    <Modal wide title={`درجات: ${exam.name} (من ${exam.maxScore})`} onClose={onClose}>
      {q.isLoading ? <Spinner /> : !rows.length ? <Empty text="لا يوجد طلاب" /> : (
        <>
          <div className="max-h-96 divide-y overflow-y-auto">
            {rows.map((r, i) => (
              <div key={r._id} className="flex items-center gap-3 py-2">
                <span className="flex-1 text-sm">{r.name}</span>
                <input type="number" min={0} max={exam.maxScore} className="input w-24" value={r.score ?? ''} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, score: e.target.value === '' ? null : e.target.value } : x)))} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>حفظ الدرجات</button></div>
        </>
      )}
    </Modal>
  );
}

export default function Exams() {
  const [exam, setExam] = useState<any>(null);
  const probe = useQuery({ queryKey: ['exams-probe'], queryFn: async () => (await api.get('/exams', { params: { limit: 1 } })).data, retry: false });
  if ((probe.error as any)?.response?.status === 402) return <Locked what="الامتحانات والدرجات" />;
  return (
    <>
      <ResourcePage title="الامتحانات والدرجات" url="/exams" noun="امتحان" fields={[
        { key: 'name', label: 'اسم الامتحان', required: true, list: true },
        { key: 'classId', label: 'الفصل', required: true, optionsFrom: { url: '/classes', label: cls }, list: (r) => cls(r.classId) },
        { key: 'subjectId', label: 'المادة', required: true, optionsFrom: { url: '/subjects', label: (s) => s.name }, list: (r) => r.subjectId?.name || '—' },
        { key: 'term', label: 'الفصل الدراسي', list: true },
        { key: 'date', label: 'التاريخ', type: 'date', list: (r) => dateAr(r.date) },
        { key: 'maxScore', label: 'الدرجة العظمى', type: 'number', list: true },
      ]} rowActions={(r) => <button className="rounded p-1.5 hover:bg-slate-200" title="رصد الدرجات" onClick={() => setExam(r)}><ClipboardList size={15} /></button>} />
      {exam && <Marks exam={exam} onClose={() => setExam(null)} />}
    </>
  );
}
