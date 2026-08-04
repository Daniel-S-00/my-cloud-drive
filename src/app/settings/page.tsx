'use client';

import { Shield, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DeleteAccountDialog } from '@/components/delete-account-dialog';
import { TwoFactorDisableDialog } from '@/components/two-factor-disable-dialog';
import { TwoFactorSetupDialog } from '@/components/two-factor-setup-dialog';
import { TwoFactorRegenerateDialog } from '@/components/two-factor-regenerate-dialog';
import { get2FAStatus } from '@/app/actions/two-factor';
import { Button } from '@/components/ui/button';
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function SettingsPage() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [setup2FAOpen, setSetup2FAOpen] = useState(false);
  const [disable2FAOpen, setDisable2FAOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [backupCodeCount, setBackupCodeCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    get2FAStatus().then((s) => {
      setTwoFAEnabled(s.enabled);
      setBackupCodeCount(s.backupCodeCount);
      setLoaded(true);
    });
  }, [setup2FAOpen, disable2FAOpen, regenerateOpen]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="font-display mb-6 text-2xl font-bold text-text-primary">
        Settings
      </h1>

      {/* Security */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-bg-surface text-text-primary shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent-glow" />
            Security
          </CardTitle>
          <CardDescription className="text-text-secondary">
            Manage two-factor authentication for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!loaded ? (
            <p className="text-sm text-text-secondary">Loading...</p>
          ) : twoFAEnabled ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-medium text-green-400">
                  Enabled
                </span>
                <span className="text-sm text-text-secondary">
                  {backupCodeCount} backup code{backupCodeCount !== 1 ? 's' : ''} remaining
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setRegenerateOpen(true)}
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Regenerate codes
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setDisable2FAOpen(true)}
                >
                  Disable 2FA
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-secondary">
                Add an extra layer of security to your account by requiring a code
                from your authenticator app when signing in.
              </p>
              <Button
                variant="primary"
                onClick={() => setSetup2FAOpen(true)}
              >
                <Shield className="mr-2 h-4 w-4" />
                Enable 2FA
              </Button>
            </div>
          )}
        </CardContent>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-border-subtle bg-bg-surface text-text-primary shadow">
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription className="text-text-secondary">
            Permanently delete your account and all associated data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-text-secondary">
            Once you delete your account, there is no going back after 30
            days. All of your files, folders, and shares will be permanently
            removed.
          </p>
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            Delete Account
          </Button>
        </CardContent>
      </div>

      <DeleteAccountDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />

      <TwoFactorSetupDialog
        open={setup2FAOpen}
        onOpenChange={setSetup2FAOpen}
      />

      <TwoFactorDisableDialog
        open={disable2FAOpen}
        onOpenChange={setDisable2FAOpen}
      />

      <TwoFactorRegenerateDialog
        open={regenerateOpen}
        onOpenChange={setRegenerateOpen}
      />
    </div>
  );
}
