import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { getOptionalUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, subscriptions } from '@/server/db/schema';
import {
  getPlanStorageBytes,
  isPaidPlan,
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

export { isPaidPlan };

/**
 * The user's current storage usage and their quota (from the active
 * subscription plan, falling back to free). Returns null for anonymous
 * requests.
 */
export async function getStorageQuota(): Promise<StorageQuota | null> {
  const user = await getOptionalUser();
  if (!user) return null;

  // Usage counts ALL files, including soft-deleted ones in trash: the
  // bytes still physically occupy R2 until emptyTrash purges them, so
  // they must count against the quota. (Without this, delete → restore
  // → delete cycles give unlimited storage by dropping usage while the
  // R2 object is still billed.)
  const [storageRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${files.sizeBytes}), 0)::bigint`,
    })
    .from(files)
    .where(eq(files.ownerId, user.id));

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
