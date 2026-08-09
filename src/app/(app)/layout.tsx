import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { AppHeader } from '@/components/app-header';
import { AppSidebar } from '@/components/app-sidebar';
import { getOptionalUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, shares } from '@/server/db/schema';
import { getStorageQuota } from '@/server/billing/quota';

async function getSidebarData() {
  const user = await getOptionalUser();
  if (!user) {
    return {
      trashCount: 0,
      sharesCount: 0,
      usedBytes: 0,
      storageQuotaBytes: 0,
      isSubscribed: false,
      overQuota: false,
      plan: 'free',
    };
  }

  const [trashRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(files)
    .where(and(eq(files.ownerId, user.id), isNotNull(files.deletedAt)));

  // Mirrors the /shares page query so the badge matches the list the
  // user actually sees (only shares pointing at live files).
  const [sharesRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(shares)
    .innerJoin(files, eq(shares.fileId, files.id))
    .where(
      and(
        eq(shares.createdBy, user.id),
        isNull(shares.deletedAt),
        isNull(files.deletedAt),
      ),
    );

  // Single source of truth for usage + quota (includes the soft-landing
  // rule: paid quota holds until the current period ends).
  const quota = await getStorageQuota();

  return {
    trashCount: trashRow?.count ?? 0,
    sharesCount: sharesRow?.count ?? 0,
    usedBytes: quota?.usedBytes ?? 0,
    storageQuotaBytes: quota?.quotaBytes ?? 0,
    isSubscribed: quota?.isPaid ?? false,
    overQuota: quota?.overQuota ?? false,
    plan: quota?.plan ?? 'free',
  };
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    trashCount,
    sharesCount,
    usedBytes,
    storageQuotaBytes,
    isSubscribed,
    overQuota,
    plan,
  } = await getSidebarData();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg-base text-text-primary">
      <AppHeader
        trashCount={trashCount}
        sharesCount={sharesCount}
        usedBytes={usedBytes}
        storageQuotaBytes={storageQuotaBytes}
        isSubscribed={isSubscribed}
        overQuota={overQuota}
        plan={plan}
      />
      <div className="flex min-h-0 flex-1">
        <AppSidebar
          trashCount={trashCount}
          sharesCount={sharesCount}
          usedBytes={usedBytes}
          storageQuotaBytes={storageQuotaBytes}
          isSubscribed={isSubscribed}
          overQuota={overQuota}
          plan={plan}
        />
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
