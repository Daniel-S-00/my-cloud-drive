import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { NavLinks } from '@/components/nav-links';
import { getOptionalUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files } from '@/server/db/schema';

async function getTrashCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(files)
    .where(and(eq(files.ownerId, userId), isNotNull(files.deletedAt)));
  return row?.count ?? 0;
}

export async function Nav() {
  const user = await getOptionalUser();
  if (!user) {
    return null;
  }
  const trashCount = await getTrashCount(user.id);
  return (
    <nav className="sticky top-0 z-30 border-b border-border-subtle bg-bg-surface/80 backdrop-blur-md supports-[backdrop-filter]:bg-bg-surface/70">
      <div className="mx-auto flex h-12 w-full max-w-[1920px] items-center gap-2 px-4 text-sm text-text-primary sm:px-6">
        <NavLinks trashCount={trashCount} />
      </div>
    </nav>
  );
}
