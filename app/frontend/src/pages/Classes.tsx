import ResourcePage from '../components/ResourcePage';
import { className } from '../lib/format';
import { useAuth } from '../store/auth';

const names = (xs: any[] | undefined) => (xs?.length ? xs.map((x) => ('section' in x ? className(x) : x.name)).join('، ') : '—');

export default function Classes() {
  const { me } = useAuth();
  const mgr = me!.role === 'owner' || me!.role === 'admin';
  const teachers = { url: '/users?role=teacher', label: (u: any) => u.name };
  return (
    <div className="space-y-8">
      <ResourcePage title="الفصول والشعب" url="/classes" noun="فصل" fields={[
        { key: 'stage', label: 'المرحلة', required: true, list: true },
        { key: 'name', label: 'الصف', required: true, list: true },
        { key: 'section', label: 'الشعبة', list: true },
        { key: 'year', label: 'العام الدراسي', list: true },
        { key: 'capacity', label: 'السعة', type: 'number', list: true },
        ...(mgr ? [{ key: 'teacherIds', label: 'معلمو الفصل', type: 'multi' as const, optionsFrom: teachers, list: (r: any) => names(r.teacherIds) }] : []),
      ]} canWrite={mgr} />
      <ResourcePage title="المواد الدراسية" url="/subjects" noun="مادة" canWrite={mgr} fields={[
        { key: 'name', label: 'اسم المادة', required: true, list: true },
        { key: 'classIds', label: 'الفصول اللي بتدرس المادة', type: 'multi', optionsFrom: { url: '/classes', label: className }, list: (r) => names(r.classIds) },
        ...(mgr ? [{ key: 'teacherIds', label: 'معلمو المادة', type: 'multi' as const, optionsFrom: teachers, list: (r: any) => names(r.teacherIds) }] : []),
      ]} />
    </div>
  );
}
