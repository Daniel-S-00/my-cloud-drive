'use client';

import { Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { setup2FA, confirm2FA } from '@/app/actions/two-factor';
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

type Step = 'qr' | 'verify' | 'backup';

export function TwoFactorSetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<Step>('qr');
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const reset = () => {
    setStep('qr');
    setQrCodeImage(null);
    setSecret(null);
    setToken('');
    setBackupCodes([]);
    setSavedConfirmed(false);
    setCopied(false);
    setError(null);
    setIsLoading(false);
    setIsPending(false);
  };

  const doSetup2FA = async () => {
    setIsLoading(true);
    setError(null);
    setQrCodeImage(null);
    setSecret(null);
    const result = await setup2FA();
    if (result.ok && result.qrCodeImage) {
      setQrCodeImage(result.qrCodeImage);
      setSecret(result.secret ?? null);
    } else {
      setError(result.message);
    }
    setIsLoading(false);
  };

  // The dialog component stays mounted in the JSX tree and is only
  // hidden/shown via AnimatedDialogContent's shouldRender flag (which
  // returns null when closed). The onOpenChange callback is only
  // invoked on close — nothing calls it for open. So we use a
  // useEffect on the `open` prop to detect when we're being opened.
  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        reset();
        void doSetup2FA();
      });
    }
  }, [open]);

  const onConfirm = async () => {
    if (!token) return;
    setError(null);
    setIsPending(true);
    const result = await confirm2FA(token);
    if (result.ok && result.backupCodes) {
      setBackupCodes(result.backupCodes);
      setStep('backup');
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

  const onDone = () => {
    reset();
    onOpenChange(false);
    toast.success('Two-factor authentication is now enabled.');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent animated className="bg-bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 'qr'
              ? 'Set up authenticator'
              : step === 'verify'
                ? 'Verify setup'
                : 'Save backup codes'}
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            {step === 'qr'
              ? 'Scan this QR code with your authenticator app (Google Authenticator, 1Password, etc.).'
              : step === 'verify'
                ? 'Enter the 6-digit code from your app to confirm setup.'
                : 'Each code can be used once if you lose access to your authenticator app.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: QR Code */}
        {step === 'qr' && (
          <div className="flex flex-col items-center gap-4">
            {isLoading ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-accent-glow" />
                <p className="text-sm text-text-secondary">
                  Generating QR code...
                </p>
              </div>
            ) : error ? (
              <div className="flex w-full flex-col items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-sm text-red-400" role="alert">
                  {error}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void doSetup2FA()}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            ) : qrCodeImage ? (
              <>
                {/* next/image does not support dynamic base64 QR code data URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCodeImage}
                  alt="QR code for authenticator setup"
                  className="h-48 w-48 rounded-lg border border-border-subtle"
                />
                {secret && (
                  <p className="text-center text-xs font-mono text-text-secondary tracking-[0.15em]">
                    {secret.toUpperCase().replace(/(.{4})/g, '$1 ').trim()}
                  </p>
                )}
                <p className="text-xs text-text-secondary">
                  Or enter the code manually in your app.
                </p>
                <Button
                  variant="primary"
                  onClick={() => setStep('verify')}
                  className="w-full"
                >
                  I&apos;ve scanned it
                </Button>
              </>
            ) : null}
          </div>
        )}

        {/* Step 2: Verify code */}
        {step === 'verify' && (
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
                if (e.key === 'Enter') void onConfirm();
              }}
            />
            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            )}
            <Button
              variant="primary"
              onClick={() => void onConfirm()}
              disabled={token.length < 6 || isPending}
              className="w-full"
            >
              {isPending ? 'Verifying...' : 'Verify and Enable'}
            </Button>
          </div>
        )}

        {/* Step 3: Backup codes */}
        {step === 'backup' && (
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
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={savedConfirmed}
                onChange={(e) => setSavedConfirmed(e.target.checked)}
                className="h-4 w-4 rounded border-border-subtle"
              />
              I have saved my backup codes in a safe place.
            </label>
            <DialogFooter>
              <Button
                variant="primary"
                onClick={onDone}
                disabled={!savedConfirmed}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
