import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { GlitchHeadline } from './glitch-headline';
import { GlitchText } from './glitch-text';

export function Cta() {
  return (
    <section data-testid="cta" className="relative overflow-hidden border-t border-border-subtle/70">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-primary/12 blur-[120px]" />
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 py-24 text-center sm:px-6">
        <GlitchHeadline
          as="h2"
          start="view"
          className="text-balance font-display text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl"
          parts={[
            { text: 'Ready to bring your files ' },
            {
              text: 'back home?',
              className: 'landing-display font-normal text-accent-glow',
            },
          ]}
        />
        <p className="mt-5 max-w-lg text-balance text-base text-text-secondary">
          <GlitchText
            parts={[
              {
                text: 'Create your account in seconds and take back control of where your stuff lives.',
              },
            ]}
          />
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="group inline-flex h-12 items-center gap-2 rounded-lg bg-accent-primary px-7 text-sm font-medium text-white shadow-lg shadow-accent-primary/25 transition-colors hover:bg-accent-glow"
          >
            Create your account
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center rounded-lg border border-border-subtle bg-bg-surface/60 px-7 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface-hover"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
