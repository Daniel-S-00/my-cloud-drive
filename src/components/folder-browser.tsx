'use client';

import type { ReactNode } from 'react';
import { FolderDialogs, NewFolderTrigger } from '@/components/folder-row';
import { RootDropZone } from '@/components/root-drop-zone';
import { FolderDialogProvider } from '@/contexts/file-dialog-context';

type FolderBrowserProps = {
  folderId: string | null;
  parentName: string;
  children: ReactNode;
};

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
}: FolderBrowserProps) {
  return (
    <FolderDialogProvider>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Browse
          </h2>
          <NewFolderTrigger parentFolderId={folderId} />
        </div>
        {folderId !== null && <RootDropZone />}
        {children}
      </div>
      <FolderDialogs parentFolderName={parentName} />
    </FolderDialogProvider>
  );
}
