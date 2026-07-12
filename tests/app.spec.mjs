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
  // Toggle/Clear only act on items visible under the current journey filter, so
  // count the visible checkboxes (NG+/NG++ entries are hidden on NG).
  const total = await page.locator('#Cemetery_of_Ash_col .checkbox input:visible').count();

  await clear.click();
  await toggle.click();
  await expect(page.locator('#Cemetery_of_Ash_col .checkbox input:checked')).toHaveCount(total);

  await clear.click();
  await expect(page.locator('#Cemetery_of_Ash_col .checkbox input:checked')).toHaveCount(0);
});

test('checking a unique item mirrors to its twin in another tab (bidirectional)', async ({
  page,
}) => {
  // Estus Ring: playthrough_1_16 (Playthrough) <-> checklist_5_3 (Achievements).
  const play = page.locator('#playthrough_1_16');
  const ach = page.locator('#checklist_5_3');

  await play.check();
  await expect(ach).toBeChecked(); // Playthrough -> Achievements

  await play.uncheck();
  await expect(ach).not.toBeChecked();

  // Reverse direction: check it from the Achievements tab.
  await page.locator('[data-bs-target="#tabChecklists"]').click();
  await ach.check();
  await expect(play).toBeChecked(); // Achievements -> Playthrough

  // Persists across reload for both.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await expect(page.locator('#playthrough_1_16')).toBeChecked();
  await expect(page.locator('#checklist_5_3')).toBeChecked();
});

test('stackable items are not chained together', async ({ page }) => {
  // Homeward Bone appears 24x in the Playthrough alone, so its wiki URL resolves
  // to many ids per tab and must never be linked. Checking one must not cascade
  // into a pile of other boxes across the page.
  const before = await page.locator('.checkbox input:checked').count();
  const bones = page.locator('#tabPlaythrough li.f_misc input[type="checkbox"]');
  // Find a Homeward Bone row and check exactly one box.
  const bone = page
    .locator('#tabPlaythrough li', { hasText: 'Homeward Bone' })
    .locator('input[type="checkbox"]')
    .first();
  await bone.check();
  const after = await page.locator('.checkbox input:checked').count();
  expect(after).toBe(before + 1); // only the one we clicked
  void bones;
});

test('section Clear propagates to linked twins in other tabs', async ({ page }) => {
  const play = page.locator('#playthrough_1_16'); // Estus Ring
  const ach = page.locator('#checklist_5_3');

  await play.check();
  await expect(ach).toBeChecked();

  // Clear the whole Playthrough section that contains the Estus Ring.
  await page.locator('#playthrough_1_16').evaluate((cb) => {
    const container = cb.closest('[id$="_col"]');
    container.previousElementSibling.querySelector('.btn-section-clear').click();
  });

  await expect(play).not.toBeChecked();
  await expect(ach).not.toBeChecked(); // propagated across the tab boundary
});

test('section Toggle on NG does not check hidden NG+/NG++ items', async ({ page }) => {
  // Cemetery of Ash contains f_ring s_ng+ (playthrough_17_16) and s_ng++
  // (playthrough_17_17) entries that are hidden while on NG. Toggling the
  // section must not check them.
  await page.locator('#Cemetery_of_Ash_col').evaluate((el) => el.classList.add('show'));
  const toggle = page.locator('#Cemetery_of_Ash .btn-section-toggle');
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();

  // A normal, visible NG item in the section is checked...
  await expect(page.locator('#playthrough_17_1')).toBeChecked();
  // ...but the journey-only entries (hidden on NG) are left alone.
  await expect(page.locator('#playthrough_17_16')).not.toBeChecked();
  await expect(page.locator('#playthrough_17_17')).not.toBeChecked();

  // They only become visible on NG++, still unchecked.
  await page.locator('label[for="ng3"]').click();
  await expect(page.locator('#playthrough_17_16')).not.toBeChecked();
  await expect(page.locator('#playthrough_17_17')).not.toBeChecked();
});

test('section Toggle on NG+ checks NG+ items but not hidden NG++ items', async ({ page }) => {
  // On NG+ (journey 2): s_ng+ entries are visible, s_ng++ entries are still
  // hidden. Toggling the section should check the former but not the latter.
  await page.locator('label[for="ng2"]').click();
  await page.locator('#Cemetery_of_Ash_col').evaluate((el) => el.classList.add('show'));
  const toggle = page.locator('#Cemetery_of_Ash .btn-section-toggle');
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();

  await expect(page.locator('#playthrough_17_16')).toBeChecked(); // s_ng+ (visible on NG+)
  await expect(page.locator('#playthrough_17_17')).not.toBeChecked(); // s_ng++ (still hidden)

  // Reveal NG++ items; the s_ng++ entry is still unchecked.
  await page.locator('label[for="ng3"]').click();
  await expect(page.locator('#playthrough_17_17')).not.toBeChecked();
});

test('Collapse/Expand All toggles every section in the active tab and persists', async ({
  page,
}) => {
  const btn = page.locator('#collapseAllToggle');
  const openCount = () => page.locator('#tabPlaythrough [id$="_col"].show').count();

  expect(await openCount()).toBeGreaterThan(0);
  await expect(btn).toContainText('Collapse All');

  await btn.click();
  expect(await openCount()).toBe(0);
  await expect(btn).toContainText('Expand All');

  await btn.click();
  expect(await openCount()).toBeGreaterThan(0);
  await expect(btn).toContainText('Collapse All');

  // Collapse all, then reload — sections stay collapsed (state persisted).
  await btn.click();
  expect(await openCount()).toBe(0);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  expect(await page.locator('#tabPlaythrough [id$="_col"].show').count()).toBe(0);
  await expect(page.locator('#collapseAllToggle')).toContainText('Expand All');
});

test('Misc/Crow (Pickle Pee) trades are never linked to other tabs', async ({ page }) => {
  // Loretta's Bone shares a wiki URL between playthrough_3_8 (found) and
  // crow_1_4 (crow trade), but trading is a separate acquisition — no sync.
  const play = page.locator('#playthrough_3_8');
  const crow = page.locator('#crow_1_4');

  await play.check();
  await expect(crow).not.toBeChecked();
  await play.uncheck();

  await page.locator('[data-bs-target="#tabMisc"]').click();
  await crow.check();
  await expect(play).not.toBeChecked();

  // Excluding Crow must not break other links that happen to share a crow URL:
  // Eleonora still syncs playthrough_9_6 <-> weapons_1_87.
  await page.locator('[data-bs-target="#tabPlaythrough"]').click();
  await page.locator('#playthrough_9_6').check();
  await expect(page.locator('#weapons_1_87')).toBeChecked();
});

test('NG+/NG++ upgrade variants sync to their matching Achievements entry', async ({ page }) => {
  // Ring of Favor+1 (s_ng+, visible on NG+) must sync to the Achievements "+1"
  // entry only — not the base or +2, which share the same wiki page.
  await page.locator('label[for="ng2"]').click();
  await page.locator('#playthrough_15_72').check();
  await expect(page.locator('#checklist_5_78')).toBeChecked(); // Ring of Favor+1
  await expect(page.locator('#checklist_5_7')).not.toBeChecked(); // base
  await expect(page.locator('#checklist_5_79')).not.toBeChecked(); // +2

  // Ring of Favor+2 (s_ng++, visible on NG++) syncs to the "+2" entry.
  await page.locator('label[for="ng3"]').click();
  await page.locator('#playthrough_5_56').check();
  await expect(page.locator('#checklist_5_79')).toBeChecked();
});

test('defeating a boss syncs to its Achievements entry', async ({ page }) => {
  // Every Boss Achievements entry is linked to its Playthrough defeat by an
  // item key. Spot-check a few, including tricky cases.
  const pairs = [
    ['#playthrough_6_73', '#checklist_8_5'], // Abyss Watchers
    ['#playthrough_14_36', '#checklist_8_8'], // Old Demon King (also carries its soul key)
    ['#playthrough_3_50', '#checklist_8_3'], // Curse-rotted Greatwood (URL-casing mismatch)
    ['#playthrough_12_45', '#checklist_8_18'], // Nameless King
  ];
  for (const [play, ach] of pairs) {
    await page.locator(play).check();
    await expect(page.locator(ach)).toBeChecked();
  }
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
