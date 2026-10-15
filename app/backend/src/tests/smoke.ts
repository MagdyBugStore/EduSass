// End-to-end smoke test against a running API (default http://localhost:4000). Requires `npm run seed` first.
const BASE = process.env.API || 'http://localhost:4000/api';
let fails = 0;

async function call(method: string, path: string, body?: any, token?: string) {
  const r = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data: data as any };
}
const check = (name: string, ok: boolean, extra?: any) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { fails++; if (extra !== undefined) console.log('   ', JSON.stringify(extra).slice(0, 300)); }
};

async function main() {
  const login = async (l: string, p = 'Demo12345') => (await call('POST', '/auth/login', { login: l, password: p })).data.token as string;
  const owner = await login('owner@demo.edu');
  const teacher = await login('teacher@demo.edu');
  const acc = await login('accountant@demo.edu');
  const parent = await login('01000000000');
  check('owner login', !!owner); check('parent login', !!parent);
  check('bad password rejected', (await call('POST', '/auth/login', { login: 'owner@demo.edu', password: 'x' })).status === 401);

  const stu = await call('GET', '/students?limit=50', undefined, owner);
  check('list students', stu.data.items?.length >= 5, stu.data);
  const s0 = stu.data.items.find((s: any) => s.name === 'أحمد علي');

  // RBAC
  check('teacher cannot create invoice', (await call('POST', '/invoices', {}, teacher)).status === 403);
  check('parent blocked from staff API', (await call('GET', '/students', undefined, parent)).status === 403);
  check('staff blocked from parent API', (await call('GET', '/parent/children', undefined, owner)).status === 403);

  // Invoice + payment + over-payment guard
  const inv = await call('POST', '/invoices', { studentId: s0._id, items: [{ title: 'مصروفات دراسية', kind: 'tuition', amount: 1000 }], discount: 100 }, acc);
  check('create invoice (total 900)', inv.status === 201 && inv.data.total === 900, inv.data);
  const p1 = await call('POST', '/payments', { invoiceId: inv.data._id, amount: 400 }, acc);
  check('partial payment', p1.status === 201 && p1.data.invoice.status === 'partial', p1.data);
  check('overpayment rejected', (await call('POST', '/payments', { invoiceId: inv.data._id, amount: 600 }, acc)).status === 400);
  const p2 = await call('POST', '/payments', { invoiceId: inv.data._id, amount: 500 }, acc);
  check('full payment -> paid', p2.data.invoice?.status === 'paid', p2.data);

  // Accounting auto-posting (Business)
  const tb = await call('GET', '/accounting/trial-balance', undefined, acc);
  check('trial balance balanced', tb.data.totalDebit === tb.data.totalCredit && tb.data.totalDebit > 0, tb.data);

  // Attendance + notification to parent
  const cls = s0.classId?._id;
  const att = await call('POST', '/attendance/sheet', { classId: cls, date: new Date().toISOString().slice(0, 10), records: [{ studentId: s0._id, status: 'absent' }] }, teacher);
  check('mark attendance', att.status === 200, att.data);
  const notes = await call('GET', '/parent/notifications', undefined, parent);
  check('parent got absence notification', notes.data.some?.((n: any) => n.type === 'absence'), notes.data);

  // Parent portal scoping
  const kids = await call('GET', '/parent/children', undefined, parent);
  check('parent sees only own child', kids.data.length === 1 && kids.data[0].name === 'أحمد علي', kids.data);
  const other = stu.data.items.find((s: any) => s.name !== 'أحمد علي');
  check('parent cannot read other child', (await call('GET', `/parent/children/${other._id}/overview`, undefined, parent)).status === 403);
  const pinv = await call('GET', `/parent/children/${s0._id}/invoices`, undefined, parent);
  check('parent sees invoices', pinv.data.invoices?.length >= 1, pinv.data);

  // Plan gating: new Core school cannot use exams / accounting
  const email = `core${Date.now()}@t.edu`;
  const reg = await call('POST', '/auth/register-school', { schoolName: 'مدرسة اختبار', name: 'مالك', email, password: 'Passw0rd!x' });
  check('register school', reg.status === 201, reg.data);
  const core = reg.data.token;
  check('Core blocked from exams (402)', (await call('GET', '/exams', undefined, core)).status === 402);
  check('Core blocked from accounting (402)', (await call('GET', '/accounting/accounts', undefined, core)).status === 402);
  check('Core blocked from parent portal config (402)', (await call('POST', '/employees', {}, core)).status === 402);

  // Tier limit: Core tier 100 -> fill to 100 then 101st rejected
  const cc = await call('POST', '/students', { name: 'طالب 1' }, core);
  check('Core create student', cc.status === 201, cc.data);
  // Tenant isolation
  check('tenant isolation (other school cannot read student)', (await call('GET', `/students/${s0._id}`, undefined, core)).status === 404);
  const sub = await call('POST', '/school/subscription', { plan: 'mgmt', tier: 250, billingCycle: 'monthly' }, core);
  check('upgrade to Management 250 = 1199', sub.data.price === 1199, sub.data);
  check('Management unlocks exams', (await call('GET', '/exams', undefined, core)).status === 200);

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
