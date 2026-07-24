'use client';

import { ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { disable2FA } from '@/app/actions/two-factor';
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

export function TwoFactorDisableDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const reset = () => {
    setCode('');
    setError(null);
  };

  const onOpen = (open: boolean) => {
    if (open) reset();
    onOpenChange(open);
  };

  const onSubmit = async () => {
    if (!code) return;
    setError(null);
    setIsPending(true);
    const result = await disable2FA(code);
    if (result.ok) {
      toast.success(result.message);
      onOpenChange(false);
    } else {
      setError(result.message);
    }
    setIsPending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="border-red-500/50 bg-bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-red-400" />
            Disable Two-Factor Authentication
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            Enter your current 2FA code to disable.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Input
            value={code}
            onChange={(e) => {
              const cleaned = e.target.value
                .replace(/[^0-9a-zA-Z]/g, '')
                .slice(0, 8);
              setCode(cleaned);
            }}
            placeholder="000000 or backup code"
            className="font-mono text-center text-lg tracking-[0.3em]"
            maxLength={8}
            autoFocus
            disabled={isPending}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onSubmit();
            }}
          />
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <p className="text-sm text-red-400/80">
            You will no longer need a second factor to sign in.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void onSubmit()}
            disabled={!code || isPending}
          >
            {isPending ? 'Disabling...' : 'Disable 2FA'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
