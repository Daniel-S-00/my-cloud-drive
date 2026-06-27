# Server Action Contract: `getUploadStatus`

**Source**: `src/server/actions/uploads.ts`
**Spec FR**: FR-032
**Status**: stable

## Purpose

Allow a client to reconcile the state of an in-flight or recently
completed upload after a page refresh. Returns the `files` row's
status and any R2-side metadata already known.

## Signature

```ts
type GetUploadStatusInput = { fileId: FileId };
type GetUploadStatusOutput = {
  fileId: FileId;
  uploadStatus: 'pending' | 'uploading' | 'complete' | 'failed';
  sizeBytes: number;
  etag: string | null;
};
type Result<GetUploadStatusOutput, AppError>;
```

## Behavior

1. Auth + ownership check.
2. Return the row's current state.
