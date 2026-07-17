import { expect, test } from '@playwright/test';

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

test('Resources tab shows soft caps, build targets, and the relocated Soul Types', async ({
  page,
}) => {
  await page.locator('[data-bs-target="#tabResources"]').click();
  await expect(page.locator('#tabResources')).toHaveClass(/active/);

  // Reference content only: one row per stat, one card per caster build.
  await expect(page.locator('#tabResources .stat_table tbody tr')).toHaveCount(9);
  await expect(page.locator('#tabResources .build-target')).toHaveCount(3);
  await expect(page.locator('#tabResources .build-target.target-sorc')).toContainText('INT');

  // Soul Types moved here from the Misc tab.
  await expect(page.locator('#tabResources .soul_grid li')).toHaveCount(22);
  await expect(page.locator('#tabMisc .soul_grid')).toHaveCount(0);

  // No checkboxes on this tab, so the checklist controls stay hidden.
  await expect(page.locator('#tabResources .checkbox')).toHaveCount(0);
  await expect(page.locator('#btnHideCompleted')).toBeHidden();
});

test('theme toggle flips data-bs-theme', async ({ page }) => {
  const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-bs-theme'));
  const before = await theme();
  await page.locator('#themeToggle').click();
  expect(await theme()).not.toBe(before);
});

test('category filter reduces visible items and reflects partial state', async ({ page }) => {
  await page.locator('#tabPlaythrough .filter-panel summary').click();

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

test('Misc/Crow (Pickle Pee) trades link only their sole-source rewards', async ({ page }) => {
  // Loretta's Bone shares a wiki URL between playthrough_3_8 (found) and
  // crow_1_4 (crow trade), but trading it away is a separate acquisition — no
  // sync between the pickup and the trade, and the Ring of Sacrifice reward
  // has other sources so the trade stays unlinked too.
  const play = page.locator('#playthrough_3_8');
  const crow = page.locator('#crow_1_4');

  await play.check();
  await expect(crow).not.toBeChecked();
  await play.uncheck();

  await page.locator('[data-bs-target="#tabMisc"]').click();
  await crow.check();
  await expect(play).not.toBeChecked();

  // Rewards whose ONLY source is the trade DO sync with their collection
  // entry: Siegbräu -> Armor of the Sun mirrors into the armor tab.
  const armorTrade = page.locator('#crow_1_10');
  const armorEntry = page.locator('#armors_2_18');
  await armorTrade.check();
  await expect(armorEntry).toBeChecked();
  await armorTrade.uncheck();
  await expect(armorEntry).not.toBeChecked();

  // Excluding the multi-source trades must not break other links that happen
  // to share a crow URL: Eleonora still syncs playthrough_9_6 <-> weapons_1_87.
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

test('multi-item drops and same-URL variants sync to the right twins', async ({ page }) => {
  // Havel (playthrough_12_40) drops two items at once: both collection boxes
  // must mirror. The summoned Havel (playthrough_12_33) is an alternate source
  // of the same drops with its own -b keys: either spot syncs the collection
  // boxes without chaining to the other spot.
  await page.locator('#playthrough_12_40').check();
  await expect(page.locator('#weapons_1_113')).toBeChecked(); // Dragon Tooth
  await expect(page.locator('#weapons_2_55')).toBeChecked(); // Havel's Greatshield
  await expect(page.locator('#playthrough_12_33')).not.toBeChecked();
  await page.locator('#playthrough_12_40').uncheck();
  await expect(page.locator('#weapons_1_113')).not.toBeChecked();
  await page.locator('#playthrough_12_33').check();
  await expect(page.locator('#weapons_1_113')).toBeChecked();
  await expect(page.locator('#weapons_2_55')).toBeChecked();
  await expect(page.locator('#playthrough_12_40')).not.toBeChecked();

  // The two Loincloths share one wiki URL but are distinct items: the Undead
  // Settlement pickup syncs only the base entry, the Dreg Heap pickup only the
  // Ringed City version.
  await page.locator('#playthrough_3_44').check();
  await expect(page.locator('#armors_4_12')).toBeChecked();
  await expect(page.locator('#armors_4_90')).not.toBeChecked();
  await page.locator('#playthrough_21_31').check();
  await expect(page.locator('#armors_4_90')).toBeChecked();

  // Manikin Claws drop from either Pale Shade invasion: each playthrough spot
  // syncs the collection box via its own key, without chaining to the other
  // invasion.
  await page.locator('#playthrough_6_75').check();
  await expect(page.locator('#weapons_1_119')).toBeChecked();
  await expect(page.locator('#playthrough_15_35')).not.toBeChecked();
  await page.locator('#playthrough_6_75').uncheck();
  await expect(page.locator('#weapons_1_119')).not.toBeChecked();
  await page.locator('#playthrough_15_35').check();
  await expect(page.locator('#weapons_1_119')).toBeChecked();

  // Set head pieces named unlike their sets (Sneering/Steel/Billed masks)
  // spawn with the same pickups and mirror into the Armors tab too.
  await expect(page.locator('#armors_1_76')).toBeChecked(); // Sneering Mask
  await page.locator('#playthrough_15_21').check();
  await expect(page.locator('#armors_1_70')).toBeChecked(); // Creighton's Steel Mask
  await page.locator('#playthrough_19_1').check();
  await expect(page.locator('#armors_1_53')).toBeChecked(); // Billed Mask
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

test('renaming a profile updates the selector', async ({ page }) => {
  await page.locator('[data-bs-target="#tabOptions"]').click();
  await page.locator('#profileRename').click();
  await expect(page.locator('#profileModalTitle')).toHaveText('Rename Profile');
  await expect(page.locator('#profileModalName')).toHaveValue('Default Profile');

  await page.locator('#profileModalName').fill('My Run');
  await page.locator('#profileModalRename').click();
  await expect(page.locator('#profileModal')).toBeHidden();
  await expect(page.locator('#profiles')).toHaveValue('My Run');
});

test('deleting a profile requires the confirmation modal, not a native dialog', async ({
  page,
}) => {
  await page.locator('[data-bs-target="#tabOptions"]').click();
  // Only one profile exists yet, so deleting it (and being left with none) is
  // disallowed.
  await expect(page.locator('#profileDelete')).toBeDisabled();

  await page.locator('#profileAdd').click();
  await page.locator('#profileModalName').fill('Second Run');
  await page.locator('#profileModalAdd').click();
  await expect(page.locator('#profileDelete')).toBeEnabled();

  await page.locator('#profileDelete').click();
  await expect(page.locator('#profileDeleteModal')).toBeVisible();
  await expect(page.locator('#profileDeleteModalName')).toHaveText('Second Run');

  // Cancel makes no changes.
  await page.locator('#profileDeleteModal .btn-outline-secondary').click();
  await expect(page.locator('#profileDeleteModal')).toBeHidden();
  await expect(page.locator('#profiles')).toHaveValue('Second Run');

  // Confirming deletes it and falls back to the remaining profile. A native
  // confirm() here would hang the test (Playwright auto-dismisses unexpected
  // dialogs and the awaited click would never resolve), proving there is no
  // leftover browser-native confirmation.
  await page.locator('#profileDelete').click();
  await page.locator('#profileDeleteModalYes').click();
  await expect(page.locator('#profileDeleteModal')).toBeHidden();
  await expect(page.locator('#profiles')).toHaveValue('Default Profile');
  await expect(page.locator('#profileDelete')).toBeDisabled();
});

test('NG+ modal resets Playthrough/Misc but keeps other checklists, with no extra native dialog', async ({
  page,
}) => {
  await page.locator('#playthrough_1_16').check(); // Estus Ring (Playthrough)
  await page.locator('[data-bs-target="#tabChecklists"]').click();
  await page.locator('#checklist_8_5').check(); // an Achievements entry, unrelated to the link above

  await page.locator('[data-bs-target="#tabOptions"]').click();
  await page.locator('#profileNG\\+').click();
  await expect(page.locator('#NG\\+Modal')).toBeVisible();

  // Cancel makes no changes.
  await page.locator('#NG\\+Modal .btn-outline-secondary').click();
  await expect(page.locator('#NG\\+Modal')).toBeHidden();
  await expect(page.locator('#checklist_8_5')).toBeChecked();

  // Confirming resets Playthrough but leaves Achievements alone. A native
  // confirm()/alert() here would hang the test (Playwright auto-dismisses
  // unexpected dialogs and the awaited click would never resolve), so this
  // also proves the flow no longer double-confirms.
  await page.locator('#profileNG\\+').click();
  await page.locator('#NG\\+ModalYes').click();
  await expect(page.locator('#NG\\+Modal')).toBeHidden();
  await expect(page.locator('#checklist_8_5')).toBeChecked();

  await page.locator('[data-bs-target="#tabPlaythrough"]').click();
  await expect(page.locator('#playthrough_1_16')).not.toBeChecked();
});

test('unique-passive info button opens the passive modal without touching the checkbox', async ({
  page,
}) => {
  await page.locator('[data-bs-target="#tabWeaponsShields"]').click();

  // Grass Crest Shield has a passive; the button opens the modal with the
  // entry's name and effect, and must not toggle the checkbox.
  await page.locator('li[data-id="weapons_2_28"] .passive-info').click();
  await expect(page.locator('#passiveModal')).toBeVisible();
  await expect(page.locator('#passiveModalItem')).toContainText('Grass Crest Shield');
  await expect(page.locator('#passiveModalText')).toContainText('stamina');
  await expect(page.locator('#weapons_2_28')).not.toBeChecked();
  await page.locator('#passiveModal .btn-outline-secondary').click();
  await expect(page.locator('#passiveModal')).toBeHidden();

  // Catalyst spell properties count as passives too (Izalith Staff).
  await page.locator('li[data-id="weapons_1_172"] .passive-info').click();
  await expect(page.locator('#passiveModalItem')).toContainText('Izalith Staff');
  await expect(page.locator('#passiveModalText')).toContainText('dark sorceries');
  await page.locator('#passiveModal .btn-outline-secondary').click();
  await expect(page.locator('#passiveModal')).toBeHidden();

  // Hidden always-on effects count too (Scholar's Candlestick sorcery boost).
  await page.locator('li[data-id="weapons_1_8"] .passive-info').click();
  await expect(page.locator('#passiveModalItem')).toContainText("Scholar's Candlestick");
  await expect(page.locator('#passiveModalText')).toContainText('sorcery');
  await page.locator('#passiveModal .btn-outline-secondary').click();
  await expect(page.locator('#passiveModal')).toBeHidden();

  // Ordinary equipment without a passive gets no button.
  await expect(page.locator('li[data-id="weapons_2_2"] .passive-info')).toHaveCount(0);

  // Armor tab has them too (Symbol of Avarice).
  await page.locator('[data-bs-target="#tabArmors"]').click();
  await page.locator('li[data-id="armors_1_64"] .passive-info').click();
  await expect(page.locator('#passiveModalItem')).toContainText('Symbol of Avarice');
  await expect(page.locator('#passiveModalText')).toContainText('souls');
});

test('build toggles tint the passive modal text, including cross-school buffs', async ({
  page,
}) => {
  await page.locator('label[for="highlight_sorc"]').click();
  await page.locator('[data-bs-target="#tabWeaponsShields"]').click();

  // Saint-tree Bellvine is a miracle catalyst, but its casting speed buff
  // covers sorceries cast with another catalyst too: with the Sorcery build
  // active its description is tinted and "sorceries" is marked.
  await page.locator('li[data-id="weapons_1_189"] .passive-info').click();
  await expect(page.locator('#passiveModalText')).toHaveClass(/build-highlight/);
  await expect(page.locator('#passiveModalText .build-term').first()).toContainText(/sorcer/i);
  await page.locator('#passiveModal .btn-outline-secondary').click();
  await expect(page.locator('#passiveModal')).toBeHidden();

  // A passive with no sorcery relevance stays untinted (Grass Crest Shield).
  await page.locator('li[data-id="weapons_2_28"] .passive-info').click();
  await expect(page.locator('#passiveModalText')).not.toHaveClass(/build-highlight/);
  await expect(page.locator('#passiveModalText .build-term')).toHaveCount(0);
  await page.locator('#passiveModal .btn-outline-secondary').click();
  await expect(page.locator('#passiveModal')).toBeHidden();

  // Same for a build-agnostic passive on a sorc-tagged catalyst: Mendicant's
  // Staff's souls bonus is not a sorcery effect, so the entry's f_sorc_build
  // tag alone must not tint the description (the list row keeps its tint).
  await expect(page.locator('li[data-id="weapons_1_176"]')).toHaveClass(/build-highlight/);
  await page.locator('li[data-id="weapons_1_176"] .passive-info').click();
  await expect(page.locator('#passiveModalText')).not.toHaveClass(/build-highlight/);
  await expect(page.locator('#passiveModalText .build-term')).toHaveCount(0);
  await page.locator('#passiveModal .btn-outline-secondary').click();
  await expect(page.locator('#passiveModal')).toBeHidden();

  // With every build toggled off again, nothing in the modal is tinted.
  await page.locator('label[for="highlight_sorc"]').click();
  await page.locator('li[data-id="weapons_1_189"] .passive-info').click();
  await expect(page.locator('#passiveModalText')).not.toHaveClass(/build-highlight/);
  await expect(page.locator('#passiveModalText .build-term')).toHaveCount(0);
});

test('build focus shows only the focused build on the Playthrough, never touching collection tabs', async ({
  page,
}) => {
  await page.locator('#tabPlaythrough .filter-panel summary').click();

  // Focus the Sorcery build: its steps stay, everything else hides — other
  // schools' pickups and plain walkthrough steps (f_none) included.
  await page.locator('label[for="f_sorc_build"]').click();
  await expect(page.locator('#f_sorc_build')).toBeChecked();
  await expect(page.locator('li[data-id="playthrough_4_33"]')).toBeVisible(); // sorcery catalyst
  await expect(page.locator('li[data-id="playthrough_5_27"]')).toBeHidden(); // miracle pickup
  await expect(page.locator('li[data-id="playthrough_17_8"]')).toBeHidden(); // plain step

  // Zones the focus emptied out disappear entirely, header and ToC row both.
  expect(await page.locator('#tabPlaythrough h3.filter-empty').count()).toBeGreaterThan(0);
  await expect(page.locator('#tabPlaythrough h3.filter-empty').first()).toBeHidden();
  expect(
    await page.locator('#tabPlaythrough .table_of_contents li.filter-empty').count()
  ).toBeGreaterThan(0);
  await expect(
    page.locator('#tabPlaythrough .table_of_contents li.filter-empty').first()
  ).toBeHidden();

  // Several focused builds show their union.
  await page.locator('label[for="f_mirac_build"]').click();
  await expect(page.locator('li[data-id="playthrough_5_27"]')).toBeVisible();
  await page.locator('label[for="f_mirac_build"]').click();

  // The collection tabs are 100% completion lists: the staves in the Weapons
  // tab and the build rings in the Achievements tab must stay visible.
  await page.locator('[data-bs-target="#tabWeaponsShields"]').click();
  await expect(page.locator('li[data-id="weapons_1_168"]')).toBeVisible(); // Sorcerer's Staff
  await page.locator('[data-bs-target="#tabChecklists"]').click();
  await expect(page.locator('li[data-id="checklist_5_28"]')).toBeVisible(); // Young Dragon Ring

  // Focus is saved with the profile and survives a reload (which restores
  // the Achievements tab we were last on, so switch back first).
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.locator('[data-bs-target="#tabPlaythrough"]').click();
  await expect(page.locator('#f_sorc_build')).toBeChecked();
  await expect(page.locator('li[data-id="playthrough_5_27"]')).toBeHidden();

  // Switching the focus off restores everything.
  await page.locator('#tabPlaythrough .filter-panel summary').click();
  await page.locator('label[for="f_sorc_build"]').click();
  await expect(page.locator('li[data-id="playthrough_5_27"]')).toBeVisible();
  await expect(page.locator('li[data-id="playthrough_17_8"]')).toBeVisible();
});

// The regular category filters keep working alongside a focus: they apply
// within the focused set, and still work normally after the focus is gone.
test('category filters compose with build focus', async ({ page }) => {
  await page.locator('#tabPlaythrough .filter-panel summary').click();

  // Focus Sorcery, then hide Rings: the sorcery ring pickup hides too.
  await page.locator('label[for="f_sorc_build"]').click();
  await expect(page.locator('li[data-id="playthrough_15_42"]')).toBeVisible(); // f_ring f_sorc_build
  await page.locator('label[for="f_ring"]').click();
  await expect(page.locator('li[data-id="playthrough_15_42"]')).toBeHidden();
  await page.locator('label[for="f_ring"]').click();
  await expect(page.locator('li[data-id="playthrough_15_42"]')).toBeVisible();

  // With the focus off again, the spell filters behave as always: hiding
  // Miracles hides a pure miracle pickup (f_mirac f_mirac_build), and f_none
  // steps hide while any filter is active, build-tagged ones included
  // (e.g. sending Karla to Firelink).
  await page.locator('label[for="f_sorc_build"]').click();
  await page.locator('label[for="f_mirac"]').click();
  await expect(page.locator('li[data-id="playthrough_5_27"]')).toBeHidden();
  await expect(page.locator('li[data-id="playthrough_9_20"]')).toBeHidden();

  await page.locator('label[for="f_mirac"]').click();
  await expect(page.locator('li[data-id="playthrough_5_27"]')).toBeVisible();
  await expect(page.locator('li[data-id="playthrough_9_20"]')).toBeVisible();
});

test('build highlight tints catalysts and rings on every checklist tab', async ({ page }) => {
  await page.locator('label[for="highlight_sorc"]').click();
  await expect(page.locator('li[data-id="playthrough_4_33"]')).toHaveClass(/build-highlight/);

  // The toggle group stays visible on other checklist tabs, and the staves
  // and build rings there are tinted as well.
  await page.locator('[data-bs-target="#tabWeaponsShields"]').click();
  await expect(page.locator('#buildHighlightGroup')).toBeVisible();
  await expect(page.locator('li[data-id="weapons_1_168"]')).toHaveClass(/build-highlight/);
  await expect(page.locator('li[data-id="weapons_1_179"]')).not.toHaveClass(/build-highlight/);

  await page.locator('[data-bs-target="#tabChecklists"]').click();
  await expect(page.locator('li[data-id="checklist_5_28"]')).toHaveClass(/build-highlight/); // Young Dragon Ring

  // The achievement spell lists tint too: Master of Sorceries entries light
  // up, other schools (and their DLC spells) stay untinted.
  await expect(page.locator('li[data-id="checklist_2_1"]')).toHaveClass(/build-highlight/); // Soul Arrow
  await expect(page.locator('li[data-id="checklist_11_9"]')).toHaveClass(/build-highlight/); // Great Soul Dregs (DLC sorcery)
  await expect(page.locator('li[data-id="checklist_3_1"]')).not.toHaveClass(/build-highlight/); // pyromancy
  await expect(page.locator('li[data-id="checklist_11_1"]')).not.toHaveClass(/build-highlight/); // Way of White Corona (DLC miracle)

  // Switching off clears the tint everywhere.
  await page.locator('label[for="highlight_sorc"]').click();
  await expect(page.locator('li[data-id="checklist_5_28"]')).not.toHaveClass(/build-highlight/);
  await expect(page.locator('li[data-id="checklist_2_1"]')).not.toHaveClass(/build-highlight/);
});

test('build highlight covers caster weapons, tomes, trainers and shared rings', async ({
  page,
}) => {
  await page.locator('label[for="highlight_sorc"]').click();

  // Caster-scaling weapons tint alongside the catalysts, and tome/scroll
  // pickups and the Yoel/Yuria trainer steps tint on the Playthrough.
  await expect(page.locator('li[data-id="playthrough_18_2"]')).toHaveClass(/build-highlight/); // Crystal Scroll
  await expect(page.locator('li[data-id="playthrough_3_3"]')).toHaveClass(/build-highlight/); // Yoel recruit
  await page.locator('[data-bs-target="#tabWeaponsShields"]').click();
  await expect(page.locator('li[data-id="weapons_1_38"]')).toHaveClass(/build-highlight/); // Moonlight Greatsword
  await expect(page.locator('li[data-id="weapons_1_8"]')).toHaveClass(/build-highlight/); // Scholar's Candlestick
  await expect(page.locator('li[data-id="weapons_1_152"]')).not.toHaveClass(/build-highlight/); // Witch's Locks (pyro)

  // Dark Clutch Ring boosts dark spells in all three schools: it stays tinted
  // whichever single build is active.
  await page.locator('[data-bs-target="#tabChecklists"]').click();
  await expect(page.locator('li[data-id="checklist_5_51"]')).toHaveClass(/build-highlight/);
  await page.locator('label[for="highlight_sorc"]').click();
  await page.locator('label[for="highlight_mirac"]').click();
  await expect(page.locator('li[data-id="checklist_5_51"]')).toHaveClass(/build-highlight/);
  await page.locator('label[for="highlight_mirac"]').click();
  await expect(page.locator('li[data-id="checklist_5_51"]')).not.toHaveClass(/build-highlight/);

  // Int/Fth-scaling fire weapons follow the pyromancer stat pair, and the
  // Ashen Estus Ring (caster FP recovery) counts for every school.
  await page.locator('label[for="highlight_pyro"]').click();
  await expect(page.locator('li[data-id="checklist_5_4"]')).toHaveClass(/build-highlight/); // Ashen Estus Ring
  await page.locator('[data-bs-target="#tabWeaponsShields"]').click();
  await expect(page.locator('li[data-id="weapons_1_116"]')).toHaveClass(/build-highlight/); // Demon's Fist
  await expect(page.locator('li[data-id="weapons_1_91"]')).toHaveClass(/build-highlight/); // Demon's Greataxe
  await expect(page.locator('li[data-id="weapons_1_38"]')).not.toHaveClass(/build-highlight/); // Moonlight Greatsword
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
