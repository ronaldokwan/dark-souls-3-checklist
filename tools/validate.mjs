/*
 * Validates data/checklist.json. Run in CI and locally:
 *   node tools/validate.mjs
 * Exits non-zero (and prints every problem) if anything is wrong.
 */
import { readFileSync } from 'node:fs';

const FILTER_CLASSES = new Set([
  'f_none',
  'f_boss',
  'f_miss',
  'f_npc',
  'f_estus',
  'f_bone',
  'f_tome',
  'f_coal',
  'f_ash',
  'f_gest',
  'f_sorc',
  'f_pyro',
  'f_mirac',
  'f_ring',
  'f_weap',
  'f_arm',
  'f_tit',
  'f_gem',
  'f_cov',
  'f_misc',
]);
const JOURNEY_CLASS = /^(h_ng\++|s_ng\++)$/;
const SECTION_TYPES = new Set(['items', 'groups', 'raw']);

const errors = [];
function err(where, msg) {
  errors.push(`${where}: ${msg}`);
}

let data;
try {
  data = JSON.parse(readFileSync('data/checklist.json', 'utf8'));
} catch (e) {
  console.error('checklist.json is not valid JSON: ' + e.message);
  process.exit(1);
}

if (!Array.isArray(data.tabs)) {
  console.error('root: missing "tabs" array');
  process.exit(1);
}

const seenIds = new Map(); // id -> first location
let itemCount = 0;

function validateItem(item, where, key) {
  if (typeof item.id !== 'string' || !item.id) return err(where, 'item missing id');
  if (!new RegExp('^' + key + '_\\d+_\\d+$').test(item.id)) {
    err(where, `id "${item.id}" must match ${key}_<zone>_<n>`);
  }
  if (seenIds.has(item.id))
    err(where, `duplicate id "${item.id}" (also at ${seenIds.get(item.id)})`);
  else seenIds.set(item.id, where);

  if (typeof item.html !== 'string' || item.html.trim() === '') {
    err(where + ' [' + item.id + ']', 'html must be a non-empty string');
  }
  if (item.cls !== undefined && item.cls !== '') {
    if (typeof item.cls !== 'string')
      return err(where + ' [' + item.id + ']', 'cls must be a string');
    item.cls
      .trim()
      .split(/\s+/)
      .forEach(function (c) {
        if (!FILTER_CLASSES.has(c) && !JOURNEY_CLASS.test(c)) {
          err(where + ' [' + item.id + ']', `unknown class "${c}"`);
        }
      });
  }
  itemCount++;
}

data.tabs.forEach(function (tab, ti) {
  var tw = `tabs[${ti}]${tab.id ? ' (' + tab.id + ')' : ''}`;
  ['id', 'key', 'title', 'overallTotalId'].forEach(function (f) {
    if (typeof tab[f] !== 'string' || !tab[f]) err(tw, `missing string field "${f}"`);
  });
  if (!Array.isArray(tab.nav)) err(tw, 'missing "nav" array');
  if (!Array.isArray(tab.sections)) {
    err(tw, 'missing "sections" array');
    return;
  }

  tab.sections.forEach(function (s, si) {
    var sw = `${tw} sections[${si}]${s.id ? ' (' + s.id + ')' : ''}`;
    if (typeof s.id !== 'string' || !s.id) err(sw, 'section missing id');
    if (typeof s.titleHtml !== 'string') err(sw, 'section missing titleHtml');
    if (!SECTION_TYPES.has(s.type)) err(sw, `invalid type "${s.type}"`);
    if (s.totalsId !== null && s.totalsId !== undefined) {
      if (!new RegExp('^' + tab.key + '_totals_\\d+$').test(s.totalsId)) {
        err(sw, `totalsId "${s.totalsId}" must match ${tab.key}_totals_<n>`);
      }
    }

    if (s.type === 'items') {
      if (!Array.isArray(s.items)) err(sw, 'items section missing items array');
      else
        s.items.forEach(function (it) {
          validateItem(it, sw, tab.key);
        });
    } else if (s.type === 'groups') {
      if (!Array.isArray(s.groups)) err(sw, 'groups section missing groups array');
      else
        s.groups.forEach(function (g, gi) {
          if (typeof g.h4 !== 'string') err(`${sw} groups[${gi}]`, 'group missing h4');
          if (!Array.isArray(g.items)) err(`${sw} groups[${gi}]`, 'group missing items array');
          else
            g.items.forEach(function (it) {
              validateItem(it, `${sw} groups[${gi}]`, tab.key);
            });
        });
    } else if (s.type === 'raw') {
      if (typeof s.raw !== 'string' || !s.raw) err(sw, 'raw section missing raw string');
    }
  });
});

if (errors.length) {
  console.error(`✗ checklist.json has ${errors.length} problem(s):\n`);
  errors.forEach(function (e) {
    console.error('  - ' + e);
  });
  process.exit(1);
}

console.log(`✓ checklist.json OK — ${data.tabs.length} tabs, ${itemCount} items, all ids unique.`);
