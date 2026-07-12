/*
 * Dark Souls 3 Cheat Sheet - application logic.
 * Vanilla JS (no jQuery) + Bootstrap 5 JS API. Progress is stored in
 * localStorage; content is rendered from data/checklist.json by render.js.
 */
(function () {
  'use strict';

  var profilesKey = 'darksouls3_profiles';
  var CHECKLIST_TABS = ['tabPlaythrough', 'tabChecklists', 'tabWeaponsShields', 'tabArmors', 'tabMisc'];

  /* ----------------------------------------------------------------------
   * Storage (replaces jStorage) with a one-time migration from the old
   * jStorage blob so existing users keep their saved progress.
   * -------------------------------------------------------------------- */
  var Storage = {
    get: function (key, def) {
      var raw = localStorage.getItem(key);
      if (raw === null) return def;
      try { return JSON.parse(raw); } catch (e) { return def; }
    },
    set: function (key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota */ }
    }
  };

  (function migrateFromJStorage() {
    if (localStorage.getItem('__ds3_migrated')) return;
    var blob = localStorage.getItem('jStorage');
    if (blob) {
      try {
        var data = JSON.parse(blob);
        ['darksouls3_profiles', 'style'].forEach(function (k) {
          if (k in data && localStorage.getItem(k) === null) {
            localStorage.setItem(k, JSON.stringify(data[k]));
          }
        });
      } catch (e) { /* ignore malformed legacy data */ }
    }
    localStorage.setItem('__ds3_migrated', '1');
  })();

  /* ----------------------------------------------------------------------
   * Profiles / state
   * -------------------------------------------------------------------- */
  var profiles = Storage.get(profilesKey, {});
  if (!('current' in profiles)) profiles.current = 'Default Profile';
  if (!(profilesKey in profiles)) profiles[profilesKey] = {};

  function save() { Storage.set(profilesKey, profiles); }
  function cur() { return profiles[profilesKey][profiles.current]; }

  var FILTER_KEYS = ['f_boss', 'f_miss', 'f_npc', 'f_estus', 'f_bone', 'f_tome', 'f_coal',
    'f_ash', 'f_gest', 'f_sorc', 'f_pyro', 'f_mirac', 'f_ring', 'f_weap', 'f_arm',
    'f_tit', 'f_gem', 'f_cov', 'f_misc'];

  function initializeProfile(name) {
    var store = profiles[profilesKey];
    if (!(name in store)) store[name] = {};
    var p = store[name];
    if (!('checklistData' in p)) p.checklistData = {};
    if (!('collapsed' in p)) p.collapsed = {};
    if (!('current_tab' in p)) p.current_tab = '#tabPlaythrough';
    if (!('hide_completed' in p)) p.hide_completed = false;
    if (!('journey' in p)) p.journey = 1;
    if (!('hidden_categories' in p)) {
      p.hidden_categories = {};
      FILTER_KEYS.forEach(function (k) { p.hidden_categories[k] = false; });
    }
  }
  initializeProfile(profiles.current);

  function canDelete() { return Object.keys(profiles[profilesKey]).length > 1; }
  function getFirstProfile() { return Object.keys(profiles[profilesKey])[0]; }

  /* ----------------------------------------------------------------------
   * Small DOM helpers
   * -------------------------------------------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }

  /* ----------------------------------------------------------------------
   * Filtering
   * -------------------------------------------------------------------- */
  function canFilter(li) {
    var classAttr = li.getAttribute('class');
    if (!classAttr) return false;
    var hidden = cur().hidden_categories;
    if (classAttr === 'f_none') {
      return Object.keys(hidden).some(function (k) { return hidden[k]; });
    }
    var classList = classAttr.split(/\s+/);
    var journey = cur().journey;
    for (var i = 0; i < classList.length; i++) {
      var h = classList[i].match(/^h_ng(\+*)$/);
      var s = classList[i].match(/^s_ng(\+*)$/);
      if ((h && h[1].length < journey) || (s && s[1].length >= journey)) return true;
    }
    var foundMatch = false;
    for (var j = 0; j < classList.length; j++) {
      if (!/^f_/.test(classList[j])) continue;
      if (classList[j] in hidden) {
        if (!hidden[classList[j]]) return false;
        foundMatch = true;
      }
    }
    return foundMatch;
  }

  function toggleFilteredClasses(rawClass) {
    $all('li.' + CSS.escape(rawClass)).forEach(function (li) {
      li.style.display = canFilter(li) ? 'none' : '';
    });
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
    $all('[id$="_overall_total"]').forEach(function (overallEl) {
      var type = overallEl.id.replace(/_overall_total$/, '');
      var overallCount = 0, overallChecked = 0;

      $all('[id^="' + type + '_totals_"]').forEach(function (totEl) {
        var i = parseInt(totEl.id.slice((type + '_totals_').length), 10);
        var navEl = document.getElementById(type + '_nav_totals_' + i);
        var count = 0, checked = 0;

        for (var j = 1; ; j++) {
          var cb = document.getElementById(type + '_' + i + '_' + j);
          if (!cb) break;
          var li = cb.closest('li');
          if (/^playthrough_/.test(cb.id) && li && canFilter(li)) continue;
          count++; overallCount++;
          if (cb.checked) { checked++; overallChecked++; }
        }

        var done = (checked === count);
        var label = done ? 'DONE' : (checked + '/' + count);
        setBadge(totEl, label, done);
        setBadge(navEl, label, done);

        var h3 = totEl.closest('h3');
        if (h3) h3.classList.toggle('completed', done);

        // Sub-heading (h4) visibility: hide fully-completed groups.
        var container = h3 ? h3.nextElementSibling : null;
        if (container && container.tagName === 'DIV') {
          $all(':scope > h4', container).forEach(function (h) { h.classList.add('completed'); });
          $all(':scope > ul', container).forEach(function (ul) {
            if (ul.querySelector('li > div > label:not(.completed)')) {
              var prev = ul.previousElementSibling;
              while (prev && prev.tagName !== 'H4') prev = prev.previousElementSibling;
              if (prev) prev.classList.remove('completed');
            }
          });
        }
      });

      var oDone = (overallChecked === overallCount);
      setBadge(overallEl, oDone ? 'DONE' : (overallChecked + '/' + overallCount), oDone);
    });

    var textArea = document.getElementById('profileText');
    if (textArea) textArea.value = JSON.stringify(profiles);
  }

  /* ----------------------------------------------------------------------
   * Checkbox state
   * -------------------------------------------------------------------- */
  function setLabelCompleted(cb, on) {
    var label = cb.closest('label');
    if (label) label.classList.toggle('completed', on);
  }

  function onCheckboxChange(cb) {
    var checked = cb.checked;
    cur().checklistData[cb.id] = checked;
    setLabelCompleted(cb, checked);
    save();
    calculateTotals();
  }

  function setCheckboxesFromProfile() {
    $all('.checkbox input[type="checkbox"]').forEach(function (cb) {
      cb.checked = false;
      setLabelCompleted(cb, false);
    });
    var data = cur().checklistData;
    Object.keys(data).forEach(function (id) {
      var cb = document.getElementById(id);
      if (cb && cb.matches('.checkbox input[type="checkbox"]')) {
        cb.checked = !!data[id];
        setLabelCompleted(cb, !!data[id]);
      }
    });
  }

  // Batch update used by section Toggle/Clear buttons and NG+.
  function setBoxes(boxes, wantFn) {
    var changed = false;
    boxes.forEach(function (cb) {
      var want = wantFn(cb);
      if (want === cb.checked) return;
      cb.checked = want;
      cur().checklistData[cb.id] = want;
      setLabelCompleted(cb, want);
      changed = true;
    });
    if (changed) { save(); calculateTotals(); }
  }

  /* ----------------------------------------------------------------------
   * Profiles UI
   * -------------------------------------------------------------------- */
  function populateProfiles() {
    var sel = document.getElementById('profiles');
    sel.innerHTML = '';
    Object.keys(profiles[profilesKey]).forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.value = profiles.current;
  }

  /* ----------------------------------------------------------------------
   * Collapse / tab / hide-completed persistence & restore
   * -------------------------------------------------------------------- */
  function applyHideCompleted(state) {
    document.body.classList.toggle('hide_completed', state);
    var toggle = document.getElementById('toggleHideCompleted');
    if (toggle) toggle.checked = state;
  }

  function restoreState(name) {
    var p = profiles[profilesKey][name];

    // Collapsible sections (set directly to avoid load-time animation).
    $all('[data-bs-toggle="collapse"]').forEach(function (trigger) {
      var sel = trigger.getAttribute('data-bs-target') || trigger.getAttribute('href');
      if (!sel || !/_col$/.test(sel)) return;
      var target = document.querySelector(sel);
      if (!target) return;
      var collapsed = !!p.collapsed[sel];
      target.classList.toggle('show', !collapsed);
      trigger.classList.toggle('collapsed', collapsed);
      trigger.setAttribute('aria-expanded', String(!collapsed));
    });

    applyHideCompleted(p.hide_completed);

    // Journey radio -> triggers NG filter application.
    var ng = document.querySelector('[data-ng-toggle="' + p.journey + '"]');
    if (ng) { ng.checked = true; fire(ng, 'change'); }

    // Category filters.
    Object.keys(p.hidden_categories).forEach(function (key) {
      var el = document.querySelector('[data-item-toggle="' + key + '"]');
      if (el && el.checked !== p.hidden_categories[key]) {
        el.checked = p.hidden_categories[key];
        fire(el, 'change');
      }
    });
  }

  function populateChecklists() {
    setCheckboxesFromProfile();
    calculateTotals();
  }

  function updateHideCompletedVisibility(activeTabId) {
    var btn = document.getElementById('btnHideCompleted');
    if (btn) btn.style.display = CHECKLIST_TABS.indexOf(activeTabId) !== -1 ? '' : 'none';
  }

  /* ----------------------------------------------------------------------
   * Theme (Bootstrap 5.3 data-bs-theme: auto / light / dark)
   * -------------------------------------------------------------------- */
  var mql = window.matchMedia('(prefers-color-scheme: dark)');
  function themePref() {
    var p = Storage.get('style', 'auto');
    return (p === 'light' || p === 'dark' || p === 'auto') ? p : 'auto';
  }
  function resolveTheme(pref) {
    if (pref === 'dark' || pref === 'light') return pref;
    return mql.matches ? 'dark' : 'light';
  }
  function applyTheme() {
    var pref = themePref();
    document.documentElement.setAttribute('data-bs-theme', resolveTheme(pref));
    var sel = document.getElementById('themes');
    if (sel) sel.value = pref;
  }

  /* ----------------------------------------------------------------------
   * Search (replaces Jets) + highlight (replaces jquery.highlight)
   * -------------------------------------------------------------------- */
  function unhighlight(root) {
    $all('span.highlight', root).forEach(function (s) {
      var parent = s.parentNode;
      parent.replaceChild(document.createTextNode(s.textContent), s);
      parent.normalize();
    });
  }
  function highlight(root, term) {
    if (!term) return;
    var t = term.toLowerCase();
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var parent = node.parentNode;
      if (!parent || (parent.classList && parent.classList.contains('highlight'))) return;
      var text = node.nodeValue, lower = text.toLowerCase(), idx = lower.indexOf(t);
      if (idx === -1) return;
      var frag = document.createDocumentFragment();
      var last = 0;
      while (idx !== -1) {
        if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
        var span = document.createElement('span');
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
    var input = document.getElementById(inputId);
    var container = document.getElementById(containerId);
    if (!input || !container) return;
    input.addEventListener('input', function () {
      var q = input.value.trim();
      var lower = q.toLowerCase();
      $all('h4', container).forEach(function (h) { h.style.display = q ? 'none' : ''; });
      $all('li[data-id]', container).forEach(function (li) {
        var match = li.textContent.toLowerCase().indexOf(lower) !== -1;
        li.style.display = (q === '' || match) ? '' : 'none';
      });
      unhighlight(container);
      highlight(container, q);
    });
  }

  /* ----------------------------------------------------------------------
   * Import / export
   * -------------------------------------------------------------------- */
  function reloadFromImportedProfiles(data) {
    profiles = data;
    save();
    populateProfiles();
    location.reload();
  }

  function wireImportExport() {
    document.getElementById('profileExport').addEventListener('click', function () {
      var text = JSON.stringify(profiles);
      var a = document.createElement('a');
      a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
      a.download = 'profiles.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });

    document.getElementById('profileImport').addEventListener('click', function () {
      document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f || !/\.json$/.test(f.name)) { alert('Bad input file. File should end in .json'); return; }
      var fr = new FileReader();
      fr.onload = function (e) {
        try { reloadFromImportedProfiles(JSON.parse(e.target.result)); }
        catch (err) { alert(err); }
      };
      fr.readAsText(f);
    });

    document.getElementById('profileExportText').addEventListener('click', function () {
      var ta = document.getElementById('profileText');
      ta.value = JSON.stringify(profiles);
      ta.select();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).catch(function () {});
      } else {
        try { document.execCommand('copy'); } catch (e) {}
      }
    });

    document.getElementById('profileImportText').addEventListener('click', function () {
      if (!confirm('Are you sure you want to import profile data?')) return;
      try { reloadFromImportedProfiles(JSON.parse(document.getElementById('profileText').value)); }
      catch (e) { alert(e); }
    });
  }

  /* ----------------------------------------------------------------------
   * Modals
   * -------------------------------------------------------------------- */
  function modal(id) { return bootstrap.Modal.getOrCreateInstance(document.getElementById(id)); }

  function wireProfiles() {
    document.getElementById('profiles').addEventListener('change', function () {
      profiles.current = this.value;
      save();
      populateChecklists();
      restoreState(profiles.current);
      calculateTotals();
    });

    document.getElementById('profileAdd').addEventListener('click', function () {
      document.getElementById('profileModalTitle').textContent = 'Add Profile';
      document.getElementById('profileModalName').value = '';
      document.getElementById('profileModalAdd').style.display = '';
      document.getElementById('profileModalUpdate').style.display = 'none';
      document.getElementById('profileModalDelete').style.display = 'none';
      modal('profileModal').show();
    });

    document.getElementById('profileEdit').addEventListener('click', function () {
      document.getElementById('profileModalTitle').textContent = 'Edit Profile';
      document.getElementById('profileModalName').value = profiles.current;
      document.getElementById('profileModalAdd').style.display = 'none';
      document.getElementById('profileModalUpdate').style.display = '';
      document.getElementById('profileModalDelete').style.display = canDelete() ? '' : 'none';
      modal('profileModal').show();
    });

    document.getElementById('profileModalAdd').addEventListener('click', function () {
      var name = document.getElementById('profileModalName').value.trim();
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

    document.getElementById('profileModalUpdate').addEventListener('click', function () {
      var newName = document.getElementById('profileModalName').value.trim();
      if (newName.length > 0 && newName !== profiles.current) {
        profiles[profilesKey][newName] = profiles[profilesKey][profiles.current];
        delete profiles[profilesKey][profiles.current];
        profiles.current = newName;
        save();
        populateProfiles();
      }
      modal('profileModal').hide();
    });

    document.getElementById('profileModalDelete').addEventListener('click', function () {
      if (!canDelete() || !confirm('Are you sure?')) return;
      delete profiles[profilesKey][profiles.current];
      profiles.current = getFirstProfile();
      save();
      populateProfiles();
      populateChecklists();
      restoreState(profiles.current);
      modal('profileModal').hide();
    });

    document.getElementById('profileNG+').addEventListener('click', function () {
      modal('NG+Modal').show();
    });
    document.getElementById('NG+ModalYes').addEventListener('click', function () {
      if (!confirm('Are you sure you wish to begin the next journey?')) return;
      var data = cur().checklistData;
      $all('[id^="playthrough_"], [id^="crow_"]').forEach(function (cb) {
        if (cb.matches('.checkbox input[type="checkbox"]') && cb.checked) {
          data[cb.id] = false;
        }
      });
      Object.keys(cur().hidden_categories).forEach(function (k) { cur().hidden_categories[k] = false; });
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
    var items = $all('[data-item-toggle]', cat);
    var checkedCount = items.filter(function (i) { return i.checked; }).length;
    var catInput = $('[data-category-toggle]', cat);
    if (catInput) catInput.checked = (items.length > 0 && checkedCount === items.length);
    cat.classList.toggle('partial', checkedCount > 0 && checkedCount < items.length);
  }

  function wireFilters() {
    $all('[data-item-toggle]').forEach(function (input) {
      input.addEventListener('change', function () {
        var type = input.getAttribute('data-item-toggle');
        cur().hidden_categories[type] = input.checked;
        save();
        toggleFilteredClasses(type);
        toggleFilteredClasses('f_none');
        syncCategory(input.closest('.filter-cat'));
        calculateTotals();
      });
    });

    $all('[data-category-toggle]').forEach(function (input) {
      input.addEventListener('change', function () {
        var cat = input.closest('.filter-cat');
        var toHide = input.checked;
        $all('[data-item-toggle]', cat).forEach(function (it) {
          if (it.checked !== toHide) { it.checked = toHide; fire(it, 'change'); }
        });
      });
    });

    $all('[data-ng-toggle]').forEach(function (input) {
      input.addEventListener('change', function () {
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
    var toggle = document.getElementById('toggleHideCompleted');
    toggle.addEventListener('change', function () {
      // Preserve scroll position of the first visible incomplete item.
      var anchor = $('ul > li > div > label:not(.completed)');
      var before = anchor ? anchor.getBoundingClientRect().top : null;

      var hide = toggle.checked;
      document.body.classList.toggle('hide_completed', hide);
      cur().hide_completed = hide;
      save();

      if (anchor && before !== null) {
        var after = anchor.getBoundingClientRect().top;
        window.scrollBy(0, after - before);
      }
    });

    var fab = document.getElementById('fadingToggleHide');
    if (fab) fab.addEventListener('click', function () {
      toggle.checked = !toggle.checked;
      fire(toggle, 'change');
    });
  }

  /* ----------------------------------------------------------------------
   * Collapse / tab persistence (event delegation)
   * -------------------------------------------------------------------- */
  function wireCollapseAndTabs() {
    document.addEventListener('shown.bs.collapse', function (e) {
      if (e.target.id && /_col$/.test(e.target.id)) {
        cur().collapsed['#' + e.target.id] = false; save();
      }
    });
    document.addEventListener('hidden.bs.collapse', function (e) {
      if (e.target.id && /_col$/.test(e.target.id)) {
        cur().collapsed['#' + e.target.id] = true; save();
      }
    });

    $all('[data-bs-toggle="tab"]').forEach(function (btn) {
      btn.addEventListener('shown.bs.tab', function () {
        var target = btn.getAttribute('data-bs-target');
        cur().current_tab = target;
        save();
        updateHideCompletedVisibility(target.replace('#', ''));
      });
    });
  }

  /* ----------------------------------------------------------------------
   * Back to top / fading buttons
   * -------------------------------------------------------------------- */
  function wireScroll() {
    var offset = 220;
    window.addEventListener('scroll', function () {
      var show = window.scrollY > offset;
      $all('.fadingbutton').forEach(function (b) { b.classList.toggle('show-fab', show); });
    });
    var top = document.querySelector('.back-to-top');
    if (top) top.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ----------------------------------------------------------------------
   * Section Toggle/Clear + item checkboxes (delegation)
   * -------------------------------------------------------------------- */
  function wireChecklistDelegation() {
    document.addEventListener('change', function (e) {
      if (e.target.matches('.checkbox input[type="checkbox"]')) onCheckboxChange(e.target);
    });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-section-toggle, .btn-section-clear');
      if (!btn) return;
      var h3 = btn.closest('h3');
      var container = h3 ? h3.nextElementSibling : null;
      if (!container) return;
      var boxes = $all('.checkbox input[type="checkbox"]', container);
      if (btn.classList.contains('btn-section-toggle')) {
        setBoxes(boxes, function (cb) { return !cb.checked; });
      } else {
        setBoxes(boxes, function () { return false; });
      }
    });
  }

  /* ----------------------------------------------------------------------
   * Init
   * -------------------------------------------------------------------- */
  function initApp() {
    // Colour the "+" separators in combined item pickups.
    $all('.p').forEach(function (el) {
      el.innerHTML = '<a style="pointer-events:none">&nbsp;+ </a>';
    });

    // Open external links in a new tab.
    $all("a[href^='http']").forEach(function (a) { a.setAttribute('target', '_blank'); });

    applyTheme();
    document.getElementById('themes').addEventListener('change', function () {
      Storage.set('style', this.value); applyTheme();
    });
    document.getElementById('themeToggle').addEventListener('click', function () {
      var next = resolveTheme(themePref()) === 'dark' ? 'light' : 'dark';
      Storage.set('style', next); applyTheme();
    });
    mql.addEventListener('change', function () { if (themePref() === 'auto') applyTheme(); });

    wireProfiles();
    wireImportExport();
    wireFilters();
    wireHideCompleted();
    wireCollapseAndTabs();
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
    var tabTarget = cur().current_tab || '#tabPlaythrough';
    var tabBtn = document.querySelector('[data-bs-toggle="tab"][data-bs-target="' + tabTarget + '"]');
    if (tabBtn) {
      bootstrap.Tab.getOrCreateInstance(tabBtn).show();
      updateHideCompletedVisibility(tabTarget.replace('#', ''));
    } else {
      updateHideCompletedVisibility('tabPlaythrough');
    }

    calculateTotals();
  }

  window.initApp = initApp;
})();
