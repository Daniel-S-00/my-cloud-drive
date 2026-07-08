'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useUpload } from '@/hooks/use-upload';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type FileUploadProps = {
  folderId: string | null;
  onUploadComplete?: () => void;
};

export function FileUpload({ folderId, onUploadComplete }: FileUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const {
    upload,
    isUploading,
    progress,
    error,
    reset,
    lastUploadedName,
    lastLocalName,
  } = useUpload({
    folderId,
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;
    setActiveFile(file);
    await upload(file);
    if (onUploadComplete) onUploadComplete();
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

  const onReset = () => {
    setActiveFile(null);
    reset();
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
          Drop a file to upload
        </p>
        <p className="text-sm text-text-secondary">or</p>
        <Button
          type="button"
          variant="primary"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={onChange}
          disabled={isUploading}
        />
      </div>

      {activeFile && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">
                {activeFile.name}
              </p>
              <p className="text-xs text-text-secondary">
                {formatBytes(activeFile.size)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={isUploading}
            >
              Reset
            </Button>
          </div>

          {(isUploading || progress > 0) && (
            <div className="flex flex-col gap-1">
              <Progress
                value={progress}
                ariaLabel={`Upload progress for ${activeFile.name}`}
              />
              <p className="text-xs text-text-secondary">{progress}% uploaded</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          {!isUploading && !error && progress === 100 && (
            <div className="flex flex-col gap-0.5">
              <p className="text-sm text-accent-glow">Upload complete.</p>
              {lastUploadedName &&
                lastLocalName &&
                lastUploadedName !== lastLocalName && (
                  <p className="text-xs text-text-secondary">
                    Uploaded as:{' '}
                    <span className="font-medium text-text-primary">
                      {lastUploadedName}
                    </span>
                  </p>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
