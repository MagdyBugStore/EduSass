import ResourcePage from '../components/ResourcePage';
import { dateAr } from '../lib/format';

export default function Announcements() {
  return (
    <ResourcePage title="الإعلانات" sub="يصل الإعلان لأولياء الأمور في تطبيق الموبايل" url="/announcements" noun="إعلان" lockedLabel="الإشعارات" fields={[
      { key: 'title', label: 'العنوان', required: true, list: true },
      { key: 'classId', label: 'الفصل (اتركه فارغًا لكل المدرسة)', optionsFrom: { url: '/classes', label: (c) => `${c.name} ${c.section || ''}` }, list: false },
      { key: 'createdAt', label: 'التاريخ', noEdit: true, createOnly: true, list: (r) => dateAr(r.createdAt) },
      { key: 'body', label: 'النص', type: 'textarea' },
    ]} />
  );
}
