'use client';

import { useTransition } from 'react';
import { Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { toggleFileFavorite, toggleFolderFavorite } from '@/app/actions/favorites';

/**
 * Drive-style favorite star. Filled when the item is favorited; shown
 * inline on hover on desktop (and hidden on touch, where actions live
 * in the 3-dot menu).
 */
export function FavoriteButton({
  type,
  id,
  favorited,
  disabled = false,
  className,
}: {
  type: 'file' | 'folder';
  id: string;
  favorited: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onToggle = () => {
    if (pending || disabled) return;
    startTransition(async () => {
      try {
        if (type === 'file') {
          await toggleFileFavorite({ fileId: id });
        } else {
          await toggleFolderFavorite({ folderId: id });
        }
        toast.success(
          favorited ? 'Removed from favorites' : 'Added to favorites',
        );
        router.refresh();
      } catch (err) {
        toast.error('Could not update favorite', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onToggle();
      }}
      disabled={disabled || pending}
      aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
      title={favorited ? 'Remove from favorites' : 'Add to favorites'}
      data-no-drag
      className={[
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow disabled:opacity-40',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Star
        className={[
          'h-4 w-4',
          favorited ? 'fill-amber-400 text-amber-400' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden
      />
    </button>
  );
}
