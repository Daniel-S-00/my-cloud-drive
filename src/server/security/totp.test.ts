// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { generateSync } from 'otplib';
import {
  generateSecret,
  generateQrCodeUrl,
  verifyToken,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
} from './totp';

describe('totp', () => {
  it('generateSecret returns a non-empty string', () => {
    const secret = generateSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);
  });

  // Pin de la regla [HARD]: NUNCA truthiness — el resultado debe ser un boolean estricto.
  it('returns a strict boolean (guards against `!= null` style checks)', () => {
    const secret = generateSecret();
    expect(typeof verifyToken(secret, '123456')).toBe('boolean');
  });

  it('rejects a token minted for a different secret', () => {
    const secretA = generateSecret();
    const secretB = generateSecret();
    const tokenForA = generateSync({ secret: secretA });
    expect(verifyToken(secretB, tokenForA)).toBe(false);
  });

  it('accepts a freshly generated valid token', () => {
    const secret = generateSecret();
    const token = generateSync({ secret });
    expect(verifyToken(secret, token)).toBe(true);
  });

  it('returns false (not throw) when otplib cannot process the secret', () => {
    // A too-short secret makes verifySync throw internally; verifyToken
    // must swallow that and return false rather than propagate.
    expect(verifyToken('abc', '123456')).toBe(false);
  });

  it('generateQrCodeUrl builds an otpauth URI with default app name', () => {
    const url = generateQrCodeUrl('KJSB3UPCXQ', 'user@example.com');
    expect(url).toBe(
      'otpauth://totp/My%20Cloud%20Drive:user%40example.com?secret=KJSB3UPCXQ&issuer=My%20Cloud%20Drive',
    );
  });

  it('generateQrCodeUrl honors a custom app name and URL-encodes it', () => {
    const url = generateQrCodeUrl('SECRET123', 'a b@c.com', 'My App & Co');
    expect(url).toBe(
      'otpauth://totp/My%20App%20%26%20Co:a%20b%40c.com?secret=SECRET123&issuer=My%20App%20%26%20Co',
    );
  });

  it('generateBackupCodes returns the requested count of unique 8-char codes', () => {
    const codes = generateBackupCodes(12);
    expect(codes).toHaveLength(12);
    expect(new Set(codes).size).toBe(12);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{8}$/);
    }
  });

  it('generateBackupCodes defaults to 10 codes', () => {
    expect(generateBackupCodes()).toHaveLength(10);
  });

  it('hashBackupCode is deterministic and produces a sha256 hex digest', () => {
    const h1 = hashBackupCode('ABC12345');
    const h2 = hashBackupCode('ABC12345');
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(hashBackupCode('ABC12346'));
  });

  it('verifyBackupCode returns the matching index and -1 for unknown codes', () => {
    const codes = generateBackupCodes(3);
    const hashed = codes.map(hashBackupCode);
    expect(verifyBackupCode(codes[1], hashed)).toBe(1);
    expect(verifyBackupCode('DEADBEEF', hashed)).toBe(-1);
  });
});
