import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getOptionalUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, subscriptions } from '@/server/db/schema';
import {
  getPlanStorageBytes,
  type PlanName,
} from '@/server/billing/plans';

export type StorageQuota = {
  usedBytes: number;
  quotaBytes: number;
  /** True when usage exceeds the current quota (soft-locked uploads). */
  overQuota: boolean;
  /** The plan this quota is derived from ('free' when not paid). */
  plan: string;
  /** True when the user holds a paid plan (incl. soft-landing period). */
  isPaid: boolean;
};

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

/**
 * The user's current storage usage and their quota (from the active
 * subscription plan, falling back to free). Returns null for anonymous
 * requests.
 */
export async function getStorageQuota(): Promise<StorageQuota | null> {
  const user = await getOptionalUser();
  if (!user) return null;

  const [storageRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${files.sizeBytes}), 0)::bigint`,
    })
    .from(files)
    .where(and(eq(files.ownerId, user.id), isNull(files.deletedAt)));

  const [sub] = await db
    .select({
      plan: subscriptions.plan,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .orderBy(sql`${subscriptions.createdAt} desc`)
    .limit(1);

  const paid = isPaidPlan(sub?.status, sub?.plan, sub?.currentPeriodEnd);

  // Quota derives from the plan name via plans.ts — the single source of
  // truth. (The storage_quota_bytes column mirrors the same value, but
  // plan-derived keeps temporary test quotas consistent everywhere.)
  const quotaBytes = paid
    ? getPlanStorageBytes(sub.plan as PlanName)
    : getPlanStorageBytes('free');

  const usedBytes = Number(storageRow?.total ?? 0);

  return {
    usedBytes,
    quotaBytes,
    overQuota: usedBytes > quotaBytes,
    plan: paid ? (sub.plan as string) : 'free',
    isPaid: paid,
  };
}
