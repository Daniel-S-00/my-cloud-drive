# Server Action Contract: `completeMultipartUpload`

**Source**: `src/server/actions/uploads.ts`
**Spec FR**: FR-023
**Status**: stable

## Purpose

Tell R2 to assemble the uploaded parts, then perform server-side
verification (object exists, real size + etag match) and finalize the
`files` row in one transaction. On any inconsistency, the in-flight R2
object is deleted and the row is marked `failed`.

## Signature

```ts
type CompletedPart = { partNumber: number; etag: string };

type CompleteMultipartUploadInput = {
  fileId: FileId;
  parts: CompletedPart[];   // 1..N entries, ascending by partNumber
};

type CompleteMultipartUploadOutput = {
  fileId: FileId;
  objectKey: ObjectKey;
  sizeBytes: number;
  etag: string;
  uploadStatus: 'complete';
};

type Result<CompleteMultipartUploadOutput, AppError>;
```

## Behavior

1. Auth + ownership check on the `files` row.
2. Calls R2 `CompleteMultipartUploadCommand({ Bucket, Key, UploadId, MultipartUpload: { Parts: parts } })`.
3. `HeadObject({ Bucket, Key })` to read the real `ContentLength` and `ETag`.
4. In a single Drizzle transaction:
   - If `ContentLength !== files.size_bytes` or real `ETag !== recorded etag`
     → throw, transaction rolls back, and the catch path calls
     `DeleteObject` + sets `upload_status = 'failed'`.
   - Otherwise, set `etag` and `upload_status = 'complete'`.
5. Returns the verified metadata.

## Error map

| Failure                                 | AppError code        |
|-----------------------------------------|----------------------|
| Not the owner / file missing            | `UNAUTHORIZED`       |
| Size or etag mismatch                   | `R2_ERROR`           |
| `CompleteMultipartUpload` failed        | `R2_ERROR`           |
| Duplicate name in folder (race)         | `NAME_CONFLICT`      |

## Security notes

- Re-checks ownership at finalize time, in case the session was
  revoked between presign and complete.
- R2's `ETag` for a multipart object is the MD5 of the concatenation
  of part MD5s; a mismatch proves tampering or partial loss.

## Caller contract

- `parts` MUST be ordered ascending by `partNumber`.
- All parts MUST have been successfully PUT before this call.
- On error, the client should call `abortUpload` only if instructed
  (this action already cleans up on size/etag failure).
