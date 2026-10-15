import { useQuery } from '@tanstack/react-query';
import { NotebookPen } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import StudentNotes from '../components/StudentNotes';
import { Empty, Locked, Modal, PageHeader, Spinner, Table } from '../components/ui';
import { api } from '../lib/api';

const pct = (v: number | null) => (v == null ? <span className="text-pencil">—</span> : <span className={`num ${v < 75 ? 'text-amber-700' : ''}`}>{v}%</span>);

/** A teacher's classes with quick stats; open one to see its students and write notes. */
export default function MyClasses() {
  const [open, setOpen] = useState<string>('');
  const [note, setNote] = useState<any>(null);
  const classes = useQuery({ queryKey: ['my-classes'], queryFn: async () => (await api.get('/teacher/classes')).data, retry: false });
  const students = useQuery({
    queryKey: ['class-students', open], enabled: !!open,
    queryFn: async () => (await api.get('/students', { params: { classId: open, status: 'active', limit: 200 } })).data.items,
  });

  if ((classes.error as any)?.response?.status === 402) return <Locked what="بوابة المعلمين" />;
  if (classes.isLoading) return <Spinner />;
  const current = classes.data?.find((c: any) => c._id === open);

  return (
    <div>
      <PageHeader title="فصولي" sub="نسبة الحضور لآخر 30 يوم، ومتوسط الدرجات في موادك" />
      {!classes.data?.length ? <Empty text="مفيش فصول متسجلة ليك لسه. الإدارة بتربطك بالفصول من جدول الحصص أو صفحة الفصول." /> : (
        <div className="card p-0">
          <Table head={['الفصل', 'الطلاب', 'نسبة الحضور', 'متوسط الدرجات', '']}>
            {classes.data.map((c: any) => (
              <tr key={c._id} className={open === c._id ? 'bg-marker/25' : ''}>
                <td className="td font-medium">{c.name}<span className="block text-xs font-normal text-pencil">{c.stage}</span></td>
                <td className="td num">{c.students}</td>
                <td className="td">{pct(c.attendanceRate)}</td>
                <td className="td">{pct(c.averageScore)}</td>
                <td className="td text-left">
                  <button className="btn-ghost px-3 py-1.5" aria-expanded={open === c._id} onClick={() => setOpen(open === c._id ? '' : c._id)}>
                    {open === c._id ? 'اقفل' : 'الطلاب'}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {open && (
        <section className="card mt-6 p-0" aria-labelledby="h-students">
          <h2 id="h-students" className="sheet-title px-5 pt-5">طلاب {current?.name}</h2>
          {students.isLoading ? <Spinner /> : !students.data?.length ? <Empty text="مفيش طلاب نشطين في الفصل ده." /> : (
            <Table head={['الطالب', 'الكود', '']}>
              {students.data.map((s: any) => (
                <tr key={s._id}>
                  <td className="td"><Link to={`/students/${s._id}`} className="font-medium text-brand hover:underline">{s.name}</Link></td>
                  <td className="td num text-pencil">{s.code}</td>
                  <td className="td text-left"><button className="btn-ghost px-3 py-1.5" onClick={() => setNote(s)}><NotebookPen size={15} />ملاحظة</button></td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      )}

      {note && <Modal title={`ملاحظة على ${note.name}`} onClose={() => setNote(null)} wide><StudentNotes studentId={note._id} /></Modal>}
    </div>
  );
}
