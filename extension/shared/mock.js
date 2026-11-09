/**
 * ReklámStop – fejlesztői mock
 * ----------------------------
 * Ha az oldal nem kiegészítőként fut (pl. a helyi preview-ban), ez a modul
 * utánozza a chrome.* API-t, hogy a popup és a beállítások oldal
 * kipróbálható legyen Böngészőben, telepítés nélkül.
 * Az adatok localStorage-ban tárolódnak.
 */
import { DEFAULT_SETTINGS, DEFAULT_STATS, mergeSettings } from './settings.js';
import {
  buildCosmeticCss,
  buildHostsFile,
  buildHostIndex,
  domainMatches,
  hostOfUrl,
  matchHost,
  parseCustomRules,
  parseEasyList,
} from './engine.js';

const isExtension = Boolean(globalThis.chrome?.runtime?.id);
if (!isExtension) {
  const LS_KEY = 'reklamstop-mock-v1';
  const MOCK_HOST = 'telex.hu';
  const MOCK_URL = 'https://telex.hu/belfold/2026/11/09/kozlekedes-budapest';

  const seedStats = () => ({
    ...DEFAULT_STATS,
    total: 1436,
    byCategory: { ads: 812, trackers: 501, privacy: 123, custom: 0 },
    since: Date.now() - 1000 * 60 * 60 * 26,
  });

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (raw) {
        return {
          settings: mergeSettings({ ...DEFAULT_SETTINGS }, raw.settings || {}),
          stats: { ...seedStats(), ...(raw.stats || {}) },
          imported: raw.imported || null,
        };
      }
    } catch {
      /* sérült állapot -> új */
    }
    return { settings: { ...DEFAULT_SETTINGS }, stats: seedStats(), imported: null };
  }

  const state = loadState();
  state.settings.allowlist = state.settings.allowlist || [];

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      /* privát mód */
    }
  }

  let filterData = null;
  let hostIndex = null;
  const filterDataReady = fetch(new URL('../data/filters.json', location.href))
    .then((r) => r.json())
    .then((d) => {
      filterData = d;
      hostIndex = buildHostIndex(d);
      return d;
    })
    .catch(() => {
      filterData = { categories: {}, cosmetic: { groups: {}, siteSpecific: {} }, counts: {} };
      hostIndex = new Map();
      return filterData;
    });

  const isAllowed = (host) => (state.settings.allowlist || []).some((e) => domainMatches(host, e));

  function customIndex() {
    const set = new Set();
    for (const f of parseCustomRules(state.settings.customRules).network) {
      const d = f.replace(/^\|\|/, '').split(/[\^/$]/)[0];
      if (d) set.add(d.toLowerCase());
    }
    return set;
  }

  async function devMessage(msg) {
    await filterDataReady;
    switch (msg?.type) {
      case 'state':
        return {
          settings: state.settings,
          stats: state.stats,
          host: MOCK_HOST,
          tabId: 1,
          tabCount: isAllowed(MOCK_HOST) || !state.settings.enabled ? 0 : 9,
          paused: isAllowed(MOCK_HOST),
          counts: filterData.counts || {},
          imported: state.imported
            ? {
                name: state.imported.name,
                at: state.imported.at,
                network: state.imported.network.length,
                cosmetic: state.imported.generic.length,
              }
            : null,
          mock: true,
        };

      case 'updateSettings':
        state.settings = mergeSettings(state.settings, msg.patch || {});
        persist();
        return { settings: state.settings };

      case 'toggleSite': {
        const host = msg.host || MOCK_HOST;
        const list = new Set(state.settings.allowlist || []);
        if (msg.paused) list.add(host);
        else list.delete(host);
        state.settings.allowlist = [...list];
        persist();
        return { settings: state.settings, paused: isAllowed(host) };
      }

      case 'getCosmetic': {
        const host = String(msg.host || MOCK_HOST).toLowerCase();
        if (!state.settings.enabled || isAllowed(host)) return { css: '' };
        const groups = ['ads', 'consent', 'widget'].filter((g) => state.settings.cosmetic?.[g] !== false);
        const custom = parseCustomRules(state.settings.customRules);
        return {
          css: buildCosmeticCss(filterData, host, groups, {
            siteSpecific: { ...(state.imported?.siteSpecific || {}), ...custom.siteSpecific },
            generic: state.imported?.generic || [],
          }),
        };
      }

      case 'resetStats':
        state.stats = { ...DEFAULT_STATS, byCategory: { ads: 0, trackers: 0, privacy: 0, custom: 0 }, since: Date.now() };
        persist();
        return { stats: state.stats };

      case 'importList': {
        const result = parseEasyList(msg.text || '');
        if (!result.network.length && !result.generic.length && !Object.keys(result.siteSpecific).length) {
          return { ok: false, reason: 'empty' };
        }
        state.imported = {
          name: msg.name || 'import.txt',
          at: Date.now(),
          network: result.network,
          generic: result.generic,
          siteSpecific: result.siteSpecific,
        };
        persist();
        return {
          ok: true,
          imported: {
            name: state.imported.name,
            at: state.imported.at,
            network: result.network.length,
            cosmetic: result.generic.length,
            skipped: result.skipped,
          },
        };
      }

      case 'removeImport':
        state.imported = null;
        persist();
        return { ok: true };

      case 'exportHosts': {
        const custom = parseCustomRules(state.settings.customRules).network;
        return { text: buildHostsFile(filterData, [...custom, ...(state.imported?.network || [])]) };
      }

      case 'exportDomains': {
        const custom = parseCustomRules(state.settings.customRules).network;
        const text = buildHostsFile(filterData, [...custom, ...(state.imported?.network || [])]);
        const domains = text
          .split('\n')
          .filter((l) => l.startsWith('0.0.0.0 '))
          .map((l) => l.replace('0.0.0.0 ', '').trim());
        return { text: domains.join('\n') + '\n', count: domains.length };
      }

      case 'reloadTab':
        return { ok: true, mock: true };

      case 'matchTest': {
        const host = hostOfUrl(msg.url) || msg.url;
        const match = matchHost(hostIndex, host, customIndex());
        return { match, allowed: isAllowed(host) };
      }

      default:
        return { error: 'ismeretlen üzenet: ' + (msg?.type || '?') };
    }
  }

  const chromeMock = {
    runtime: {
      id: 'mock',
      getURL: (p) => new URL('../' + String(p).replace(/^\//, ''), location.href).href,
      getManifest: () => ({ version: '1.0.0', name: 'ReklámStop' }),
      sendMessage: (msg) => devMessage(msg),
      onMessage: { addListener() {} },
      lastError: null,
    },
    storage: {
      local: {
        async get(key) {
          if (key == null) return {};
          const keys = Array.isArray(key) ? key : [key];
          const out = {};
          for (const k of keys) {
            if (k === 'settings') out[k] = state.settings;
            else if (k === 'stats') out[k] = state.stats;
            else if (k === 'imported') out[k] = state.imported;
          }
          return out;
        },
        async set(obj) {
          Object.assign(state, obj);
          persist();
        },
        async remove(key) {
          const keys = Array.isArray(key) ? key : [key];
          for (const k of keys) state[k] = null;
          persist();
        },
      },
      onChanged: { addListener() {} },
    },
    tabs: {
      async query() {
        return [{ id: 1, url: MOCK_URL, active: true, currentWindow: true }];
      },
      async reload() {},
      async sendMessage() {},
      onUpdated: { addListener() {} },
      onRemoved: { addListener() {} },
    },
    declarativeNetRequest: {
      async updateEnabledRulesets() {},
      async getDynamicRules() {
        return [];
      },
      async updateDynamicRules() {},
    },
    webRequest: { onBeforeRequest: { addListener() {} } },
  };

  globalThis.chrome = chromeMock;
  globalThis.__REKLAMSTOP_MOCK__ = true;
  document.documentElement.classList.add('is-mock');
  document.addEventListener('DOMContentLoaded', () => document.body.classList.add('is-mock'));
}
