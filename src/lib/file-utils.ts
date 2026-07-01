import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '@/server/db/client';
import { files, folders } from '@/server/db/schema';

const EXT_REGEX = /\.([^.\\/]+)$/;
const SUFFIX_REGEX = /^(.+) \((\d+)\)$/;
const MAX_RENAME_ATTEMPTS = 10_000;

type SplitName = {
  base: string;
  ext: string;
};

/**
 * Split a filename into its base + extension pair. The extension
 * includes the leading dot (e.g. ".pdf") and is only present when the
 * filename has at least one character before the last dot. Filenames
 * without an extension, hidden files (".gitignore"), and trailing-dot
 * filenames return an empty `ext`.
 */
function splitName(name: string): SplitName {
  const match = name.match(EXT_REGEX);
  if (match && typeof match.index === 'number' && match.index > 0) {
    return {
      base: name.slice(0, match.index),
      ext: name.slice(match.index),
    };
  }
  return { base: name, ext: '' };
}

/**
 * Strip a trailing " (N)" suffix from a base name. Used to normalize
 * the base before computing the next available suffix, so that
 * uploading "report (1).pdf" when "report.pdf" already exists
 * becomes "report (2).pdf" (not "report (1) (1).pdf").
 */
function stripExistingSuffix(base: string): string {
  const match = base.match(SUFFIX_REGEX);
  return match && match[1] ? match[1] : base;
}

/**
 * Given the original full name, the stripped base, the original
 * extension, and the set of existing names (already lowercased),
 * return a name that does not collide with any existing entry.
 *
 * Behavior:
 *   - If `originalFullName` is identical to `strippedBase + ext`
 *     (i.e. no " (N)" suffix was stripped), return it as-is when
 *     free, otherwise append " (N)" with the lowest free N.
 *   - If a suffix WAS stripped, the input is normalized to the
 *     stripped form. The input's original N-suffixed name is
 *     treated as already taken so the algorithm allocates a fresh
 *     N — preventing confusing no-op results like
 *     "report (1).pdf" → "report (1).pdf" when only "report.pdf"
 *     exists.
 */
function pickAvailable(
  originalFullName: string,
  strippedBase: string,
  ext: string,
  existingLowercase: Set<string>,
): string {
  const taken = new Set(existingLowercase);
  const strippedFull = strippedBase + ext;
  const wasSuffixStripped = originalFullName !== strippedFull;
  if (wasSuffixStripped) {
    taken.add(originalFullName.toLowerCase());
  }
  if (!taken.has(strippedFull.toLowerCase())) {
    return strippedFull;
  }
  let attempt = 1;
  while (taken.has(`${strippedBase} (${attempt})${ext}`.toLowerCase())) {
    attempt += 1;
    if (attempt > MAX_RENAME_ATTEMPTS) {
      throw new Error(
        `Could not generate a unique name after ${MAX_RENAME_ATTEMPTS} attempts`,
      );
    }
  }
  return `${strippedBase} (${attempt})${ext}`;
}

async function fetchLiveFileNames(
  db: Database,
  ownerId: string,
  folderId: string | null,
): Promise<string[]> {
  const condition =
    folderId === null
      ? and(
          eq(files.ownerId, ownerId),
          isNull(files.folderId),
          isNull(files.deletedAt),
        )
      : and(
          eq(files.ownerId, ownerId),
          eq(files.folderId, folderId),
          isNull(files.deletedAt),
        );
  const rows = await db
    .select({ name: files.name })
    .from(files)
    .where(condition);
  return rows.map((r) => r.name);
}

async function fetchLiveFolderNames(
  db: Database,
  ownerId: string,
  parentId: string | null,
): Promise<string[]> {
  const condition =
    parentId === null
      ? and(
          eq(folders.ownerId, ownerId),
          isNull(folders.parentId),
          isNull(folders.deletedAt),
        )
      : and(
          eq(folders.ownerId, ownerId),
          eq(folders.parentId, parentId),
          isNull(folders.deletedAt),
        );
  const rows = await db
    .select({ name: folders.name })
    .from(folders)
    .where(condition);
  return rows.map((r) => r.name);
}

/**
 * Return a name that does not collide with any live file already in
 * the given folder for the given owner. The uniqueness check is
 * case-insensitive, matching the partial unique index
 * `files_unique_name_per_folder`.
 *
 * Examples (assuming "report.pdf" already exists):
 *   generateUniqueFileName(db, "report.pdf", folderId, ownerId)
 *     => "report (1).pdf"
 *   generateUniqueFileName(db, "report (1).pdf", folderId, ownerId)
 *     => "report (2).pdf"   (the existing " (1)" suffix is stripped)
 *
 * Examples for an empty folder:
 *   generateUniqueFileName(db, "report.pdf", folderId, ownerId)
 *     => "report.pdf"
 *   generateUniqueFileName(db, "README", folderId, ownerId)
 *     => "README"
 *   generateUniqueFileName(db, "archive.tar.gz", folderId, ownerId)
 *     => "archive.tar.gz"
 */
export async function generateUniqueFileName(
  db: Database,
  fileName: string,
  folderId: string | null,
  ownerId: string,
): Promise<string> {
  const { base, ext } = splitName(fileName);
  const strippedBase = stripExistingSuffix(base);
  const existing = await fetchLiveFileNames(db, ownerId, folderId);
  const existingLowercase = new Set(existing.map((n) => n.toLowerCase()));
  return pickAvailable(fileName, strippedBase, ext, existingLowercase);
}

/**
 * Folder-name counterpart to `generateUniqueFileName`. Same algorithm,
 * but queries the `folders` table under the given parent.
 */
export async function generateUniqueFolderName(
  db: Database,
  folderName: string,
  parentId: string | null,
  ownerId: string,
): Promise<string> {
  const { base, ext } = splitName(folderName);
  const strippedBase = stripExistingSuffix(base);
  const existing = await fetchLiveFolderNames(db, ownerId, parentId);
  const existingLowercase = new Set(existing.map((n) => n.toLowerCase()));
  return pickAvailable(folderName, strippedBase, ext, existingLowercase);
}
