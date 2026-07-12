import { test, expect } from '@playwright/test';

// Existing users stored progress via jStorage under a single localStorage
// "jStorage" blob. The app must migrate that to plain localStorage on first
// load so nobody loses their saved checklist.
test('migrates legacy jStorage data on first load', async ({ page }) => {
  await page.addInitScript(() => {
    const profiles = {
      current: 'Legacy Hero',
      darksouls3_profiles: {
        'Legacy Hero': {
          checklistData: { playthrough_17_1: true, checklist_1_1: true, weapons_1_1: true },
          collapsed: {},
          current_tab: '#tabPlaythrough',
          hide_completed: false,
          journey: 1,
          hidden_categories: {},
        },
      },
    };
    localStorage.setItem(
      'jStorage',
      JSON.stringify({
        darksouls3_profiles: profiles,
        style: 'Darkly',
        __jstorage_meta: { CRC32: {} },
      })
    );
  });

  await page.goto('/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);

  await expect(page.locator('#profiles')).toHaveValue('Legacy Hero');
  await expect(page.locator('#playthrough_17_1')).toBeChecked();
  await expect(page.locator('#weapons_1_1')).toBeChecked();

  // Legacy Bootswatch theme name falls back to a valid resolved theme.
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  expect(['light', 'dark']).toContain(theme);

  expect(await page.evaluate(() => localStorage.getItem('darksouls3_profiles'))).not.toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('__ds3_migrated'))).toBe('1');

  // Idempotent: data survives a reload.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  await expect(page.locator('#playthrough_17_1')).toBeChecked();
});
