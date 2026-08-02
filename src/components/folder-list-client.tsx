'use client';

import { FolderRow, type FolderRowData } from '@/components/folder-row';
import { FolderGrid } from '@/components/folder-grid';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDragContext } from '@/contexts/drag-context';
import { useSelection } from '@/contexts/selection-context';
import { useViewMode } from '@/hooks/use-view-mode';
import { useEffect, useRef, useState } from 'react';

type FolderListClientProps = {
  folders: FolderRowData[];
};

export function FolderListClient({ folders }: FolderListClientProps) {
  const { viewMode } = useViewMode();
  const { selectedId, onSelect, shouldScroll } = useSelection();
  const { isMoving } = useDragContext();

  // Only play the staggered spawn entrance on the very first mount.
  // After the first commit we flip `animate` off so later navigations
  // swap rows without replaying the per-item animation.
  const mountedRef = useRef(false);
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      setAnimate(false);
    }
  }, []);

  // No subfolders in this folder: render nothing. The shared
  // <FileListEmpty /> handles the combined "no folders, no files" hint.
  if (folders.length === 0) return null;

  return (
    <div
      key={viewMode}
      className="animate-in fade-in zoom-in-95 duration-300"
    >
      {viewMode === 'list' ? (
        <section
          aria-label="Folders"
          className="responsive-table-host overflow-hidden rounded-md border border-border-subtle bg-bg-surface"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  scope="col"
                  className="w-9 px-1"
                  aria-label="Drag handle"
                >
                  <span className="sr-only">Drag handle</span>
                </TableHead>
                <TableHead scope="col">Name</TableHead>
                <TableHead scope="col" className="w-44">
                  Modified
                </TableHead>
                <TableHead scope="col" className="w-32">
                  Contents
                </TableHead>
                <TableHead scope="col" className="w-44 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {folders.map((folder, index) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  index={index}
                  isSelected={selectedId === folder.id}
                  onSelect={onSelect}
                  shouldScroll={shouldScroll}
                  animate={animate}
                />
              ))}
            </TableBody>
          </Table>
        </section>
      ) : (
        <section aria-label="Folders">
          <FolderGrid
            folders={folders}
            selectedId={selectedId}
            onSelect={onSelect}
            isMoving={isMoving}
            shouldScroll={shouldScroll}
            animate={animate}
          />
        </section>
      )}
    </div>
  );
}
