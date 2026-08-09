// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock SOLO del boundary externo (Resend) — permitido; la lógica no se mockea.
const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: sendMock } };
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import { sendEmail } from './sender';

beforeEach(() => {
  sendMock.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

const baseInput = {
  to: 'a@b.c',
  subject: 'S',
  html: '<p>H</p>',
  text: 'H',
};

describe('sendEmail', () => {
  it('without RESEND_API_KEY in production: warns, does not send, does not throw', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(sendEmail(baseInput)).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('RESEND_API_KEY not set'),
      baseInput.to,
    );
    warnSpy.mockRestore();
  });

  it('with RESEND_API_KEY in production: sends via Resend with the right fields', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', 'My Cloud Drive <noreply@my-cloud-drive.space>');
    sendMock.mockResolvedValue({ data: { id: 'x' }, error: null });

    await sendEmail(baseInput);

    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: baseInput.to,
        subject: baseInput.subject,
        html: baseInput.html,
        text: baseInput.text,
        from: 'My Cloud Drive <noreply@my-cloud-drive.space>',
      }),
    );
  });

  it('with RESEND_API_KEY in production but no EMAIL_FROM: falls back to the default sender', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', '');
    sendMock.mockResolvedValue({ data: { id: 'x' }, error: null });

    await sendEmail(baseInput);

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'My Cloud Drive <noreply@my-cloud-drive.space>',
      }),
    );
  });

  it('does not send text when not provided', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    sendMock.mockResolvedValue({ data: { id: 'x' }, error: null });

    await sendEmail({ to: 'a@b.c', subject: 'S', html: '<p>H</p>' });

    expect(sendMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ text: expect.any(String) }),
    );
  });

  it('Resend error: logs and does not throw', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    sendMock.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendEmail(baseInput)).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('non-production NODE_ENV: logs to console, never touches Resend', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(sendEmail(baseInput)).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(baseInput.subject),
    );
    logSpy.mockRestore();
  });
});
