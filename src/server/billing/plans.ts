// Billing plan definitions. Storage quotas back both the storage meter
// and the upload guard. Quotas are derived from the plan NAME (not the
// storage_quota_bytes column) so a single change here applies everywhere.
export type PlanName = 'free' | 'plus' | 'pro' | 'max';

// ── TEMPORARY TEST QUOTAS ─────────────────────────────────────────────
// Small quotas for local testing so enforcement can be exercised without
// uploading real data. RESTORE THE REAL VALUES below before merging.
//   free → 5 * 1024 * 1024 * 1024 (5 GB)
//   plus → 100 * 1024 * 1024 * 1024 (100 GB)
export const FREE_STORAGE_BYTES = 50 * 1024 * 1024; // 50 MB (test)

export const PLANS: Record<
  Exclude<PlanName, 'free'>,
  { name: PlanName; storageBytes: number; envKey: string }
> = {
  plus: {
    name: 'plus',
    storageBytes: 100 * 1024 * 1024, // 100 MB (test)
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
