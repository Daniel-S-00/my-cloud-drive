import {
  HardDrive,
  KeyRound,
  Link2,
  RotateCcw,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { GlitchHeadline } from './glitch-headline';
import { GlitchText } from './glitch-text';

const features: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Upload,
    title: 'Drag-and-drop uploads',
    desc: 'Drop files straight into the drive. Presigned uploads keep everything moving fast.',
  },
  {
    icon: Link2,
    title: 'Shareable links',
    desc: 'Generate a link for any file or folder and control when it expires.',
  },
  {
    icon: RotateCcw,
    title: 'Trash & recovery',
    desc: 'Deleted files sit in trash until you empty it, so accidents don’t hurt.',
  },
  {
    icon: ShieldCheck,
    title: 'Two-factor auth',
    desc: 'TOTP codes and one-time backup codes keep your account locked down.',
  },
  {
    icon: KeyRound,
    title: 'Flexible sign-in',
    desc: 'Email and password, or one-click OAuth with Google and GitHub.',
  },
  {
    icon: HardDrive,
    title: 'R2 object storage',
    desc: 'Files are stored in Cloudflare R2 — scalable, durable, and yours.',
  },
];

export function Features() {
  return (
    <section id="features" data-testid="features" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-accent-glow">
          <GlitchText parts={[{ text: 'Capabilities' }]} />
        </p>
        <GlitchHeadline
          as="h2"
          start="view"
          className="mt-3 text-balance font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl"
          parts={[
            { text: 'Everything you need. ' },
            {
              text: "Nothing you don't.",
              className: 'landing-display font-normal text-accent-glow',
            },
          ]}
        />
        <p className="mt-4 text-balance text-base text-text-secondary">
          <GlitchText
            parts={[
              {
                text: 'A focused set of features that cover the day-to-day of owning your files — without the clutter of a mega-suite.',
              },
            ]}
          />
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, desc }, i) => (
          <div
            key={title}
            className="landing-fade group flex flex-col gap-3 rounded-2xl border border-border-subtle bg-bg-surface/60 p-6 transition-colors hover:border-accent-primary/50 hover:bg-bg-surface"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-primary/15 text-accent-glow transition-transform group-hover:scale-105">
              <Icon className="h-5 w-5" strokeWidth={1.75} />
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
