/*
 * localStorage wrapper (replaces jStorage) with a one-time migration from the
 * old jStorage blob so existing users keep their saved progress. The migration
 * runs once, on first import of this module.
 */
export const Storage = {
  get(key, def) {
    const raw = localStorage.getItem(key);
    if (raw === null) return def;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return def;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      /* quota */
    }
  },
};

(function migrateFromJStorage() {
  if (localStorage.getItem('__ds3_migrated')) return;
  const blob = localStorage.getItem('jStorage');
  if (blob) {
    try {
      const data = JSON.parse(blob);
      ['darksouls3_profiles', 'style'].forEach((k) => {
        if (k in data && localStorage.getItem(k) === null) {
          localStorage.setItem(k, JSON.stringify(data[k]));
        }
      });
    } catch (e) {
      /* ignore malformed legacy data */
    }
  }
  localStorage.setItem('__ds3_migrated', '1');
})();
