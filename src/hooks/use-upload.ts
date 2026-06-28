'use client';

import { useCallback, useState } from 'react';
import { confirmUpload, generateUploadUrl } from '@/app/actions/upload';

export type UseUploadInput = {
  folderId: string | null;
};

export type UseUploadState = {
  isUploading: boolean;
  progress: number;
  error: string | null;
};

export type UseUploadReturn = UseUploadState & {
  upload: (file: File) => Promise<void>;
  reset: () => void;
};

export function useUpload({ folderId }: UseUploadInput): UseUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  const upload = useCallback(
    async (file: File) => {
      reset();
      setIsUploading(true);
      setProgress(0);

      try {
        const { presignedUrl, storageKey, fileId } = await generateUploadUrl({
          folderId,
          fileName: file.name,
        });

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
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown upload error';
        setError(message);
      } finally {
        setIsUploading(false);
      }
    },
    [folderId, reset],
  );

  return { isUploading, progress, error, upload, reset };
}
