import 'server-only';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const endpoint = process.env.R2_ENDPOINT_URL;

if (!accountId || !accessKeyId || !secretAccessKey || !endpoint) {
  throw new Error(
    'R2 credentials are not fully configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT_URL in .env.local.',
  );
}

export const r2 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET ?? '';

/**
 * Delete a single object from R2. Returns `true` when an object was
 * deleted, `false` when the object was already missing (R2 returns a
 * 404/NoSuchKey, which we treat as idempotent success). Any other
 * error is re-thrown so callers can surface it.
 */
export async function deleteFromR2(storageKey: string): Promise<boolean> {
  try {
    await r2.send(
      new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: storageKey }),
    );
    return true;
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const code = (err as { $metadata?: { httpStatusCode?: number } })
      ?.$metadata?.httpStatusCode;
    if (name === 'NoSuchKey' || name === 'NotFound' || code === 404) {
      return false;
    }
    throw err;
  }
}
