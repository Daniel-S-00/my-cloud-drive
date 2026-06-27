# Server Action Contract: `abortUpload`

**Source**: `src/server/actions/uploads.ts`
**Spec FR**: FR-025
**Status**: stable

## Purpose

Cancel a pending or in-progress upload. Deletes any partial R2 object
(single-part or multipart) and marks the `files` row `failed`.

## Signature

```ts
type AbortUploadInput = { fileId: FileId };
type AbortUploadOutput = { fileId: FileId; uploadStatus: 'failed' };
type Result<AbortUploadOutput, AppError>;
```

## Behavior

1. Auth + ownership check on `files.id`.
2. If `r2_upload_id` is set, call `AbortMultipartUploadCommand`; else
   call `DeleteObjectCommand({ Key: storageKey })`.
3. Update `files.upload_status = 'failed'`.

## Error map

| Failure                       | AppError code   |
|-------------------------------|-----------------|
| Not the owner / file missing  | `UNAUTHORIZED`  |
| R2 abort/delete failed        | `R2_ERROR`      |

## Caller contract

- Idempotent: if the row is already `failed`, the action returns the
  current state without re-calling R2.
