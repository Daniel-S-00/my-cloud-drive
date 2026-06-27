# Server Action Contract: `generateMultipartUploadUrl`

**Source**: `src/server/actions/uploads.ts`
**Spec FR**: FR-022
**Status**: stable

## Purpose

Issue a set of presigned `UploadPart` URLs for a multipart upload
(used when `sizeBytes > 50 MB`). Persists a `files` row in
`upload_status = 'pending'` and stores the R2 `UploadId` for later
assembly.

## Signature

```ts
type GenerateMultipartUploadUrlInput = {
  folderId: FolderId;
  fileName: string;
  sizeBytes: number;          // > 50 MiB
  mimeType: string;
  partCount: number;          // 1..10000, must equal ceil(sizeBytes / partSize)
  partSize: number;           // bytes per part (5 MiB..5 GiB)
};

type PartUrl = {
  partNumber: number;         // 1..partCount
  url: string;                // presigned UploadPart URL, expires ≤ 15 min
  expiresAt: string;
};

type GenerateMultipartUploadUrlOutput = {
  fileId: FileId;
  objectKey: ObjectKey;
  uploadId: string;           // R2 UploadId
  partUrls: PartUrl[];        // length = partCount
  partSize: number;
};

type Result<GenerateMultipartUploadUrlOutput, AppError>;
```

## Behavior

1–4. Same as `generateUploadUrl` (auth, validation, folder ownership
check, opaque key generation).
5. Calls R2 `CreateMultipartUploadCommand({ Bucket, Key: objectKey, ContentType })`
   to obtain `UploadId`.
6. For each `partNumber` 1..N, signs a presigned
   `UploadPartCommand({ Bucket, Key, UploadId, PartNumber })` URL with
   15-minute expiry.
7. Inserts the `files` row with `upload_status = 'pending'`,
   `r2_upload_id = UploadId`, and the agreed `size_bytes`.
8. Returns the part URL list.

## Error map

Same as `generateUploadUrl` plus:

| Failure                          | AppError code         |
|----------------------------------|-----------------------|
| `CreateMultipartUpload` failed   | `R2_ERROR`            |
| `partCount` invalid for size     | `INVALID_NAME`        |

## Security notes

- `UploadId` is server-generated; clients cannot substitute it.
- Per-part URLs are bound to `(Bucket, Key, UploadId, PartNumber)`;
  R2 will reject mismatches.
- `objectKey` is still `${userId}/${uuidv4()}` and never reveals
  user input.

## Caller contract

- Browser uploads parts in parallel (default concurrency 4).
- Each part is sent as `PUT url; body = chunk`; `Content-Length` MUST
  equal `partSize` (last part may be smaller).
- On each part's response, capture `ETag` and the `partNumber`.
- When all parts have succeeded, call `completeMultipartUpload`.
