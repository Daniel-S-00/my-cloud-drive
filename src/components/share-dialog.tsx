'use client';

import { useCallback, useState, useTransition } from 'react';
import { Check, Copy, Link2, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  createShare,
  revokeShare,
  type CreateShareInput,
} from '@/app/actions/shares';
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
import { useShareDialogs } from '@/contexts/share-dialog-context';

type ExpiryOption = {
  label: string;
  days?: number;
};

const EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: 'Never', days: undefined },
];

export function ShareDialog() {
  const { state, closeDialog } = useShareDialogs();

  const open = state.fileId !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      {open && state.fileId !== null ? (
        <ShareDialogBody
          key={state.fileId}
          fileId={state.fileId}
          fileName={state.fileName}
          existing={state.existing}
          onClose={closeDialog}
        />
      ) : null}
    </Dialog>
  );
}

function ShareDialogBody({
  fileId,
  fileName,
  existing,
  onClose,
}: {
  fileId: string;
  fileName: string;
  existing: { id: string; shareUrl: string; expiresAt: string | null } | null;
  onClose: () => void;
}) {
  const [isCreating, startCreate] = useTransition();
  const [isRevoking, startRevoke] = useTransition();

  // The dialog body is keyed by fileId in <ShareDialog />, so it
  // remounts per file. Initialize local state directly from props.
  const [shareUrl, setShareUrl] = useState<string | null>(existing?.shareUrl ?? null);
  const [expiresAt, setExpiresAt] = useState<string | null>(existing?.expiresAt ?? null);
  const [selectedExpiry, setSelectedExpiry] = useState<ExpiryOption>(EXPIRY_OPTIONS[2]);
  const [copied, setCopied] = useState(false);

  const onCreate = useCallback(() => {
    const input: CreateShareInput = {
      fileId,
      expiresInDays: selectedExpiry.days,
    };
    startCreate(async () => {
      try {
        const result = await createShare(input);
        setShareUrl(result.shareUrl);
        setExpiresAt(result.expiresAt);
        toast.success('Share link created');
      } catch (err) {
        toast.error('Could not create share', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  }, [fileId, selectedExpiry.days]);

  const onCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  }, [shareUrl]);

  const onRevoke = useCallback(() => {
    if (!existing) return;
    startRevoke(async () => {
      try {
        await revokeShare({ shareId: existing.id });
        setShareUrl(null);
        setExpiresAt(null);
        toast.success('Share revoked');
        onClose();
      } catch (err) {
        toast.error('Could not revoke share', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  }, [existing, onClose]);

  const canRevoke = Boolean(existing);

  return (
    <DialogContent animated>
      <DialogHeader>
        <DialogTitle>Share &quot;{fileName}&quot;</DialogTitle>
        <DialogDescription>
          Anyone with the link can view this file. The link is not tied to your account.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
        {shareUrl ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="share-url" className="text-sm font-medium text-text-secondary">
              Share link
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="share-url"
                readOnly
                value={shareUrl}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCopy}
                className="flex-shrink-0"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            {expiresAt ? (
              <p className="text-xs text-text-secondary">
                Expires {expiresAt.slice(0, 10)}
              </p>
            ) : (
              <p className="text-xs text-text-secondary">Never expires</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-secondary">Link expires</span>
            <div className="flex flex-wrap gap-2">
              {EXPIRY_OPTIONS.map((opt) => {
                const active = opt.label === selectedExpiry.label;
                return (
                  <Button
                    key={opt.label}
                    type="button"
                    variant={active ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedExpiry(opt)}
                  >
                    {opt.label}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        {!shareUrl ? (
          <Button
            type="button"
            variant="primary"
            onClick={onCreate}
            disabled={isCreating}
          >
            <Link2 className="h-4 w-4" />
            {isCreating ? 'Creating…' : 'Create link'}
          </Button>
        ) : null}
        {canRevoke ? (
          <Button
            type="button"
            variant="destructive"
            onClick={onRevoke}
            disabled={isRevoking}
          >
            <ShieldOff className="h-4 w-4" />
            {isRevoking ? 'Revoking…' : 'Revoke share'}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
