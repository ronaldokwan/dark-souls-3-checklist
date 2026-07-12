import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page._errors = errors;
  await page.goto('/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
});

test('renders all 1953 items with no errors', async ({ page }) => {
  await expect(page.locator('.checkbox input[type="checkbox"]')).toHaveCount(1953);
  await expect(page.locator('#tabPlaythrough .table_of_contents li')).toHaveCount(22);
  expect(page._errors).toEqual([]);
});

test('checking an item updates totals, styles it, and persists across reload', async ({ page }) => {
  const overall = () => page.locator('#playthrough_overall_total').textContent();
  const before = await overall();
  expect(before).toMatch(/^\d+\/\d+$|^DONE$/);

  await page.locator('#playthrough_17_1').check();
  await expect(page.locator('#playthrough_17_1')).toHaveJSProperty('checked', true);
  const completed = await page
    .locator('#playthrough_17_1')
    .evaluate((cb) => cb.closest('label').classList.contains('completed'));
  expect(completed).toBe(true);
  expect(await overall()).not.toBe(before);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await expect(page.locator('#playthrough_17_1')).toBeChecked();
});

test('tab switching works and Hide Completed hides on non-checklist tabs', async ({ page }) => {
  await page.locator('[data-bs-target="#tabArmors"]').click();
  await expect(page.locator('#tabArmors')).toHaveClass(/active/);

  await page.locator('[data-bs-target="#tabOptions"]').click();
  await expect(page.locator('#btnHideCompleted')).toBeHidden();
  await expect(page.locator('#profiles option')).not.toHaveCount(0);
});

test('theme toggle flips data-bs-theme', async ({ page }) => {
  const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  const before = await theme();
  await page.locator('#themeToggle').click();
  expect(await theme()).not.toBe(before);
});

test('category filter reduces visible items and reflects partial state', async ({ page }) => {
  const visible = () => page.locator('#tabPlaythrough li.f_boss:visible').count();
  const before = await visible();
  await page.locator('label[for="f_boss"]').click();
  await expect(page.locator('#f_boss')).toBeChecked();
  expect(await visible()).toBeLessThan(before);

  const pureBossHidden = await page.$$eval('#tabPlaythrough li', (els) => {
    const pure = els.find((e) => e.className.trim() === 'f_boss');
    return pure ? getComputedStyle(pure).display === 'none' : true;
  });
  expect(pureBossHidden).toBe(true);

  const partial = await page
    .locator('#cat_quests')
    .evaluate((el) => el.closest('.filter-cat').classList.contains('partial'));
  expect(partial).toBe(true);
});

test('collapse toggle hides a section body', async ({ page }) => {
  const col = page.locator('#Cemetery_of_Ash_col');
  await expect(col).toHaveClass(/show/);
  const trigger = page.locator('a[data-bs-target="#Cemetery_of_Ash_col"]');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click({ force: true });
  await expect(col).not.toHaveClass(/show/);
});

test('search filters and highlights, and clears', async ({ page }) => {
  await page.locator('#playthrough_search').fill('Uchigatana');
  await page.waitForTimeout(200);
  const visible = await page.$$eval(
    '#playthrough_list li[data-id]',
    (els) => els.filter((e) => e.style.display !== 'none').length
  );
  expect(visible).toBeGreaterThan(0);
  expect(visible).toBeLessThan(50);
  expect(await page.locator('#playthrough_list .highlight').count()).toBeGreaterThan(0);

  await page.locator('#playthrough_search').fill('');
  await page.waitForTimeout(150);
  const restored = await page.$$eval(
    '#playthrough_list li[data-id]',
    (els) => els.filter((e) => e.style.display !== 'none').length
  );
  expect(restored).toBeGreaterThan(900);
});

test('section Toggle checks all, Clear unchecks all', async ({ page }) => {
  await page.locator('#Cemetery_of_Ash_col').evaluate((el) => el.classList.add('show'));
  const toggle = page.locator('#Cemetery_of_Ash .btn-section-toggle');
  const clear = page.locator('#Cemetery_of_Ash .btn-section-clear');
  await toggle.scrollIntoViewIfNeeded();
  const total = await page.locator('#Cemetery_of_Ash_col .checkbox input').count();

  await clear.click();
  await toggle.click();
  await expect(page.locator('#Cemetery_of_Ash_col .checkbox input:checked')).toHaveCount(total);

  await clear.click();
  await expect(page.locator('#Cemetery_of_Ash_col .checkbox input:checked')).toHaveCount(0);
});

test('profile modal opens', async ({ page }) => {
  await page.locator('[data-bs-target="#tabOptions"]').click();
  await page.locator('#profileAdd').click();
  await expect(page.locator('#profileModal')).toBeVisible();
});

// Regression guard: totals must reflect the actual checkboxes present, not a
// sequential id scan. Removing a middle item must drop the denominator by
// exactly one (the old id-scan algorithm broke on such gaps).
test('totals are robust to non-contiguous / missing ids', async ({ page }) => {
  const denom = async () => {
    const t = await page.locator('#playthrough_totals_17').textContent();
    return parseInt(t.split('/')[1], 10);
  };
  const start = await denom();
  expect(start).toBeGreaterThan(2);

  // Remove a middle item from the DOM to create a gap, then trigger a recalc.
  await page.locator('#playthrough_17_5').evaluate((cb) => cb.closest('li').remove());
  await page.locator('#playthrough_17_1').check(); // triggers calculateTotals
  const after = await denom();
  // numerator now 1; denominator should be exactly one less than before.
  expect(after).toBe(start - 1);
});
