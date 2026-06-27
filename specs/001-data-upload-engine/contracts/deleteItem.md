# Server Action Contract: `deleteItem`

**Source**: `src/server/actions/folders.ts`
**Spec FR**: FR-029
**Status**: stable

## Purpose

Soft-delete a folder or file. For files, also schedules an R2 object
delete (best-effort, retryable by a future sweep job).

## Signature

```ts
type DeleteItemInput =
  | { kind: 'folder'; id: FolderId }
  | { kind: 'file';   id: FileId };

type DeleteItemOutput = { id: string; deletedAt: string };
type Result<DeleteItemOutput, AppError>;
```

## Behavior

1. Auth + ownership check.
2. If `kind = 'folder'`, reject if it has any non-soft-deleted children
   (folders or files) → `NOT_EMPTY`. Caller must delete/move them first.
3. Set `deleted_at = now()`.
4. For files, enqueue an R2 `DeleteObject` for the `storage_key` (best
   effort; failure is logged but does not roll back the soft delete).

## Error map

| Failure                              | AppError code        |
|--------------------------------------|----------------------|
| No session                           | `UNAUTHORIZED`       |
| Item not found / wrong owner         | `FOLDER_NOT_FOUND`   |
| Folder has live children             | `NOT_EMPTY`          |
| R2 delete enqueue failed             | logged, not surfaced |
