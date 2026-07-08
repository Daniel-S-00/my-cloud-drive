import 'server-only';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
 * How long a preview URL stays valid. 24h keeps the URL stable long
 * enough that the browser's HTTP cache can serve thumbnails and modal
 * images instantly when the user navigates away and back.
 */
const PREVIEW_URL_TTL_SECONDS = 24 * 60 * 60;

/**
 * Module-level cache of presigned preview URLs, keyed by storage key.
 *
 * WHY THIS EXISTS: R2 presigned URLs embed the signing timestamp and a
 * random signature, so calling `getSignedUrl` twice for the same object
 * returns two DIFFERENT strings. If a Server Component signed a fresh
 * URL on every render, the <img src> would change on every navigation
 * and the browser's HTTP cache would treat each URL as a new resource —
 * re-downloading the image every time ("top-to-bottom re-rendering").
 *
 * By memoizing the URL in-process and only re-signing when the existing
 * URL is within `RESHIGN_LEEWAY_SECONDS` of expiring, the same URL
 * string is reused across renders within a server lifetime, so the
 * browser serves the image from disk cache on revisit.
 *
 * The cache is intentionally in-memory (per server instance / dev
 * process); it is not shared across instances and is lost on redeploy,
 * which is fine — a cache miss just signs a new URL.
 */
const RESIGN_LEEWAY_SECONDS = 10 * 60;
const previewUrlCache = new Map<
  string,
  { url: string; expiresAt: number }
>();

/**
 * Returns a long-lived (24h) presigned GET URL for inline preview of an
 * object in R2. The URL is cached per `storageKey` so repeated calls
 * within the server lifetime return the same string, enabling browser
 * HTTP caching of thumbnails and modal images.
 */
export async function generateLongLivedPreviewUrl(
  storageKey: string,
  expiresIn: number = PREVIEW_URL_TTL_SECONDS,
): Promise<string> {
  const now = Date.now();
  const cached = previewUrlCache.get(storageKey);
  if (
    cached &&
    cached.expiresAt - now > RESIGN_LEEWAY_SECONDS * 1000
  ) {
    return cached.url;
  }

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
    // `inline` so the browser renders the image instead of downloading it.
    ResponseContentDisposition: 'inline',
  });

  const url = await getSignedUrl(r2, command, { expiresIn });
  previewUrlCache.set(storageKey, {
    url,
    expiresAt: now + expiresIn * 1000,
  });
  return url;
}

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
