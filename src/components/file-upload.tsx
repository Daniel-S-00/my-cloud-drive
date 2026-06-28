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

  const { upload, isUploading, progress, error, reset } = useUpload({
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

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
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
            ? 'border-zinc-900 bg-zinc-100'
            : 'border-zinc-300 bg-zinc-50 hover:border-zinc-400',
        ].join(' ')}
      >
        <p className="text-base font-medium text-zinc-900">
          Drop a file to upload
        </p>
        <p className="text-sm text-zinc-500">or</p>
        <Button
          type="button"
          variant="default"
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
        <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900">
                {activeFile.name}
              </p>
              <p className="text-xs text-zinc-500">
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
              <p className="text-xs text-zinc-500">{progress}% uploaded</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          {!isUploading && !error && progress === 100 && (
            <p className="text-sm text-green-600">Upload complete.</p>
          )}
        </div>
      )}
    </div>
  );
}
