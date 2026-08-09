// Billing plan definitions. Storage quotas are the real values backing
// the storage meter (they replace the hardcoded 5 GB display tier once
// a user is on a paid plan).
export type PlanName = 'free' | 'plus' | 'pro' | 'max';

export const FREE_STORAGE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

export const PLANS: Record<
  Exclude<PlanName, 'free'>,
  { name: PlanName; storageBytes: number; envKey: string }
> = {
  plus: {
    name: 'plus',
    storageBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    envKey: 'STRIPE_PLUS_PRICE_ID',
  },
  pro: {
    name: 'pro',
    storageBytes: 500 * 1024 * 1024 * 1024, // 500 GB
    envKey: 'STRIPE_PRO_PRICE_ID',
  },
  max: {
    name: 'max',
    storageBytes: 2 * 1024 * 1024 * 1024 * 1024, // 2 TB
    envKey: 'STRIPE_MAX_PRICE_ID',
  },
};

export function getPlanStorageBytes(plan: PlanName): number {
  if (plan === 'free') return FREE_STORAGE_BYTES;
  return PLANS[plan].storageBytes;
}
