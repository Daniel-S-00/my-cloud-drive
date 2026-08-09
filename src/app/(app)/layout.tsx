import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { AppHeader } from '@/components/app-header';
import { AppSidebar } from '@/components/app-sidebar';
import { getOptionalUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, shares } from '@/server/db/schema';

async function getSidebarData() {
  const user = await getOptionalUser();
  if (!user) return { trashCount: 0, sharesCount: 0, usedBytes: 0 };

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

  const [storageRow] = await db
    .select({ total: sql<number>`coalesce(sum(${files.sizeBytes}), 0)::bigint` })
    .from(files)
    .where(and(eq(files.ownerId, user.id), isNull(files.deletedAt)));

  return {
    trashCount: trashRow?.count ?? 0,
    sharesCount: sharesRow?.count ?? 0,
    usedBytes: Number(storageRow?.total ?? 0),
  };
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { trashCount, sharesCount, usedBytes } = await getSidebarData();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg-base text-text-primary">
      <AppHeader
        trashCount={trashCount}
        sharesCount={sharesCount}
        usedBytes={usedBytes}
      />
      <div className="flex min-h-0 flex-1">
        <AppSidebar
          trashCount={trashCount}
          sharesCount={sharesCount}
          usedBytes={usedBytes}
        />
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
