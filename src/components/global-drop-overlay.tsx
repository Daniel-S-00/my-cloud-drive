'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useUpload } from '@/contexts/upload-context';

function UploadIcon({ className }: { className?: string }) {
  return <Upload className={className} aria-hidden />;
}

export function GlobalDropOverlay({
  folderId,
  currentFolderName = 'My Drive',
}: {
  folderId: string | null;
  currentFolderName?: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const { upload } = useUpload();

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    const types = Array.from(e.dataTransfer?.types || []);
    const isExternalFiles = types.includes('Files') && !types.includes('text/plain');
    if (!isExternalFiles) return;

    dragCounter.current++;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      dragCounter.current = 0;

      const droppedFiles = Array.from(e.dataTransfer?.files || []);
      if (droppedFiles.length === 0) return;

      if (droppedFiles.length > 1) {
        toast.info(`Uploading ${droppedFiles.length} files…`);
      }

      for (const file of droppedFiles) {
        await upload(file, folderId);
      }
    },
    [upload, folderId],
  );

  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragOver, handleDragLeave, handleDrop]);

  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/80 backdrop-blur-md border-4 border-dashed border-accent-glow rounded-none">
      <div className="flex flex-col items-center gap-4 text-text-primary px-6 text-center">
        <UploadIcon className="h-24 w-24 text-accent-glow" />
        <h2 className="text-3xl font-semibold">Drop files to upload</h2>
        <p className="text-text-secondary">
          Files will be uploaded to{' '}
          <span className="font-medium text-accent-glow">{currentFolderName}</span>
        </p>
      </div>
    </div>
  );
}
