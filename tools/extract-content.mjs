/*
 * One-time / regeneratable extractor: parses the checklist content out of a
 * Bootstrap-3 era index.html into data/checklist.json.
 *
 * The checklist items are always single-line `<li data-id="..">..</li>` entries,
 * which makes a line-based parser reliable (no DOM dependency needed).
 *
 * Usage:  node tools/extract-content.mjs [path-to-source-html]
 * Default source: index.legacy.html (the pre-migration copy). Falls back to
 * index.html if that does not exist.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const srcArg = process.argv[2];
const src = srcArg
  ? srcArg
  : existsSync('index.legacy.html') ? 'index.legacy.html' : 'index.html';

const lines = readFileSync(src, 'utf8').split('\n');

// Tabs that hold checklist content, in document order, with their id prefix.
const TABS = [
  { id: 'tabPlaythrough',    key: 'playthrough', title: 'Playthrough Checklist',            overall: 'playthrough_overall_total', listId: 'playthrough_list', search: 'playthrough_search' },
  { id: 'tabChecklists',     key: 'checklist',   title: 'Achievement Checklists',            overall: 'checklist_overall_total',   listId: 'item_list',        search: 'item_search' },
  { id: 'tabWeaponsShields', key: 'weapons',     title: 'Weapons and Shields Checklists',    overall: 'weapons_overall_total',     listId: 'weapons_list',     search: 'weapons_search' },
  { id: 'tabArmors',         key: 'armors',      title: 'Armor Checklists',                  overall: 'armors_overall_total',      listId: 'armors_list',      search: 'armors_search' },
  { id: 'tabMisc',           key: 'crow',        title: 'Misc',                              overall: 'crow_overall_total',        listId: null,               search: null },
];

// Locate every tab-pane opening line so we can slice each tab's region.
const paneOpen = [];
lines.forEach((line, i) => {
  const m = line.match(/<div class="tab-pane[^"]*"\s+id="([^"]+)"/);
  if (m) paneOpen.push({ id: m[1], line: i });
});
function regionFor(tabId) {
  const idx = paneOpen.findIndex(p => p.id === tabId);
  const start = paneOpen[idx].line + 1;
  const end = idx + 1 < paneOpen.length ? paneOpen[idx + 1].line : lines.length;
  return { start, end };
}

const LI_RE = /^\s*<li data-id="([^"]+)"(?:\s+class="([^"]*)")?\s*>(.*)<\/li>\s*$/;

function parseItems(bodyLines) {
  const items = [];
  for (const line of bodyLines) {
    const m = line.match(LI_RE);
    if (m) items.push({ id: m[1], cls: m[2] || '', html: m[3] });
  }
  return items;
}

let grandTotal = 0;
const out = { tabs: [] };

for (const tab of TABS) {
  const { start, end } = regionFor(tab.id);
  const region = lines.slice(start, end);

  // --- table of contents / nav ------------------------------------------
  const nav = [];
  {
    const navStart = region.findIndex(l => /<ul class="table_of_contents">/.test(l));
    if (navStart !== -1) {
      for (let i = navStart + 1; i < region.length; i++) {
        if (/<\/ul>/.test(region[i])) break;
        const m = region[i].match(/^\s*<li>(.*)<\/li>\s*$/);
        if (m) nav.push(m[1]);
      }
    }
  }

  // --- sections ---------------------------------------------------------
  const sections = [];
  for (let i = 0; i < region.length; i++) {
    const h3line = region[i];
    if (!/^\s*<h3\b/.test(h3line)) continue;

    const idM = h3line.match(/<h3[^>]*\bid="([^"]+)"/);
    const id = idM ? idM[1] : null;
    const totalsM = h3line.match(new RegExp(`<span id="(${tab.key}_totals_\\d+)">`));
    const totalsId = totalsM ? totalsM[1] : null;

    // Inner html of the h3, minus the leading collapse-toggle anchor and the
    // trailing totals span -> the human-readable title html.
    let inner = h3line.replace(/^\s*<h3[^>]*>/, '').replace(/<\/h3>\s*$/, '');
    inner = inner.replace(/^<a href="#[^"]*_col"[^>]*data-toggle="collapse"[^>]*><\/a>/, '');
    inner = inner.replace(/\s*<span id="[^"]*_totals_\d+"><\/span>\s*$/, '');
    const titleHtml = inner.trim();

    // Body starts on the next non-empty line: <ul id=..> or <div id=..>
    let j = i + 1;
    while (j < region.length && region[j].trim() === '') j++;
    const openLine = region[j] || '';
    const isUl = /^\s*<ul\b/.test(openLine);
    const closeTag = isUl ? '</ul>' : '</div>';

    // Collect body lines until the container's own closing tag (these
    // containers never nest another element of the same tag type).
    const bodyLines = [];
    let k = j + 1;
    for (; k < region.length; k++) {
      if (region[k].trim().startsWith(closeTag)) break;
      bodyLines.push(region[k]);
    }
    i = k; // continue scanning after this section's body

    const section = { id, titleHtml, totalsId };

    if (isUl) {
      section.type = 'items';
      section.items = parseItems(bodyLines);
    } else if (bodyLines.some(l => /^\s*<h4\b/.test(l))) {
      section.type = 'groups';
      section.groups = [];
      let group = null;
      for (let x = 0; x < bodyLines.length; x++) {
        const hm = bodyLines[x].match(/^\s*<h4\b([^>]*)>(.*)<\/h4>\s*$/);
        if (hm) { group = { attrs: hm[1].trim(), h4: hm[2], items: [] }; section.groups.push(group); continue; }
        const im = bodyLines[x].match(LI_RE);
        if (im && group) group.items.push({ id: im[1], cls: im[2] || '', html: im[3] });
      }
    } else {
      section.type = 'raw';
      section.raw = bodyLines.join('\n').replace(/\s+$/, '');
    }

    // running total of checklist items
    if (section.type === 'items') grandTotal += section.items.length;
    if (section.type === 'groups') grandTotal += section.groups.reduce((a, g) => a + g.items.length, 0);

    sections.push(section);
  }

  out.tabs.push({
    id: tab.id, key: tab.key, title: tab.title,
    overallTotalId: tab.overall, listId: tab.listId, searchId: tab.search,
    nav, sections,
  });
}

writeFileSync('data/checklist.json', JSON.stringify(out, null, 1) + '\n');

// --- report ---------------------------------------------------------------
const allIds = [];
for (const t of out.tabs)
  for (const s of t.sections) {
    if (s.type === 'items') s.items.forEach(it => allIds.push(it.id));
    if (s.type === 'groups') s.groups.forEach(g => g.items.forEach(it => allIds.push(it.id)));
  }
const dupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);

console.log(`source: ${src}`);
console.log(`tabs: ${out.tabs.length}`);
out.tabs.forEach(t => {
  const secItems = t.sections.reduce((a, s) =>
    a + (s.type === 'items' ? s.items.length
      : s.type === 'groups' ? s.groups.reduce((b, g) => b + g.items.length, 0) : 0), 0);
  console.log(`  ${t.key.padEnd(12)} sections=${String(t.sections.length).padStart(3)} nav=${String(t.nav.length).padStart(3)} items=${secItems}`);
});
console.log(`total items parsed: ${grandTotal}`);
console.log(`duplicate data-ids: ${dupes.length ? dupes.join(', ') : 'none'}`);
