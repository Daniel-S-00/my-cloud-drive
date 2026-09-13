import { Check, ShieldCheck } from 'lucide-react';
import { GlitchHeadline } from './glitch-headline';
import { GlitchText } from './glitch-text';

const assurances = [
  {
    title: 'Passwords never stored in plain text',
    desc: 'Credentials are salted and hashed before they ever touch the database.',
  },
  {
    title: 'Two-factor with backup codes',
    desc: 'TOTP via your authenticator app, plus rotating single-use backup codes.',
  },
  {
    title: 'Recoverable deletion',
    desc: 'Accounts and files move to a grace-period trash before anything is gone for good.',
  },
  {
    title: 'Ownership enforced on every write',
    desc: 'Server actions verify the current user before any file or folder mutation.',
  },
];

export function Security() {
  return (
    <section id="security" data-testid="security" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pb-24 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-border-subtle bg-bg-surface/50">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent-primary/12 blur-[100px]" />
        </div>

        <div className="relative grid gap-10 p-8 sm:p-12 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-accent-glow">
              <ShieldCheck className="h-4 w-4" />
              <GlitchText parts={[{ text: 'Security' }]} />
            </p>
            <GlitchHeadline
              as="h2"
              start="view"
              className="mt-3 text-balance font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl"
              parts={[
                { text: 'Protected ' },
                {
                  text: 'from the ground up.',
                  className: 'landing-display font-normal text-accent-glow',
                },
              ]}
            />
            <p className="mt-4 max-w-md text-base leading-relaxed text-text-secondary">
              <GlitchText
                parts={[
                  {
                    text: "Storage is only half the story. Every account, file, and share is guarded by the same practices you'd expect from a service you pay for — because your data deserves nothing less.",
                  },
                ]}
              />
            </p>
          </div>

          <ul className="flex flex-col gap-5">
            {assurances.map(({ title, desc }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent-primary/40 bg-accent-primary/15 text-accent-glow">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    <GlitchText parts={[{ text: title }]} />
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">
                    <GlitchText parts={[{ text: desc }]} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
