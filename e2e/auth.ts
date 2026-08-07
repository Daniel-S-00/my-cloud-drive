import { type Page } from '@playwright/test';

// Login por UI con un usuario de test. Creds desde .env.local (NO commiteadas).
export async function loginAsTestUser(page: Page) {
  const email = process.env.E2E_TEST_EMAIL!;
  const password = process.env.E2E_TEST_PASSWORD!;
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /sign in|iniciar|login/i }).click();
  // Tras login con callbackUrl por defecto se aterriza en "/drive" (el drive).
  await page.waitForURL('/drive');
}

export const hasTestUser =
  !!process.env.E2E_TEST_EMAIL && !!process.env.E2E_TEST_PASSWORD;