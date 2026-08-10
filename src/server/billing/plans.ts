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
 *
 * CHURN POLICY — OPTION A (GRACE BY DESIGN):
 * A failed renewal (status `past_due`/`unpaid`) does NOT downgrade the
 * user immediately. They keep the paid quota until the end of the
 * period they already paid for, then fall back to free. The webhook
 * records `invoice.payment_failed` and the settings UI surfaces a
 * "payment failed — update billing" notice so the user can fix their
 * card before losing access. This is deliberate: the user paid for
 * the period, so they get the value of it.
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
