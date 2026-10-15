import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { env } from '../config/env';
import { Announcement, Attendance, ClassRoom, Exam, Mark, Period, School, Student, Subject, TimetableSlot, User } from '../models';
import { ensureChart } from '../utils/services';

/** Idempotent: creates super admin + an Academic-plan demo school with a timetable. Run: npm run seed */
async function main() {
  await connectDb();
  const hash = (p: string) => bcrypt.hash(p, 12);

  if (!(await User.exists({ email: env.superEmail }))) {
    await User.create({ name: 'Platform Admin', email: env.superEmail, role: 'superadmin', passwordHash: await hash(env.superPassword) });
    console.log('super admin:', env.superEmail);
  }

  if (env.isProd && process.env.SEED_DEMO !== '1') return console.log('prod: skipping demo school (set SEED_DEMO=1 to force)');
  const existing = await School.findOne({ name: 'مدرسة النور (تجريبية)' });
  if (existing) {
    if (existing.plan === 'biz') await School.updateOne({ _id: existing._id }, { plan: 'acad' }); // demo shows every package feature
    await ensureAcademicDemo(existing._id);
    await ensureDemoAttendance(existing._id);
    await ensureDemoProfiles(existing._id);
    await ensureDemoSplit(existing._id);
    await backfillAssignments(existing._id);
    return console.log('demo exists (timetable ensured)');
  }
  const school = await School.create({ name: 'مدرسة النور (تجريبية)', plan: 'acad', tier: 250, maxStudents: 250, status: 'active', billingCycle: 'monthly', subscriptionEnds: new Date(Date.now() + 30 * 864e5) });
  const sid = school._id;
  await ensureChart(String(sid));

  const mk = async (name: string, email: string, role: string, phone?: string) =>
    User.create({ schoolId: sid, name, email, phone, role, passwordHash: await hash('Demo12345') });
  await mk('مدير المدرسة', 'owner@demo.edu', 'owner');
  await mk('أ. سارة (معلمة)', 'teacher@demo.edu', 'teacher');
  await mk('أ. محمود (محاسب)', 'accountant@demo.edu', 'accountant');
  await mk('أ. هدى (موارد بشرية)', 'hr@demo.edu', 'hr');
  await mk('الاستقبال', 'reception@demo.edu', 'receptionist');

  const cls = await ClassRoom.insertMany([
    { schoolId: sid, stage: 'ابتدائي', name: 'الصف الأول', section: 'أ', year: school.currentYear },
    { schoolId: sid, stage: 'ابتدائي', name: 'الصف الثاني', section: 'أ', year: school.currentYear },
  ]);
  await Subject.insertMany([
    { schoolId: sid, name: 'اللغة العربية', classIds: cls.map((c) => c._id) },
    { schoolId: sid, name: 'الرياضيات', classIds: cls.map((c) => c._id) },
  ]);
  const names = ['أحمد علي', 'منى حسن', 'يوسف إبراهيم', 'ليلى محمود', 'عمر خالد'];
  const studs = [];
  for (let i = 0; i < names.length; i++) {
    const s = await School.findByIdAndUpdate(sid, { $inc: { studentSeq: 1 } }, { new: true });
    studs.push(await Student.create({
      schoolId: sid, name: names[i], code: `S${String(s!.studentSeq).padStart(5, '0')}`, classId: cls[i % 2]._id, gender: i % 2 ? 'female' : 'male',
      guardian: { name: `ولي أمر ${names[i]}`, phone: `0100000000${i}`, relation: 'أب' },
    }));
  }
  await ensureAcademicDemo(sid);
  await ensureDemoAttendance(sid);
  await ensureDemoProfiles(sid);
  await ensureDemoSplit(sid);
  await backfillAssignments(sid);
  await User.create({ schoolId: sid, name: 'ولي أمر أحمد', phone: '01000000000', role: 'parent', studentIds: [studs[0]._id], passwordHash: await hash('Demo12345') });
  console.log('demo school ready. logins: owner@demo.edu / Demo12345, parent phone 01000000000 / Demo12345');
}

/** Demo bell schedule, a second teacher, extra subjects and a clash-free weekly timetable. Safe to re-run. */
async function ensureAcademicDemo(sid: any) {
  if (await Period.exists({ schoolId: sid })) return;
  const school = await School.findById(sid).lean();
  const times = [['08:00', '08:45'], ['08:50', '09:35'], ['09:40', '10:25'], ['10:45', '11:30'], ['11:35', '12:20'], ['12:25', '13:10'], ['13:15', '14:00']];
  await Period.insertMany(times.map(([start, end], i) => ({ schoolId: sid, number: i + 1, start, end })));

  const sara = await User.findOne({ schoolId: sid, email: 'teacher@demo.edu' });
  let khaled = await User.findOne({ schoolId: sid, email: 'teacher2@demo.edu' });
  if (!khaled) khaled = await User.create({ schoolId: sid, name: 'أ. خالد (معلم)', email: 'teacher2@demo.edu', role: 'teacher', passwordHash: await bcrypt.hash('Demo12345', 12) });

  const cls = await ClassRoom.find({ schoolId: sid }).sort({ name: 1 }).limit(2).lean();
  const want = ['اللغة العربية', 'الرياضيات', 'اللغة الإنجليزية', 'العلوم'];
  const subs = [];
  for (const name of want) {
    subs.push((await Subject.findOne({ schoolId: sid, name })) || (await Subject.create({ schoolId: sid, name, classIds: cls.map((c) => c._id) })));
  }
  // even subjects -> Sara, odd -> Khaled; the two classes are offset by one so a teacher is never in both at once
  const teacherOf = (k: number) => (k % 2 === 0 ? sara : khaled)!._id;
  await Promise.all(subs.map((s, k) => Subject.updateOne({ _id: s._id }, { $addToSet: { teacherIds: teacherOf(k) } })));
  await Promise.all(cls.map((c) => ClassRoom.updateOne({ _id: c._id }, { $addToSet: { teacherIds: { $each: [sara!._id, khaled._id] } } })));
  const slots = [];
  for (const day of school?.schoolDays ?? [0, 1, 2, 3, 4])
    for (let p = 1; p <= 6; p++)
      for (let ci = 0; ci < cls.length; ci++) {
        const k = (p + day + ci) % 4;
        slots.push({ schoolId: sid, year: school!.currentYear, day, period: p, classId: cls[ci]._id, subjectId: subs[k]._id, teacherId: teacherOf(k) });
      }
  await TimetableSlot.insertMany(slots);
  console.log(`timetable: ${slots.length} lessons; second teacher teacher2@demo.edu / Demo12345`);
}

/** 30 school days of daily attendance so the demo dashboard trend has something to show. Safe to re-run. */
async function ensureDemoAttendance(sid: any) {
  if ((await Attendance.countDocuments({ schoolId: sid, period: 0 })) > 20) return;
  const school = await School.findById(sid).lean();
  const days = new Set<number>(school?.schoolDays ?? [0, 1, 2, 3, 4]);
  const studs = await Student.find({ schoolId: sid, status: 'active' }).select('_id classId').lean();
  const ops = [];
  for (let back = 1, made = 0; made < 30 && back < 60; back++) {
    const d = new Date(Date.now() - back * 864e5);
    if (!days.has(d.getDay())) continue;
    made++;
    const date = d.toISOString().slice(0, 10);
    for (const [i, s] of studs.entries()) {
      const roll = (back * 7 + i * 13) % 20; // deterministic mix: mostly present, a few late/absent
      const status = roll === 0 ? 'absent' : roll === 1 ? 'late' : 'present';
      ops.push({ updateOne: { filter: { schoolId: sid, studentId: s._id, date, period: 0 }, update: { $setOnInsert: { classId: s.classId, status } }, upsert: true } });
    }
  }
  if (ops.length) await Attendance.bulkWrite(ops as any);
  console.log(`attendance history: ${ops.length} records`);
}

/** CV details for the demo teachers and class capacities, only where missing. */
async function ensureDemoProfiles(sid: any) {
  const cv: Record<string, any> = {
    'teacher@demo.edu': { title: 'معلمة أولى لغة عربية', specialization: 'اللغة العربية واللغة الإنجليزية', qualification: 'ليسانس آداب وتربية، جامعة عين شمس', experienceYears: 9, hireDate: new Date('2019-09-01'), bio: 'بتدرّس العربي والإنجليزي للمرحلة الابتدائية. مهتمة بالقراءة الجهرية والكتابة الإبداعية، وبتتابع كل طالب بخطة قصيرة كل شهر.' },
    'teacher2@demo.edu': { title: 'معلم رياضيات وعلوم', specialization: 'الرياضيات والعلوم', qualification: 'بكالوريوس علوم وتربية، جامعة القاهرة', experienceYears: 6, hireDate: new Date('2021-09-01'), bio: 'بيحب يعلّم الرياضيات بالأنشطة والألعاب، ومسؤول عن نادي العلوم في المدرسة.' },
  };
  for (const [email, profile] of Object.entries(cv))
    await User.updateOne({ schoolId: sid, email, 'profile.title': { $exists: false } }, { $set: { profile } });
  await ClassRoom.updateMany({ schoolId: sid, capacity: { $exists: false } }, { $set: { capacity: 30 } });
  const codes: Record<string, string> = { 'الرياضيات': 'MATH301', 'العلوم': 'SCI402', 'اللغة العربية': 'ARB201', 'اللغة الإنجليزية': 'ENG101' };
  for (const [name, code] of Object.entries(codes)) await Subject.updateOne({ schoolId: sid, name, code: { $exists: false } }, { $set: { code } });

  // one marked monthly test per subject per class, so grade averages have data
  if (!(await Exam.exists({ schoolId: sid }))) {
    const [subs, classes] = await Promise.all([Subject.find({ schoolId: sid }).lean(), ClassRoom.find({ schoolId: sid }).lean()]);
    for (const [si, sub] of subs.entries())
      for (const cls of classes) {
        const exam = await Exam.create({ schoolId: sid, name: 'اختبار الشهر الأول', classId: cls._id, subjectId: sub._id, term: 'الترم الأول', date: new Date(Date.now() - 10 * 864e5), maxScore: 20 });
        const studs = await Student.find({ schoolId: sid, classId: cls._id, status: 'active' }).select('_id').lean();
        if (studs.length) await Mark.insertMany(studs.map((st, i) => ({ schoolId: sid, examId: exam._id, studentId: st._id, score: 11 + ((si * 3 + i * 5) % 9) })));
      }
  }
  if (!(await Announcement.exists({ schoolId: sid })))
    await Announcement.create({ schoolId: sid, title: 'اجتماع أولياء الأمور الخميس الجاي', body: 'الساعة 12 الضهر في قاعة المدرسة. هنتكلم عن نتايج الشهر الأول وخطة الامتحانات.' });
}

/** Math is split by class in the demo: Khaled teaches it to class 1, Mona to class 2 (same periods are fine). */
async function ensureDemoSplit(sid: any) {
  if (await User.exists({ schoolId: sid, email: 'teacher3@demo.edu' })) return;
  const mona = await User.create({
    schoolId: sid, name: 'أ. منى (معلمة)', email: 'teacher3@demo.edu', role: 'teacher', passwordHash: await bcrypt.hash('Demo12345', 12),
    profile: { title: 'معلمة رياضيات', specialization: 'الرياضيات', qualification: 'بكالوريوس تربية رياضيات، جامعة حلوان', experienceYears: 4, hireDate: new Date('2023-09-01') },
  });
  const math = await Subject.findOne({ schoolId: sid, name: 'الرياضيات' });
  const second = await ClassRoom.findOne({ schoolId: sid, name: 'الصف الثاني' });
  if (!math || !second) return;
  await TimetableSlot.updateMany({ schoolId: sid, subjectId: math._id, classId: second._id }, { $set: { teacherId: mona._id } });
  await Subject.updateOne({ _id: math._id }, { $addToSet: { teacherIds: mona._id } });
  await ClassRoom.updateOne({ _id: second._id }, { $addToSet: { teacherIds: mona._id } });
  console.log('math split: teacher3@demo.edu / Demo12345 teaches it to class 2');
}

/** Per-class subject assignments mirror who is on the timetable (safe to re-run). */
async function backfillAssignments(sid: any) {
  const slots = await TimetableSlot.find({ schoolId: sid, teacherId: { $ne: null } }).select('subjectId classId teacherId').lean();
  const seen = new Set<string>();
  for (const s of slots) {
    const k = `${s.subjectId}:${s.classId}:${s.teacherId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    await Subject.updateOne({ _id: s.subjectId }, { $addToSet: { assignments: { classId: s.classId, teacherId: s.teacherId } } });
  }
  // drop assignments that no longer match the timetable for timetabled subject/class pairs
  const subs = await Subject.find({ schoolId: sid }).lean();
  for (const sub of subs) {
    const keep = (sub.assignments || []).filter((a: any) => {
      const timetabled = slots.some((s) => String(s.subjectId) === String(sub._id) && String(s.classId) === String(a.classId));
      return !timetabled || seen.has(`${sub._id}:${a.classId}:${a.teacherId}`);
    });
    if (keep.length !== (sub.assignments || []).length) await Subject.updateOne({ _id: sub._id }, { $set: { assignments: keep } });
  }
}

main().then(() => mongoose.disconnect()).catch((e) => { console.error(e); process.exit(1); });
