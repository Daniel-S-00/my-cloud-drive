import { generateSecret as otpGenerateSecret, verify, verifySync } from 'otplib';
import { randomBytes, createHash } from 'crypto';

const WINDOW = 30;

export function generateSecret(): string {
  return otpGenerateSecret();
}

export function generateQrCodeUrl(
  secret: string,
  email: string,
  appName = 'My Cloud Drive',
): string {
  return `otpauth://totp/${encodeURIComponent(appName)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(appName)}`;
}

export function verifyToken(secret: string, token: string): boolean {
  try {
    const result = verifySync({
      secret,
      token,
      epochTolerance: WINDOW,
    });
    return result != null;
  } catch {
    return false;
  }
}

export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(6)
      .toString('hex')
      .slice(0, 8)
      .toUpperCase(),
  );
}

export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function verifyBackupCode(
  code: string,
  hashedCodes: string[],
): number {
  const hash = hashBackupCode(code);
  return hashedCodes.indexOf(hash);
}
