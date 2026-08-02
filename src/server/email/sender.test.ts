// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock SOLO del boundary externo (Resend) — permitido; la lógica no se mockea.
const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: sendMock } };
  }),
}));

// AJUSTA si el export se llama distinto
import { sendEmail } from './sender';

beforeEach(() => sendMock.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe('sendEmail', () => {
  it('without RESEND_API_KEY: warns, does not send, does not throw', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');
    await expect(
      sendEmail({ to: 'a@b.c', subject: 'S', html: '<p>H</p>' }),
    ).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('with RESEND_API_KEY: sends via Resend with the right fields', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    sendMock.mockResolvedValue({ data: { id: 'x' }, error: null });

    await sendEmail({ to: 'a@b.c', subject: 'S', html: '<p>H</p>' });

    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.c', subject: 'S', html: '<p>H</p>' }),
    );
  });

  it('non-production NODE_ENV: no-op, never touches Resend or warns', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      sendEmail({ to: 'a@b.c', subject: 'S', html: '<p>H</p>' }),
    ).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});