'use client';

import { useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { LayoutGrid, List } from 'lucide-react';
import { FolderDialogs, NewFolderTrigger } from '@/components/folder-row';
import { RootDropZone } from '@/components/root-drop-zone';
import { SelectionBar } from '@/components/selection-bar';
import { ShareDialog } from '@/components/share-dialog';
import { FolderDialogProvider } from '@/contexts/file-dialog-context';
import { MultiSelectProvider } from '@/contexts/multi-select-context';
import { SelectionProvider } from '@/contexts/selection-context';
import { ShareDialogProvider } from '@/contexts/share-dialog-context';
import { useViewMode } from '@/hooks/use-view-mode';

type FolderBrowserProps = {
  folderId: string | null;
  parentName: string;
  children: ReactNode;
  initialSelectedId?: string | null;
  breadcrumbs?: ReactNode;
};

function ListIcon({ className }: { className?: string }) {
  return <List className={className} aria-hidden />;
}

function GridIcon({ className }: { className?: string }) {
  return <LayoutGrid className={className} aria-hidden />;
}

function CleanHighlightParam() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!searchParams.has('highlight')) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('highlight');
    const query = params.toString();
    const clean = query ? `/?${query}` : '/';
    window.history.replaceState(null, '', clean);
  }, [searchParams]);

  return null;
}

export function FolderBrowser({
  folderId,
  parentName,
  children,
  initialSelectedId,
  breadcrumbs,
}: FolderBrowserProps) {
  const { viewMode, toggleViewMode } = useViewMode();

  return (
    <FolderDialogProvider>
      <ShareDialogProvider>
        <MultiSelectProvider key={folderId ?? 'root'}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              {breadcrumbs ?? (
                <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
                  Browse
                </h2>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleViewMode}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-bg-surface text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                  aria-label={
                    viewMode === 'list'
                      ? 'Switch to grid view'
                      : 'Switch to list view'
                  }
                  title={
                    viewMode === 'list'
                      ? 'Switch to grid view'
                      : 'Switch to list view'
                  }
                >
                  {viewMode === 'list' ? (
                    <GridIcon className="h-4 w-4" />
                  ) : (
                    <ListIcon className="h-4 w-4" />
                  )}
                </button>
                <NewFolderTrigger parentFolderId={folderId} />
              </div>
            </div>
            {folderId !== null && <RootDropZone />}
            <SelectionProvider
              key={initialSelectedId ?? 'root'}
              initialSelectedId={initialSelectedId}
            >
              {children}
              <CleanHighlightParam />
            </SelectionProvider>
          </div>
          <SelectionBar />
          <ShareDialog />
        </MultiSelectProvider>
      </ShareDialogProvider>
      <FolderDialogs parentFolderName={parentName} />
    </FolderDialogProvider>
  );
}
