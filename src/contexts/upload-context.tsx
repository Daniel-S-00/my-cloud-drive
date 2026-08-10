'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import {
  cancelUpload,
  confirmUpload,
  generateUploadUrl,
} from '@/app/actions/upload';

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  status: 'queued' | 'uploading' | 'complete' | 'error';
  progress: number;
  error?: string;
  uploadedAs?: string;
};

type UploadContextValue = {
  items: UploadItem[];
  isUploading: boolean;
  /** Aggregate progress across active items (0-100). */
  overallProgress: number;
  upload: (file: File, folderId: string | null) => Promise<void>;
  clearCompleted: () => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

let nextId = 0;

export function UploadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const queueRef = useRef<
    Array<{ file: File; folderId: string | null; id: string }>
  >([]);
  const busyRef = useRef(false);

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...changes } : i)),
    );
  }, []);

  // Upload one item fully, updating progress via `patch`. Reads/writes go
  // through refs so a long upload doesn't re-render the provider per tick.
  const runItem = useCallback(
    async (file: File, folderId: string | null, id: string) => {
      let pendingFileId: string | null = null;
      let pendingStorageKey: string | null = null;

      patch(id, { status: 'uploading', progress: 0 });

      try {
        const { presignedUrl, storageKey, fileId, fileName, wasRenamed } =
          await generateUploadUrl({
            folderId,
            fileName: file.name,
            sizeBytes: file.size,
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
              patch(id, { progress: pct });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              patch(id, { progress: 100 });
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

        patch(id, { status: 'complete', progress: 100, uploadedAs: fileName });

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
        patch(id, { status: 'error', error: message });
        toast.error('Upload failed', { description: message });

        if (pendingFileId && pendingStorageKey) {
          try {
            await cancelUpload({
              fileId: pendingFileId,
              storageKey: pendingStorageKey,
              sizeBytes: file.size,
            });
          } catch {
            // Best-effort cleanup.
          }
        }
      }
    },
    [patch],
  );

  // Sequential worker: processes queued items one at a time. New uploads
  // enqueue behind the current one; the `busy` flag prevents double-runs.
  const drain = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    while (busyRef.current) {
      const next = queueRef.current.shift();
      if (!next) {
        busyRef.current = false;
        break;
      }
      await runItem(next.file, next.folderId, next.id);
    }
  }, [runItem]);

  const upload = useCallback(
    async (file: File, folderId: string | null) => {
      const id = `upload-${++nextId}`;
      setItems((prev) => [
        ...prev,
        {
          id,
          name: file.name,
          size: file.size,
          status: 'queued',
          progress: 0,
        },
      ]);
      queueRef.current.push({ file, folderId, id });
      void drain();
    },
    [drain],
  );

  const clearCompleted = useCallback(() => {
    setItems((prev) =>
      prev.filter((i) => i.status === 'queued' || i.status === 'uploading'),
    );
  }, []);

  const isUploading = items.some(
    (i) => i.status === 'queued' || i.status === 'uploading',
  );

  const overallProgress = useMemo(() => {
    const active = items.filter(
      (i) => i.status === 'queued' || i.status === 'uploading',
    );
    if (active.length === 0) return 0;
    const total = active.reduce((acc, i) => acc + i.progress, 0);
    return Math.round(total / active.length);
  }, [items]);

  const value = useMemo(
    () => ({ items, isUploading, overallProgress, upload, clearCompleted }),
    [items, isUploading, overallProgress, upload, clearCompleted],
  );

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return ctx;
}
