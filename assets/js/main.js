/*
 * Dark Souls 3 Cheat Sheet - application logic.
 * Vanilla JS (no jQuery) + Bootstrap 5 JS API. Progress is stored in
 * localStorage (see storage.js); the profile model lives in profiles.js and
 * content is rendered from data/checklist.json by render.js.
 */
import { Storage } from './storage.js';
import {
  profiles,
  profilesKey,
  setProfiles,
  save,
  cur,
  initializeProfile,
  canDelete,
  getFirstProfile,
} from './profiles.js';

const CHECKLIST_TABS = [
  'tabPlaythrough',
  'tabChecklists',
  'tabWeaponsShields',
  'tabArmors',
  'tabMisc',
];

/* ----------------------------------------------------------------------
 * Small DOM helpers
 * -------------------------------------------------------------------- */
function $(sel, root) {
  return (root || document).querySelector(sel);
}
function $all(sel, root) {
  return [...(root || document).querySelectorAll(sel)];
}
function fire(el, type) {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

/* ----------------------------------------------------------------------
 * Filtering
 * -------------------------------------------------------------------- */
function canFilter(li) {
  const classAttr = li.getAttribute('class');
  if (!classAttr) return false;
  const hidden = cur().hidden_categories;
  if (classAttr === 'f_none') {
    return Object.keys(hidden).some((k) => hidden[k]);
  }
  const classList = classAttr.split(/\s+/);
  const journey = cur().journey;
  for (let i = 0; i < classList.length; i++) {
    const h = classList[i].match(/^h_ng(\+*)$/);
    const s = classList[i].match(/^s_ng(\+*)$/);
    if ((h && h[1].length < journey) || (s && s[1].length >= journey)) return true;
  }
  let foundMatch = false;
  for (let j = 0; j < classList.length; j++) {
    if (!/^f_/.test(classList[j])) continue;
    if (classList[j] in hidden) {
      if (!hidden[classList[j]]) return false;
      foundMatch = true;
    }
  }
  return foundMatch;
}

function toggleFilteredClasses(rawClass) {
  $all('li.' + CSS.escape(rawClass)).forEach((li) => {
    li.style.display = canFilter(li) ? 'none' : '';
  });
}

// A playthrough checkbox that the current journey/category filters hide. Bulk
// section actions and totals ignore these so they only ever touch the items
// actually visible in the current view (e.g. NG+/NG++ entries while on NG).
function isFilteredOut(cb) {
  const li = cb.closest('li');
  return /^playthrough_/.test(cb.id) && !!li && canFilter(li);
}

/* ----------------------------------------------------------------------
 * Totals (ported from the original jQuery implementation)
 * -------------------------------------------------------------------- */
function setBadge(el, text, done) {
  if (!el) return;
  el.innerHTML = text;
  el.classList.toggle('done', done);
  el.classList.toggle('in_progress', !done);
}

function calculateTotals() {
  $all('[id$="_overall_total"]').forEach((overallEl) => {
    const type = overallEl.id.replace(/_overall_total$/, '');
    let overallCount = 0;
    let overallChecked = 0;

    $all('[id^="' + type + '_totals_"]').forEach((totEl) => {
      const i = parseInt(totEl.id.slice((type + '_totals_').length), 10);
      const navEl = document.getElementById(type + '_nav_totals_' + i);
      const h3 = totEl.closest('h3');
      const container = h3 ? h3.nextElementSibling : null;

      // Count the section's actual checkboxes so that gaps or out-of-order
      // ids can never cause a silent undercount.
      let count = 0;
      let checked = 0;
      if (container) {
        $all('.checkbox input[type="checkbox"]', container).forEach((cb) => {
          if (isFilteredOut(cb)) return;
          count++;
          overallCount++;
          if (cb.checked) {
            checked++;
            overallChecked++;
          }
        });
      }

      const done = checked === count;
      const label = done ? 'DONE' : checked + '/' + count;
      setBadge(totEl, label, done);
      setBadge(navEl, label, done);

      if (h3) h3.classList.toggle('completed', done);

      // Sub-heading (h4) visibility: hide fully-completed groups.
      if (container && container.tagName === 'DIV') {
        $all(':scope > h4', container).forEach((h) => {
          h.classList.add('completed');
        });
        $all(':scope > ul', container).forEach((ul) => {
          if (ul.querySelector('li > div > label:not(.completed)')) {
            let prev = ul.previousElementSibling;
            while (prev && prev.tagName !== 'H4') prev = prev.previousElementSibling;
            if (prev) prev.classList.remove('completed');
          }
        });
      }
    });

    const oDone = overallChecked === overallCount;
    setBadge(overallEl, oDone ? 'DONE' : overallChecked + '/' + overallCount, oDone);
  });
}

// The export textarea holds the whole profile blob; only refresh it when the
// Options tab is shown (not on every checkbox toggle).
function refreshExportText() {
  const ta = document.getElementById('profileText');
  if (ta) ta.value = JSON.stringify(profiles);
}

/* ----------------------------------------------------------------------
 * Cross-tab item links
 * ----------------------------------------------------------------------
 * The same real item often appears in more than one tab (e.g. a weapon in the
 * Playthrough walkthrough and again in the Weapons/Shields collection). Those
 * are separate checkboxes with separate ids, but they represent one thing, so
 * checking one should check the other.
 *
 * The link is declared in the data: entries that represent the same item carry
 * the same `item` key(s), emitted here as the `data-item` attribute (a single
 * key, or several space-separated when one entry grants multiple items). We just
 * group ids by shared key and mirror them. `tools/validate.mjs` guarantees a key
 * never resolves to more than one entry per tab, so no runtime guardrail (for
 * stackables, Crow trades, or upgrade variants) is needed here — those are
 * simply left without an `item` key in the data.
 * -------------------------------------------------------------------- */
let linkGroups = new Map(); // id -> Set(linked ids in other tabs)

function buildLinkGroups() {
  const byKey = new Map(); // item key -> [ids]
  $all('li[data-item]').forEach((li) => {
    const id = li.getAttribute('data-id');
    const cb = document.getElementById(id);
    if (!cb || !cb.matches('.checkbox input[type="checkbox"]')) return;
    li.getAttribute('data-item')
      .split(/\s+/)
      .forEach((slug) => {
        if (!slug) return;
        if (!byKey.has(slug)) byKey.set(slug, []);
        byKey.get(slug).push(id);
      });
  });

  const links = new Map();
  byKey.forEach((ids) => {
    if (ids.length < 2) return;
    ids.forEach((id) => {
      const set = links.get(id) || new Set();
      ids.forEach((other) => {
        if (other !== id) set.add(other);
      });
      links.set(id, set);
    });
  });
  return links;
}

/* ----------------------------------------------------------------------
 * Checkbox state
 * -------------------------------------------------------------------- */
function setLabelCompleted(cb, on) {
  const label = cb.closest('label');
  if (label) label.classList.toggle('completed', on);
}

function applyCheckState(cb, checked) {
  cb.checked = checked;
  cur().checklistData[cb.id] = checked;
  setLabelCompleted(cb, checked);
}

// Set a checkbox to `checked` and mirror the state onto its cross-tab twins
// (unique 1:1 links only). Returns true if anything actually changed.
function setWithLinks(cb, checked) {
  let changed = cb.checked !== checked || cur().checklistData[cb.id] !== checked;
  applyCheckState(cb, checked);
  const linked = linkGroups.get(cb.id);
  if (linked) {
    linked.forEach((id) => {
      const twin = document.getElementById(id);
      if (twin && twin.checked !== checked) {
        applyCheckState(twin, checked);
        changed = true;
      }
    });
  }
  return changed;
}

function onCheckboxChange(cb) {
  setWithLinks(cb, cb.checked);
  save();
  calculateTotals();
}

function setCheckboxesFromProfile() {
  $all('.checkbox input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
    setLabelCompleted(cb, false);
  });
  const data = cur().checklistData;
  Object.keys(data).forEach((id) => {
    const cb = document.getElementById(id);
    if (cb && cb.matches('.checkbox input[type="checkbox"]')) {
      cb.checked = !!data[id];
      setLabelCompleted(cb, !!data[id]);
    }
  });
}

// Batch update used by the section Toggle/Clear buttons. Also mirrors each
// change onto cross-tab twins, so clearing/toggling a section keeps linked
// items in other tabs in sync.
function setBoxes(boxes, wantFn) {
  let changed = false;
  boxes.forEach((cb) => {
    if (setWithLinks(cb, wantFn(cb))) changed = true;
  });
  if (changed) {
    save();
    calculateTotals();
  }
}

/* ----------------------------------------------------------------------
 * Profiles UI
 * -------------------------------------------------------------------- */
function populateProfiles() {
  const sel = document.getElementById('profiles');
  sel.innerHTML = '';
  Object.keys(profiles[profilesKey]).forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
  sel.value = profiles.current;
}

/* ----------------------------------------------------------------------
 * Collapse / tab / hide-completed persistence & restore
 * -------------------------------------------------------------------- */
function applyHideCompleted(state) {
  document.body.classList.toggle('hide_completed', state);
  const toggle = document.getElementById('toggleHideCompleted');
  if (toggle) toggle.checked = state;
}

function restoreState(name) {
  const p = profiles[profilesKey][name];

  // Collapsible sections (set directly to avoid load-time animation).
  $all('[data-bs-toggle="collapse"]').forEach((trigger) => {
    const sel = trigger.getAttribute('data-bs-target') || trigger.getAttribute('href');
    if (!sel || !/_col$/.test(sel)) return;
    const target = document.querySelector(sel);
    if (!target) return;
    const collapsed = !!p.collapsed[sel];
    target.classList.toggle('show', !collapsed);
    trigger.classList.toggle('collapsed', collapsed);
    trigger.setAttribute('aria-expanded', String(!collapsed));
  });

  applyHideCompleted(p.hide_completed);

  // Journey radio -> triggers NG filter application.
  const ng = document.querySelector('[data-ng-toggle="' + p.journey + '"]');
  if (ng) {
    ng.checked = true;
    fire(ng, 'change');
  }

  // Category filters.
  Object.keys(p.hidden_categories).forEach((key) => {
    const el = document.querySelector('[data-item-toggle="' + key + '"]');
    if (el && el.checked !== p.hidden_categories[key]) {
      el.checked = p.hidden_categories[key];
      fire(el, 'change');
    }
  });

  updateCollapseAllBtn();
}

function populateChecklists() {
  setCheckboxesFromProfile();
  calculateTotals();
}

function updateHideCompletedVisibility(activeTabId) {
  const btn = document.getElementById('btnHideCompleted');
  if (btn) btn.classList.toggle('d-none', CHECKLIST_TABS.indexOf(activeTabId) === -1);
}

/* ----------------------------------------------------------------------
 * Theme (Bootstrap 5.3 data-bs-theme: auto / light / dark)
 * -------------------------------------------------------------------- */
const mql = window.matchMedia('(prefers-color-scheme: dark)');
function themePref() {
  const p = Storage.get('style', 'auto');
  return p === 'light' || p === 'dark' || p === 'auto' ? p : 'auto';
}
function resolveTheme(pref) {
  if (pref === 'dark' || pref === 'light') return pref;
  return mql.matches ? 'dark' : 'light';
}
function applyTheme() {
  const pref = themePref();
  document.documentElement.setAttribute('data-bs-theme', resolveTheme(pref));
  const sel = document.getElementById('themes');
  if (sel) sel.value = pref;
}

/* ----------------------------------------------------------------------
 * Search (replaces Jets) + highlight (replaces jquery.highlight)
 * -------------------------------------------------------------------- */
function unhighlight(root) {
  $all('span.highlight', root).forEach((s) => {
    const parent = s.parentNode;
    parent.replaceChild(document.createTextNode(s.textContent), s);
    parent.normalize();
  });
}
function highlight(root, term) {
  if (!term) return;
  const t = term.toLowerCase();
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const parent = node.parentNode;
    if (!parent || (parent.classList && parent.classList.contains('highlight'))) return;
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    let idx = lower.indexOf(t);
    if (idx === -1) return;
    const frag = document.createDocumentFragment();
    let last = 0;
    while (idx !== -1) {
      if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
      const span = document.createElement('span');
      span.className = 'highlight';
      span.textContent = text.slice(idx, idx + t.length);
      frag.appendChild(span);
      last = idx + t.length;
      idx = lower.indexOf(t, last);
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    parent.replaceChild(frag, node);
  });
}

function setupSearch(inputId, containerId) {
  const input = document.getElementById(inputId);
  const container = document.getElementById(containerId);
  if (!input || !container) return;
  input.addEventListener('input', () => {
    const q = input.value.trim();
    const lower = q.toLowerCase();
    $all('h4', container).forEach((h) => {
      h.style.display = q ? 'none' : '';
    });
    $all('li[data-id]', container).forEach((li) => {
      const match = li.textContent.toLowerCase().indexOf(lower) !== -1;
      li.style.display = q === '' || match ? '' : 'none';
    });
    unhighlight(container);
    highlight(container, q);
  });
}

/* ----------------------------------------------------------------------
 * Import / export
 * -------------------------------------------------------------------- */
function reloadFromImportedProfiles(data) {
  setProfiles(data);
  save();
  populateProfiles();
  location.reload();
}

function wireImportExport() {
  document.getElementById('profileExport').addEventListener('click', () => {
    const text = JSON.stringify(profiles);
    const a = document.createElement('a');
    a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
    a.download = 'profiles.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  document.getElementById('profileImport').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', function () {
    const f = this.files && this.files[0];
    if (!f || !/\.json$/.test(f.name)) {
      alert('Bad input file. File should end in .json');
      return;
    }
    const fr = new FileReader();
    fr.onload = (e) => {
      try {
        reloadFromImportedProfiles(JSON.parse(e.target.result));
      } catch (err) {
        alert(err);
      }
    };
    fr.readAsText(f);
  });

  document.getElementById('profileExportText').addEventListener('click', () => {
    const ta = document.getElementById('profileText');
    ta.value = JSON.stringify(profiles);
    ta.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).catch(() => {});
    } else {
      try {
        document.execCommand('copy');
      } catch (e) {}
    }
  });

  document.getElementById('profileImportText').addEventListener('click', () => {
    if (!confirm('Are you sure you want to import profile data?')) return;
    try {
      reloadFromImportedProfiles(JSON.parse(document.getElementById('profileText').value));
    } catch (e) {
      alert(e);
    }
  });
}

/* ----------------------------------------------------------------------
 * Modals
 * -------------------------------------------------------------------- */
function modal(id) {
  return bootstrap.Modal.getOrCreateInstance(document.getElementById(id));
}

function wireProfiles() {
  document.getElementById('profiles').addEventListener('change', function () {
    profiles.current = this.value;
    save();
    populateChecklists();
    restoreState(profiles.current);
    calculateTotals();
  });

  document.getElementById('profileAdd').addEventListener('click', () => {
    document.getElementById('profileModalTitle').textContent = 'Add Profile';
    document.getElementById('profileModalName').value = '';
    document.getElementById('profileModalAdd').style.display = '';
    document.getElementById('profileModalUpdate').style.display = 'none';
    document.getElementById('profileModalDelete').style.display = 'none';
    modal('profileModal').show();
  });

  document.getElementById('profileEdit').addEventListener('click', () => {
    document.getElementById('profileModalTitle').textContent = 'Edit Profile';
    document.getElementById('profileModalName').value = profiles.current;
    document.getElementById('profileModalAdd').style.display = 'none';
    document.getElementById('profileModalUpdate').style.display = '';
    document.getElementById('profileModalDelete').style.display = canDelete() ? '' : 'none';
    modal('profileModal').show();
  });

  document.getElementById('profileModalAdd').addEventListener('click', () => {
    const name = document.getElementById('profileModalName').value.trim();
    if (name.length > 0) {
      initializeProfile(name);
      profiles.current = name;
      save();
      populateProfiles();
      populateChecklists();
      restoreState(profiles.current);
    }
    modal('profileModal').hide();
  });

  document.getElementById('profileModalUpdate').addEventListener('click', () => {
    const newName = document.getElementById('profileModalName').value.trim();
    if (newName.length > 0 && newName !== profiles.current) {
      profiles[profilesKey][newName] = profiles[profilesKey][profiles.current];
      delete profiles[profilesKey][profiles.current];
      profiles.current = newName;
      save();
      populateProfiles();
    }
    modal('profileModal').hide();
  });

  document.getElementById('profileModalDelete').addEventListener('click', () => {
    if (!canDelete() || !confirm('Are you sure?')) return;
    delete profiles[profilesKey][profiles.current];
    profiles.current = getFirstProfile();
    save();
    populateProfiles();
    populateChecklists();
    restoreState(profiles.current);
    modal('profileModal').hide();
  });

  document.getElementById('profileNG+').addEventListener('click', () => {
    modal('NG+Modal').show();
  });
  document.getElementById('NG+ModalYes').addEventListener('click', () => {
    if (!confirm('Are you sure you wish to begin the next journey?')) return;
    const data = cur().checklistData;
    $all('[id^="playthrough_"], [id^="crow_"]').forEach((cb) => {
      if (cb.matches('.checkbox input[type="checkbox"]') && cb.checked) {
        data[cb.id] = false;
      }
    });
    Object.keys(cur().hidden_categories).forEach((k) => {
      cur().hidden_categories[k] = false;
    });
    if (cur().journey < 3) cur().journey++;
    save();
    populateChecklists();
    restoreState(profiles.current);
    modal('NG+Modal').hide();
  });
}

/* ----------------------------------------------------------------------
 * Filter toolbar
 * -------------------------------------------------------------------- */
function syncCategory(cat) {
  const items = $all('[data-item-toggle]', cat);
  const checkedCount = items.filter((i) => i.checked).length;
  const catInput = $('[data-category-toggle]', cat);
  if (catInput) catInput.checked = items.length > 0 && checkedCount === items.length;
  cat.classList.toggle('partial', checkedCount > 0 && checkedCount < items.length);
}

function wireFilters() {
  $all('[data-item-toggle]').forEach((input) => {
    input.addEventListener('change', () => {
      const type = input.getAttribute('data-item-toggle');
      cur().hidden_categories[type] = input.checked;
      save();
      toggleFilteredClasses(type);
      toggleFilteredClasses('f_none');
      syncCategory(input.closest('.filter-cat'));
      calculateTotals();
    });
  });

  $all('[data-category-toggle]').forEach((input) => {
    input.addEventListener('change', () => {
      const cat = input.closest('.filter-cat');
      const toHide = input.checked;
      $all('[data-item-toggle]', cat).forEach((it) => {
        if (it.checked !== toHide) {
          it.checked = toHide;
          fire(it, 'change');
        }
      });
    });
  });

  $all('[data-ng-toggle]').forEach((input) => {
    input.addEventListener('change', () => {
      cur().journey = +input.getAttribute('data-ng-toggle');
      save();
      toggleFilteredClasses('h_ng+');
      toggleFilteredClasses('s_ng+');
      toggleFilteredClasses('s_ng++');
      calculateTotals();
    });
  });
}

/* ----------------------------------------------------------------------
 * Hide completed
 * -------------------------------------------------------------------- */
function wireHideCompleted() {
  const toggle = document.getElementById('toggleHideCompleted');
  toggle.addEventListener('change', () => {
    // Preserve scroll position of the first visible incomplete item.
    const anchor = $('ul > li > div > label:not(.completed)');
    const before = anchor ? anchor.getBoundingClientRect().top : null;

    const hide = toggle.checked;
    document.body.classList.toggle('hide_completed', hide);
    cur().hide_completed = hide;
    save();

    if (anchor && before !== null) {
      const after = anchor.getBoundingClientRect().top;
      window.scrollBy(0, after - before);
    }
  });

  const fab = document.getElementById('fadingToggleHide');
  if (fab)
    fab.addEventListener('click', () => {
      toggle.checked = !toggle.checked;
      fire(toggle, 'change');
    });
}

/* ----------------------------------------------------------------------
 * Collapse / expand all sections in the active tab
 * -------------------------------------------------------------------- */
function sectionTriggers(scope) {
  return $all('[data-bs-toggle="collapse"]', scope).filter((t) => {
    const sel = t.getAttribute('data-bs-target') || t.getAttribute('href');
    return sel && /_col$/.test(sel);
  });
}

function anySectionOpen(scope) {
  return sectionTriggers(scope).some((t) => {
    const target = document.querySelector(
      t.getAttribute('data-bs-target') || t.getAttribute('href')
    );
    return target && target.classList.contains('show');
  });
}

// Set every section in `scope` open/closed at once (no animation), mirroring the
// direct class manipulation restoreState uses, and persist the collapsed state.
function setAllSectionsCollapsed(scope, collapsed) {
  sectionTriggers(scope).forEach((trigger) => {
    const sel = trigger.getAttribute('data-bs-target') || trigger.getAttribute('href');
    const target = document.querySelector(sel);
    if (!target) return;
    target.classList.toggle('show', !collapsed);
    trigger.classList.toggle('collapsed', collapsed);
    trigger.setAttribute('aria-expanded', String(!collapsed));
    cur().collapsed[sel] = collapsed;
  });
  save();
}

// Label the button with the action it will perform next.
function updateCollapseAllBtn() {
  const btn = document.getElementById('collapseAllToggle');
  if (!btn) return;
  const pane = document.querySelector('.tab-pane.active');
  const open = pane ? anySectionOpen(pane) : false;
  btn.innerHTML = open
    ? '<i class="bi bi-arrows-collapse" aria-hidden="true"></i> Collapse All'
    : '<i class="bi bi-arrows-expand" aria-hidden="true"></i> Expand All';
}

function wireCollapseAll() {
  const btn = document.getElementById('collapseAllToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const pane = document.querySelector('.tab-pane.active');
    if (!pane) return;
    // If any section is open, collapse them all; otherwise expand them all.
    setAllSectionsCollapsed(pane, anySectionOpen(pane));
    updateCollapseAllBtn();
  });
}

/* ----------------------------------------------------------------------
 * Collapse / tab persistence (event delegation)
 * -------------------------------------------------------------------- */
function wireCollapseAndTabs() {
  document.addEventListener('shown.bs.collapse', (e) => {
    if (e.target.id && /_col$/.test(e.target.id)) {
      cur().collapsed['#' + e.target.id] = false;
      save();
      updateCollapseAllBtn();
    }
  });
  document.addEventListener('hidden.bs.collapse', (e) => {
    if (e.target.id && /_col$/.test(e.target.id)) {
      cur().collapsed['#' + e.target.id] = true;
      save();
      updateCollapseAllBtn();
    }
  });

  $all('[data-bs-toggle="tab"]').forEach((btn) => {
    btn.addEventListener('shown.bs.tab', () => {
      const target = btn.getAttribute('data-bs-target');
      cur().current_tab = target;
      save();
      updateHideCompletedVisibility(target.replace('#', ''));
      updateCollapseAllBtn();
      if (target === '#tabOptions') refreshExportText();
    });
  });
}

/* ----------------------------------------------------------------------
 * Back to top / fading buttons
 * -------------------------------------------------------------------- */
function wireScroll() {
  const offset = 220;
  window.addEventListener('scroll', () => {
    const show = window.scrollY > offset;
    $all('.fadingbutton').forEach((b) => {
      b.classList.toggle('show-fab', show);
    });
  });
  const top = document.querySelector('.back-to-top');
  if (top)
    top.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

/* ----------------------------------------------------------------------
 * Section Toggle/Clear + item checkboxes (delegation)
 * -------------------------------------------------------------------- */
function wireChecklistDelegation() {
  document.addEventListener('change', (e) => {
    if (e.target.matches('.checkbox input[type="checkbox"]')) onCheckboxChange(e.target);
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-section-toggle, .btn-section-clear');
    if (!btn) return;
    const h3 = btn.closest('h3');
    const container = h3 ? h3.nextElementSibling : null;
    if (!container) return;
    // Only act on items visible under the current filters, so a Toggle/Clear on
    // NG never touches hidden NG+/NG++ entries (they'd reappear pre-checked).
    const boxes = $all('.checkbox input[type="checkbox"]', container).filter(
      (cb) => !isFilteredOut(cb)
    );
    if (btn.classList.contains('btn-section-toggle')) {
      setBoxes(boxes, (cb) => !cb.checked);
    } else {
      setBoxes(boxes, () => false);
    }
  });
}

/* ----------------------------------------------------------------------
 * Init
 * -------------------------------------------------------------------- */
export function initApp() {
  // Colour the "+" separators in combined item pickups.
  $all('.p').forEach((el) => {
    el.innerHTML = '<a style="pointer-events:none">&nbsp;+ </a>';
  });

  // Open external links in a new tab.
  $all("a[href^='http']").forEach((a) => {
    a.setAttribute('target', '_blank');
  });

  applyTheme();
  document.getElementById('themes').addEventListener('change', function () {
    Storage.set('style', this.value);
    applyTheme();
  });
  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = resolveTheme(themePref()) === 'dark' ? 'light' : 'dark';
    Storage.set('style', next);
    applyTheme();
  });
  mql.addEventListener('change', () => {
    if (themePref() === 'auto') applyTheme();
  });

  linkGroups = buildLinkGroups();

  wireProfiles();
  wireImportExport();
  wireFilters();
  wireHideCompleted();
  wireCollapseAndTabs();
  wireCollapseAll();
  wireScroll();
  wireChecklistDelegation();

  populateProfiles();
  setCheckboxesFromProfile();
  restoreState(profiles.current);

  setupSearch('playthrough_search', 'playthrough_list');
  setupSearch('item_search', 'item_list');
  setupSearch('weapons_search', 'weapons_list');
  setupSearch('armors_search', 'armors_list');

  // Restore the saved tab.
  const tabTarget = cur().current_tab || '#tabPlaythrough';
  const tabBtn = document.querySelector(
    '[data-bs-toggle="tab"][data-bs-target="' + tabTarget + '"]'
  );
  if (tabBtn) {
    bootstrap.Tab.getOrCreateInstance(tabBtn).show();
    updateHideCompletedVisibility(tabTarget.replace('#', ''));
  } else {
    updateHideCompletedVisibility('tabPlaythrough');
  }

  calculateTotals();
}
