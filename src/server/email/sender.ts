import * as Sentry from '@sentry/nextjs';

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

// The verified sender. Overridable via EMAIL_FROM (see .env.example).
// Falls back to the verified domain so a missing env var degrades to a
// working send instead of a hard failure.
const DEFAULT_FROM = 'My Cloud Drive <noreply@my-cloud-drive.space>';

/**
 * Send a transactional email.
 *
 * In development and test, the rendered email is logged to the server
 * console instead of being sent, so flows stay exercisable locally
 * without burning Resend quota. In production the email goes through
 * the Resend API.
 *
 * Sending is best-effort: a failure (missing key, Resend error) logs
 * and is reported to Sentry but never throws — callers treat email as
 * non-critical relative to the action that triggered it.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailInput): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `\n── Email (not sent in ${process.env.NODE_ENV ?? 'development'}) ──` +
        `\nTo: ${to}` +
        `\nSubject: ${subject}` +
        `\n${text ?? html}` +
        `\n${'─'.repeat(50)}`,
    );
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      '[email] RESEND_API_KEY not set. Email not sent. Target:',
      to,
    );
    return;
  }

  try {
    // Lazy-load Resend so a missing/broken dep doesn't break the app at
    // module load in environments that never send email.
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM?.trim() || DEFAULT_FROM,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }
  } catch (err) {
    console.error('[email] failed to send:', err);
    Sentry.captureException(err);
  }
}
