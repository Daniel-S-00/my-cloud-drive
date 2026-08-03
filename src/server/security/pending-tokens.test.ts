// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const db = {
    delete: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  };

  // Configurables per-test: what each terminal resolves to.
  const selectResult = { rows: [] as unknown[], next: [] as unknown[] };
  const updateResult = { attempts: 0 };
  const deleteLog: unknown[] = [];

  db.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(selectResult.next.shift() ?? selectResult.rows),
      }),
    }),
  }));
  db.insert.mockImplementation(() => ({
    values: vi.fn().mockResolvedValue([]),
  }));
  db.update.mockImplementation(() => ({
    set: () => ({
      where: () => ({
        returning: vi.fn().mockImplementation(() => {
          const row = { attempts: updateResult.attempts };
          if (Array.isArray(updateResult.attempts)) {
            return Promise.resolve(updateResult.attempts);
          }
          return Promise.resolve([row]);
        }),
      }),
    }),
  }));
  db.delete.mockImplementation((table: unknown) => {
    deleteLog.push(table);
    return { where: vi.fn().mockResolvedValue([]) };
  });

  return { db, selectResult, updateResult, deleteLog };
});

vi.mock('@/server/db/client', () => ({ db: hoisted.db }));
vi.mock('nanoid', () => ({ nanoid: () => 'mocked-token-1234567890abcdef' }));

import {
  generatePendingToken,
  validatePendingToken,
  incrementPendingTokenAttempts,
  consumePendingToken,
} from './pending-tokens';

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.selectResult.rows = [];
  hoisted.selectResult.next = [];
  hoisted.deleteLog.length = 0;
});

afterEach(() => vi.restoreAllMocks());

const futureDate = () => new Date(Date.now() + 60_000);
const expiredDate = () => new Date(Date.now() - 60_000);

describe('generatePendingToken', () => {
  it('cleans up expired tokens, inserts a fresh one and returns the token', async () => {
    hoisted.selectResult.rows = [];

    const token = await generatePendingToken('u1');

    expect(hoisted.db.delete).toHaveBeenCalled(); // cleanup of expired tokens
    expect(hoisted.db.insert).toHaveBeenCalled();

    expect(token).toBe('mocked-token-1234567890abcdef');

    // Assert the values object handed to .values()
    const insertMock = vi.mocked(hoisted.db.insert);
    const chain = insertMock.mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const valuesArg = chain.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(valuesArg).toMatchObject({ token, userId: 'u1', attempts: 0 });
    expect(valuesArg.expiresAt).toBeInstanceOf(Date);
    expect((valuesArg.expiresAt as Date).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('validatePendingToken', () => {
  it('returns null when no row exists', async () => {
    hoisted.selectResult.rows = [];
    expect(await validatePendingToken('tok')).toBeNull();
  });

  it('returns null when the token is expired', async () => {
    hoisted.selectResult.rows = [
      { userId: 'u1', attempts: 1, expiresAt: expiredDate() },
    ];
    expect(await validatePendingToken('tok')).toBeNull();
  });

  it('returns userId and attempts for a valid, unexpired token', async () => {
    hoisted.selectResult.rows = [
      { userId: 'u1', attempts: 2, expiresAt: futureDate() },
    ];
    expect(await validatePendingToken('tok')).toEqual({ userId: 'u1', attempts: 2 });
  });
});

describe('incrementPendingTokenAttempts', () => {
  it('deletes the token once attempts reach the cap', async () => {
    hoisted.updateResult.attempts = 5;

    await incrementPendingTokenAttempts('tok');

    expect(hoisted.db.delete).toHaveBeenCalledTimes(1);
    expect(hoisted.deleteLog).toHaveLength(1);
  });

  it('keeps the token when attempts are below the cap', async () => {
    hoisted.updateResult.attempts = 2;

    await incrementPendingTokenAttempts('tok');

    expect(hoisted.db.delete).not.toHaveBeenCalled();
  });
});

describe('consumePendingToken', () => {
  it('deletes the token', async () => {
    await consumePendingToken('tok');
    expect(hoisted.db.delete).toHaveBeenCalledTimes(1);
    expect(hoisted.deleteLog).toHaveLength(1);
  });
});
