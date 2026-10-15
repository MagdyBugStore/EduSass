import 'dotenv/config';

const required = (k: string, fallback?: string) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${k}`);
  return v;
};

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  isProd,
  port: Number(process.env.PORT || 4000),
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/edusaas'),
  jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-secret'),
  jwtExpires: process.env.JWT_EXPIRES || '12h',
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  whatsappToken: process.env.WHATSAPP_TOKEN || '',
  whatsappPhoneId: process.env.WHATSAPP_PHONE_ID || '',
  superEmail: process.env.SUPERADMIN_EMAIL || 'admin@edusaas.local',
  superPassword: process.env.SUPERADMIN_PASSWORD || 'ChangeMe123!',
};

if (isProd && env.jwtSecret.length < 24) throw new Error('JWT_SECRET too short');
