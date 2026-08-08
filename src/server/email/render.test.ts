// @vitest-environment node
import { createElement } from 'react';
import { describe, it, expect } from 'vitest';
import { renderEmail } from './render';
import { ConfirmEmail } from './templates/confirm-email';
import { ResetPasswordEmail } from './templates/reset-password';
import { RecoverAccountEmail } from './templates/recover-account';

describe('email templates', () => {
  it('confirm-email renders the CTA pointing at the confirmation URL', async () => {
    const { html, text } = await renderEmail(
      createElement(ConfirmEmail, {
        confirmationUrl: 'https://app.example.com/auth/callback?code=abc',
        email: 'user@example.com',
      }),
    );

    expect(html).toContain('https://app.example.com/auth/callback?code=abc');
    expect(html).toContain('Confirm email');
    expect(text).toContain('Confirm email');
    expect(text).toContain('user@example.com');
  });

  it('reset-password renders the CTA pointing at the reset URL', async () => {
    const { html, text } = await renderEmail(
      createElement(ResetPasswordEmail, {
        resetUrl: 'https://app.example.com/reset-password?code=xyz',
        email: 'user@example.com',
      }),
    );

    expect(html).toContain('https://app.example.com/reset-password?code=xyz');
    expect(html).toContain('Reset password');
    expect(text).toContain('Reset password');
  });

  it('recover-account renders the CTA, email, and grace period', async () => {
    const { html, text } = await renderEmail(
      createElement(RecoverAccountEmail, {
        recoveryUrl: 'https://app.example.com/recover-account?token=t0k3n',
        email: 'user@example.com',
        gracePeriodDays: 30,
      }),
    );

    expect(html).toContain(
      'https://app.example.com/recover-account?token=t0k3n',
    );
    expect(html).toContain('30 days');
    expect(text).toContain('user@example.com');
    expect(text).toContain('Recover account');
  });
});
