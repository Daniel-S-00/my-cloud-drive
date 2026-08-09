// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  };
  return {
    db,
    deleteFromR2: vi.fn(),
  };
});

vi.mock('@/server/db/client', () => ({ db: hoisted.db }));
vi.mock('@/server/storage/r2', () => ({
  r2: { send: vi.fn() },
  R2_BUCKET: 'test-bucket',
  deleteFromR2: hoisted.deleteFromR2,
}));
vi.mock('server-only', () => ({}));

import { GET, POST } from './route';

function makeReq(secret?: string) {
  return {
    headers: new Headers(
      secret ? { authorization: `Bearer ${secret}` } : {},
    ),
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 's3cret');
  hoisted.deleteFromR2.mockResolvedValue(true);
  // Default: no expired files or folders. Individual tests override the
  // resolved values.
  hoisted.db.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  });
  hoisted.db.delete.mockImplementation(() => ({
    where: vi.fn().mockResolvedValue([]),
  }));
  hoisted.db.execute.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe('cleanup-trash cron', () => {
  it('rejects requests without a valid CRON_SECRET', async () => {
    const res = await POST(makeReq(undefined));
    expect(res.status).toBe(401);
    const res2 = await POST(makeReq('wrong'));
    expect(res2.status).toBe(401);
    // No DB work should happen for unauthorized calls.
    expect(hoisted.db.select).not.toHaveBeenCalled();
  });

  it('purges expired file rows and their R2 objects', async () => {
    hoisted.db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: 'f1', storageKey: 'k1' },
            { id: 'f2', storageKey: 'k2' },
          ]),
        }),
      }),
    });
    hoisted.db.execute.mockResolvedValue([]); // no expired folders

    const res = await GET(makeReq('s3cret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedFiles).toBe(2);
    expect(hoisted.deleteFromR2).toHaveBeenCalledWith('k1');
    expect(hoisted.deleteFromR2).toHaveBeenCalledWith('k2');
  });

  it('purges expired folders deepest-first', async () => {
    hoisted.db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]), // no expired files
        }),
      }),
    });
    hoisted.db.execute.mockResolvedValue([{ id: 'folder-a' }, { id: 'folder-b' }]);

    const res = await GET(makeReq('s3cret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedFolders).toBe(2);
  });

  it('keeps the row and reports an Error-based R2 failure', async () => {
    hoisted.db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'f1', storageKey: 'k1' }]),
        }),
      }),
    });
    hoisted.db.execute.mockResolvedValue([]);
    hoisted.deleteFromR2.mockRejectedValue(new Error('r2 down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(makeReq('s3cret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedFiles).toBe(0);
    expect(body.results).toContain('FAILED file f1: r2 down');
    expect(hoisted.db.delete).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('reports a non-Error R2 failure via String(err)', async () => {
    hoisted.db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'f1', storageKey: 'k1' }]),
        }),
      }),
    });
    hoisted.db.execute.mockResolvedValue([]);
    hoisted.deleteFromR2.mockRejectedValue('r2 down string'); // non-Error
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(makeReq('s3cret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedFiles).toBe(0);
    expect(body.results).toContain('FAILED file f1: r2 down string');
    expect(hoisted.db.delete).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('continues past a folder purge failure and reports it', async () => {
    hoisted.db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]), // no expired files
        }),
      }),
    });
    hoisted.db.execute.mockResolvedValue([
      { id: 'folder-ok' },
      { id: 'folder-fail' },
    ]);
    hoisted.db.delete.mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => {
        throw { notAnError: true }; // non-Error → String(err) branch
      }),
    }));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(makeReq('s3cret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedFolders).toBe(0);
    expect(body.results).toContain('FAILED folder folder-ok: [object Object]');
    expect(body.results).toContain('FAILED folder folder-fail: [object Object]');
    errSpy.mockRestore();
  });

  it('reports an Error-based folder failure via err.message', async () => {
    hoisted.db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]), // no expired files
        }),
      }),
    });
    hoisted.db.execute.mockResolvedValue([{ id: 'folder-fail' }]);
    hoisted.db.delete.mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => {
        throw new Error('fk restrict');
      }),
    }));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(makeReq('s3cret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedFolders).toBe(0);
    expect(body.results).toContain('FAILED folder folder-fail: fk restrict');
    errSpy.mockRestore();
  });
});
