'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  cancelUpload,
  confirmUpload,
  generateUploadUrl,
} from '@/app/actions/upload';

export type UseUploadInput = {
  folderId: string | null;
};

export type UseUploadState = {
  isUploading: boolean;
  progress: number;
  error: string | null;
};

export type UseUploadResult = {
  // The name actually stored in the database after the most recent
  // successful upload. May differ from the local file name when a
  // collision was resolved with an auto-generated suffix. Reset on
  // `reset()` or the start of a new upload.
  lastUploadedName: string | null;
  // The local file name of the most recently uploaded file, kept
  // alongside `lastUploadedName` so the UI can show the original
  // (e.g. "Uploaded as: <name>") when the two differ.
  lastLocalName: string | null;
};

export type UseUploadReturn = UseUploadState & UseUploadResult & {
  upload: (file: File) => Promise<void>;
  reset: () => void;
};

export function useUpload({ folderId }: UseUploadInput): UseUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastUploadedName, setLastUploadedName] = useState<string | null>(null);
  const [lastLocalName, setLastLocalName] = useState<string | null>(null);

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
    setLastUploadedName(null);
    setLastLocalName(null);
  }, []);

  const upload = useCallback(
    async (file: File) => {
      reset();
      setIsUploading(true);
      setProgress(0);

      let pendingFileId: string | null = null;
      let pendingStorageKey: string | null = null;

      try {
        const { presignedUrl, storageKey, fileId, fileName, wasRenamed } =
          await generateUploadUrl({
            folderId,
            fileName: file.name,
          });
        pendingFileId = fileId;
        pendingStorageKey = storageKey;

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', presignedUrl, true);
          xhr.setRequestHeader(
            'Content-Type',
            file.type || 'application/octet-stream',
          );

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const pct = Math.round((event.loaded / event.total) * 100);
              setProgress(pct);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setProgress(100);
              resolve();
            } else {
              reject(
                new Error(
                  `Upload to R2 failed: ${xhr.status} ${xhr.statusText}`,
                ),
              );
            }
          };

          xhr.onerror = () => {
            reject(new Error('Network error while uploading to R2'));
          };

          xhr.onabort = () => {
            reject(new Error('Upload aborted'));
          };

          xhr.send(file);
        });

        await confirmUpload({
          fileId,
          storageKey,
          sizeBytes: file.size,
          mimeType: file.type || undefined,
        });

        setLastUploadedName(fileName);
        setLastLocalName(file.name);

        if (wasRenamed) {
          toast.success('File renamed to avoid conflict', {
            description: `Uploaded "${file.name}" as "${fileName}".`,
          });
        } else {
          toast.success('Upload complete', { description: fileName });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown upload error';
        setError(message);
        toast.error('Upload failed', { description: message });

        // The R2 upload failed before confirmUpload ran, so the pending
        // DB row would linger as a 0-byte ghost file. Remove it.
        if (pendingFileId && pendingStorageKey) {
          try {
            await cancelUpload({
              fileId: pendingFileId,
              storageKey: pendingStorageKey,
              sizeBytes: file.size,
            });
          } catch {
            // Best-effort cleanup; a lingering row is handled by the
            // delete action, which is now enabled for pending files.
          }
        }
      } finally {
        setIsUploading(false);
      }
    },
    [folderId, reset],
  );

  return {
    isUploading,
    progress,
    error,
    lastUploadedName,
    lastLocalName,
    upload,
    reset,
  };
}
