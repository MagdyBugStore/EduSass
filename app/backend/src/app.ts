import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { connectDb } from './config/db';
import { env } from './config/env';
import { authenticate, staffOnly, allow, requireModule } from './middleware/auth';
import { errorHandler, notFound } from './middleware/error';
import { Notification } from './models';
import { accounting, announcements, employees, payroll } from './routes/business';
import { attendance, classes, exams, subjects } from './routes/academic';
import authRoutes from './routes/auth';
import { discounts, expenses, invoices, payments } from './routes/finance';
import parentRoutes from './routes/parent';
import reports from './routes/reports';
import { exportRouter, plansPublic, school, superadmin, users } from './routes/school';
import students from './routes/students';
import inbox from './routes/inbox';
import teachers from './routes/teachers';
import { teacher, timetable } from './routes/timetable';
import { wrap } from './utils/http';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins.includes('*') ? true : env.corsOrigins, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  if (env.isProd) app.use(morgan('combined'));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (_q, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
  app.use('/api/plans', plansPublic);
  app.use('/api/auth', authRoutes);

  // ---- authenticated ----
  const api = express.Router();
  api.use(authenticate);
  api.use('/superadmin', superadmin);
  api.use('/parent', parentRoutes);

  const staff = express.Router();
  staff.use(staffOnly);
  staff.use('/school', school);
  staff.use('/users', users);
  staff.use('/export', exportRouter);
  staff.use('/students', students);
  staff.use('/classes', classes);
  staff.use('/subjects', subjects);
  staff.use('/attendance', attendance);
  staff.use('/exams', exams);
  staff.use('/invoices', invoices);
  staff.use('/payments', payments);
  staff.use('/discounts', discounts);
  staff.use('/expenses', expenses);
  staff.use('/reports', reports);
  staff.use('/accounting', accounting);
  staff.use('/employees', employees);
  staff.use('/payroll', payroll);
  staff.use('/announcements', announcements);
  staff.use('/inbox', inbox);
  staff.use('/teachers', teachers);
  staff.use('/timetable', timetable);
  staff.use('/teacher', teacher);
  staff.get('/notifications', requireModule('notifications'), allow('teacher', 'accountant', 'hr', 'receptionist'),
    wrap(async (req, res) => res.json(await Notification.find({ schoolId: req.user!.schoolId }).sort({ createdAt: -1 }).limit(100).lean())));
  api.use(staff);
  app.use('/api', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

async function main() {
  await connectDb();
  const app = buildApp();
  const server = app.listen(env.port, () => console.log(`[api] listening on :${env.port}`));
  const stop = () => server.close(() => mongoose.disconnect().then(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
