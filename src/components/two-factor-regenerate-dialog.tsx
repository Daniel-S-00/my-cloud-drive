'use client';

import { Check, Copy, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { regenerateBackupCodes } from '@/app/actions/two-factor';
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

export function TwoFactorRegenerateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<'code' | 'codes'>('code');
  const [token, setToken] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setStep('code');
    setToken('');
    setBackupCodes([]);
    setError(null);
    setCopied(false);
  };

  const onOpen = (open: boolean) => {
    if (open) reset();
    onOpenChange(open);
  };

  const onSubmit = async () => {
    if (!token) return;
    setError(null);
    setIsPending(true);
    const result = await regenerateBackupCodes(token);
    if (result.ok && result.backupCodes) {
      setBackupCodes(result.backupCodes);
      setStep('codes');
    } else {
      setError(result.message);
    }
    setIsPending(false);
  };

  const onCopyAll = async () => {
    await navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopied(true);
    toast.success('Backup codes copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const onDownload = () => {
    const text = backupCodes.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-cloud-drive-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="bg-bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            {step === 'code'
              ? 'Regenerate backup codes'
              : 'New backup codes'}
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            {step === 'code'
              ? 'Enter your current authenticator code to generate new backup codes.'
              : 'Previous backup codes are now invalid. Save these new ones.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'code' && (
          <div className="flex flex-col gap-4">
            <Input
              value={token}
              onChange={(e) => {
                const cleaned = e.target.value
                  .replace(/[^0-9]/g, '')
                  .slice(0, 6);
                setToken(cleaned);
              }}
              placeholder="000000"
              className="font-mono text-center text-lg tracking-[0.3em]"
              maxLength={6}
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
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => onOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void onSubmit()}
                disabled={token.length < 6 || isPending}
              >
                {isPending ? 'Generating...' : 'Generate'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'codes' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <code
                  key={i}
                  className="rounded bg-bg-base px-3 py-1.5 font-mono text-sm text-text-primary"
                >
                  {code}
                </code>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void onCopyAll()}
                className="flex-1"
              >
                {copied ? (
                  <Check className="mr-1 h-4 w-4" />
                ) : (
                  <Copy className="mr-1 h-4 w-4" />
                )}
                {copied ? 'Copied' : 'Copy All'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onDownload}
                className="flex-1"
              >
                Download
              </Button>
            </div>
            <DialogFooter>
              <Button variant="primary" onClick={() => onOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
