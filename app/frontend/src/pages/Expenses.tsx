import ResourcePage from '../components/ResourcePage';
import { dateAr, money } from '../lib/format';

export default function Expenses() {
  return (
    <ResourcePage title="المصروفات" sub="مصروفات المدرسة التشغيلية" url="/expenses" noun="مصروف" lockedLabel="المصروفات" fields={[
      { key: 'category', label: 'التصنيف', required: true, list: true },
      { key: 'amount', label: 'المبلغ', type: 'number', required: true, list: (r) => money(r.amount) },
      { key: 'date', label: 'التاريخ', type: 'date', list: (r) => dateAr(r.date) },
      { key: 'vendor', label: 'المورد', list: true },
      { key: 'description', label: 'الوصف', type: 'textarea' },
    ]} />
  );
}
