/**
 * ReklámStop – háttérfolyamat (MV3 service worker)
 * ------------------------------------------------
 * Feladatai:
 *  - a statikus DNR szabálykészletek ki-/bekapcsolása,
 *  - a saját szabályok és az engedélyezett oldalak dinamikus szabályként,
 *  - kérésszámlálás (webRequest, csak megfigyelés),
 *  - kozmetikai CSS kiszolgálása a content scriptnek,
 *  - import/export, beállítás-tárolás.
 */
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  STORAGE_KEYS,
  loadSettings,
  saveSettings,
  loadStats,
  saveStats,
  loadImported,
} from './shared/settings.js';
import {
  buildCosmeticCss,
  buildDynamicRules,
  buildHostsFile,
  buildHostIndex,
  domainMatches,
  hostOfUrl,
  matchHost,
  parseCustomRules,
  parseEasyList,
} from './shared/engine.js';

const STATIC_RULESETS = ['ads', 'trackers', 'privacy'];
const MAX_DYNAMIC_RULES = 4900; // a Chrome limit 5000, marad hely az engedélyezett oldalaknak

let settings = { ...DEFAULT_SETTINGS };
let stats = { ...DEFAULT_STATS, byCategory: { ...DEFAULT_STATS.byCategory } };
let imported = null;
let filterData = null;
let hostIndex = null;
let customIndex = null;

const tabHost = new Map();     // tabId -> hosztnév
const tabCounts = new Map();   // tabId -> blokkolt kérések száma
let statsSaveTimer = null;
let ready = null;

/* ------------------------------------------------------------------ */
/* Inicializálás                                                       */
/* ------------------------------------------------------------------ */

async function ensureReady() {
  if (!ready) ready = bootstrap();
  return ready;
}

async function bootstrap() {
  settings = await loadSettings();
  stats = await loadStats();
  if (!stats.since) {
    stats.since = Date.now();
    await saveStats(stats);
  }
  imported = await loadImported();
  try {
    const res = await fetch(chrome.runtime.getURL('data/filters.json'));
    filterData = await res.json();
    hostIndex = buildHostIndex(filterData);
  } catch (err) {
    console.error('[ReklámStop] Nem sikerült betölteni a szűrőlistát:', err);
    filterData = { categories: {}, cosmetic: { groups: {}, siteSpecific: {} }, counts: {} };
    hostIndex = new Map();
  }
  rebuildCustomIndex();

  // a már nyitva lévő lapok hosztjainak betöltése (a service worker újraindulhat)
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab?.id != null && tab.url) tabHost.set(tab.id, hostOfUrl(tab.url));
    }
  } catch {
    /* nincs tabs hozzáférés */
  }
}

function rebuildCustomIndex() {
  customIndex = new Set();
  const parsed = parseCustomRules(settings.customRules);
  for (const f of parsed.network) {
    const d = f.replace(/^\|\|/, '').split(/[\^/$]/)[0];
    if (d) customIndex.add(d.toLowerCase());
  }
}

/* ------------------------------------------------------------------ */
/* Szabályok szinkronizálása                                           */
/* ------------------------------------------------------------------ */

async function syncRules() {
  await ensureReady();

  const enabledSets = settings.enabled
    ? STATIC_RULESETS.filter((id) => settings.categories?.[id] !== false)
    : [];
  const disabledSets = STATIC_RULESETS.filter((id) => !enabledSets.includes(id));

  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enabledSets,
      disableRulesetIds: disabledSets,
    });
  } catch (err) {
    console.warn('[ReklámStop] ruleset frissítés hiba:', err);
  }

  const extra = settings.enabled ? imported?.network || [] : [];
  let rules = buildDynamicRules(settings, extra);
  if (rules.length > MAX_DYNAMIC_RULES) {
    const allow = rules.filter((r) => r.action.type === 'allowAllRequests');
    const block = rules.filter((r) => r.action.type !== 'allowAllRequests');
    rules = [...block.slice(0, MAX_DYNAMIC_RULES - allow.length), ...allow];
  }

  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules: rules,
    });
  } catch (err) {
    console.error('[ReklámStop] dinamikus szabályok frissítése nem sikerült:', err);
  }

  broadcastCosmeticRefresh();
}

async function broadcastCosmeticRefresh() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: 'cosmeticRefresh' }).catch(() => {});
    }
  } catch {
    /* nincs mit tenni */
  }
}

/* ------------------------------------------------------------------ */
/* Kérésszámlálás (csak megfigyelés, nem blokkol)                      */
/* ------------------------------------------------------------------ */

function scheduleStatsSave() {
  if (statsSaveTimer) return;
  statsSaveTimer = setTimeout(async () => {
    statsSaveTimer = null;
    try {
      await saveStats(stats);
    } catch (err) {
      console.warn('[ReklámStop] statisztika mentés hiba:', err);
    }
  }, 2500);
}

function countRequest(details) {
  if (!settings.enabled || !settings.countStats) return;
  if (!hostIndex || details.tabId == null || details.tabId < 0) return;

  const host = hostOfUrl(details.url);
  if (!host) return;

  const pageHost = tabHost.get(details.tabId);
  if (!pageHost) return;
  // első féltől jövő kérést nem számolunk
  if (domainMatches(host, pageHost)) return;
  if (isAllowed(pageHost)) return;

  const match = matchHost(hostIndex, host, customIndex);
  if (!match) return;
  if (match.category !== 'custom' && settings.categories?.[match.category] === false) return;

  stats.total += 1;
  stats.byCategory[match.category] = (stats.byCategory[match.category] || 0) + 1;
  tabCounts.set(details.tabId, (tabCounts.get(details.tabId) || 0) + 1);
  scheduleStatsSave();
}

function isAllowed(host) {
  return (settings.allowlist || []).some((entry) => domainMatches(host, entry));
}

try {
  chrome.webRequest.onBeforeRequest.addListener(countRequest, { urls: ['<all_urls>'] });
} catch (err) {
  console.warn('[ReklámStop] webRequest nem elérhető:', err);
}

/* ------------------------------------------------------------------ */
/* Lapok követése                                                      */
/* ------------------------------------------------------------------ */

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabCounts.set(tabId, 0);
    tabHost.set(tabId, hostOfUrl(changeInfo.url));
  } else if (changeInfo.url) {
    tabHost.set(tabId, hostOfUrl(changeInfo.url));
  } else if (!tabHost.has(tabId) && tab.url) {
    tabHost.set(tabId, hostOfUrl(tab.url));
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  if (tabHost.has(tabId)) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url) tabHost.set(tabId, hostOfUrl(tab.url));
  } catch {
    /* eltűnt lap */
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabHost.delete(tabId);
  tabCounts.delete(tabId);
});

/* ------------------------------------------------------------------ */
/* Kozmetikai CSS                                                      */
/* ------------------------------------------------------------------ */

function cosmeticCssFor(host) {
  if (!settings.enabled) return '';
  if (isAllowed(host)) return '';

  const groups = ['ads', 'consent', 'widget'].filter((g) => settings.cosmetic?.[g] !== false);
  if (!groups.length) return '';

  const custom = parseCustomRules(settings.customRules);
  const siteSpecific = { ...(imported?.siteSpecific || {}), ...custom.siteSpecific };
  const genericExtra = [...(imported?.generic || [])];

  return buildCosmeticCss(filterData, host, groups, { siteSpecific, generic: genericExtra });
}

/* ------------------------------------------------------------------ */
/* Üzenetkezelés (popup / beállítások oldal)                           */
/* ------------------------------------------------------------------ */

async function handleMessage(msg, sender) {
  await ensureReady();

  switch (msg?.type) {
    case 'state': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const host = tab?.url ? hostOfUrl(tab.url) : null;
      return {
        settings,
        stats,
        host,
        tabId: tab?.id ?? null,
        tabCount: tab?.id ? tabCounts.get(tab.id) || 0 : 0,
        paused: host ? isAllowed(host) : false,
        counts: filterData?.counts || {},
        generatedAt: filterData?.generatedAt || null,
        version: chrome.runtime.getManifest().version,
        imported: imported
          ? { name: imported.name, at: imported.at, network: imported.network.length, cosmetic: imported.generic.length }
          : null,
      };
    }

    case 'updateSettings': {
      settings = await saveSettings(msg.patch || {});
      rebuildCustomIndex();
      await syncRules();
      return { settings };
    }

    case 'toggleSite': {
      const host = msg.host;
      if (!host) return { settings };
      const list = new Set(settings.allowlist || []);
      if (msg.paused) list.add(host);
      else list.delete(host);
      settings = await saveSettings({ allowlist: [...list] });
      await syncRules();
      return { settings, paused: isAllowed(host) };
    }

    case 'getCosmetic': {
      const host = String(msg.host || '').toLowerCase();
      return { css: cosmeticCssFor(host) };
    }

    case 'resetStats': {
      stats = { ...DEFAULT_STATS, byCategory: { ads: 0, trackers: 0, privacy: 0, custom: 0 }, since: Date.now() };
      tabCounts.clear();
      await saveStats(stats);
      return { stats };
    }

    case 'importList': {
      const result = parseEasyList(msg.text || '');
      if (!result.network.length && !result.generic.length && !Object.keys(result.siteSpecific).length) {
        return { ok: false, reason: 'empty' };
      }
      imported = {
        name: msg.name || 'import.txt',
        at: Date.now(),
        network: result.network,
        generic: result.generic,
        siteSpecific: result.siteSpecific,
      };
      await chrome.storage.local.set({ [STORAGE_KEYS.imported]: imported });
      await syncRules();
      return {
        ok: true,
        imported: {
          name: imported.name,
          at: imported.at,
          network: result.network.length,
          cosmetic: result.generic.length,
          skipped: result.skipped,
        },
      };
    }

    case 'removeImport': {
      imported = null;
      await chrome.storage.local.remove(STORAGE_KEYS.imported);
      await syncRules();
      return { ok: true };
    }

    case 'exportHosts': {
      const custom = parseCustomRules(settings.customRules).network;
      return { text: buildHostsFile(filterData, [...custom, ...(imported?.network || [])]) };
    }

    case 'exportDomains': {
      const text = await handleMessage({ type: 'exportHosts' }, sender);
      const domains = text.text
        .split('\n')
        .filter((l) => l.startsWith('0.0.0.0 '))
        .map((l) => l.replace('0.0.0.0 ', '').trim());
      return { text: domains.join('\n') + '\n', count: domains.length };
    }

    case 'reloadTab': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.tabs.reload(tab.id);
      return { ok: true };
    }

    default:
      return { error: 'ismeretlen üzenet: ' + (msg?.type || '?') };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then((res) => sendResponse(res))
    .catch((err) => {
      console.error('[ReklámStop] üzenet hiba:', err);
      sendResponse({ error: String(err) });
    });
  return true; // aszinkron válasz
});

/* ------------------------------------------------------------------ */
/* Életciklus                                                          */
/* ------------------------------------------------------------------ */

chrome.runtime.onInstalled.addListener(async () => {
  await ensureReady();
  await chrome.storage.local.set({
    [STORAGE_KEYS.stats]: { ...stats, since: stats.since || Date.now() },
  });
  await syncRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureReady();
  await syncRules();
});

// a beállítások bármely oldalról módosulhatnak
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.settings]) {
    const next = { ...DEFAULT_SETTINGS, ...changes[STORAGE_KEYS.settings].newValue };
    const before = JSON.stringify(settings);
    settings = next;
    rebuildCustomIndex();
    if (before !== JSON.stringify(settings)) syncRules();
  }
});

ensureReady().then(syncRules);
