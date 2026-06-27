# Server Action Contract: `generateUploadUrl`

**Source**: `src/server/actions/uploads.ts`
**Spec FR**: FR-021
**Status**: stable

## Purpose

Issue a short-lived, single-part S3 v3 presigned `PUT` URL (R2-compatible)
for a single object, and persist a `files` row in `upload_status = 'pending'`.

## Signature

```ts
type GenerateUploadUrlInput = {
  folderId: FolderId;
  fileName: string;        // 1–255 chars, see data-model §6
  sizeBytes: number;       // 0 ≤ n ≤ 10 GiB
  mimeType: string;        // RFC 6838
};

type GenerateUploadUrlOutput = {
  fileId: FileId;          // id of the pending files row
  objectKey: ObjectKey;    // opaque, user-prefixed
  url: string;             // presigned PUT URL, expires in ≤ 15 min
  expiresAt: string;       // ISO 8601, mirrors the URL TTL
  requiredHeaders: {       // headers the browser MUST send on PUT
    'Content-Type': string;
    'Content-Length': string;
  };
};

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
type AppError =
  | { code: 'UNAUTHORIZED'; message: string }
  | { code: 'FOLDER_NOT_FOUND'; message: string }
  | { code: 'INVALID_NAME'; message: string }
  | { code: 'UPLOAD_TOO_LARGE'; message: string; maxBytes: number }
  | { code: 'INVALID_MIME_TYPE'; message: string }
  | { code: 'R2_ERROR'; message: string; requestId: string };

export async function generateUploadUrl(
  input: GenerateUploadUrlInput,
): Promise<Result<GenerateUploadUrlOutput, AppError>>;
```

## Behavior

1. Reads the Supabase session; resolves `currentUserId`. If missing →
   `UNAUTHORIZED`.
2. Validates `folderId` (UUID), `fileName`, `sizeBytes`, `mimeType`
   with the Zod schema in `src/lib/schemas/uploads.ts`. On failure →
   `INVALID_NAME` / `UPLOAD_TOO_LARGE` / `INVALID_MIME_TYPE`.
3. Loads the folder; checks `owner_id = currentUserId` and
   `deleted_at IS NULL`. If not → `FOLDER_NOT_FOUND`.
4. Generates `objectKey = ${currentUserId}/${uuidv4()}`.
5. Calls `PutObjectCommand({ Bucket, Key: objectKey, ContentType, ContentLength })`
   through the S3 client, signs with
   `getSignedUrl(client, cmd, { expiresIn: 900 })`.
6. Inserts a `files` row in `upload_status = 'pending'` with the
   chosen `storage_key`, `folder_id`, `owner_id`, `name`, `mime_type`,
   `size_bytes`.
7. Returns the URL, the row id, and the required headers.

## Error map

| Failure                              | AppError code         |
|--------------------------------------|-----------------------|
| No session                           | `UNAUTHORIZED`        |
| Folder missing/soft-deleted/wrong owner | `FOLDER_NOT_FOUND` |
| `fileName` violates constraints      | `INVALID_NAME`        |
| `sizeBytes > 10 GiB`                 | `UPLOAD_TOO_LARGE`    |
| `mimeType` invalid format            | `INVALID_MIME_TYPE`   |
| R2 sign call threw                   | `R2_ERROR`            |

## Security notes

- `objectKey` is server-generated; the client cannot influence it.
- The folder ownership check happens BEFORE the URL is signed.
- The presigned URL is bound to the exact `Key` and `Content-Length`;
  R2 will reject PUTs with mismatched values.

## Caller contract

The browser MUST:

- Use `fetch(url, { method: 'PUT', headers: requiredHeaders, body: file })`.
- Send `Content-Type` and `Content-Length` EXACTLY as returned.
- On success, capture the response's `ETag` header.
- Call `confirmUpload({ fileId })` next.
