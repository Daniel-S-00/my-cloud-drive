import { Lock, RotateCcw, Share2, ShieldCheck, type LucideIcon } from 'lucide-react';
import { GlitchHeadline } from './glitch-headline';
import { GlitchText } from './glitch-text';

const pillars: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Lock,
    title: 'Private to you',
    desc: 'No other user can see your files — only the people you share with.',
  },
  {
    icon: ShieldCheck,
    title: 'Protected access',
    desc: 'Two-factor authentication with one-time backup codes.',
  },
  {
    icon: RotateCcw,
    title: 'Never lose a file',
    desc: 'Deleted files stay in trash until you decide to empty it.',
  },
  {
    icon: Share2,
    title: 'Share on your terms',
    desc: 'Links for any file or folder, with optional expiry dates.',
  },
];

export function Pillars() {
  return (
    <section data-testid="pillars" className="border-y border-border-subtle/70 bg-bg-surface/30">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-px overflow-hidden px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {pillars.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex flex-col gap-2.5 p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-bg-surface text-accent-glow">
              <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
            </span>
            <GlitchHeadline
              as="h3"
              start="view"
              className="text-sm font-semibold text-text-primary"
              parts={[{ text: title }]}
            />
            <p className="text-sm leading-relaxed text-text-secondary">
              <GlitchText parts={[{ text: desc }]} />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
