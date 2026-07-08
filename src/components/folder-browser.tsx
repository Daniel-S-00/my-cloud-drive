'use client';

import { useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { FolderDialogs, NewFolderTrigger } from '@/components/folder-row';
import { RootDropZone } from '@/components/root-drop-zone';
import { FolderDialogProvider } from '@/contexts/file-dialog-context';
import { SelectionProvider } from '@/contexts/selection-context';
import { useViewMode } from '@/hooks/use-view-mode';

type FolderBrowserProps = {
  folderId: string | null;
  parentName: string;
  children: ReactNode;
  initialSelectedId?: string | null;
};

function ListIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
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

/**
 * The browse section of the drive page. Assumes it is rendered
 * inside a <DragProvider> (the page-level provider wraps the
 * breadcrumbs AND this component so that the breadcrumb drop zone
 * and the folder rows share the same drag state).
 */
export function FolderBrowser({
  folderId,
  parentName,
  children,
  initialSelectedId,
}: FolderBrowserProps) {
  const { viewMode, toggleViewMode } = useViewMode();

  return (
    <FolderDialogProvider>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
            Browse
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleViewMode}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-bg-surface text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              aria-label={
                viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'
              }
              title={
                viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'
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
        <SelectionProvider key={initialSelectedId ?? 'root'} initialSelectedId={initialSelectedId}>
          {children}
          <CleanHighlightParam />
        </SelectionProvider>
      </div>
      <FolderDialogs parentFolderName={parentName} />
    </FolderDialogProvider>
  );
}
