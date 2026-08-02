import { test, expect } from '@playwright/test';

test('with ?token= shows restore prompt on first frame, never the email form', async ({ page }) => {
  await page.goto('/recover-account?token=whatever');
  // Debe aparecer el prompt de restaurar...
  await expect(page.getByRole('button', { name: /restore|restaurar/i })).toBeVisible();
  // ...y NUNCA el formulario de pedir email en ese mismo estado.
  await expect(page.getByLabel(/email/i)).toHaveCount(0);
});

test('without token shows the request-email form', async ({ page }) => {
  await page.goto('/recover-account');
  await expect(page.getByLabel(/email/i)).toBeVisible();
});