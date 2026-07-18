'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { revokeShare, type GetUserSharesOutput } from '@/app/actions/shares';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format-date';

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border-subtle bg-bg-surface/40 p-10 text-center">
      <p className="font-medium text-text-primary">No shared links</p>
      <p className="mt-1 text-sm text-text-secondary">
        Open a file from My Drive and click Share to generate a public link.
      </p>
    </div>
  );
}

export function SharesList({ shares }: { shares: GetUserSharesOutput[] }) {
  if (shares.length === 0) return <EmptyState />;
  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle">
      <table className="w-full text-sm">
        <thead className="border-b border-border-subtle bg-bg-surface text-text-secondary">
          <tr>
            <th scope="col" className="px-4 py-2 text-left font-medium">File</th>
            <th scope="col" className="px-4 py-2 text-left font-medium">Share link</th>
            <th scope="col" className="px-4 py-2 text-left font-medium">Created</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Views</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shares.map((share) => (
            <ShareRow key={share.id} share={share} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShareRow({ share }: { share: GetUserSharesOutput }) {
  const [isRevoking, startRevoke] = useTransition();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(share.shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  };

  const onRevoke = () => {
    startRevoke(async () => {
      try {
        await revokeShare({ shareId: share.id });
        toast.success('Share revoked');
      } catch (err) {
        toast.error('Could not revoke share', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  };

  return (
    <tr className="border-b border-border-subtle last:border-0 text-text-primary transition-colors hover:bg-bg-surface-hover">
      <td className="px-4 py-3">
        <span className="block max-w-[16rem] truncate font-medium" title={share.fileName}>
          {share.fileName}
        </span>
        {share.expiresAt ? (
          <span className="text-xs text-text-secondary">
            Expires {share.expiresAt.slice(0, 10)}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <code className="max-w-[20rem] truncate rounded bg-bg-surface-hover px-2 py-1 font-mono text-xs">
            {share.shareUrl}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={onCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {formatDateTime(share.createdAt)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
        {share.viewCount}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onRevoke}
            disabled={isRevoking}
          >
            <ShieldOff className="h-4 w-4" />
            {isRevoking ? 'Revoking…' : 'Revoke'}
          </Button>
        </div>
      </td>
    </tr>
  );
}
