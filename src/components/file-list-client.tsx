'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileDialogs,
  type FileDialogsFile,
  isViewableMedia,
} from '@/components/file-dialogs';
import { FileGrid, type FileGridFile } from '@/components/file-grid';
import { FileRow } from '@/components/file-row';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileDialogProvider, useFileDialogs } from '@/contexts/file-dialog-context';
import { useSelection } from '@/contexts/selection-context';
import { useViewMode } from '@/hooks/use-view-mode';

export type FileListRow = FileDialogsFile & {
  createdAt: string;
  uploadStatus: 'pending' | 'uploading' | 'complete' | 'failed';
  favorite?: boolean;
  existingShare?: { id: string; shareUrl: string; expiresAt: string | null } | null;
};

function FileTableView({
  rows,
  selectedId,
  onSelect,
  shouldScroll,
  animate,
}: {
  rows: FileListRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  shouldScroll: boolean;
  animate: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Name</TableHead>
          <TableHead scope="col" className="w-32">
            Size
          </TableHead>
          <TableHead scope="col" className="w-40">
            Uploaded
          </TableHead>
          <TableHead scope="col" className="w-56 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((file, index) => (
          <FileRow
            key={file.id}
            file={file}
            index={index}
            isSelected={selectedId === file.id}
            onSelect={onSelect}
            shouldScroll={shouldScroll}
            animate={animate}
          />
        ))}
      </TableBody>
    </Table>
  );
}

export function FileListClient({ rows }: { rows: FileListRow[] }) {
  const dialogFiles = useMemo<FileDialogsFile[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        thumbnailUrl: r.thumbnailUrl,
      })),
    [rows],
  );

  const mediaFiles = useMemo<FileDialogsFile[]>(
    () => dialogFiles.filter((f) => isViewableMedia(f.mimeType)),
    [dialogFiles],
  );

  const { viewMode } = useViewMode();
  const { selectedId, onSelect, shouldScroll } = useSelection();

  // Only play the staggered spawn entrance on the very first mount.
  // After the first commit we flip `animate` off so later navigations
  // (entering a folder / returning to root) swap rows without
  // replaying the per-item animation.
  const mountedRef = useRef(false);
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      setAnimate(false);
    }
  }, []);

  // No files in this folder: render nothing. The shared <FileListEmpty />
  // handles the combined "no folders, no files" hint, and an empty
  // folder with subfolders should just show the folder table.
  if (rows.length === 0) return null;

  return (
    <FileDialogProvider>
      <div
        key={viewMode}
        className="animate-in fade-in zoom-in-95 duration-300"
      >
        {viewMode === 'list' ? (
          <FileTableView
            rows={rows}
            selectedId={selectedId}
            onSelect={onSelect}
            shouldScroll={shouldScroll}
            animate={animate}
          />
        ) : (
          <FileGridWrapper
            rows={rows}
            selectedId={selectedId}
            onSelect={onSelect}
            shouldScroll={shouldScroll}
            animate={animate}
          />
        )}
      </div>
      <FileDialogs files={dialogFiles} mediaFiles={mediaFiles} />
    </FileDialogProvider>
  );
}

function FileGridWrapper({
  rows,
  selectedId,
  onSelect,
  shouldScroll,
  animate,
}: {
  rows: FileListRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  shouldScroll: boolean;
  animate: boolean;
}) {
  const { openPreviewDialog } = useFileDialogs();

  const gridFiles = useMemo<FileGridFile[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        mimeType: r.mimeType,
        thumbnailUrl: r.thumbnailUrl,
        uploadStatus: r.uploadStatus,
        favorite: r.favorite,
        existingShare: r.existingShare,
      })),
    [rows],
  );

  const handleOpen = (id: string) => {
    openPreviewDialog(id);
  };

  return (
    <FileGrid
      files={gridFiles}
      selectedId={selectedId}
      onSelect={onSelect}
      onOpen={handleOpen}
      shouldScroll={shouldScroll}
      animate={animate}
    />
  );
}
