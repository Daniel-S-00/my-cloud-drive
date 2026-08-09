'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Copy,
  Download,
  FolderInput,
  Link2,
  MoreVertical,
  Pencil,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

const MENU_WIDTH_PX = 224;
const MENU_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

type ItemMenuProps = {
  /** Accessible label for the trigger button (e.g. "Actions for <name>"). */
  label: string;
  disabled?: boolean;
  onMove: () => void;
  onRename: () => void;
  onCopyName: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  shareLabel?: string;
  onDelete?: () => void;
};

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onClick();
      }}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
    >
      <Icon className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
      {label}
    </button>
  );
}

/**
 * The per-item 3-dot menu (files and folders). Replaces the old drag
 * handle: the item itself is the drag source now, so the menu hosts
 * the actions — Move to folder, Rename, Copy name, and (files only)
 * Download / Share.
 *
 * The dropdown is portaled to <body> and positioned from the trigger
 * button's rect, because rows live inside table scroll containers
 * (overflow-auto) that would otherwise clip an in-flow dropdown.
 */
export function ItemMenu({
  label,
  disabled = false,
  onMove,
  onRename,
  onCopyName,
  onDownload,
  onShare,
  shareLabel = 'Share…',
  onDelete,
}: ItemMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setFlipped(false);
    setPos({
      top: rect.bottom + MENU_GAP_PX,
      right: Math.min(
        window.innerWidth - rect.right,
        window.innerWidth - VIEWPORT_MARGIN_PX - MENU_WIDTH_PX,
      ),
    });
    setOpen(true);
  };

  // If the menu would overflow the bottom of the viewport, flip it
  // above the trigger (measured on the first frame it's mounted).
  useLayoutEffect(() => {
    if (!open || !pos || flipped || !menuRef.current) return;
    const height = menuRef.current.offsetHeight;
    if (pos.top + height > window.innerHeight - VIEWPORT_MARGIN_PX) {
      setPos((prev) =>
        prev
          ? {
              ...prev,
              top: Math.max(
                VIEWPORT_MARGIN_PX,
                window.innerHeight - height - VIEWPORT_MARGIN_PX,
              ),
            }
          : prev,
      );
      setFlipped(true);
    }
  }, [open, pos, flipped]);

  // Close on outside pointerdown and on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      if (btnRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const run = (action?: () => void) => {
    setOpen(false);
    action?.();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-no-drag
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        onPointerDown={(event) => {
          // Never let the menu trigger arm the row's touch drag or
          // bubble into row selection.
          event.stopPropagation();
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow disabled:opacity-40"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>

      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              data-no-drag
              style={{ top: pos.top, right: pos.right }}
              className="fixed z-[70] w-56 rounded-md border border-border-subtle bg-bg-surface p-1 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <MenuItem
                icon={FolderInput}
                label="Move to folder…"
                onClick={() => run(onMove)}
              />
              <MenuItem
                icon={Pencil}
                label="Rename…"
                onClick={() => run(onRename)}
              />
              <MenuItem
                icon={Copy}
                label="Copy name"
                onClick={() => run(onCopyName)}
              />
              {onDownload ? (
                <MenuItem
                  icon={Download}
                  label="Download"
                  onClick={() => run(onDownload)}
                />
              ) : null}
              {onShare ? (
                <MenuItem
                  icon={Link2}
                  label={shareLabel}
                  onClick={() => run(onShare)}
                />
              ) : null}
              {onDelete ? (
                <MenuItem
                  icon={Trash2}
                  label="Delete"
                  onClick={() => run(onDelete)}
                />
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
