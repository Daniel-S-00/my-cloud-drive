import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { LogoutButton } from '@/components/logout-button';
import {
  TrashFileListClient,
  type TrashFileRowData,
} from '@/components/trash-file-list-client';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, type File } from '@/server/db/schema';

export const dynamic = 'force-dynamic';

const TRASH_RETENTION_DAYS = 30;
const PURGE_WARNING_DAYS = 7;

export default async function TrashPage() {
  const { id: userId } = await getCurrentUser();

  const dbRows: File[] = await db
    .select()
    .from(files)
    .where(
      and(eq(files.ownerId, userId), isNotNull(files.deletedAt)),
    )
    .orderBy(desc(files.deletedAt));

  // `force-dynamic` ensures this page is rendered per request, so reading
  // the wall clock here is safe even though React's purity rule flags
  // `Date.now()` inside a render. We compute the cutoff once and pass it
  // to the row mapper.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const rows: TrashFileRowData[] = dbRows.map((row) => {
    const deletedAtMs = row.deletedAt
      ? new Date(row.deletedAt).getTime()
      : 0;
    const daysSince = Math.floor(
      (now - deletedAtMs) / (24 * 60 * 60 * 1000),
    );
    const daysRemaining = Math.max(0, TRASH_RETENTION_DAYS - daysSince);
    const purgingSoon = daysRemaining < PURGE_WARNING_DAYS;
    return {
      id: row.id,
      name: row.name,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      deletedAt: deletedAtMs ? new Date(deletedAtMs).toISOString() : null,
      daysRemaining,
      purgingSoon,
    };
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Trash
          </h1>
          <p className="text-sm text-zinc-500">
            {rows.length === 0
              ? 'No trashed files. Files you delete from your drive will appear here for 30 days.'
              : `${rows.length} file${rows.length === 1 ? '' : 's'} in trash. Files are permanently deleted after ${TRASH_RETENTION_DAYS} days.`}
          </p>
        </div>
        <LogoutButton />
      </header>

      <TrashFileListClient rows={rows} hasFiles={rows.length > 0} />
    </div>
  );
}
