// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const insertValuesLog: unknown[] = [];

  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() =>
            Promise.resolve(selectQueue.shift() ?? []),
          ),
        }),
      }),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((v: unknown) => {
        insertValuesLog.push(v);
        return { returning: vi.fn().mockResolvedValue([]) };
      }),
    })),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockResolvedValue({}) }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    execute: vi.fn().mockResolvedValue([]),
  };

  return {
    db,
    selectQueue,
    insertValuesLog,
    getCurrentUser: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock('@/server/auth/session', () => ({
  getCurrentUser: hoisted.getCurrentUser,
}));
vi.mock('@/server/db/client', () => ({ db: hoisted.db }));
vi.mock('@/server/storage/r2', () => ({
  deleteFromR2: vi.fn().mockResolvedValue(true),
  r2: { send: vi.fn() },
  R2_BUCKET: 'test-bucket',
}));
vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePath,
}));
vi.mock('server-only', () => ({}));

import { ensureUploadFolder } from './folder-upload';

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.selectQueue.length = 0;
  hoisted.insertValuesLog.length = 0;
  hoisted.getCurrentUser.mockResolvedValue({ id: 'u1', email: null, name: null, image: null });
});
afterEach(() => vi.unstubAllEnvs());

describe('ensureUploadFolder', () => {
  it('creates a new folder when none exists under the parent', async () => {
    // First select: loadOwnedFolderOrThrow validates the parent exists.
    hoisted.selectQueue.push([{ id: 'parent-1', ownerId: 'u1', deletedAt: null }]);
    // Second select: no folder with this name exists yet.
    hoisted.selectQueue.push([]);
    hoisted.db.insert.mockReturnValue({
      values: vi.fn().mockImplementation((v: unknown) => {
        hoisted.insertValuesLog.push(v);
        return { returning: vi.fn().mockResolvedValue([{ id: 'new-folder-1' }]) };
      }),
    });

    const result = await ensureUploadFolder({
      name: 'Photos',
      parentFolderId: 'parent-1',
    });

    expect(result).toEqual({ folderId: 'new-folder-1', existed: false });
    expect(hoisted.insertValuesLog[0]).toMatchObject({
      ownerId: 'u1',
      parentId: 'parent-1',
      name: 'Photos',
    });
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/drive');
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/drive?folder=parent-1');
  });

  it('reuses an existing folder with the same name (merge upload)', async () => {
    hoisted.selectQueue.push([{ id: 'existing-folder-1' }]);

    const result = await ensureUploadFolder({
      name: 'Photos',
      parentFolderId: null,
    });

    expect(result).toEqual({ folderId: 'existing-folder-1', existed: true });
    expect(hoisted.db.insert).not.toHaveBeenCalled();
  });

  it('matches existing folders case-insensitively', async () => {
    hoisted.selectQueue.push([{ id: 'existing-folder-1' }]);

    const result = await ensureUploadFolder({
      name: 'photos',
      parentFolderId: null,
    });

    expect(result).toEqual({ folderId: 'existing-folder-1', existed: true });
    const whereArg = hoisted.db.select.mock.calls[0];
    expect(whereArg).toBeTruthy();
  });

  it('rejects an empty name', async () => {
    await expect(
      ensureUploadFolder({ name: '   ', parentFolderId: null }),
    ).rejects.toThrow('Folder name cannot be empty');
    expect(hoisted.db.insert).not.toHaveBeenCalled();
  });

  it('rejects names with path separators', async () => {
    await expect(
      ensureUploadFolder({ name: 'a/b', parentFolderId: null }),
    ).rejects.toThrow('cannot contain /');
    expect(hoisted.db.insert).not.toHaveBeenCalled();
  });

  it('throws for unauthenticated users', async () => {
    hoisted.getCurrentUser.mockRejectedValue(new Error('UNAUTHORIZED'));
    await expect(
      ensureUploadFolder({ name: 'Photos', parentFolderId: null }),
    ).rejects.toThrow('UNAUTHORIZED');
  });
});
