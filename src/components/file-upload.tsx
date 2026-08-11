'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { ensureUploadFolder } from '@/app/actions/folder-upload';
import { useUpload } from '@/contexts/upload-context';

type FileUploadProps = {
  folderId: string | null;
};

type FileWithTarget = {
  file: File;
  /** The resolved destination folder id for this file. */
  folderId: string | null;
};

/**
 * Walk a FileSystemEntry tree and collect every file with the id of the
 * folder it should land in. Each directory level is resolved through
 * `ensureUploadFolder` (find-or-create, merge semantics), so nested
 * folder uploads preserve their structure and re-uploading a folder
 * merges into an existing one.
 */
async function collectFilesFromEntries(
  entries: FileSystemEntry[],
  currentFolderId: string | null,
  out: FileWithTarget[],
  seenFolders: Map<string, string>,
): Promise<void> {
  for (const entry of entries) {
    if (entry.isDirectory) {
      const fsEntry = entry as FileSystemDirectoryEntry;
      const resolved = seenFolders.get(entry.fullPath);
      let childFolderId = resolved ?? currentFolderId;
      if (!resolved) {
        const result = await ensureUploadFolder({
          name: entry.name,
          parentFolderId: currentFolderId,
        });
        childFolderId = result.folderId;
        seenFolders.set(entry.fullPath, childFolderId);
      }
      const reader = fsEntry.createReader();
      // readEntries returns up to 100 entries per call; loop until empty.
      let batch: FileSystemEntry[] = [];
      do {
        batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
          reader.readEntries(
            (entriesBatch) => resolve(entriesBatch),
            (err) => reject(err),
          );
        });
        await collectFilesFromEntries(batch, childFolderId, out, seenFolders);
      } while (batch.length > 0);
    } else if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) => {
        (entry as FileSystemFileEntry).file(resolve, () => resolve(null));
      });
      if (file) {
        out.push({ file, folderId: currentFolderId });
      }
    }
  }
}

export function FileUpload({ folderId }: FileUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { upload, isUploading } = useUpload();

  const handleItems = async (items: Array<File | FileSystemEntry>) => {
    const out: FileWithTarget[] = [];

    if (items.length > 0 && (items[0] as FileSystemEntry).isDirectory !== undefined) {
      // Drag from the OS: use webkitGetAsEntry to preserve folder structure.
      await collectFilesFromEntries(items as FileSystemEntry[], folderId, out, new Map());
    } else {
      // Plain file list (picker / folder picker without structure support).
      for (const item of items as File[]) {
        out.push({ file: item, folderId });
      }
    }

    for (const { file, folderId: targetFolderId } of out) {
      await upload(file, targetFolderId);
    }
    router.refresh();
  };

  const getDropItems = (event: DragEvent<HTMLDivElement>): Array<File | FileSystemEntry> => {
    const dt = event.dataTransfer;
    if (!dt) return [];
    const items = Array.from(dt.items ?? []);
    const entries = items
      .map((item) => item.webkitGetAsEntry?.())
      .filter((e): e is FileSystemEntry => Boolean(e));
    if (entries.length > 0) return entries;
    return Array.from(dt.files);
  };

  // The upload zone only accepts drops from outside the app (OS file
  // drags), which arrive with a `Files` entry in dataTransfer.types.
  // Internal move-drags carry `text/plain` instead. Without this
  // gate, dragging an existing file/folder to move it would be
  // intercepted by the upload zone whenever the cursor crossed it.
  const isExternalFileDrag = (
    event: DragEvent<HTMLDivElement>,
  ): boolean => {
    const types = event.dataTransfer?.types;
    if (!types) return false;
    for (const t of types) {
      // `Files` is the type Chromium sets for OS-level file drags.
      if (t === 'Files') return true;
    }
    return false;
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    setIsDragging(false);
    void handleItems(getDropItems(event));
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    setIsDragging(false);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const files = Array.from(input.files ?? []);
    const dirEntries = Array.from(
      (input as HTMLInputElement & { webkitEntries?: FileSystemEntry[] })
        .webkitEntries ?? [],
    );
    void handleItems(
      dirEntries.length > 0 ? dirEntries : files,
    );
    input.value = '';
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={[
          'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
          isDragging
            ? 'border-accent-glow bg-accent-primary/15 text-text-primary'
            : 'border-border-subtle bg-bg-surface text-text-secondary hover:border-accent-glow',
        ].join(' ')}
      >
        <p className="text-base font-medium text-text-primary">
          Drop files or folders to upload
        </p>
        <p className="text-sm text-text-secondary">or</p>
        <Button
          type="button"
          variant="primary"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? 'Uploading…' : 'Choose files or folders'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          // Directory picker: lets the user select whole folders in
          // Chromium/Firefox/Safari. Files-only pickers ignore it.
          {...({ webkitdirectory: '', directory: '' } as object)}
          className="hidden"
          onChange={onChange}
          disabled={isUploading}
        />
      </div>

      {isUploading && (
        <p className="text-sm text-text-secondary" role="status">
          Uploading — see progress in the status bar below.
        </p>
      )}
    </div>
  );
}
