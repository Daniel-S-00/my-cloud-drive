import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsTestUser, hasTestUser } from './auth';

const LONG_PRESS_MS = 500;

/**
 * Simulate a mobile long-press on an element: touch pointerdown, hold
 * past the ~350ms trigger, then release. Synthetic pointer events with
 * pointerType touch drive the app's useLongPress hook directly.
 */
async function longPress(page: Page, locator: Locator) {
  await locator.evaluate((el) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerType: 'touch',
        isPrimary: true,
        pointerId: 1,
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page.waitForTimeout(LONG_PRESS_MS);
  await locator.evaluate((el) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    el.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerType: 'touch',
        isPrimary: true,
        pointerId: 1,
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

test.describe('mobile multi-select (long-press)', () => {
  test.skip(!hasTestUser, 'no E2E test user configured');
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('long-press enters selection; tapping toggles; exit clears', async ({
    page,
  }) => {
    const fileCards = page.locator('.mobile-card', {
      hasText: /\.(png|mp3|webm|jpg|html)/,
    });
    await expect(fileCards.first()).toBeVisible();

    // Long-press the first file card.
    await longPress(page, fileCards.first());
    const bar = page.getByRole('toolbar', { name: /Selected items/ });
    await expect(bar).toBeVisible();
    await expect(bar.getByText('1 selected')).toBeVisible();

    // Move / Download / Share actions are present; Download & Share are
    // enabled for a single selected file.
    await expect(bar.getByRole('button', { name: /Move/ })).toBeVisible();
    await expect(
      bar.getByRole('button', { name: /Download/ }),
    ).toBeEnabled();
    await expect(bar.getByRole('button', { name: /Share/ })).toBeEnabled();

    // Tap a second file card -> 2 selected.
    await fileCards.nth(1).click();
    await expect(bar.getByText('2 selected')).toBeVisible();

    // Tap the first card again -> back to 1 (toggle off).
    await fileCards.first().click();
    await expect(bar.getByText('1 selected')).toBeVisible();

    // Exit clears the selection bar.
    await bar.getByRole('button', { name: /Clear selection/ }).click();
    await expect(page.getByRole('toolbar')).toHaveCount(0);
  });

  test('multi-select Move opens the dialog with the item count', async ({
    page,
  }) => {
    const fileCards = page.locator('.mobile-card', {
      hasText: /\.(png|mp3|webm|jpg|html)/,
    });
    await longPress(page, fileCards.first());
    await fileCards.nth(1).click();

    const bar = page.getByRole('toolbar');
    await expect(bar.getByText('2 selected')).toBeVisible();

    await bar.getByRole('button', { name: /Move/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Move 2 items/)).toBeVisible();
    // Cancel — don't mutate test data.
    await dialog.getByRole('button', { name: /Cancel/ }).click();
  });
});
