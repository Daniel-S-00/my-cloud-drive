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
    <nav className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-12 w-full max-w-5xl items-center gap-2 px-6 text-sm">
        <NavLinks trashCount={trashCount} />
      </div>
    </nav>
  );
}
