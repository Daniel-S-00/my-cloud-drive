'use client';

import { useRef, type ChangeEvent } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useUpload } from '@/contexts/upload-context';
import { resolveFileInputItems } from '@/lib/folder-upload';

export function UploadFab({ folderId }: { folderId: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useUpload();

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    // Resolve webkitdirectory selections into files-with-target-folder so
    // picked folders preserve their structure.
    const resolved = await resolveFileInputItems(input, folderId);
    input.value = '';
    if (resolved.length === 0) return;

    if (resolved.length > 1) {
      toast.info(`Uploading ${resolved.length} files.`);
    }

    for (const { file, folderId: targetFolderId } of resolved) {
      await upload(file, targetFolderId);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        // Directory picker: lets the user select whole folders in
        // Chromium/Firefox/Safari. Files-only pickers ignore it.
        {...({ webkitdirectory: '', directory: '' } as object)}
        onChange={handleChange}
        className="hidden"
        disabled={isUploading}
      />
      <button
        onClick={handleClick}
        disabled={isUploading}
        className={[
          'fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center',
          'rounded-full bg-accent-primary text-white shadow-lg',
          'hover:bg-accent-glow hover:shadow-xl hover:scale-110',
          'active:scale-95 transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
          isUploading ? 'animate-pulse cursor-not-allowed' : '',
        ].join(' ')}
        aria-label="Upload files"
      >
        <Plus className="h-6 w-6" aria-hidden />
      </button>
    </>
  );
}
