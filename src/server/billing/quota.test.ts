// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const whereCalls: unknown[][] = [];
  const shiftResult = () => Promise.resolve(selectQueue.shift() ?? []);
  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((...args: unknown[]) => {
          whereCalls.push(args);
          const whereNode = {
            orderBy: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(shiftResult),
            })),
            then: (resolve: (v: unknown) => void) => resolve(shiftResult()),
          };
          return whereNode;
        }),
      }),
    })),
  };
  return { db, selectQueue, whereCalls, getOptionalUser: vi.fn() };
});

vi.mock('@/server/db/client', () => ({ db: hoisted.db }));
vi.mock('@/server/auth/session', () => ({
  getOptionalUser: hoisted.getOptionalUser,
  getCurrentUser: hoisted.getOptionalUser,
}));
vi.mock('server-only', () => ({}));

import { isPaidPlan, getStorageQuota } from './quota';
import { PLANS, FREE_STORAGE_BYTES } from './plans';

const user = { id: 'u1', email: 'a@b.c', name: null, image: null };
const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.selectQueue.length = 0;
  hoisted.whereCalls.length = 0;
  hoisted.getOptionalUser.mockResolvedValue(user);
});
afterEach(() => vi.unstubAllEnvs());

describe('isPaidPlan (soft landing)', () => {
  it('active plus is paid', () => {
    expect(isPaidPlan('active', 'plus', null)).toBe(true);
  });

  it('canceled plan with period still running stays paid', () => {
    expect(isPaidPlan('canceled', 'plus', future())).toBe(true);
  });

  it('canceled plan with expired period is not paid', () => {
    expect(isPaidPlan('canceled', 'plus', past())).toBe(false);
  });

  it('canceled plan with no period is not paid', () => {
    expect(isPaidPlan('canceled', 'plus', null)).toBe(false);
  });

  it('free plan is never paid', () => {
    expect(isPaidPlan('active', 'free', future())).toBe(false);
  });
});

describe('getStorageQuota', () => {
  it('returns free quota with overQuota=false when under', async () => {
    hoisted.selectQueue.push([{ total: 10 }]); // usage
    hoisted.selectQueue.push([]); // no subscription
    const q = await getStorageQuota();
    expect(q).toMatchObject({
      usedBytes: 10,
      quotaBytes: FREE_STORAGE_BYTES,
      plan: 'free',
      isPaid: false,
    });
    if (q) expect(q.overQuota).toBe(false);
  });

  it('flags overQuota when usage exceeds the quota', async () => {
    hoisted.selectQueue.push([{ total: PLANS.plus.storageBytes + 1 }]); // usage
    hoisted.selectQueue.push([
      { plan: 'plus', status: 'active', currentPeriodEnd: null },
    ]);
    const q = await getStorageQuota();
    expect(q?.quotaBytes).toBe(PLANS.plus.storageBytes);
    expect(q?.plan).toBe('plus');
    expect(q?.isPaid).toBe(true);
    expect(q?.overQuota).toBe(true);
  });

  it('keeps paid quota during the soft-landing period after cancel', async () => {
    hoisted.selectQueue.push([{ total: 10 }]); // usage
    hoisted.selectQueue.push([
      { plan: 'plus', status: 'canceled', currentPeriodEnd: future() },
    ]);
    const q = await getStorageQuota();
    expect(q?.quotaBytes).toBe(PLANS.plus.storageBytes);
    expect(q?.isPaid).toBe(true);
  });

  it('returns null for anonymous users', async () => {
    hoisted.getOptionalUser.mockResolvedValue(null);
    const q = await getStorageQuota();
    expect(q).toBeNull();
  });

  it('counts soft-deleted (trash) files toward usage — no delete/restore loop', async () => {
    // The usage query must NOT filter by deleted_at: trashed bytes still
    // occupy R2, so they must count against the quota (otherwise delete →
    // restore → delete gives unlimited storage).
    hoisted.selectQueue.push([{ total: 80 }]); // usage includes trashed
    hoisted.selectQueue.push([
      { plan: 'plus', status: 'active', currentPeriodEnd: null },
    ]);
    const q = await getStorageQuota();
    expect(q?.usedBytes).toBe(80);

    // First where call is the usage sum; serialize (skipping circular
    // table refs) and confirm it does not mention "deleted_at".
    const usageWhere = hoisted.whereCalls[0]?.[0] as unknown[];
    const serialized = JSON.stringify(usageWhere, (_k, v) => {
      if (v && typeof v === 'object' && 'table' in v && 'name' in v) {
        return `col:${(v as { name?: string }).name}`;
      }
      return v;
    });
    expect(serialized).not.toContain('deleted_at');
  });
});
