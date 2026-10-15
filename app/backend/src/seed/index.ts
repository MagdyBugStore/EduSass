import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { env } from '../config/env';
import { ClassRoom, School, Student, Subject, User } from '../models';
import { ensureChart } from '../utils/services';

/** Idempotent: creates super admin + a Business-plan demo school. Run: npm run seed */
async function main() {
  await connectDb();
  const hash = (p: string) => bcrypt.hash(p, 12);

  if (!(await User.exists({ email: env.superEmail }))) {
    await User.create({ name: 'Platform Admin', email: env.superEmail, role: 'superadmin', passwordHash: await hash(env.superPassword) });
    console.log('super admin:', env.superEmail);
  }

  if (env.isProd && process.env.SEED_DEMO !== '1') return console.log('prod: skipping demo school (set SEED_DEMO=1 to force)');
  if (await School.exists({ name: 'مدرسة النور (تجريبية)' })) return console.log('demo exists');
  const school = await School.create({ name: 'مدرسة النور (تجريبية)', plan: 'biz', tier: 250, maxStudents: 250, status: 'active', billingCycle: 'monthly', subscriptionEnds: new Date(Date.now() + 30 * 864e5) });
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
  await User.create({ schoolId: sid, name: 'ولي أمر أحمد', phone: '01000000000', role: 'parent', studentIds: [studs[0]._id], passwordHash: await hash('Demo12345') });
  console.log('demo school ready. logins: owner@demo.edu / Demo12345, parent phone 01000000000 / Demo12345');
}

main().then(() => mongoose.disconnect()).catch((e) => { console.error(e); process.exit(1); });
