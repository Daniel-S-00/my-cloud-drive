/**
 * Trash retention policy constants and helpers.
 *
 * This module is intentionally free of any "use server" directive so it
 * can be imported from both server actions and Server Components. The
 * "use server" rule forbids exporting non-async values (constants,
 * sync functions) from a server-action file, so this file is the
 * canonical home for the retention policy.
 */

export const TRASH_RETENTION_DAYS = 30;
export const PURGE_WARNING_DAYS = 7;

export function trashCutoff(now: Date = new Date()): Date {
  return new Date(
    now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function daysRemaining(deletedAt: Date | string | null, now: number = Date.now()): number {
  if (!deletedAt) return TRASH_RETENTION_DAYS;
  const ms =
    typeof deletedAt === 'string' ? new Date(deletedAt).getTime() : deletedAt.getTime();
  return Math.max(0, TRASH_RETENTION_DAYS - Math.floor((now - ms) / (24 * 60 * 60 * 1000)));
}
