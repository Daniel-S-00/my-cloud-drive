'use client';

import { useMemo } from 'react';
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
import { useDragContext } from '@/contexts/drag-context';
import { useSelection } from '@/contexts/selection-context';
import { useViewMode } from '@/hooks/use-view-mode';

export type FileListRow = FileDialogsFile & {
  createdAt: string;
  uploadStatus: 'pending' | 'uploading' | 'complete' | 'failed';
};

function FileTableView({
  rows,
  selectedId,
  onSelect,
}: {
  rows: FileListRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead
            scope="col"
            className="w-9 px-1"
            aria-label="Drag handle"
          >
            <span className="sr-only">Drag handle</span>
          </TableHead>
          <TableHead scope="col">Name</TableHead>
          <TableHead scope="col" className="w-32">
            Size
          </TableHead>
          <TableHead scope="col" className="w-40">
            Uploaded
          </TableHead>
          <TableHead scope="col" className="w-32">
            Status
          </TableHead>
          <TableHead scope="col" className="w-44 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            isSelected={selectedId === file.id}
            onSelect={onSelect}
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
  const { selectedId, onSelect } = useSelection();

  return (
    <FileDialogProvider>
      {viewMode === 'list' ? (
        <FileTableView
          rows={rows}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        <FileGridWrapper
          rows={rows}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
      <FileDialogs files={dialogFiles} mediaFiles={mediaFiles} />
    </FileDialogProvider>
  );
}

function FileGridWrapper({
  rows,
  selectedId,
  onSelect,
}: {
  rows: FileListRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { openPreviewDialog } = useFileDialogs();
  const { isMoving } = useDragContext();

  const gridFiles = useMemo<FileGridFile[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        mimeType: r.mimeType,
        thumbnailUrl: r.thumbnailUrl,
        uploadStatus: r.uploadStatus,
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
      isMoving={isMoving}
    />
  );
}
