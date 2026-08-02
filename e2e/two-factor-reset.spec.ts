import { test, expect } from '@playwright/test';
import { loginAsTestUser, hasTestUser } from './auth';

// Regex del secreto mostrado: 8 grupos de 4 chars base32 separados por espacios.
const SECRET_RE = /([A-Z2-7]{4} ){7}[A-Z2-7]{4}/;

test('2FA secret text differs across two dialog opens', async ({ page }) => {
  // Precondición: el test user NO debe tener 2FA habilitado, porque
  // setup2FA() responde {ok:false} si ya está activo y no renderiza secreto.
  test.skip(!hasTestUser, 'set E2E_TEST_EMAIL/PASSWORD in .env.local to run');
  await loginAsTestUser(page);
  await page.goto('/settings');

  const readSecret = async () => {
    await page.getByRole('button', { name: /enable 2fa/i }).click();
    const secret = page.getByText(SECRET_RE).first();
    await expect(secret).toBeVisible();
    const text = (await secret.textContent())?.replace(/\s+/g, ' ').trim() ?? '';
    // El dialog se cierra con Escape o click en el backdrop; no hay botón close.
    await page.keyboard.press('Escape');
    await expect(secret).toBeHidden();
    return text;
  };

  const first = await readSecret();
  const second = await readSecret();
  expect(first).toMatch(SECRET_RE);
  expect(second).toMatch(SECRET_RE);
  expect(second).not.toBe(first); // el gate: secreto fresco en cada apertura
});