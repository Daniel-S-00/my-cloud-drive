import { createElement } from 'react';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { render } from '@react-email/render';
import { ConfirmEmail } from '../src/server/email/templates/confirm-email';
import { ResetPasswordEmail } from '../src/server/email/templates/reset-password';
import { RecoverAccountEmail } from '../src/server/email/templates/recover-account';

const OUT_DIR = path.join(import.meta.dirname, '../emails/out');

// render() outputs one minified line and leaks React Server Component
// streaming markers (<!--$-->, <!--body-->, etc.) into the HTML. Emails
// don't need RSC markers, and a single-line file is painful to review,
// so pretty-print and strip the markers before writing.
function sanitizeHtml(raw: string): string {
  const noMarkers = raw.replace(
    /<!--\$-->|<!--\/\$-->|<!--html-->|<!--head-->|<!--body-->/g,
    '',
  );
  // Preview components pad with invisible zero-width chars so the inbox
  // preview never truncates mid-word. Harmless to clients but renders as
  // garbage in editors — strip them (the visible preview text stays).
  const noZwsp = noMarkers.replace(/[\u200B-\u200F\uFEFF]+/g, '');
  // The <Preview> component pads its hidden div with &nbsp; so the inbox
  // preview never truncates mid-word. Harmless to clients but renders as
  // garbage in editors — strip the padding between the nested divs, keep
  // the visible preview text.
  const noNbspPad = noZwsp.replace(
    /(<div[^>]*data-skip-in-text="true">[^<]*<div>)[\u00A0\u200B-\u200F\uFEFF]+(<\/div><\/div>)/g,
    '$1$2',
  );
  const pretty = noNbspPad.replace(/></g, '>\n<');
  return pretty;
}

// Render a template to a paste-ready HTML file. Confirm/reset use the
// Supabase placeholders (they're pasted into the dashboard and Supabase
// substitutes the link at send-time). Recover-account is sent by our own
// app, so it renders a real URL instead.
const jobs: Array<{ file: string; element: ReturnType<typeof createElement> }> = [
  {
    file: 'confirm-signup.html',
    element: createElement(ConfirmEmail, {
      confirmationUrl: '{{ .ConfirmationURL }}',
      email: '{{ .Email }}',
    }),
  },
  {
    file: 'reset-password.html',
    element: createElement(ResetPasswordEmail, {
      resetUrl: '{{ .RecoveryURL }}',
      email: '{{ .Email }}',
    }),
  },
  {
    file: 'recover-account.html',
    element: createElement(RecoverAccountEmail, {
      recoveryUrl: 'https://my-cloud-drive.space/recover-account?token=EXAMPLE',
      email: 'you@example.com',
      gracePeriodDays: 30,
    }),
  },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const { file, element } of jobs) {
    const html = sanitizeHtml(await render(element));
    await writeFile(path.join(OUT_DIR, file), html, 'utf8');
    console.log(`Wrote ${file}`);
  }

  console.log(`\nOutput: ${path.resolve(OUT_DIR)}`);
}

void main();
