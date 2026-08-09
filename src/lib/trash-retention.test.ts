// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TRASH_RETENTION_DAYS,
  PURGE_WARNING_DAYS,
  trashCutoff,
  daysRemaining,
  getAncestorFolderIds,
  getDescendantFolderIds,
  getDescendantFileIds,
} from './trash-retention';

const execute = vi.fn();

beforeEach(() => {
  execute.mockReset();
});

describe('trash retention constants', () => {
  it('keeps the documented retention window', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
    expect(PURGE_WARNING_DAYS).toBe(7);
  });
});

describe('trashCutoff', () => {
  it('is 30 days before the reference time', () => {
    const now = new Date('2026-08-09T00:00:00Z');
    const cutoff = trashCutoff(now);
    expect(cutoff.toISOString()).toBe('2026-07-10T00:00:00.000Z');
  });
});

describe('daysRemaining', () => {
  const now = new Date('2026-08-09T00:00:00Z').getTime();

  it('returns the full window when never deleted', () => {
    expect(daysRemaining(null, now)).toBe(TRASH_RETENTION_DAYS);
  });

  it('counts down from the deletion date', () => {
    const deleted = new Date('2026-07-25T00:00:00Z'); // 15 days ago
    expect(daysRemaining(deleted, now)).toBe(15);
  });

  it('handles a string deletedAt', () => {
    expect(daysRemaining('2026-07-25T00:00:00Z', now)).toBe(15);
  });

  it('never returns negative', () => {
    const old = new Date('2026-01-01T00:00:00Z');
    expect(daysRemaining(old, now)).toBe(0);
  });
});

describe('SQL subtree helpers', () => {
  const db = { execute };

  it('getAncestorFolderIds returns ids from the CTE', async () => {
    execute.mockResolvedValue([
      { id: 'parent' },
      { id: 'grandparent' },
    ]);
    const ids = await getAncestorFolderIds(db as never, 'child');
    expect(ids).toEqual(['parent', 'grandparent']);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('getDescendantFolderIds returns leaf-first ids', async () => {
    execute.mockResolvedValue([{ id: 'leaf' }, { id: 'root' }]);
    const ids = await getDescendantFolderIds(db as never, 'root');
    expect(ids).toEqual(['leaf', 'root']);
  });

  it('getDescendantFileIds returns matching file ids', async () => {
    execute.mockResolvedValue([{ id: 'file-1' }, { id: 'file-2' }]);
    const ids = await getDescendantFileIds(db as never, 'root');
    expect(ids).toEqual(['file-1', 'file-2']);
  });
});
