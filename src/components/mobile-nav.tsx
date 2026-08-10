'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, Menu, X } from 'lucide-react';
import { SidebarContent } from '@/components/sidebar-content';

export function MobileNav({
  trashCount,
  sharesCount,
  usedBytes,
  storageQuotaBytes,
  isSubscribed,
  overQuota,
  plan,
}: {
  trashCount: number;
  sharesCount: number;
  usedBytes: number;
  storageQuotaBytes: number;
  isSubscribed: boolean;
  overQuota: boolean;
  plan: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="dialog"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-text-primary md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Portaled to <body>: the header's backdrop-blur would otherwise
          become the containing block for this `fixed` dialog and collapse
          it to the header height. */}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setOpen(false)}
            />
            <div
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-bg-surface shadow-2xl animate-in slide-in-from-left duration-300"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('a')) setOpen(false);
              }}
            >
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-4">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-glow ring-1 ring-inset ring-accent-primary/30">
                    <Cloud className="h-4.5 w-4.5" strokeWidth={1.75} />
                  </span>
                  <span className="font-display text-sm font-semibold tracking-tight text-text-primary">
                    My Cloud Drive
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 p-3">
                <SidebarContent
                  trashCount={trashCount}
                  sharesCount={sharesCount}
                  usedBytes={usedBytes}
                  storageQuotaBytes={storageQuotaBytes}
                  isSubscribed={isSubscribed}
                  overQuota={overQuota}
                  plan={plan}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
