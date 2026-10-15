# EduSaaS — School Management (multi-tenant SaaS)

Built from `PRICING.md` / `features-data.js`. Packages: **Core → Management → Business** (Enterprise = on request, not built yet).
Pricing = active-student tier × package. Staff accounts are unlimited. Cloud-only, no LMS, no transport.

```
app/
  backend/   Node + TypeScript + Express + MongoDB (Mongoose) — REST API
  frontend/  React + Vite + Tailwind (Arabic RTL) — school admin dashboard
  mobile/    Flutter (Android/iOS) — parents app
  docker-compose.yml
```

## Run locally
```bash
# backend (needs MongoDB on 127.0.0.1:27017)
cd backend && cp .env.example .env && npm i && npm run seed && npm run dev
npm test            # 25 end-to-end checks against the running API

# frontend
cd frontend && npm i && npm run dev     # http://localhost:5173 (proxies /api -> :4000)

# mobile (Android emulator reaches host at 10.0.2.2)
cd mobile && flutter run --dart-define=API_URL=http://10.0.2.2:4000/api
```
Demo logins (seed, non-production only): `owner@demo.edu` / `teacher@demo.edu` / `accountant@demo.edu` / `hr@demo.edu` / `reception@demo.edu` — password `Demo12345`.
Parent (mobile): phone `01000000000` / `Demo12345`. Super admin: `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` from `.env`.

## Production
```bash
cp .env.example .env   # set JWT_SECRET (32+ chars), SUPERADMIN_PASSWORD, CORS_ORIGINS
docker compose up -d --build
docker compose exec backend node dist/seed/index.js   # creates super admin only (no demo school in prod)
```
Put TLS in front (Caddy / nginx / Cloudflare). Back up the `mongo_data` and `uploads` volumes (`mongodump` nightly).
Mobile release: `flutter build apk --release --dart-define=API_URL=https://your.domain/api` (add signing config first).

## How the document maps to the code
| Document rule | Where |
| --- | --- |
| Package → feature gating | `backend/src/config/plans.ts` (`MODULE_PLAN`), `requireModule()` → HTTP 402 `UPGRADE_REQUIRED` |
| Only **active** students billed; tier limit | `routes/students.ts` `assertCapacity` (HTTP 402 `TIER_LIMIT`) |
| Upgrade/downgrade anytime, can't go below active count | `routes/school.ts` `POST /school/subscription` |
| Prices / yearly = ×10 | `config/plans.ts`, `GET /api/plans` |
| Staff unlimited | no staff counting anywhere |
| Roles & permissions | `middleware/auth.ts` `allow()`; roles owner/admin/teacher/accountant/hr/receptionist/parent |
| Core: attendance, basic fees, reports, export/backup | `routes/academic.ts`, `finance.ts`, `reports.ts`, `school.ts` (`/export`) |
| Management: per-lesson attendance, exams, discounts/installments/fee types, expenses, financial reports, documents | same files, gated |
| Business: accounting (auto-posted ledger), HR, payroll, parent portal, KPI, notifications, WhatsApp | `routes/business.ts`, `parent.ts`, `utils/services.ts` |

## Not done yet (be explicit before launch)
- **Enterprise** package (multi-branch, public API/webhooks, white-label, SLA).
- **Payment gateway** for subscriptions (plan change is instant/trust-based now) and for parents paying fees in-app.
- **Push notifications** (FCM): tokens are stored (`POST /auth/device-token`) but nothing sends yet; the app polls in-app notifications. WhatsApp Cloud API is wired via env, untested against a real account.
- Parent password reset flow, email/SMS verification, 2FA.
- Automated unit tests beyond the smoke suite; load testing; monitoring/alerting.
