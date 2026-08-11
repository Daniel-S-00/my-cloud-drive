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
  /** Number of files this batch represents (1 for single-file uploads). */
  fileCount: number;
  status: 'queued' | 'uploading' | 'complete' | 'error';
  progress: number;
  error?: string;
  uploadedAs?: string;
};

export type UploadFile = {
  file: File;
  folderId: string | null;
};

type UploadContextValue = {
  items: UploadItem[];
  isUploading: boolean;
  /** Aggregate progress across active items (0-100). */
  overallProgress: number;
  /**
   * Enqueue a single file. Runs as its own one-file batch so single
   * uploads keep their per-file progress + toast.
   */
  upload: (file: File, folderId: string | null) => Promise<void>;
  /**
   * Enqueue a group of files (e.g. a whole folder) as ONE status item.
   * Files are uploaded sequentially; progress and the completion toast
   * reflect the batch as a whole instead of one toast per file.
   */
  uploadBatch: (
    files: UploadFile[],
    label: string,
  ) => Promise<void>;
  clearCompleted: () => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

let nextId = 0;

export function UploadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const queueRef = useRef<
    Array<{ id: string; files: UploadFile[]; label: string }>
  >([]);
  const busyRef = useRef(false);

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...changes } : i)),
    );
  }, []);

  // Upload one FILE of a batch, returning the number of bytes uploaded
  // or throwing. Progress is reported via `onProgress` (0-100 for this
  // file). Reads/writes go through refs so a long upload doesn't
  // re-render the provider per tick.
  const uploadOneFile = useCallback(
    async (
      file: File,
      folderId: string | null,
      onProgress: (pct: number) => void,
    ): Promise<void> => {
      let pendingFileId: string | null = null;
      let pendingStorageKey: string | null = null;
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
              onProgress(pct);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              onProgress(100);
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

        if (wasRenamed) {
          toast.success('File renamed to avoid conflict', {
            description: `Uploaded "${file.name}" as "${fileName}".`,
          });
        }
      } catch (err) {
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
        throw err;
      }
    },
    [],
  );

  // Run one queued batch (one UploadItem) to completion, updating the
  // item's aggregate progress across its files.
  const runBatch = useCallback(
    async (
      id: string,
      files: UploadFile[],
      label: string,
    ): Promise<void> => {
      patch(id, { status: 'uploading', progress: 0 });
      const totalBytes = files.reduce((acc, f) => acc + f.file.size, 0);
      let uploadedBytes = 0;
      let errorCount = 0;
      let lastError: string | undefined;

      for (const { file, folderId } of files) {
        try {
          await uploadOneFile(file, folderId, (pct) => {
            // Approximate batch progress by the share this file's bytes
            // represent of the total batch.
            const fileBytes = Math.round((pct / 100) * file.size);
            const total = totalBytes || 1;
            patch(id, {
              progress: Math.round(
                ((uploadedBytes + fileBytes) / total) * 100,
              ),
            });
          });
          uploadedBytes += file.size;
        } catch (err) {
          errorCount++;
          lastError = err instanceof Error ? err.message : 'Upload failed';
          // Don't abort the rest of the batch on one file failure.
        }
      }

      if (errorCount > 0) {
        patch(id, { status: 'error', error: lastError });
        toast.error('Upload failed', {
          description: lastError ?? `Failed for ${errorCount} file(s).`,
        });
      } else {
        patch(id, { status: 'complete', progress: 100 });
        const n = files.length;
        toast.success(
          n === 1 ? 'Upload complete' : `${n} uploads complete`,
          { description: label },
        );
      }
    },
    [patch, uploadOneFile],
  );

  // Sequential worker: processes queued batches one at a time.
  const drain = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    while (busyRef.current) {
      const next = queueRef.current.shift();
      if (!next) {
        busyRef.current = false;
        break;
      }
      await runBatch(next.id, next.files, next.label);
    }
  }, [runBatch]);

  const enqueue = useCallback(
    (files: UploadFile[], label: string) => {
      const id = `upload-${++nextId}`;
      const totalBytes = files.reduce((acc, f) => acc + f.file.size, 0);
      setItems((prev) => [
        ...prev,
        {
          id,
          name: label,
          size: totalBytes,
          fileCount: files.length,
          status: 'queued',
          progress: 0,
        },
      ]);
      queueRef.current.push({ id, files, label });
      void drain();
      return id;
    },
    [drain],
  );

  const upload = useCallback(
    async (file: File, folderId: string | null) => {
      enqueue([{ file, folderId }], file.name);
    },
    [enqueue],
  );

  const uploadBatch = useCallback(
    async (files: UploadFile[], label: string) => {
      if (files.length === 0) return;
      if (files.length === 1) {
        enqueue(files, files[0].file.name);
        return;
      }
      enqueue(files, label);
    },
    [enqueue],
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
    () => ({
      items,
      isUploading,
      overallProgress,
      upload,
      uploadBatch,
      clearCompleted,
    }),
    [items, isUploading, overallProgress, upload, uploadBatch, clearCompleted],
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
