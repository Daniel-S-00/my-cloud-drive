// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt } from './encryption';

const VALID_KEY = 'a'.repeat(64);

beforeEach(() => {
  vi.stubEnv('TWO_FA_ENCRYPTION_KEY', VALID_KEY);
});
afterEach(() => vi.unstubAllEnvs());

describe('encryption (aes-256-gcm)', () => {
  it('round-trips empty, unicode and large payloads', () => {
    for (const plain of ['', 'ñandú 🦫 秘密', 'x'.repeat(1_000_000)]) {
      expect(decrypt(encrypt(plain))).toBe(plain);
    }
  });

  it('produces distinct ciphertexts for the same plaintext (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('throws on malformed / tampered input rather than returning garbage', () => {
    expect(() => decrypt('definitely-not-valid')).toThrow();
  });

  it('throws when the auth tag is tampered (aes-gcm authenticity check)', () => {
    const [iv, tag, data] = encrypt('attack at dawn').split(':');
    const flipped = tag.startsWith('0') ? `1${tag.slice(1)}` : `0${tag.slice(1)}`;
    expect(() => decrypt(`${iv}:${flipped}:${data}`)).toThrow();
  });

  it('throws a clear error when TWO_FA_ENCRYPTION_KEY is unset', () => {
    vi.stubEnv('TWO_FA_ENCRYPTION_KEY', '');
    expect(() => encrypt('x')).toThrow(/64-character hex string/);
    expect(() => decrypt('aa:bb:cc')).toThrow(/64-character hex string/);
  });

  it('throws a clear error when TWO_FA_ENCRYPTION_KEY has the wrong length', () => {
    vi.stubEnv('TWO_FA_ENCRYPTION_KEY', 'abc');
    expect(() => encrypt('x')).toThrow(/64-character hex string/);
  });
});
