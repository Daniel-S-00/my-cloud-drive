// Billing plan definitions. Storage quotas back both the storage meter
// and the upload guard. Quotas are derived from the plan NAME (not the
// storage_quota_bytes column) so a single change here applies everywhere.
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

/**
 * Whether the user still holds a paid plan. A subscription counts as
 * paid while it is active OR while the current billing period they paid
 * for is still running (soft landing: immediate cancellation keeps the
 * quota until the period they already paid for ends, then downgrades).
 */
export function isPaidPlan(
  status: string | null | undefined,
  plan: string | null | undefined,
  currentPeriodEnd: Date | null | undefined,
): boolean {
  if (!plan || plan === 'free') return false;
  if (status === 'active') return true;
  if (currentPeriodEnd && currentPeriodEnd.getTime() > Date.now()) {
    return true;
  }
  return false;
}
