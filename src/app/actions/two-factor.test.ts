// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSync } from 'otplib';

// ── Hoisted mocks (external boundaries only) ─────────────────────────────
const hoisted = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];

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
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((obj: unknown) => {
        updateSetLog.push(obj);
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ attempts: 1 }]),
          }),
        };
      }),
    }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
  };

  const updateSetLog: unknown[] = [];

  return {
    db,
    updateSetLog,
    selectQueue,
    cookieStore: { get: vi.fn(), set: vi.fn() },
    headerStore: { get: vi.fn() },
    getCurrentUser: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock('@/server/db/client', () => ({ db: hoisted.db }));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(hoisted.cookieStore),
  headers: vi.fn().mockResolvedValue(hoisted.headerStore),
}));
vi.mock('next/cache', () => ({ revalidatePath: hoisted.revalidatePath }));
vi.mock('@/server/auth/session', () => ({
  getCurrentUser: hoisted.getCurrentUser,
}));

import {
  setup2FA,
  confirm2FA,
  verify2FALogin,
  disable2FA,
  get2FAStatus,
  regenerateBackupCodes,
} from '@/app/actions/two-factor';
import { encrypt } from '@/server/security/encryption';
import {
  generateSecret,
  generateBackupCodes,
  hashBackupCode,
} from '@/server/security/totp';

const VALID_KEY = 'b'.repeat(64);
const futureDate = () => new Date(Date.now() + 60_000);
const currentUser = { id: 'u1', email: 'a@b.c', name: null, image: null };

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.selectQueue.length = 0;
  hoisted.updateSetLog.length = 0;
  vi.stubEnv('TWO_FA_ENCRYPTION_KEY', VALID_KEY);
  vi.stubEnv('AUTH_SECRET', 'x'.repeat(64));
  hoisted.getCurrentUser.mockResolvedValue(currentUser);
  hoisted.cookieStore.get.mockReturnValue(null);
  hoisted.headerStore.get.mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('setup2FA', () => {
  it('[HARD gate] invalid/missing TWO_FA_ENCRYPTION_KEY -> ok:false, no throw, console.error', async () => {
    vi.stubEnv('TWO_FA_ENCRYPTION_KEY', '');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await setup2FA();
    expect(res.ok).toBe(false);
    expect(typeof res.message).toBe('string');
    expect(errSpy).toHaveBeenCalled();
    expect(hoisted.db.select).not.toHaveBeenCalled();
  });

  it('already enabled -> ok:false with a friendly message', async () => {
    hoisted.selectQueue.push([{ enabled: true }]);
    const res = await setup2FA();
    expect(res).toEqual({
      ok: false,
      message: 'Two-factor authentication is already enabled.',
    });
  });

  it('success with an existing not-enabled row -> updates the row', async () => {
    hoisted.selectQueue.push([{ enabled: false }]);
    const res = await setup2FA();

    expect(res.ok).toBe(true);
    expect(res.qrCodeImage).toMatch(/^data:image/);
    expect(typeof res.secret).toBe('string');
    expect(hoisted.db.update).toHaveBeenCalled();
    expect(hoisted.db.insert).not.toHaveBeenCalled();
  });

  it('success with no existing row -> inserts the row', async () => {
    hoisted.selectQueue.push([]);
    const res = await setup2FA();
    expect(res.ok).toBe(true);
    expect(hoisted.db.insert).toHaveBeenCalled();
  });

  it('uses "user" as the QR label when the account has no email', async () => {
    hoisted.getCurrentUser.mockResolvedValue({
      id: 'u1',
      email: null,
      name: null,
      image: null,
    });
    hoisted.selectQueue.push([]);
    const res = await setup2FA();
    expect(res.ok).toBe(true);
    expect(res.qrCodeImage).toMatch(/^data:image/);
  });

  it('[HARD gate] getCurrentUser throwing is caught -> ok:false, console.error', async () => {
    hoisted.getCurrentUser.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await setup2FA();
    expect(res.ok).toBe(false);
    expect(typeof res.message).toBe('string');
    expect(errSpy).toHaveBeenCalled();
  });
});

describe('confirm2FA', () => {
  it('no setup row -> ok:false', async () => {
    hoisted.selectQueue.push([]);
    const res = await confirm2FA('123456');
    expect(res).toEqual({
      ok: false,
      message: '2FA setup not started. Please try again.',
    });
  });

  it('already enabled -> ok:false', async () => {
    hoisted.selectQueue.push([{ secret: 'x', enabled: true }]);
    const res = await confirm2FA('123456');
    expect(res.ok).toBe(false);
  });

  it('[HARD gate] invalid token must NOT confirm (no truthiness leak)', async () => {
    const secret = generateSecret();
    hoisted.selectQueue.push([{ secret: encrypt(secret), enabled: false }]);

    const res = await confirm2FA('000000');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Invalid code. Please try again.');
    expect(hoisted.db.update).not.toHaveBeenCalled();
  });

  it('valid token -> ok:true, 10 backup codes persisted, revalidate', async () => {
    const secret = generateSecret();
    const token = generateSync({ secret });
    hoisted.selectQueue.push([{ secret: encrypt(secret), enabled: false }]);

    const res = await confirm2FA(token);
    expect(res.ok).toBe(true);
    expect(res.backupCodes).toHaveLength(10);
    expect(hoisted.db.update).toHaveBeenCalled();
    const set = hoisted.updateSetLog[0] as Record<string, unknown>;
    expect(set.enabled).toBe(true);
    expect(JSON.parse(set.backupCodes as string)).toHaveLength(10);
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/settings');
  });
});

describe('verify2FALogin', () => {
  it('no pending token and empty fallback -> ok:false', async () => {
    const res = await verify2FALogin('', '123456');
    expect(res).toEqual({
      ok: false,
      message: 'No pending verification. Please sign in again.',
    });
  });

  it('invalid/expired pending token -> ok:false, token not consumed', async () => {
    hoisted.cookieStore.get.mockReturnValue({ value: 'tok' });
    hoisted.selectQueue.push([]); // validatePendingToken -> null

    const res = await verify2FALogin('fallback', '123456');
    expect(res).toEqual({
      ok: false,
      message: 'Verification expired. Please sign in again.',
    });
    expect(hoisted.db.delete).not.toHaveBeenCalled();
  });

  it('no user2fa row -> ok:false and the pending token is consumed', async () => {
    hoisted.cookieStore.get.mockReturnValue({ value: 'tok' });
    hoisted.selectQueue.push([
      { userId: 'u1', attempts: 0, expiresAt: futureDate() },
    ]);
    hoisted.selectQueue.push([]); // user2fa -> no row

    const res = await verify2FALogin('fallback', '123456');
    expect(res).toEqual({
      ok: false,
      message: '2FA is not enabled for this account.',
    });
    expect(hoisted.db.delete).toHaveBeenCalled();
  });

  it('invalid code -> ok:false and attempts are incremented', async () => {
    hoisted.cookieStore.get.mockReturnValue({ value: 'tok' });
    const secret = generateSecret();
    hoisted.selectQueue.push([
      { userId: 'u1', attempts: 0, expiresAt: futureDate() },
    ]);
    hoisted.selectQueue.push([{ secret: encrypt(secret), backupCodes: null }]);

    const res = await verify2FALogin('fallback', '000000');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Invalid code. Please try again.');
    expect(hoisted.db.update).toHaveBeenCalled();
  });

  it('[HARD gate] valid TOTP code -> ok:true and session cookie is written', async () => {
    hoisted.cookieStore.get.mockReturnValue({ value: 'tok' });
    hoisted.headerStore.get.mockReturnValue(null); // no https proto
    const secret = generateSecret();
    const token = generateSync({ secret });
    hoisted.selectQueue.push([
      { userId: 'u1', attempts: 0, expiresAt: futureDate() },
    ]);
    hoisted.selectQueue.push([{ secret: encrypt(secret), backupCodes: null }]);
    hoisted.selectQueue.push([{ id: 'u1', email: 'a@b.c' }]);

    const res = await verify2FALogin('fallback', token);
    expect(res).toEqual({
      ok: true,
      message: 'Verification successful.',
      redirectUrl: '/drive',
    });
    expect(hoisted.cookieStore.set).toHaveBeenCalledWith(
      'authjs.session-token',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
    expect(hoisted.cookieStore.set).toHaveBeenCalledWith(
      'pending-2fa-token',
      '',
      expect.objectContaining({ maxAge: 0 }),
    );
    expect(hoisted.db.delete).toHaveBeenCalled(); // token consumed
  });

  it('valid backup code -> ok:true and the used code is spliced out', async () => {
    hoisted.cookieStore.get.mockReturnValue({ value: 'tok' });
    const secret = generateSecret();
    const codes = generateBackupCodes(10);
    const code = codes[2];
    hoisted.selectQueue.push([
      { userId: 'u1', attempts: 0, expiresAt: futureDate() },
    ]);
    hoisted.selectQueue.push([
      {
        secret: encrypt(secret),
        backupCodes: JSON.stringify(codes.map(hashBackupCode)),
      },
    ]);
    hoisted.selectQueue.push([{ id: 'u1', email: 'a@b.c' }]);

    const res = await verify2FALogin('fallback', code);
    expect(res.ok).toBe(true);

    const splice = hoisted.updateSetLog.find((l) => {
      const o = l as Record<string, unknown>;
      return typeof o.backupCodes === 'string';
    }) as { backupCodes: string } | undefined;
    expect(splice).toBeDefined();
    expect(JSON.parse(splice!.backupCodes)).toHaveLength(9);
  });

  it('backup code stored but not matching -> falls through to invalid', async () => {
    hoisted.cookieStore.get.mockReturnValue({ value: 'tok' });
    const secret = generateSecret();
    const codes = generateBackupCodes(2);
    hoisted.selectQueue.push([
      { userId: 'u1', attempts: 0, expiresAt: futureDate() },
    ]);
    hoisted.selectQueue.push([
      {
        secret: encrypt(secret),
        backupCodes: JSON.stringify(codes.map(hashBackupCode)),
      },
    ]);

    const res = await verify2FALogin('fallback', '99999999');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Invalid code. Please try again.');
  });

  it('missing AUTH_SECRET -> ok:false server-config error', async () => {
    vi.stubEnv('AUTH_SECRET', '');
    hoisted.cookieStore.get.mockReturnValue({ value: 'tok' });
    const secret = generateSecret();
    const token = generateSync({ secret });
    hoisted.selectQueue.push([
      { userId: 'u1', attempts: 0, expiresAt: futureDate() },
    ]);
    hoisted.selectQueue.push([{ secret: encrypt(secret), backupCodes: null }]);

    const res = await verify2FALogin('fallback', token);
    expect(res).toEqual({
      ok: false,
      message: 'Server configuration error. Please contact support.',
    });
  });

  it('dbUser lookup misses -> ok:false user-not-found', async () => {
    hoisted.cookieStore.get.mockReturnValue({ value: 'tok' });
    const secret = generateSecret();
    const token = generateSync({ secret });
    hoisted.selectQueue.push([
      { userId: 'u1', attempts: 0, expiresAt: futureDate() },
    ]);
    hoisted.selectQueue.push([{ secret: encrypt(secret), backupCodes: null }]);
    hoisted.selectQueue.push([]); // users -> no row

    const res = await verify2FALogin('fallback', token);
    expect(res).toEqual({
      ok: false,
      message: 'User not found. Please contact support.',
    });
  });

  it('https request -> __Secure- session cookie and stale bare cookie cleared', async () => {
    hoisted.cookieStore.get.mockReturnValue({ value: 'tok' });
    hoisted.headerStore.get.mockReturnValue('https');
    const secret = generateSecret();
    const token = generateSync({ secret });
    hoisted.selectQueue.push([
      { userId: 'u1', attempts: 0, expiresAt: futureDate() },
    ]);
    hoisted.selectQueue.push([{ secret: encrypt(secret), backupCodes: null }]);
    hoisted.selectQueue.push([{ id: 'u1', email: 'a@b.c' }]);

    const res = await verify2FALogin('fallback', token);
    expect(res.ok).toBe(true);
    expect(hoisted.cookieStore.set).toHaveBeenCalledWith(
      '__Secure-authjs.session-token',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, secure: true }),
    );
    expect(hoisted.cookieStore.set).toHaveBeenCalledWith(
      'authjs.session-token',
      '',
      expect.objectContaining({ maxAge: 0 }),
    );
  });
});

describe('disable2FA', () => {
  it('no row -> ok:false', async () => {
    hoisted.selectQueue.push([]);
    const res = await disable2FA('123456');
    expect(res.ok).toBe(false);
  });

  it('invalid code -> ok:false, nothing deleted', async () => {
    const secret = generateSecret();
    hoisted.selectQueue.push([{ secret: encrypt(secret), backupCodes: null }]);
    const res = await disable2FA('000000');
    expect(res.ok).toBe(false);
    expect(hoisted.db.delete).not.toHaveBeenCalled();
  });

  it('valid code -> ok:true and the row is deleted', async () => {
    const secret = generateSecret();
    const token = generateSync({ secret });
    hoisted.selectQueue.push([{ secret: encrypt(secret), backupCodes: null }]);
    const res = await disable2FA(token);
    expect(res).toEqual({
      ok: true,
      message: 'Two-factor authentication has been disabled.',
    });
    expect(hoisted.db.delete).toHaveBeenCalled();
  });

  it('valid backup code -> ok:true and the row is deleted', async () => {
    const secret = generateSecret();
    const codes = generateBackupCodes(3);
    hoisted.selectQueue.push([
      {
        secret: encrypt(secret),
        backupCodes: JSON.stringify(codes.map(hashBackupCode)),
      },
    ]);
    const res = await disable2FA(codes[1]);
    expect(res.ok).toBe(true);
    expect(hoisted.db.delete).toHaveBeenCalled();
  });
});

describe('get2FAStatus', () => {
  it('no row -> disabled with zero codes', async () => {
    hoisted.selectQueue.push([]);
    expect(await get2FAStatus()).toEqual({ enabled: false, backupCodeCount: 0 });
  });

  it('enabled with backup codes -> reports the count', async () => {
    hoisted.selectQueue.push([
      { enabled: true, backupCodes: JSON.stringify(['a', 'b', 'c']) },
    ]);
    expect(await get2FAStatus()).toEqual({ enabled: true, backupCodeCount: 3 });
  });

  it('enabled with no stored backup codes -> zero count', async () => {
    hoisted.selectQueue.push([{ enabled: true, backupCodes: null }]);
    expect(await get2FAStatus()).toEqual({ enabled: true, backupCodeCount: 0 });
  });
});

describe('regenerateBackupCodes', () => {
  it('no row -> ok:false', async () => {
    hoisted.selectQueue.push([]);
    const res = await regenerateBackupCodes('123456');
    expect(res.ok).toBe(false);
  });

  it('invalid code -> ok:false', async () => {
    const secret = generateSecret();
    hoisted.selectQueue.push([{ secret: encrypt(secret), enabled: true }]);
    const res = await regenerateBackupCodes('000000');
    expect(res.ok).toBe(false);
  });

  it('valid code -> ok:true with 10 new codes persisted', async () => {
    const secret = generateSecret();
    const token = generateSync({ secret });
    hoisted.selectQueue.push([{ secret: encrypt(secret), enabled: true }]);
    const res = await regenerateBackupCodes(token);
    expect(res.ok).toBe(true);
    expect(res.backupCodes).toHaveLength(10);
    expect(hoisted.db.update).toHaveBeenCalled();
  });
});
