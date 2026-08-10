'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

export const JUST_LOGGED_IN_KEY = 'mcd-just-logged-in';

const TRASH_RETENTION_DAYS = 30;

export function TrashLoginToast({ trashCount }: { trashCount: number }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(JUST_LOGGED_IN_KEY) !== '1') return;
    sessionStorage.removeItem(JUST_LOGGED_IN_KEY);
    if (trashCount > 0) {
      toast.warning(
        `${trashCount} item${trashCount === 1 ? '' : 's'} in your trash will be permanently deleted after ${TRASH_RETENTION_DAYS} days.`,
        {
          description: 'Review and restore anything you want to keep.',
        },
      );
    }
  }, [trashCount]);

  return null;
}
