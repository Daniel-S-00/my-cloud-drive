# Server Action Contract: `confirmUpload`

**Source**: `src/server/actions/uploads.ts`
**Spec FR**: FR-024
**Status**: stable

## Purpose

Server-side finalize for a **single-part** upload. Verifies the object
exists in R2, reads its real size and etag, and transitions the `files`
row to `upload_status = 'complete'` in a single transaction.

## Signature

```ts
type ConfirmUploadInput = { fileId: FileId };

type ConfirmUploadOutput = {
  fileId: FileId;
  objectKey: ObjectKey;
  sizeBytes: number;
  etag: string;
  uploadStatus: 'complete';
};

type Result<ConfirmUploadOutput, AppError>;
```

## Behavior

1. Auth + ownership check on `files.id`.
2. `HeadObject({ Bucket, Key: storageKey })` to read real `ContentLength`
   and `ETag`.
3. Transaction:
   - On mismatch (`ContentLength !== size_bytes` or missing object):
     delete the R2 object, set `upload_status = 'failed'`, return
     `R2_ERROR`.
   - On success: store `etag`, set `upload_status = 'complete'`.
4. Returns the verified metadata.

## Error map

| Failure                                 | AppError code        |
|-----------------------------------------|----------------------|
| Not the owner / file missing            | `UNAUTHORIZED`       |
| Object not in R2 / size mismatch        | `R2_ERROR`           |
| Already finalized (idempotent no-op)    | (no error, returns current) |

## Security notes

- Ownership re-check at finalize (defence in depth).
- The presigned URL had a 15-minute TTL; if the client confirms after
  expiry, the object may still be in R2 but the URL is no longer
  valid. Finalize is independent of URL validity.

## Caller contract

- The client MUST have completed the `PUT` to R2 before calling
  this action.
- Safe to retry; the action is idempotent (subsequent calls with
  `upload_status = 'complete'` return the stored values).
