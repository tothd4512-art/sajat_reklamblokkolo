/** ReklámStop – beállítások és statisztika tárolása (chrome.storage.local) */

export const STORAGE_KEYS = {
  settings: 'settings',
  stats: 'stats',
  imported: 'imported',
};

export const DEFAULT_SETTINGS = {
  enabled: true,
  lang: 'hu',
  categories: { ads: true, trackers: true, privacy: true },
  cosmetic: { ads: true, consent: true, widget: true },
  customRules: '',
  allowlist: [],
  countStats: true,
};

export const DEFAULT_STATS = {
  total: 0,
  byCategory: { ads: 0, trackers: 0, privacy: 0, custom: 0 },
  since: null,
};

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

export function mergeSettings(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isObject(v) && isObject(base[k]) ? { ...base[k], ...v } : v;
  }
  return out;
}

const hasChrome =
  typeof chrome !== 'undefined' && chrome?.storage?.local && typeof chrome.storage.local.get === 'function';

export async function loadSettings() {
  if (!hasChrome) return { ...DEFAULT_SETTINGS };
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return mergeSettings(DEFAULT_SETTINGS, stored?.[STORAGE_KEYS.settings]);
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  const next = mergeSettings(current, patch);
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

export async function loadStats() {
  if (!hasChrome) return { ...DEFAULT_STATS, byCategory: { ...DEFAULT_STATS.byCategory } };
  const stored = await chrome.storage.local.get(STORAGE_KEYS.stats);
  const stats = stored?.[STORAGE_KEYS.stats];
  if (!stats) return { ...DEFAULT_STATS, byCategory: { ...DEFAULT_STATS.byCategory }, since: Date.now() };
  return { ...DEFAULT_STATS, ...stats, byCategory: { ...DEFAULT_STATS.byCategory, ...(stats.byCategory || {}) } };
}

export async function saveStats(stats) {
  if (!hasChrome) return stats;
  await chrome.storage.local.set({ [STORAGE_KEYS.stats]: stats });
  return stats;
}

export async function loadImported() {
  if (!hasChrome) return null;
  const stored = await chrome.storage.local.get(STORAGE_KEYS.imported);
  return stored?.[STORAGE_KEYS.imported] || null;
}
