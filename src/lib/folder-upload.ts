'use client';

import { ensureUploadFolder } from '@/app/actions/folder-upload';

export type FileWithTarget = {
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
export async function collectFilesFromEntries(
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

/**
 * Resolve a drag's DataTransfer into files-with-target-folder. Uses
 * `webkitGetAsEntry` when available so dropped folders preserve their
 * structure; falls back to a flat FileList otherwise.
 */
export async function resolveDragItems(
  dataTransfer: DataTransfer | null,
  currentFolderId: string | null,
): Promise<FileWithTarget[]> {
  if (!dataTransfer) return [];
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => Boolean(e));
  const out: FileWithTarget[] = [];
  if (entries.length > 0) {
    await collectFilesFromEntries(entries, currentFolderId, out, new Map());
  } else {
    for (const file of Array.from(dataTransfer.files)) {
      out.push({ file, folderId: currentFolderId });
    }
  }
  return out;
}

/**
 * Resolve a file input's selection into files-with-target-folder. Uses
 * `webkitEntries` (set when the input has webkitdirectory) so picked
 * folders preserve their structure; falls back to a flat FileList.
 */
export async function resolveFileInputItems(
  input: HTMLInputElement,
  currentFolderId: string | null,
): Promise<FileWithTarget[]> {
  const entries = Array.from(
    (input as HTMLInputElement & { webkitEntries?: FileSystemEntry[] })
      .webkitEntries ?? [],
  );
  const out: FileWithTarget[] = [];
  if (entries.length > 0) {
    await collectFilesFromEntries(entries, currentFolderId, out, new Map());
  } else {
    for (const file of Array.from(input.files ?? [])) {
      out.push({ file, folderId: currentFolderId });
    }
  }
  return out;
}
