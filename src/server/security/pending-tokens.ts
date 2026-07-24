import { nanoid } from 'nanoid';
import { eq, lte, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { pending2faVerifications } from '@/server/db/schema';

const PENDING_TOKEN_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

export async function generatePendingToken(
  userId: string,
): Promise<string> {
  // Clean up expired tokens first.
  await db
    .delete(pending2faVerifications)
    .where(lte(pending2faVerifications.expiresAt, new Date()));

  const token = nanoid(32);
  const expiresAt = new Date(
    Date.now() + PENDING_TOKEN_TTL_MINUTES * 60 * 1000,
  );

  await db.insert(pending2faVerifications).values({
    token,
    userId,
    expiresAt,
    attempts: 0,
  });

  return token;
}

export async function validatePendingToken(
  token: string,
): Promise<{ userId: string; attempts: number } | null> {
  const [row] = await db
    .select({
      userId: pending2faVerifications.userId,
      attempts: pending2faVerifications.attempts,
      expiresAt: pending2faVerifications.expiresAt,
    })
    .from(pending2faVerifications)
    .where(eq(pending2faVerifications.token, token))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  return { userId: row.userId, attempts: row.attempts };
}

export async function incrementPendingTokenAttempts(
  token: string,
): Promise<void> {
  const [row] = await db
    .update(pending2faVerifications)
    .set({
      attempts: sql`${pending2faVerifications.attempts} + 1`,
    })
    .where(eq(pending2faVerifications.token, token))
    .returning({ attempts: pending2faVerifications.attempts });

  if (row && row.attempts >= MAX_ATTEMPTS) {
    await db
      .delete(pending2faVerifications)
      .where(eq(pending2faVerifications.token, token));
  }
}

export async function consumePendingToken(
  token: string,
): Promise<void> {
  await db
    .delete(pending2faVerifications)
    .where(eq(pending2faVerifications.token, token));
}
