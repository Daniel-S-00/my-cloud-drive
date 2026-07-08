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

type FolderListClientProps = {
  folders: FolderRowData[];
};

export function FolderListClient({ folders }: FolderListClientProps) {
  const { viewMode } = useViewMode();
  const { selectedId, onSelect } = useSelection();
  const { isMoving } = useDragContext();

  if (viewMode === 'list') {
    return (
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
            {folders.map((folder) => (
              <FolderRow
                key={folder.id}
                folder={folder}
                isSelected={selectedId === folder.id}
                onSelect={onSelect}
              />
            ))}
          </TableBody>
        </Table>
      </section>
    );
  }

  return (
    <section aria-label="Folders">
      <FolderGrid
        folders={folders}
        selectedId={selectedId}
        onSelect={onSelect}
        isMoving={isMoving}
      />
    </section>
  );
}
