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
// Active build-focus keys (f_*_build). Unlike hidden_categories these are
// inclusive: while any are active, only entries tagged with one of them stay
// visible on the Playthrough. `|| {}` guards profiles written before the
// build_focus field existed (old exports, secondary profiles in the blob).
function activeFocusBuilds() {
  const focus = cur().build_focus || {};
  return Object.keys(focus).filter((k) => focus[k]);
}

function canFilter(li) {
  const classList = (li.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  const journey = cur().journey;
  for (let i = 0; i < classList.length; i++) {
    const h = classList[i].match(/^h_ng(\+*)$/);
    const s = classList[i].match(/^s_ng(\+*)$/);
    if ((h && h[1].length < journey) || (s && s[1].length >= journey)) return true;
  }
  // Build focus: while a build is focused, everything not tagged for an
  // active build hides — including untagged entries, which is why this runs
  // before the classless early-return below. Entries that survive the focus
  // still answer to the regular category filters (focusing Sorcery and hiding
  // Rings hides the sorcery rings too).
  const focused = activeFocusBuilds();
  if (focused.length > 0 && !focused.some((k) => classList.includes(k))) return true;
  if (classList.length === 0) return false;
  const hidden = cur().hidden_categories;
  // f_none marks "no specific category" content: it has no checkbox of its
  // own, so it hides whenever the player is filtering anything at all. This
  // must key off classList.includes rather than an exact string match,
  // since f_none can be combined with other classes (e.g. a build tag) that
  // don't otherwise affect visibility.
  let foundMatch = classList.includes('f_none') && Object.keys(hidden).some((k) => hidden[k]);
  for (let j = 0; j < classList.length; j++) {
    if (!/^f_/.test(classList[j]) || classList[j] === 'f_none') continue;
    // Build classes only drive the focus above (their keys are kept out of
    // hidden_categories); they must never count as a protective category
    // here, or every build-tagged entry would become immune to the regular
    // filters if a stale key from an old profile ever slipped through.
    if (/_build$/.test(classList[j])) continue;
    if (classList[j] in hidden) {
      if (!hidden[classList[j]]) return false;
      foundMatch = true;
    }
  }
  return foundMatch;
}

// Filters only ever hide entries in the Playthrough walkthrough. The
// collection tabs (Achievements, Weapons/Shields, ...) are 100% completion
// lists, so their entries must stay visible (and counted) no matter what is
// filtered; the f_* classes they carry only drive build highlighting.
function toggleFilteredClasses(rawClass) {
  $all('#tabPlaythrough li.' + CSS.escape(rawClass)).forEach((li) => {
    li.style.display = canFilter(li) ? 'none' : '';
  });
}

// Build focus touches every Playthrough entry (untagged ones included), so a
// change re-evaluates them all rather than one class like the filters above.
// The body class lets CSS collapse the zones the focus emptied out.
function applyBuildFocus() {
  document.body.classList.toggle('build-focus', activeFocusBuilds().length > 0);
  $all('#tabPlaythrough li[data-id]').forEach((li) => {
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
function setBadge(el, text, done, pct) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('done', done);
  el.classList.toggle('in_progress', !done);
  if (typeof pct === 'number') el.style.setProperty('--pct', pct);
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
      const pct = count > 0 ? Math.round((checked / count) * 100) : 0;
      setBadge(totEl, label, done, pct);
      setBadge(navEl, label, done, pct);

      if (h3) {
        h3.classList.toggle('completed', done);
        // A zone the current filters emptied out entirely; while a build
        // focus is active, CSS hides these headers (and their lists) so the
        // Playthrough reads as one compact build checklist.
        h3.classList.toggle('filter-empty', count === 0);
      }
      if (navEl) {
        const navLi = navEl.closest('li');
        if (navLi) navLi.classList.toggle('filter-empty', count === 0);
      }

      // Sub-heading (h4) visibility: hide fully-completed groups.
      if (container && container.tagName === 'DIV') {
        $all('.item-group', container).forEach((group) => {
          const h = group.querySelector('h4');
          if (!h) return;
          const allDone = !group.querySelector('li > div > label:not(.completed)');
          h.classList.toggle('completed', allDone);
        });
      }
    });

    const oDone = overallChecked === overallCount;
    const oPct = overallCount > 0 ? Math.round((overallChecked / overallCount) * 100) : 0;
    setBadge(overallEl, oDone ? 'DONE' : overallChecked + '/' + overallCount, oDone, oPct);
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
 * never resolves to more than one entry per tab, so no runtime guardrail is
 * needed here — entries that would violate that (stackables, multi-source items
 * like Crow trades for gems/rings, upgrade variants) are simply left without an
 * `item` key in the data.
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
  document.getElementById('profileDelete').disabled = !canDelete();
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

  // Build focus toggles.
  const focus = p.build_focus || {};
  $all('[data-build-focus]').forEach((el) => {
    el.checked = !!focus[el.getAttribute('data-build-focus')];
  });
  applyBuildFocus();
  calculateTotals();

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
 * Build highlighting (Sorcery / Pyromancy / Miracle)
 * ----------------------------------------------------------------------
 * Unlike the category filters (which hide items), these buttons tint the
 * checklist entries connected to a caster build - the spells, catalysts
 * (staves / pyromancy flames / talismans and chimes), build-related rings and
 * trainer NPCs (see the f_*_build classes in data/checklist.json) - across
 * every checklist tab. Multiple builds can be highlighted at once; a step
 * that belongs to more than one (e.g. recruiting Karla, who sells both
 * sorceries and pyromancies) gets a gradient blending each active color
 * instead of a single flat tint. Highlight state is intentionally transient
 * (not saved to the profile) - it resets on reload like a scratch view.
 * -------------------------------------------------------------------- */
const BUILD_HIGHLIGHT_COLORS = {
  f_sorc_build: '61, 118, 209',
  f_pyro_build: '196, 94, 33',
  f_mirac_build: '201, 162, 39',
};

// School names as they appear in passive descriptions. They let the passive
// modal tint a description that matters to an active build even when the
// entry itself is tagged for another school (e.g. Saint-tree Bellvine is a
// miracle catalyst, but its casting speed buff covers sorceries and
// pyromancies cast with another catalyst too).
const BUILD_TERMS = {
  f_sorc_build: 'sorcer(?:y|ies)',
  f_pyro_build: 'pyromanc(?:y|ies)',
  f_mirac_build: 'miracles?',
};

function activeBuilds() {
  return $all('[data-build-highlight]')
    .filter((el) => el.checked)
    .map((el) => el.getAttribute('data-build-highlight'));
}

function buildTint(matches) {
  if (matches.length === 1) return `rgba(${BUILD_HIGHLIGHT_COLORS[matches[0]]}, 0.35)`;
  const stops = matches.map((cls) => `rgba(${BUILD_HIGHLIGHT_COLORS[cls]}, 0.35)`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function updateBuildHighlights() {
  const active = activeBuilds();
  const scope = CHECKLIST_TABS.map((t) => '#' + t + ' li[data-id]').join(', ');
  $all(scope).forEach((li) => {
    const matches = active.filter((cls) => li.classList.contains(cls));
    li.classList.toggle('build-highlight', matches.length > 0);
    if (matches.length === 0) {
      li.style.removeProperty('--build-tint');
    } else {
      li.style.setProperty('--build-tint', buildTint(matches));
    }
  });
}

// Passive modal counterpart of updateBuildHighlights: tint the description
// when the passive matters to an active build - either the entry carries that
// build's tag, or the text itself names the school - and mark the matched
// school names in their own build colour.
function renderPassiveModalText(li, text) {
  const el = document.getElementById('passiveModalText');
  const matches = activeBuilds().filter(
    (cls) => li.classList.contains(cls) || new RegExp(BUILD_TERMS[cls], 'i').test(text)
  );
  el.classList.toggle('build-highlight', matches.length > 0);
  el.textContent = text;
  if (matches.length === 0) {
    el.style.removeProperty('--build-tint');
    return;
  }
  el.style.setProperty('--build-tint', buildTint(matches));
  // textContent above escaped the description, so these replacements only
  // ever wrap plain text.
  let html = el.innerHTML;
  matches.forEach((cls) => {
    html = html.replace(
      new RegExp('\\b' + BUILD_TERMS[cls], 'gi'),
      (m) =>
        `<span class="build-term" style="--build-tint: rgba(${BUILD_HIGHLIGHT_COLORS[cls]}, 0.55)">${m}</span>`
    );
  });
  el.innerHTML = html;
}

function updateBuildHighlightVisibility(activeTabId) {
  const group = document.getElementById('buildHighlightGroup');
  if (group) group.classList.toggle('d-none', CHECKLIST_TABS.indexOf(activeTabId) === -1);
}

function wireBuildHighlights() {
  $all('[data-build-highlight]').forEach((input) => {
    input.addEventListener('change', updateBuildHighlights);
  });
}

/* ----------------------------------------------------------------------
 * Theme (Bootstrap 5.3 data-bs-theme: auto / light / dark)
 * -------------------------------------------------------------------- */
const mql = window.matchMedia('(prefers-color-scheme: dark)');
function themePref() {
  // The default is light, not the OS scheme: the page opens light for new
  // visitors even on dark-mode machines. "Auto (match system)" remains an
  // explicit choice in the Options tab, and stored preferences always win.
  const p = Storage.get('style', 'light');
  return p === 'light' || p === 'dark' || p === 'auto' ? p : 'light';
}
function resolveTheme(pref) {
  if (pref === 'dark' || pref === 'light') return pref;
  return mql.matches ? 'dark' : 'light';
}
function applyTheme() {
  const pref = themePref();
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute('data-bs-theme', resolved);
  // Keep the browser/PWA chrome (Android toolbar, installed-app title bar)
  // matching the navbar of the active theme instead of a fixed dark brown.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#17110b' : '#f8f9fa');
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
    // Only the Playthrough is ever category/focus-filtered; consult canFilter
    // there so showing search results (or clearing the search) can't undo the
    // active filters by resetting every row's display.
    const filtered = containerId === 'playthrough_list' ? canFilter : () => false;
    $all('li[data-id]', container).forEach((li) => {
      const match = li.textContent.toLowerCase().indexOf(lower) !== -1;
      li.style.display = (q === '' || match) && !filtered(li) ? '' : 'none';
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
    document.getElementById('profileModalIconAdd').style.display = '';
    document.getElementById('profileModalIconRename').style.display = 'none';
    document.getElementById('profileModalAdd').style.display = '';
    document.getElementById('profileModalRename').style.display = 'none';
    modal('profileModal').show();
  });

  document.getElementById('profileRename').addEventListener('click', () => {
    document.getElementById('profileModalTitle').textContent = 'Rename Profile';
    document.getElementById('profileModalName').value = profiles.current;
    document.getElementById('profileModalIconAdd').style.display = 'none';
    document.getElementById('profileModalIconRename').style.display = '';
    document.getElementById('profileModalAdd').style.display = 'none';
    document.getElementById('profileModalRename').style.display = '';
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

  document.getElementById('profileModalRename').addEventListener('click', () => {
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

  document.getElementById('profileDelete').addEventListener('click', () => {
    if (!canDelete()) return;
    document.getElementById('profileDeleteModalName').textContent = profiles.current;
    modal('profileDeleteModal').show();
  });
  document.getElementById('profileDeleteModalYes').addEventListener('click', () => {
    delete profiles[profilesKey][profiles.current];
    profiles.current = getFirstProfile();
    save();
    populateProfiles();
    populateChecklists();
    restoreState(profiles.current);
    modal('profileDeleteModal').hide();
  });

  document.getElementById('profileNG+').addEventListener('click', () => {
    modal('NG+Modal').show();
  });
  document.getElementById('NG+ModalYes').addEventListener('click', () => {
    const data = cur().checklistData;
    $all('[id^="playthrough_"], [id^="crow_"]').forEach((cb) => {
      if (cb.matches('.checkbox input[type="checkbox"]') && cb.checked) {
        data[cb.id] = false;
      }
    });
    Object.keys(cur().hidden_categories).forEach((k) => {
      cur().hidden_categories[k] = false;
    });
    Object.keys(cur().build_focus || {}).forEach((k) => {
      cur().build_focus[k] = false;
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

  // Build focus toggles: inverted semantics compared to the filters above
  // (checked = show only that build), so they keep their own profile field
  // and re-evaluate the whole Playthrough on change.
  $all('[data-build-focus]').forEach((input) => {
    input.addEventListener('change', () => {
      const p = cur();
      if (!p.build_focus) p.build_focus = {};
      p.build_focus[input.getAttribute('data-build-focus')] = input.checked;
      save();
      applyBuildFocus();
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
      updateBuildHighlightVisibility(target.replace('#', ''));
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

  // Unique-passive info buttons: show the passive description in a modal,
  // titled with the entry's own (linked) name.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.passive-info');
    if (!btn) return;
    const li = btn.closest('li');
    const content = li.querySelector('.item_content');
    document.getElementById('passiveModalItem').innerHTML = content ? content.innerHTML : '';
    renderPassiveModalText(li, btn.getAttribute('data-passive'));
    modal('passiveModal').show();
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
  wireBuildHighlights();
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
    updateBuildHighlightVisibility(tabTarget.replace('#', ''));
  } else {
    updateHideCompletedVisibility('tabPlaythrough');
    updateBuildHighlightVisibility('tabPlaythrough');
  }

  calculateTotals();
}
