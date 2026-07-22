'use client';

import { useState } from 'react';
import { DeleteAccountDialog } from '@/components/delete-account-dialog';
import { Button } from '@/components/ui/button';
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function SettingsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-text-primary">
        Settings
      </h1>

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
            onClick={() => setDialogOpen(true)}
          >
            Delete Account
          </Button>
        </CardContent>
      </div>

      <DeleteAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
