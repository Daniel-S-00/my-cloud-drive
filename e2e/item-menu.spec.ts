import { test, expect, type Page } from '@playwright/test';
import { loginAsTestUser, hasTestUser } from './auth';

// Temp folder name is unique per run so parallel workers don't collide.
const TEMP_PREFIX = `e2e-menu-${Date.now()}`;

async function createFolder(page: Page, name: string) {
  await page.getByRole('button', { name: /New folder/i }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: /Create folder/i }).click();
  await expect(page.getByRole('row', { name })).toBeVisible();
}

async function openMenuFor(page: Page, name: string) {
  await page
    .getByRole('button', { name: new RegExp(`Actions for ${name}`) })
    .click();
  return page.getByRole('menu');
}

async function deleteFolderViaMenu(page: Page, name: string) {
  const menu = await openMenuFor(page, name);
  await menu.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: /Delete folder/ }).click();
}

test.describe('per-item 3-dot menu', () => {
  test.skip(!hasTestUser, 'no E2E test user configured');

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('folder menu offers move/rename/copy-name and rename works', async ({
    page,
  }) => {
    const name = `${TEMP_PREFIX}-rename`;
    await createFolder(page, name);

    const menu = await openMenuFor(page, name);
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole('menuitem', { name: /Move to folder/ }),
    ).toBeVisible();
    await expect(
      menu.getByRole('menuitem', { name: /Rename/ }),
    ).toBeVisible();
    await expect(
      menu.getByRole('menuitem', { name: /Copy name/ }),
    ).toBeVisible();

    await menu.getByRole('menuitem', { name: /Rename/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/New name/i).fill(`${name}-v2`);
    await dialog.getByRole('button', { name: /Rename/ }).click();

    await expect(page.getByRole('row', { name: `${name}-v2` })).toBeVisible();

    // Cleanup: delete the temp folder via the menu.
    await deleteFolderViaMenu(page, `${name}-v2`);
    await expect(page.getByText(`${name}-v2`)).toHaveCount(0);
  });

  test('move to folder via menu moves the item', async ({ page }) => {
    const name = `${TEMP_PREFIX}-move`;
    await createFolder(page, name);

    const menu = await openMenuFor(page, name);
    await menu.getByRole('menuitem', { name: /Move to folder/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Move to folder/)).toBeVisible();
    // Drill into the AI Generated folder and move the item there.
    await dialog.getByRole('button', { name: 'AI Generated' }).click();
    await dialog.getByRole('button', { name: /Move here/ }).click();

    // It leaves the root…
    await expect(page.getByText(name)).toHaveCount(0);
    // …and lands inside AI Generated.
    await page.goto('/drive?folder=e8afd369-73d0-4523-9cc2-2d7371ffcabb');
    await expect(page.getByRole('row', { name })).toBeVisible();

    // Move it back to My Drive (root) for cleanup.
    const menu2 = await openMenuFor(page, name);
    await menu2.getByRole('menuitem', { name: /Move to folder/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Move here/ })
      .click();
    // Wait for the move to finish (dialog closes on success) before
    // navigating, so the server revalidation has flushed.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/drive');
    await expect(page.getByRole('row', { name })).toBeVisible();

    // Delete the temp folder via the menu.
    await deleteFolderViaMenu(page, name);
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test('file menu offers download and share', async ({ page }) => {
    const menuButton = page.getByRole('button', {
      name: /Actions for .*\.(png|mp3|webm|jpg|html)/,
    });
    await expect(menuButton.first()).toBeVisible();
    await menuButton.first().click();

    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: /Download/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Share/ })).toBeVisible();
    await expect(
      menu.getByRole('menuitem', { name: /Copy name/ }),
    ).toBeVisible();
  });
});
