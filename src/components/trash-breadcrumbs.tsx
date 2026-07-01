import Link from 'next/link';

import type { FolderBreadcrumb } from '@/app/actions/folders';

type TrashBreadcrumbsProps = {
  path: FolderBreadcrumb[];
};

const TRASH_ROOT_CRUMB = { id: 'trash-root', name: 'Trash' } as const;

/**
 * Presentational breadcrumb navigation for the trash view. The first
 * element of `path` is always the synthetic "Trash" crumb; the rest
 * are the ancestor folders from the top-level trashed folder down to
 * the current folder (inclusive). Each ancestor links to
 * `/trash?folder=<id>`; the current folder is plain text.
 */
export function TrashBreadcrumbs({ path }: TrashBreadcrumbsProps) {
  const chain =
    path[0]?.id === TRASH_ROOT_CRUMB.id ? path.slice(1) : path;
  const last = chain[chain.length - 1];

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1 text-sm text-zinc-500"
    >
      <Link
        href="/trash"
        className="rounded px-1 hover:bg-zinc-100 hover:text-zinc-900"
      >
        {TRASH_ROOT_CRUMB.name}
      </Link>
      {chain.map((crumb) => {
        const isLast = crumb.id === last?.id;
        return (
          <span key={crumb.id} className="flex items-center gap-1">
            <span aria-hidden className="text-zinc-300">
              /
            </span>
            {isLast ? (
              <span className="rounded px-1 font-medium text-zinc-700">
                {crumb.name}
              </span>
            ) : (
              <Link
                href={`/trash?folder=${crumb.id}`}
                className="rounded px-1 hover:bg-zinc-100 hover:text-zinc-900"
              >
                {crumb.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
