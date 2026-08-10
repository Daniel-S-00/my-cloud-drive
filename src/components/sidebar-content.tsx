'use client';

import { AlertTriangle, Crown } from 'lucide-react';
import { useState } from 'react';
import { createPlusCheckoutSession } from '@/app/actions/billing';
import { SidebarNav } from '@/components/sidebar-nav';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function SidebarContent({
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
  const usedPct = Math.min(
    100,
    Math.round((usedBytes / storageQuotaBytes) * 100),
  );
  const [upgrading, setUpgrading] = useState(false);

  const onUpgrade = async () => {
    setUpgrading(true);
    try {
      const result = await createPlusCheckoutSession();
      if (result.ok && result.url) {
        window.location.href = result.url;
      }
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav trashCount={trashCount} sharesCount={sharesCount} />
      </div>

      <div className="mt-3 flex shrink-0 flex-col gap-3 border-t border-border-subtle pt-3">
        {overQuota && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Over your storage quota — uploads are paused. Delete files
              or upgrade your plan.
            </span>
          </div>
        )}

        {isSubscribed ? (
          <div className="flex w-full items-center justify-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm font-medium text-green-400">
            <Crown className="h-4 w-4" />
            {capitalize(plan)} plan
          </div>
        ) : (
          <button
            type="button"
            onClick={onUpgrade}
            disabled={upgrading}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-accent-primary/40 bg-accent-primary/15 px-3 py-2 text-sm font-medium text-accent-glow transition-colors hover:bg-accent-primary/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow disabled:opacity-60"
          >
            <Crown className="h-4 w-4" />
            {upgrading ? 'Redirecting…' : 'Upgrade to Plus'}
          </button>
        )}

        <div
          className={`rounded-lg border border-border-subtle bg-bg-surface/60 p-3 ${overQuota ? 'border-amber-500/30' : ''}`}
        >
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
              className={`h-full rounded-full ${overQuota ? 'bg-amber-500' : 'bg-accent-primary'}`}
              style={{ width: `${Math.min(100, usedPct)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-text-secondary">
            {formatBytes(usedBytes)} of {formatBytes(storageQuotaBytes)} used
          </p>
        </div>
      </div>
    </div>
  );
}
