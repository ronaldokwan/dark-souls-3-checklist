/*
 * Renders the checklist content (data/checklist.json) into the static page
 * shell. Replaces the ~500 KB of hand-written markup that used to live in
 * index.html. Runs before main.js initialises behaviour.
 */
function itemHtml(item) {
  const cls = item.cls ? ' class="' + item.cls + '"' : '';
  // Cross-tab link key(s): entries sharing a key mirror their checked state.
  const link = item.item
    ? ' data-item="' + (Array.isArray(item.item) ? item.item.join(' ') : item.item) + '"'
    : '';
  return (
    '<li data-id="' +
    item.id +
    '"' +
    cls +
    link +
    '>' +
    '<div class="checkbox"><label>' +
    '<input type="checkbox" id="' +
    item.id +
    '">' +
    '<span class="item_content">' +
    item.html +
    '</span>' +
    '</label></div>' +
    '</li>'
  );
}

function collapseToggle(colId) {
  return (
    '<a href="#' +
    colId +
    '" data-bs-toggle="collapse" data-bs-target="#' +
    colId +
    '"' +
    ' role="button" aria-expanded="true" aria-controls="' +
    colId +
    '" aria-label="Toggle section"' +
    ' class="btn btn-primary btn-collapse btn-sm"><i class="bi bi-caret-right-fill" aria-hidden="true"></i></a>'
  );
}

const SECTION_BTNS =
  '<div class="btn-group section_btn-group" role="group" aria-label="Section Checklist">' +
  '<button type="button" class="btn btn-primary btn-section-toggle">Toggle</button>' +
  '<button type="button" class="btn btn-primary btn-section-clear">Clear</button>' +
  '</div>';

function sectionHtml(section) {
  const colId = section.id + '_col';
  const hasChecks = section.type === 'items' || section.type === 'groups';
  const totals = section.totalsId ? ' <span id="' + section.totalsId + '"></span>' : '';

  const header =
    '<h3 id="' +
    section.id +
    '"' +
    (hasChecks ? ' class="section_header"' : '') +
    '>' +
    collapseToggle(colId) +
    section.titleHtml +
    totals +
    (hasChecks ? SECTION_BTNS : '') +
    '</h3>';

  let body;
  if (section.type === 'items') {
    body =
      '<ul id="' +
      colId +
      '" class="collapse show">' +
      section.items.map(itemHtml).join('') +
      '</ul>';
  } else if (section.type === 'groups') {
    body =
      '<div id="' +
      colId +
      '" class="collapse show">' +
      section.groups
        .map((g) => {
          const attrs = g.attrs ? ' ' + g.attrs : '';
          return (
            '<h4' + attrs + '>' + g.h4 + '</h4><ul>' + g.items.map(itemHtml).join('') + '</ul>'
          );
        })
        .join('') +
      '</div>';
  } else {
    // raw
    body = '<div id="' + colId + '" class="collapse show">' + section.raw + '</div>';
  }
  return header + body;
}

function tabHtml(tab) {
  let html = '<h2>' + tab.title + ' <span id="' + tab.overallTotalId + '"></span></h2>';
  html +=
    '<ul class="table_of_contents">' + tab.nav.map((n) => '<li>' + n + '</li>').join('') + '</ul>';
  if (tab.searchId) {
    html +=
      '<div class="mb-3"><input type="search" id="' +
      tab.searchId +
      '" class="form-control" aria-label="Search ' +
      tab.title +
      '" placeholder="Start typing to filter results..."></div>';
  }
  const sections = tab.sections.map(sectionHtml).join('\n');
  html += tab.listId ? '<div id="' + tab.listId + '">' + sections + '</div>' : sections;
  return html;
}

export function renderChecklists() {
  return fetch('data/checklist.json')
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then((data) => {
      data.tabs.forEach((tab) => {
        const container = document.querySelector('#' + tab.id + ' .checklist-content');
        if (container) container.innerHTML = tabHtml(tab);
      });
      return data;
    });
}
