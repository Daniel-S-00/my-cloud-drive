'use client';

import { CreditCard, LogOut, Shield, ShieldCheck } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { DeleteAccountDialog } from '@/components/delete-account-dialog';
import { TwoFactorDisableDialog } from '@/components/two-factor-disable-dialog';
import { TwoFactorSetupDialog } from '@/components/two-factor-setup-dialog';
import { TwoFactorRegenerateDialog } from '@/components/two-factor-regenerate-dialog';
import { get2FAStatus } from '@/app/actions/two-factor';
import {
  cancelSubscription,
  getSubscriptionStatus,
  type SubscriptionStatusResult,
} from '@/app/actions/billing';
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
  const [subscription, setSubscription] =
    useState<SubscriptionStatusResult | null>(null);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    get2FAStatus().then((s) => {
      setTwoFAEnabled(s.enabled);
      setBackupCodeCount(s.backupCodeCount);
      setLoaded(true);
    });
  }, [setup2FAOpen, disable2FAOpen, regenerateOpen]);

  useEffect(() => {
    getSubscriptionStatus().then((s) => {
      setSubscription(s);
      setBillingLoaded(true);
    });
  }, []);

  const onCancel = async () => {
    setCancelError(null);
    setCanceling(true);
    try {
      const result = await cancelSubscription();
      if (result.ok) {
        setSubscription((prev) =>
          prev ? { ...prev, cancelAtPeriodEnd: true } : prev,
        );
      } else {
        setCancelError(result.error ?? 'Could not cancel. Please try again.');
      }
    } catch {
      setCancelError('Something went wrong. Please try again.');
    } finally {
      setCanceling(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
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

      {/* Subscription */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-bg-surface text-text-primary shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-accent-glow" />
            Subscription
          </CardTitle>
          <CardDescription className="text-text-secondary">
            Manage your storage plan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!billingLoaded ? (
            <p className="text-sm text-text-secondary">Loading...</p>
          ) : subscription && subscription.isActive ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-medium text-green-400">
                  {subscription.plan} · active
                </span>
                <span className="text-sm text-text-secondary">
                  {subscription.cancelAtPeriodEnd
                    ? 'Cancels at the end of the billing period'
                    : subscription.currentPeriodEnd
                      ? `Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                      : ''}
                </span>
              </div>
              {cancelError && (
                <p className="text-sm text-red-400" role="alert">
                  {cancelError}
                </p>
              )}
              {!subscription.cancelAtPeriodEnd && (
                <Button
                  variant="outline"
                  onClick={onCancel}
                  disabled={canceling}
                >
                  {canceling ? 'Canceling…' : 'Cancel subscription'}
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">
              You&apos;re on the free plan.
            </p>
          )}
        </CardContent>
      </div>

      {/* Session */}
      <div className="mb-6 rounded-xl border border-border-subtle bg-bg-surface text-text-primary shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-accent-glow" />
            Session
          </CardTitle>
          <CardDescription className="text-text-secondary">
            Sign out of this device and return to the sign-in page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
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
