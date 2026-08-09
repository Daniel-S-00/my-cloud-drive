import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
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
