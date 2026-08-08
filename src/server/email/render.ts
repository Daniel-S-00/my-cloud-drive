import { render } from '@react-email/render';
import type { ReactElement } from 'react';

export type RenderedEmail = {
  html: string;
  text: string;
};

/**
 * Render a React Email component to HTML and plain text, ready for
 * sendEmail. Keeps the renderer in one place so templates stay free of
 * send/delivery concerns.
 */
export async function renderEmail(
  element: ReactElement,
): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { html, text };
}
