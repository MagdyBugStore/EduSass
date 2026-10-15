import ResourcePage from '../components/ResourcePage';

export default function Classes() {
  return (
    <div className="space-y-8">
      <ResourcePage title="الفصول والشعب" url="/classes" noun="فصل" fields={[
        { key: 'stage', label: 'المرحلة', required: true, list: true },
        { key: 'name', label: 'الصف', required: true, list: true },
        { key: 'section', label: 'الشعبة', list: true },
        { key: 'year', label: 'العام الدراسي', list: true },
        { key: 'capacity', label: 'السعة', type: 'number', list: true },
      ]} />
      <ResourcePage title="المواد الدراسية" url="/subjects" noun="مادة" fields={[{ key: 'name', label: 'اسم المادة', required: true, list: true }]} />
    </div>
  );
}
