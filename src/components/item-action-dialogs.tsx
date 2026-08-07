'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ArrowUp, ChevronRight, Folder, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { moveFile, renameFile } from '@/app/actions/files';
import {
  getFolderPickerItems,
  moveFolder,
  renameFolder,
} from '@/app/actions/folders';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useItemActionDialogs,
  type ItemActionTarget,
} from '@/contexts/item-action-dialog-context';

export function ItemActionDialogs() {
  const { state, closeDialog } = useItemActionDialogs();

  const open = state.target !== null;
  const target = state.target;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      {open && target ? (
        state.kind === 'move' ? (
          <MoveDialogBody key={`move-${target.id}`} target={target} onClose={closeDialog} />
        ) : (
          <RenameDialogBody key={`rename-${target.id}`} target={target} onClose={closeDialog} />
        )
      ) : null}
    </Dialog>
  );
}

type DialogBodyProps = {
  target: ItemActionTarget;
  onClose: () => void;
};

function MoveDialogBody({ target, onClose }: DialogBodyProps) {
  const router = useRouter();
  const [crumbs, setCrumbs] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: 'My Drive' },
  ]);
  // `null` means "loading" — the picker starts empty and flips to the
  // folder list once the fetch resolves.
  const [folders, setFolders] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const [pending, startMove] = useTransition();

  const currentId = crumbs[crumbs.length - 1].id;
  const currentName = crumbs[crumbs.length - 1].name;

  useEffect(() => {
    let cancelled = false;
    getFolderPickerItems({
      parentId: currentId,
      excludeFolderId: target.type === 'folder' ? target.id : null,
    })
      .then((result) => {
        if (!cancelled) setFolders(result.folders);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error('Could not load folders', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
        setFolders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentId, target.type, target.id]);

  const enterFolder = (id: string, name: string) => {
    setFolders(null);
    setCrumbs((c) => [...c, { id, name }]);
  };

  const goUp = () => {
    setFolders(null);
    setCrumbs((c) => (c.length > 1 ? c.slice(0, -1) : c));
  };

  const onMove = () => {
    startMove(async () => {
      try {
        if (target.type === 'file') {
          const result = await moveFile({
            fileId: target.id,
            targetFolderId: currentId,
          });
          toast.success(
            result.wasRenamed ? 'File moved (renamed)' : 'File moved',
            {
              description: `"${target.name}" → "${currentName}"${
                result.wasRenamed ? ` (renamed to "${result.newName}")` : ''
              }`,
            },
          );
        } else {
          const result = await moveFolder({
            folderId: target.id,
            targetParentId: currentId,
          });
          toast.success(
            result.wasRenamed ? 'Folder moved (renamed)' : 'Folder moved',
            {
              description: `"${target.name}" → "${currentName}"${
                result.wasRenamed ? ` (renamed to "${result.newName}")` : ''
              }`,
            },
          );
        }
        router.refresh();
        onClose();
      } catch (err) {
        toast.error('Move failed', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  };

  return (
    <DialogContent animated className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Move to folder</DialogTitle>
        <DialogDescription>
          Move <span className="font-medium text-text-primary">{target.name}</span>{' '}
          to a new location.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-surface-hover px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Go up one folder"
            disabled={crumbs.length <= 1}
            onClick={goUp}
            className="h-7 w-7"
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <span key={crumb.id ?? 'root'} className="flex shrink-0 items-center gap-1">
                  {index > 0 ? (
                    <ChevronRight
                      className="h-3.5 w-3.5 text-text-secondary/60"
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className={
                      isLast
                        ? 'font-medium text-text-primary'
                        : 'text-text-secondary'
                    }
                  >
                    {crumb.name}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        <div
          aria-label="Destination folders"
          className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-border-subtle p-2"
        >
          {folders === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading folders…
            </div>
          ) : folders.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-secondary">
              No subfolders here.
            </p>
          ) : (
            folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => enterFolder(folder.id, folder.name)}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                <Folder className="h-4 w-4 shrink-0 text-accent-primary/70" aria-hidden />
                <span className="min-w-0 truncate">{folder.name}</span>
              </button>
            ))
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={onMove} disabled={pending}>
          {pending ? 'Moving…' : `Move here`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function RenameDialogBody({ target, onClose }: DialogBodyProps) {
  const router = useRouter();
  const [name, setName] = useState(target.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startRename] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    // Select the base name (without the extension) so typing overwrites
    // the meaningful part for files; select all for folders.
    if (target.type === 'file') {
      const dot = target.name.lastIndexOf('.');
      const end = dot > 0 ? dot : target.name.length;
      input.setSelectionRange(0, end);
    } else {
      input.select();
    }
  }, [target]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Name cannot be empty');
      return;
    }
    startRename(async () => {
      try {
        if (target.type === 'file') {
          await renameFile({ fileId: target.id, name: trimmed });
        } else {
          await renameFolder({ folderId: target.id, name: trimmed });
        }
        toast.success('Renamed', { description: `"${target.name}" → "${trimmed}"` });
        router.refresh();
        onClose();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not rename';
        setError(message);
        toast.error('Rename failed', { description: message });
      }
    });
  };

  return (
    <DialogContent animated className="sm:max-w-md">
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>Rename {target.type === 'file' ? 'file' : 'folder'}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-text-primary">{target.name}</span>
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-input">New name</Label>
            <Input
              id="rename-input"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={pending}
              maxLength={255}
            />
            {error ? (
              <p className="mt-1 text-sm text-red-400" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Renaming…' : 'Rename'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
