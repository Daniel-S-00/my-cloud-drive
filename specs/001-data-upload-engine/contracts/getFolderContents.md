# Server Action Contract: `getFolderContents`

**Source**: `src/server/actions/folders.ts`
**Spec FR**: FR-030
**Status**: stable

## Purpose

Server Component backing action. Returns the children of a folder
(folders first, then files), with cursor-based pagination.

## Signature

```ts
type GetFolderContentsInput = {
  folderId: FolderId;
  cursor?: string;        // opaque cursor (created_at + id)
  limit?: number;         // default 100, max 1000
};

type ChildItem =
  | { kind: 'folder'; folder: FolderNode }
  | { kind: 'file';   file: FileNode };

type GetFolderContentsOutput = {
  items: ChildItem[];
  nextCursor: string | null;
};

type Result<GetFolderContentsOutput, AppError>;
```

## Behavior

1. Auth + ownership check on `folderId`.
2. Single query: `SELECT ... FROM folders WHERE parent_id = $1 AND deleted_at IS NULL`
   UNION ALL `SELECT ... FROM files WHERE folder_id = $1 AND deleted_at IS NULL`,
   ordered and cursor-paginated.
3. Returns items + next cursor.
