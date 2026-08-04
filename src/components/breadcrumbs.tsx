import Link from 'next/link';
import { getFolderBreadcrumbs } from '@/app/actions/folders';
import { BreadcrumbDropZone } from '@/components/breadcrumb-drop-zone';

type BreadcrumbsProps = {
  folderId: string | null;
};

const ROOT_CRUMB = { id: 'root', name: 'My Drive' } as const;

export async function Breadcrumbs({ folderId }: BreadcrumbsProps) {
  // The root crumb is always present; the action layer returns the
  // rest of the chain when folderId is non-null.
  const { path } = await getFolderBreadcrumbs({ folderId });

  // Drop the synthetic "My Drive" entry from `path` so we don't
  // duplicate it. The first element of `path` is always the root
  // crumb; we render it explicitly below as the clickable link.
  const chain =
    path[0]?.id === ROOT_CRUMB.id ? path.slice(1) : path;
  const last = chain[chain.length - 1];

  // The immediate parent of the current folder is the second-to-last
  // element of the chain (the chain is ancestor-first → current
  // folder-last). When the current folder's parent is root (chain
  // has a single element) or we're at root (empty chain), the
  // "move up" target is the root of the drive, which is handled by
  // the dedicated `RootDropZone` elsewhere. In that case we leave
  // the breadcrumb links unwrapped.
  const parentCrumb =
    chain.length >= 2 ? chain[chain.length - 2] : null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-sm text-text-secondary"
    >
      <Link
        href="/drive"
        className="rounded px-1 text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
      >
        {ROOT_CRUMB.name}
      </Link>
      {chain.map((crumb) => {
        const isLast = crumb.id === last?.id;
        const isParent = parentCrumb?.id === crumb.id;
        return (
          <span key={crumb.id} className="flex items-center gap-1">
            <span aria-hidden className="text-border-subtle">
              /
            </span>
            {isLast ? (
              <span className="rounded px-1 font-medium text-text-primary">
                {crumb.name}
              </span>
            ) : isParent ? (
              // Wrap the immediate parent so dragging a file or
              // folder onto it moves the item up one level. The
              // link inside still navigates on click; the drop zone
              // only adds drag/drop handlers.
              <BreadcrumbDropZone
                parentFolderId={crumb.id}
                parentFolderName={crumb.name}
              >
                <Link
                  href={`/drive?folder=${crumb.id}`}
                  draggable={false}
                  className="rounded px-1 text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
                >
                  {crumb.name}
                </Link>
              </BreadcrumbDropZone>
            ) : (
              <Link
                href={`/drive?folder=${crumb.id}`}
                className="rounded px-1 text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
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
