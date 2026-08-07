'use client';

import { Crown } from 'lucide-react';
import { SidebarNav } from '@/components/sidebar-nav';

// Display-only "free tier" for the storage meter — the app has no
// enforced quota, this just gives the progress bar a denominator.
const DISPLAY_TIER_BYTES = 5 * 1024 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function SidebarContent({
  trashCount,
  sharesCount,
  usedBytes,
}: {
  trashCount: number;
  sharesCount: number;
  usedBytes: number;
}) {
  const usedPct = Math.min(
    100,
    Math.round((usedBytes / DISPLAY_TIER_BYTES) * 100),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav trashCount={trashCount} sharesCount={sharesCount} />
      </div>

      <div className="mt-3 flex shrink-0 flex-col gap-3 border-t border-border-subtle pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-accent-primary/40 bg-accent-primary/15 px-3 py-2 text-sm font-medium text-accent-glow transition-colors hover:bg-accent-primary/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <Crown className="h-4 w-4" />
          Upgrade to Pro
        </button>

        <div className="rounded-lg border border-border-subtle bg-bg-surface/60 p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">
              Storage
            </span>
            <span className="font-mono text-[10px] text-text-secondary">
              {usedPct}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-surface-hover">
            <div
              className="h-full rounded-full bg-accent-primary"
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-text-secondary">
            {formatBytes(usedBytes)} of {formatBytes(DISPLAY_TIER_BYTES)} used
          </p>
        </div>
      </div>
    </div>
  );
}
