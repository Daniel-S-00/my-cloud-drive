# Server Action Contract: `moveItem`

**Source**: `src/server/actions/folders.ts`
**Spec FR**: FR-028
**Status**: stable

## Purpose

Move a folder or file to a new parent. For folders, runs a cycle check
so a folder cannot be moved into one of its own descendants.

## Signature

```ts
type MoveItemInput =
  | { kind: 'folder'; id: FolderId; newParentId: FolderId | null }
  | { kind: 'file';   id: FileId;   newFolderId: FolderId };

type MoveItemOutput =
  | { kind: 'folder'; folder: FolderNode }
  | { kind: 'file';   file: FileNode };

type Result<MoveItemOutput, AppError>;
```

## Behavior

1. Auth + ownership check on both source and target.
2. If `kind = 'folder'`, run the recursive CTE ancestor walk and
   reject if `newParentId` is in the ancestor chain → `CYCLE_DETECTED`.
3. Update `parent_id` (or `folder_id`) and `updated_at`.
4. Unique partial index rejects name collisions → `NAME_CONFLICT`.

## Error map

| Failure                                 | AppError code        |
|-----------------------------------------|----------------------|
| No session                              | `UNAUTHORIZED`       |
| Source/target not found / wrong owner   | `FOLDER_NOT_FOUND`   |
| Folder would become its own ancestor    | `CYCLE_DETECTED`     |
| Name already used in target             | `NAME_CONFLICT`      |
