/**
 * In development, recovery emails are logged to the server console
 * instead of actually sent. In production, they should go through
 * Resend or an equivalent service.
 */

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      // Lazy-load Resend to avoid requiring the dep in dev.
      const { Resend } = await import(
        /* webpackIgnore: true */ 'resend'
      );
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from: 'My Cloud Drive <noreply@myclouddrive.com>',
        ...input,
      });
      return;
    }
    console.warn(
      'RESEND_API_KEY not set. Recovery email not sent. Target:',
      input.to,
    );
    return;
  }

}
