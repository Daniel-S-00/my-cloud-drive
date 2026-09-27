// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const updateQueue: unknown[][] = [];
  const deleteQueue: unknown[][] = [];
  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => ({
          orderBy: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
          limit: vi.fn().mockResolvedValue([]),
        })),
      }),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
        returning: vi.fn().mockResolvedValue([
          { id: 'file_123' },
        ]),
      })),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockImplementation(() =>
            Promise.resolve(updateQueue.shift() ?? []),
          ),
        })),
      })),
    })),
    delete: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockImplementation(() =>
          Promise.resolve(deleteQueue.shift() ?? []),
        ),
      })),
    })),
  };
  return {
    db,
    updateQueue,
    deleteQueue,
    getCurrentUser: vi.fn(),
    getStorageQuota: vi.fn(),
    getSignedUrl: vi.fn(),
    generateUniqueFileName: vi.fn(),
    r2Send: vi.fn(),
  };
});

vi.mock('@/server/auth/session', () => ({
  getCurrentUser: hoisted.getCurrentUser,
  getOptionalUser: hoisted.getCurrentUser,
}));
vi.mock('@/server/db/client', () => ({ db: hoisted.db }));
vi.mock('@/server/billing/quota', () => ({
  getStorageQuota: hoisted.getStorageQuota,
}));
vi.mock('@/server/storage/r2', () => ({
  r2: { send: hoisted.r2Send },
  R2_BUCKET: 'test-bucket',
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: hoisted.getSignedUrl,
}));
vi.mock('@/lib/file-utils', () => ({
  generateUniqueFileName: hoisted.generateUniqueFileName,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  cancelUpload,
  confirmUpload,
  generateUploadUrl,
} from './upload';

const currentUser = {
  id: 'u1',
  email: 'user@example.com',
  name: null,
  image: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.updateQueue.length = 0;
  hoisted.deleteQueue.length = 0;
  hoisted.getCurrentUser.mockResolvedValue(currentUser);
  hoisted.getSignedUrl.mockResolvedValue('https://presigned.example.com/put');
  hoisted.generateUniqueFileName.mockResolvedValue('ok.bin');
  hoisted.r2Send.mockResolvedValue({ ContentLength: 42 });
});
afterEach(() => vi.unstubAllEnvs());

describe('generateUploadUrl quota guard', () => {
  it('blocks an upload that would exceed the quota', async () => {
    hoisted.getStorageQuota.mockResolvedValue({
      usedBytes: 900 * 1024 * 1024,
      quotaBytes: 1024 * 1024 * 1024,
    });
    await expect(
      generateUploadUrl({
        folderId: null,
        fileName: 'big.bin',
        sizeBytes: 200 * 1024 * 1024,
      }),
    ).rejects.toThrow(/Not enough storage/);
  });

  it('allows an upload within the quota and returns a presigned URL', async () => {
    hoisted.getStorageQuota.mockResolvedValue({
      usedBytes: 100 * 1024 * 1024,
      quotaBytes: 1024 * 1024 * 1024,
    });
    const result = await generateUploadUrl({
      folderId: null,
      fileName: 'ok.bin',
      sizeBytes: 10 * 1024 * 1024,
    });
    expect(result.presignedUrl).toBe('https://presigned.example.com/put');
    expect(result.fileId).toBe('file_123');
    expect(result.fileName).toBe('ok.bin');
  });

  it('rejects a folderId the user does not own', async () => {
    hoisted.getStorageQuota.mockResolvedValue({
      usedBytes: 0,
      quotaBytes: 1024 * 1024 * 1024,
    });
    // Folder lookup returns empty → not owned.
    hoisted.db.select.mockClear();
    // Need the folder select to return []. Re-point select to a queue.
    const folderQueue: unknown[][] = [[]];
    hoisted.db.select.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockImplementation(() =>
            Promise.resolve(folderQueue.shift() ?? []),
          ),
        })),
      }),
    }));
    await expect(
      generateUploadUrl({
        folderId: 'folder_1',
        fileName: 'x.bin',
        sizeBytes: 10,
      }),
    ).rejects.toThrow(/Folder not found/);
  });

  it('translates a unique-name violation into a friendly error', async () => {
    hoisted.getStorageQuota.mockResolvedValue({
      usedBytes: 0,
      quotaBytes: 1024 * 1024 * 1024,
    });
    // Force the insert path to throw a Postgres-style unique violation.
    hoisted.db.insert.mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
        returning: vi.fn().mockRejectedValue(
          Object.assign(new Error('duplicate'), {
            code: '23505',
            constraint: 'files_unique_name_per_folder',
          }),
        ),
      })),
    }));
    await expect(
      generateUploadUrl({
        folderId: null,
        fileName: 'dup.bin',
        sizeBytes: 10,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('rethrows a non-unique insert error', async () => {
    hoisted.getStorageQuota.mockResolvedValue({
      usedBytes: 0,
      quotaBytes: 1024 * 1024 * 1024,
    });
    hoisted.db.insert.mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
        returning: vi.fn().mockRejectedValue(new Error('db down')),
      })),
    }));
    await expect(
      generateUploadUrl({
        folderId: null,
        fileName: 'x.bin',
        sizeBytes: 10,
      }),
    ).rejects.toThrow('db down');
  });

  it('throws when no file row was inserted', async () => {
    hoisted.getStorageQuota.mockResolvedValue({
      usedBytes: 0,
      quotaBytes: 1024 * 1024 * 1024,
    });
    hoisted.db.insert.mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
        returning: vi.fn().mockResolvedValue([]),
      })),
    }));
    await expect(
      generateUploadUrl({
        folderId: null,
        fileName: 'x.bin',
        sizeBytes: 10,
      }),
    ).rejects.toThrow(/Failed to create file record/);
  });

  it('rejects a missing file name', async () => {
    hoisted.getStorageQuota.mockResolvedValue({
      usedBytes: 0,
      quotaBytes: 1024 * 1024 * 1024,
    });
    await expect(
      generateUploadUrl({ folderId: null, fileName: '', sizeBytes: 10 }),
    ).rejects.toThrow(/fileName is required/);
  });

  it('rejects an invalid file size', async () => {
    await expect(
      generateUploadUrl({ folderId: null, fileName: 'x.bin', sizeBytes: -1 }),
    ).rejects.toThrow(/Invalid file size/);
  });
});

describe('confirmUpload', () => {
  it('persists the authoritative R2 ContentLength, not a client number', async () => {
    hoisted.r2Send.mockResolvedValueOnce({ ContentLength: 1234 });
    hoisted.updateQueue.push([{ id: 'file_123', sizeBytes: 1234 }]);
    const result = await confirmUpload({
      fileId: 'file_123',
      storageKey: 'k',
      mimeType: 'text/plain',
    });
    expect(result).toEqual({
      fileId: 'file_123',
      uploadStatus: 'complete',
      sizeBytes: 1234,
    });
    // The size written to the row is what R2 reported via HEAD.
    const setArg = hoisted.db.update.mock.results[0].value.set.mock
      .calls[0][0] as { sizeBytes: number };
    expect(setArg.sizeBytes).toBe(1234);
  });

  it('throws when the object is not in storage', async () => {
    hoisted.r2Send.mockRejectedValueOnce(new Error('NotFound'));
    await expect(
      confirmUpload({ fileId: 'f', storageKey: 'k' }),
    ).rejects.toThrow(/not found in storage/);
  });

  it('blocks a confirmed upload whose real size exceeds the quota', async () => {
    hoisted.r2Send.mockResolvedValueOnce({
      ContentLength: 200 * 1024 * 1024,
    });
    hoisted.getStorageQuota.mockResolvedValue({
      usedBytes: 900 * 1024 * 1024,
      quotaBytes: 1024 * 1024 * 1024,
    });
    await expect(
      confirmUpload({ fileId: 'f', storageKey: 'k' }),
    ).rejects.toThrow(/Not enough storage/);
  });

  it('rejects an object over the 10 GiB limit', async () => {
    hoisted.r2Send.mockResolvedValueOnce({
      ContentLength: 11 * 1024 * 1024 * 1024,
    });
    await expect(
      confirmUpload({ fileId: 'f', storageKey: 'k' }),
    ).rejects.toThrow(/over the .* limit/);
  });

  it('throws when fileId or storageKey are missing', async () => {
    await expect(
      confirmUpload({ fileId: '', storageKey: '' }),
    ).rejects.toThrow(/required/);
  });

  it('throws when the row is not owned or missing', async () => {
    hoisted.updateQueue.push([]);
    await expect(
      confirmUpload({ fileId: 'f', storageKey: 'k' }),
    ).rejects.toThrow(/File not found/);
  });
});

describe('cancelUpload', () => {
  it('deletes the pending row and reports cancelled', async () => {
    hoisted.deleteQueue.push([{ id: 'file_123' }]);
    const result = await cancelUpload({
      fileId: 'file_123',
      storageKey: 'k',
    });
    expect(result).toEqual({ cancelled: true });
  });

  it('reports not-cancelled when nothing matched', async () => {
    hoisted.deleteQueue.push([]);
    const result = await cancelUpload({
      fileId: 'file_123',
      storageKey: 'k',
    });
    expect(result).toEqual({ cancelled: false });
  });

  it('throws when fileId or storageKey are missing', async () => {
    await expect(
      cancelUpload({ fileId: '', storageKey: '' }),
    ).rejects.toThrow(/required/);
  });
});
