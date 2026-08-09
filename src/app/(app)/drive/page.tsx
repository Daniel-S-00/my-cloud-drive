import { Breadcrumbs } from '@/components/breadcrumbs';
import { FileList } from '@/components/file-list';
import { FolderBrowser } from '@/components/folder-browser';
import { FolderList } from '@/components/folder-list';
import { getFolderBreadcrumbs } from '@/app/actions/folders';
import { FileListEmpty } from '@/components/file-list-empty';
import { DragProvider } from '@/contexts/drag-context';
import { GlobalDropOverlay } from '@/components/global-drop-overlay';
import { UploadFab } from '@/components/upload-fab';
import { ItemActionDialogProvider } from '@/contexts/item-action-dialog-context';
import { ItemActionDialogs } from '@/components/item-action-dialogs';

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
      <ItemActionDialogProvider>
        <div className="flex flex-col px-4 py-6 sm:px-6">
          <FolderBrowser
            folderId={folderId}
            parentName={currentName}
            initialSelectedId={highlightId}
            breadcrumbs={<Breadcrumbs folderId={folderId} />}
          >
            <FolderList folderId={folderId} />
            <FileListEmpty folderId={folderId} />
            <FileList folderId={folderId} />
          </FolderBrowser>
        </div>
        <UploadFab folderId={folderId} />
        <GlobalDropOverlay folderId={folderId} currentFolderName={currentName} />
        <ItemActionDialogs />
      </ItemActionDialogProvider>
    </DragProvider>
  );
}
