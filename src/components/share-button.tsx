'use client';

import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShareDialogs } from '@/contexts/share-dialog-context';

export function ShareButton({
  fileId,
  fileName,
  existing,
  size = 'sm',
}: {
  fileId: string;
  fileName: string;
  existing?: { id: string; shareUrl: string; expiresAt: string | null } | null;
  size?: 'sm' | 'icon';
}) {
  const { openShareDialog } = useShareDialogs();

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      onClick={() => openShareDialog({ id: fileId, name: fileName, existing })}
      disabled={!fileId}
      aria-label={`Share ${fileName}`}
      title="Share"
    >
      <Share2 className="h-4 w-4" />
      {size === 'sm' ? 'Share' : null}
    </Button>
  );
}
