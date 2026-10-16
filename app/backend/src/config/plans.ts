// Single source of truth for pricing/packages (mirrors PRICING.md).
export const PACKAGES = ['core', 'mgmt', 'biz', 'acad', 'ent'] as const;
export type Plan = (typeof PACKAGES)[number];

export const TIERS = [100, 250, 500, 1000] as const; // above 1000 = custom (maxStudents set manually)

// PRICES[tierIndex][planIndex]; null = on request
export const PRICES: (number | null)[][] = [
  [499, 799, 1099, 1299, null],
  [899, 1199, 1499, 1799, null],
  [1399, 1699, 1999, 2449, null],
  [2299, 2599, 2899, 3599, null],
];

export const TRIAL_DAYS = 7;
/** True when the school can't use the app until it picks a plan: never started, or its period ran out. */
export const needsPlan = (s: { status?: string | null; subscriptionEnds?: Date | null }) =>
  s.status === 'pending' || (!!s.subscriptionEnds && new Date(s.subscriptionEnds).getTime() < Date.now());

export const planRank = (p: Plan) => PACKAGES.indexOf(p);

// module -> minimum plan
export const MODULE_PLAN: Record<string, Plan> = {
  students: 'core',
  classes: 'core',
  attendance: 'core',
  fees: 'core',
  reports: 'core',
  exams: 'mgmt',
  expenses: 'mgmt',
  documents: 'mgmt',
  financeReports: 'mgmt',
  accounting: 'biz',
  hr: 'biz',
  payroll: 'biz',
  parentPortal: 'biz',
  kpi: 'biz',
  notifications: 'biz',
  whatsapp: 'biz',
  timetable: 'acad',
  teacherPortal: 'acad',
  branches: 'ent',
  api: 'ent',
  branding: 'ent',
};

export const hasModule = (plan: Plan, module: string) =>
  planRank(plan) >= planRank(MODULE_PLAN[module] ?? 'ent');

export const modulesFor = (plan: Plan) => Object.keys(MODULE_PLAN).filter((m) => hasModule(plan, m));

export const priceFor = (tier: number, plan: Plan, cycle: 'monthly' | 'yearly') => {
  const ti = (TIERS as readonly number[]).indexOf(tier);
  if (ti < 0) return null;
  const m = PRICES[ti][planRank(plan)];
  if (m == null) return null;
  return cycle === 'yearly' ? m * 10 : m;
};
