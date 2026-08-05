import { Cloud } from 'lucide-react';
import { SidebarContent } from '@/components/sidebar-content';

export function AppSidebar({
  trashCount,
  usedBytes,
}: {
  trashCount: number;
  usedBytes: number;
}) {
  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-border-subtle bg-bg-surface/30 md:flex">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border-subtle px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-glow ring-1 ring-inset ring-accent-primary/30">
          <Cloud className="h-4.5 w-4.5" strokeWidth={1.75} />
        </span>
        <span className="font-display text-sm font-semibold tracking-tight text-text-primary">
          My Cloud Drive
        </span>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <SidebarContent trashCount={trashCount} usedBytes={usedBytes} />
      </div>
    </aside>
  );
}
