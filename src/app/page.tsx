import { Breadcrumbs } from '@/components/breadcrumbs';
import { FileList } from '@/components/file-list';
import { FileUpload } from '@/components/file-upload';
import { FolderBrowser } from '@/components/folder-browser';
import { FolderList } from '@/components/folder-list';
import { LogoutButton } from '@/components/logout-button';
import { getFolderBreadcrumbs } from '@/app/actions/folders';
import { FileListEmpty } from '@/components/file-list-empty';
import { DragProvider } from '@/contexts/drag-context';

type SearchParams = Promise<{
  folder?: string | string[];
  highlight?: string | string[];
}>;

function pickSingle(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const rawFolderId = pickSingle(params.folder);
  const folderId = rawFolderId && rawFolderId.trim() !== '' ? rawFolderId : null;
  const highlightId = pickSingle(params.highlight);

  const { path } = await getFolderBreadcrumbs({ folderId });
  const currentName = path[path.length - 1]?.name ?? 'My Drive';

  return (
    <DragProvider>
      <div className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col gap-8 bg-bg-base px-4 py-8 text-text-primary sm:px-6 sm:py-12">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              My Cloud Drive
            </h1>
            <Breadcrumbs folderId={folderId} />
          </div>
          <LogoutButton />
        </header>

        <section aria-label="Upload" className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
            Upload
          </h2>
          <FileUpload folderId={folderId} />
        </section>

        <section aria-label="Browse" className="flex flex-col gap-4">
          <FolderBrowser folderId={folderId} parentName={currentName} initialSelectedId={highlightId}>
            <FolderList folderId={folderId} />
            <FileListEmpty folderId={folderId} />
            <FileList folderId={folderId} />
          </FolderBrowser>
        </section>
      </div>
    </DragProvider>
  );
}
