/*
 * Profile state model. Owns the `profiles` blob that is persisted to
 * localStorage and consumed throughout the app. `profiles` is a live binding:
 * property mutations are visible to every importer, and `setProfiles` swaps the
 * whole object (used only on import, which reloads the page immediately after).
 */
import { Storage } from './storage.js';

export const profilesKey = 'darksouls3_profiles';

export const FILTER_KEYS = [
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
];

export let profiles = Storage.get(profilesKey, {});
if (!('current' in profiles)) profiles.current = 'Default Profile';
if (!(profilesKey in profiles)) profiles[profilesKey] = {};

export function setProfiles(next) {
  profiles = next;
}

export function save() {
  Storage.set(profilesKey, profiles);
}

export function cur() {
  return profiles[profilesKey][profiles.current];
}

export function initializeProfile(name) {
  const store = profiles[profilesKey];
  if (!(name in store)) store[name] = {};
  const p = store[name];
  if (!('checklistData' in p)) p.checklistData = {};
  if (!('collapsed' in p)) p.collapsed = {};
  if (!('current_tab' in p)) p.current_tab = '#tabPlaythrough';
  if (!('hide_completed' in p)) p.hide_completed = false;
  if (!('journey' in p)) p.journey = 1;
  if (!('hidden_categories' in p)) {
    p.hidden_categories = {};
    FILTER_KEYS.forEach((k) => {
      p.hidden_categories[k] = false;
    });
  }
}

export function canDelete() {
  return Object.keys(profiles[profilesKey]).length > 1;
}

export function getFirstProfile() {
  return Object.keys(profiles[profilesKey])[0];
}

initializeProfile(profiles.current);
