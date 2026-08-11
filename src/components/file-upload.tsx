'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useUpload } from '@/contexts/upload-context';
import { resolveDragItems, resolveFileInputItems } from '@/lib/folder-upload';

type FileUploadProps = {
  folderId: string | null;
};

export function FileUpload({ folderId }: FileUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { uploadBatch, isUploading } = useUpload();

  const handleItems = async (items: Array<{ file: File; folderId: string | null }>) => {
    if (items.length === 0) return;
    const topLevels = new Set(
      items
        .map((r) => r.file.webkitRelativePath?.split('/')[0])
        .filter(Boolean),
    );
    const label =
      topLevels.size === 1
        ? (topLevels.values().next().value as string)
        : `Upload (${items.length} files)`;
    await uploadBatch(items, label);
    router.refresh();
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
    void resolveDragItems(event.dataTransfer, folderId).then(handleItems);
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
    void resolveFileInputItems(input, folderId).then(handleItems);
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
