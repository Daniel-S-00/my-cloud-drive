'use client';

import { FileDialogs, type FileDialogsFile } from '@/components/file-dialogs';
import { FileRow } from '@/components/file-row';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileDialogProvider } from '@/contexts/file-dialog-context';

export type FileListRow = FileDialogsFile & {
  createdAt: string;
  uploadStatus: 'pending' | 'uploading' | 'complete' | 'failed';
};

export function FileListClient({ rows }: { rows: FileListRow[] }) {
  return (
    <FileDialogProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-32">Size</TableHead>
            <TableHead className="w-40">Uploaded</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-44 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((file) => (
            <FileRow key={file.id} file={file} />
          ))}
        </TableBody>
      </Table>
      <FileDialogs
        files={rows.map((r) => ({
          id: r.id,
          name: r.name,
          mimeType: r.mimeType,
          sizeBytes: r.sizeBytes,
        }))}
      />
    </FileDialogProvider>
  );
}
