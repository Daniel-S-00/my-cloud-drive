'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useUpload } from '@/contexts/upload-context';

type FileUploadProps = {
  folderId: string | null;
};

export function FileUpload({ folderId }: FileUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { upload, isUploading } = useUpload();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      await upload(file, folderId);
    }
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
    void handleFiles(event.dataTransfer.files);
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
    void handleFiles(event.target.files);
    event.target.value = '';
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
          Drop files to upload
        </p>
        <p className="text-sm text-text-secondary">or</p>
        <Button
          type="button"
          variant="primary"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? 'Uploading…' : 'Choose file'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
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
