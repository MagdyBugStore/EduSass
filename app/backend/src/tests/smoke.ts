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

  // Money tests run in a throwaway school of their own, so the demo school's fees stay clean.
  const fin = await call('POST', '/auth/register-school', { schoolName: 'مدرسة اختبار الحسابات', name: 'مالك الاختبار', email: `fin${Date.now()}@t.edu`, password: 'Passw0rd!x' });
  const finOwner = fin.data.token;
  await call('POST', '/school/subscription', { plan: 'biz', tier: 100, billingCycle: 'monthly' }, finOwner);
  const finStu = (await call('POST', '/students', { name: 'طالب الحسابات' }, finOwner)).data;

  // Invoice + payment + over-payment guard
  const inv = await call('POST', '/invoices', { studentId: finStu._id, items: [{ title: 'مصروفات دراسية', kind: 'tuition', amount: 1000 }], discount: 100 }, finOwner);
  check('create invoice (total 900)', inv.status === 201 && inv.data.total === 900, inv.data);
  const p1 = await call('POST', '/payments', { invoiceId: inv.data._id, amount: 400 }, finOwner);
  check('partial payment', p1.status === 201 && p1.data.invoice.status === 'partial', p1.data);
  check('overpayment rejected', (await call('POST', '/payments', { invoiceId: inv.data._id, amount: 600 }, finOwner)).status === 400);
  const p2 = await call('POST', '/payments', { invoiceId: inv.data._id, amount: 500 }, finOwner);
  check('full payment -> paid', p2.data.invoice?.status === 'paid', p2.data);

  // Fees dashboard
  const fo = await call('GET', `/invoices/overview?date=${new Date().toISOString().slice(0, 10)}`, undefined, finOwner);
  check('fees overview', fo.status === 200 && fo.data.totals.paid === 900 && fo.data.months.length === 12 && fo.data.recent.length === 2, fo.data.totals);
  check('accountant opens demo fees overview', (await call('GET', '/invoices/overview', undefined, acc)).status === 200);
  check('teacher cannot open fees overview (403)', (await call('GET', '/invoices/overview', undefined, teacher)).status === 403);

  // Accounting auto-posting (Business)
  const tb = await call('GET', '/accounting/trial-balance', undefined, finOwner);
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

  // ---- Academic: teacher scoping, timetable, teacher portal ----
  const teacher2 = await login('teacher2@demo.edu');
  const day = new Date().toISOString().slice(0, 10);
  const fresh = await call('POST', '/classes', { stage: 'ابتدائي', name: `فصل اختبار ${Date.now()}`, section: 'ب' }, owner);
  check('owner creates class', fresh.status === 201, fresh.data);
  check('teacher cannot open a class that is not theirs (403)',
    (await call('GET', `/attendance/sheet?classId=${fresh.data._id}&date=${day}`, undefined, teacher)).status === 403);
  const tcls = await call('GET', '/classes?limit=200', undefined, teacher);
  check('teacher class list excludes unassigned class', tcls.data.items?.every((c: any) => c._id !== fresh.data._id), tcls.data);
  const tst = await call('GET', '/students?limit=200', undefined, teacher);
  check('teacher sees students of own classes', tst.data.items?.length >= 5, tst.data);

  const arabic = (await call('POST', '/subjects', { name: 'مادة اختبار', classIds: [fresh.data._id] }, owner)).data;
  const me = await call('GET', '/auth/me', undefined, teacher);
  const myId = me.data.id || me.data._id;
  const grid = await call('GET', `/timetable?teacherId=${myId}`, undefined, owner);
  check('timetable for teacher', Array.isArray(grid.data) && grid.data.length > 0, grid.data);
  const busy = grid.data[0];
  const clash = await call('PUT', '/timetable/slot', { day: busy.day, period: busy.period, classId: fresh.data._id, subjectId: arabic._id, teacherId: myId }, owner);
  check('double-booking a teacher rejected (409)', clash.status === 409, clash.data);
  check('teacher cannot read another teacher timetable (403)', (await call('GET', `/timetable?teacherId=${myId}`, undefined, teacher2)).status === 403);

  const dayView = await call('GET', `/teacher/day?date=${day}`, undefined, teacher);
  check('teacher day view', dayView.status === 200 && Array.isArray(dayView.data.lessons), dayView.data);
  const note = await call('POST', '/teacher/notes', { studentId: s0._id, kind: 'behavior', body: 'متعاون جدًا في الحصة', sendToParent: true }, teacher);
  check('teacher writes note', note.status === 201, note.data);
  const pn = await call('GET', '/parent/notifications', undefined, parent);
  check('parent got teacher note', pn.data.some?.((n: any) => n.type === 'note'), pn.data);
  check('teacher deletes own note', (await call('DELETE', `/teacher/notes/${note.data._id}`, undefined, teacher)).status === 200);
  const comp = await call('GET', `/teacher/compliance?from=${day}&to=${day}`, undefined, owner);
  check('compliance report', Array.isArray(comp.data) && comp.data.length >= 2, comp.data);
  check('teacher cannot read compliance (403)', (await call('GET', `/teacher/compliance?from=${day}&to=${day}`, undefined, teacher)).status === 403);
  await call('DELETE', `/classes/${fresh.data._id}`, undefined, owner);
  await call('DELETE', `/subjects/${arabic._id}`, undefined, owner);

  // ---- Profiles, photos, classes overview ----
  const tlist = await call('GET', '/teachers', undefined, owner);
  check('teachers directory', tlist.data.items?.length >= 2 && 'lessons' in tlist.data.items[0], tlist.data);
  const t2 = (await call('GET', '/auth/me', undefined, teacher2)).data;
  check('teacher reads own profile', (await call('GET', `/teachers/${myId}`, undefined, teacher)).status === 200);
  check('teacher cannot read another teacher profile (403)', (await call('GET', `/teachers/${myId}`, undefined, teacher2)).status === 403);
  check('teacher cannot list teachers (403)', (await call('GET', '/teachers', undefined, teacher)).status === 403);
  const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  check('teacher sets own photo', (await call('PUT', `/teachers/${t2.id}/photo`, { photo: tiny }, teacher2)).status === 200);
  check('non-image photo rejected (400)', (await call('PUT', `/students/${s0._id}/photo`, { photo: 'data:text/html;base64,PGI+' }, owner)).status === 400);
  check('student photo saved', (await call('PUT', `/students/${s0._id}/photo`, { photo: tiny }, owner)).status === 200);
  check('teacher cannot change student photo (403)', (await call('PUT', `/students/${s0._id}/photo`, { photo: null }, teacher)).status === 403);
  await call('PUT', `/students/${s0._id}/photo`, { photo: null }, owner);
  await call('PUT', `/teachers/${t2.id}/photo`, { photo: null }, teacher2);
  const ov = await call('GET', `/reports/classes-overview?date=${day}`, undefined, owner);
  check('classes overview', Array.isArray(ov.data.items) && ov.data.items.length >= 2 && 'rate' in ov.data.items[0].attendance, ov.data);

  // the timetable runs Sunday to Thursday, so look at the latest school day (today may be the weekend)
  const sd = new Date(); while ([5, 6].includes(sd.getDay())) sd.setDate(sd.getDate() - 1);
  const schoolDay = `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}-${String(sd.getDate()).padStart(2, '0')}`;
  const inboxT = await call('GET', `/inbox?date=${schoolDay}&now=23:59`, undefined, teacher);
  check('teacher inbox lists late attendance sheets', inboxT.data.some?.((i: any) => i.id.startsWith('att-')), inboxT.data);
  const inboxA = await call('GET', `/inbox?date=${day}&now=23:59`, undefined, acc);
  check('accountant inbox has no teacher alerts', Array.isArray(inboxA.data) && !inboxA.data.some((i: any) => i.id.startsWith('att-')), inboxA.data);

  const allSubs = (await call('GET', '/subjects?limit=50', undefined, owner)).data.items;
  const mine = (await call('GET', '/subjects?limit=50', undefined, teacher2)).data.items.map((x: any) => x._id);
  const notMine = allSubs.find((x: any) => !mine.includes(x._id));
  const det = await call('GET', `/subjects/${mine[0]}/details`, undefined, owner);
  check('subject details', det.status === 200 && Array.isArray(det.data.classes) && Array.isArray(det.data.timetable.slots), det.data);
  if (notMine) check('teacher cannot open another teacher subject (403)', (await call('GET', `/subjects/${notMine._id}/details`, undefined, teacher2)).status === 403);

  // ---- One subject split between teachers by class, even at the same time ----
  const teacher3 = await login('teacher3@demo.edu');
  const mona = (await call('GET', '/auth/me', undefined, teacher3)).data;
  const khaled = (await call('GET', '/auth/me', undefined, teacher2)).data;
  const mathSub = allSubs.find((x: any) => x.code === 'MATH301');
  const clsList = (await call('GET', '/classes?limit=50', undefined, owner)).data.items;
  const [c1, c2] = [clsList.find((c: any) => c.name === 'الصف الأول'), clsList.find((c: any) => c.name === 'الصف الثاني')];
  const c1Grid = (await call('GET', `/timetable?classId=${c1._id}`, undefined, owner)).data;
  const c2Grid = (await call('GET', `/timetable?classId=${c2._id}`, undefined, owner)).data;
  const kMath = c1Grid.find((x: any) => x.subjectId?._id === mathSub._id && x.teacherId?._id === khaled.id);
  const was = c2Grid.find((x: any) => x.day === kMath.day && x.period === kMath.period);
  const same = await call('PUT', '/timetable/slot', { day: kMath.day, period: kMath.period, classId: c2._id, subjectId: mathSub._id, teacherId: mona.id }, owner);
  check('same subject, same period, two classes, two teachers: allowed', same.status === 200, same.data);
  if (was) await call('PUT', '/timetable/slot', { day: was.day, period: was.period, classId: c2._id, subjectId: was.subjectId._id, teacherId: was.teacherId?._id || null }, owner);
  const exams = (await call('GET', `/exams?subjectId=${mathSub._id}&limit=50`, undefined, owner)).data.items;
  const e1 = exams.find((e: any) => e.classId._id === c1._id), e2 = exams.find((e: any) => e.classId._id === c2._id);
  check('Khaled grades math in class 1', (await call('GET', `/exams/marks/${e1._id}`, undefined, teacher2)).status === 200);
  check('Khaled cannot grade math in class 2 (403)', (await call('GET', `/exams/marks/${e2._id}`, undefined, teacher2)).status === 403);
  check('Mona grades math in class 2', (await call('GET', `/exams/marks/${e2._id}`, undefined, teacher3)).status === 200);
  check('Mona cannot grade math in class 1 (403)', (await call('GET', `/exams/marks/${e1._id}`, undefined, teacher3)).status === 403);
  const kExams = (await call('GET', `/exams?subjectId=${mathSub._id}&limit=50`, undefined, teacher2)).data.items;
  check('Khaled lists only his math exams', kExams.length >= 1 && kExams.every((e: any) => e.classId._id === c1._id), kExams.map((e: any) => e.classId?.name));
  const ovAll = (await call('GET', '/exams/overview', undefined, owner)).data;
  const ovK = (await call('GET', '/exams/overview', undefined, teacher2)).data;
  check('exams board: totals and statuses', ovAll.items?.length >= ovK.items?.length && ovAll.items.every((e: any) => ['upcoming', 'pending', 'graded'].includes(e.status)), ovAll.totals);
  check('exams board: Khaled sees no math exam of class 2', ovK.items.every((e: any) => !(e.subject._id === mathSub._id && e.class._id === c2._id)), ovK.items.map((e: any) => `${e.subject.name}/${e.class.name}`));
  const mDet = (await call('GET', `/subjects/${mathSub._id}/details`, undefined, owner)).data;
  check('subject page shows a different teacher per class', mDet.classes.length === 2 && mDet.classes.every((c: any) => c.teachers.length === 1) && mDet.classes[0].teachers[0]._id !== mDet.classes[1].teachers[0]._id, mDet.classes);

  check('Management blocked from timetable (402)', (await call('GET', '/timetable/periods', undefined, core)).status === 402);
  const up = await call('POST', '/school/subscription', { plan: 'acad', tier: 250, billingCycle: 'monthly' }, core);
  check('upgrade to Academic 250 = 1799', up.data.price === 1799, up.data);
  check('Academic unlocks timetable', (await call('GET', '/timetable/periods', undefined, core)).status === 200);

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
