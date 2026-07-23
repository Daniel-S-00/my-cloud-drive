'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteAccount } from '@/app/actions/account';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const CONFIRMATION_TEXT = 'DELETE';

export function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = confirmation === CONFIRMATION_TEXT;

  const onConfirm = async () => {
    if (!confirmed) return;
    setError(null);
    setIsPending(true);
    try {
      const result = await deleteAccount();
      if (result.ok) {
        toast.success('Account deleted', {
          description: result.message,
        });
        onOpenChange(false);
        router.push('/login');
        router.refresh();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong.',
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-red-500/50 bg-bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-400">
            Delete Account
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            This action is irreversible after the grace period.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm text-text-secondary">
          <p>
            Your account will be <strong>deactivated immediately</strong>.
            All data will be permanently deleted after{' '}
            <strong>30 days</strong>.
          </p>
          <ul className="list-inside list-disc space-y-1 text-text-secondary/80">
            <li>All files and folders will be deleted</li>
            <li>All share links will stop working</li>
            <li>You will be signed out immediately</li>
            <li>You cannot sign in during the grace period</li>
          </ul>
          <p className="text-sm text-accent-glow">
            A recovery link will be sent to your email. You have 30 days
            to change your mind.
          </p>
          <p className="font-medium text-red-400">
            This cannot be undone after 30 days.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-primary">
            Type <code className="rounded bg-bg-base px-1.5 py-0.5 font-mono text-red-400">
              {CONFIRMATION_TEXT}
            </code> to confirm:
          </label>
          <Input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={CONFIRMATION_TEXT}
            disabled={isPending}
          />
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!confirmed || isPending}
          >
            {isPending
              ? 'Deleting...'
              : 'Delete My Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
