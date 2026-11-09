/**
 * ReklámStop – közös szűrőmotor
 * -----------------------------
 * Tiszta (DOM- és chrome-API mentes) függvények, amiket a háttérfolyamat,
 * a beállítások oldal, a demó és a fejlesztői mock is használ.
 */

export const CATEGORY_IDS = ['ads', 'trackers', 'privacy'];
export const COSMETIC_GROUPS = ['ads', 'consent', 'widget'];

/** 'https://a.b.example.com/x' -> 'a.b.example.com' */
export function hostOfUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** A hoszt egyezik-e a domainnel (vagy annak aldomainje) */
export function domainMatches(host, domain) {
  if (!host || !domain) return false;
  host = host.toLowerCase();
  domain = domain.toLowerCase();
  return host === domain || host.endsWith('.' + domain);
}

/** '||example.com^' | '||example.com/path' -> 'example.com' */
export function domainOfFilter(filter) {
  const m = String(filter).match(/^\|\|([a-z0-9.*_-]+)(?:\^|\/|$)/i);
  if (!m) return null;
  return m[1].replace(/^\*\./, '').replace(/^\./, '').toLowerCase();
}

/** Egy domain-lista -> Map(host -> kategória) */
export function buildHostIndex(data, categories = CATEGORY_IDS) {
  const map = new Map();
  for (const cat of categories) {
    const entry = data?.categories?.[cat];
    if (!entry) continue;
    for (const h of entry.hosts || []) if (!map.has(h)) map.set(h, cat);
  }
  return map;
}

/**
 * Egy kérés hosztjának kategóriája. A saját szabályok mindig elsőbbséget
 * élveznek ('custom' kategória).
 */
export function matchHost(index, host, customIndex = null) {
  if (!host) return null;
  if (customIndex?.has(host)) return { category: 'custom', domain: host };
  let candidate = host;
  while (true) {
    if (index.has(candidate)) return { category: index.get(candidate), domain: candidate };
    const dot = candidate.indexOf('.');
    if (dot === -1) return null;
    candidate = candidate.slice(dot + 1);
  }
}

/** Kozmetikai CSS egy adott oldalra */
export function buildCosmeticCss(data, host, groups = COSMETIC_GROUPS, options = {}) {
  const selectors = [];
  const cosmetic = data?.cosmetic || { groups: {}, siteSpecific: {} };

  for (const g of groups) {
    for (const s of cosmetic.groups?.[g] || []) selectors.push(s);
  }
  // importált lista általános szelektorai
  for (const s of options.generic || []) selectors.push(s);

  if (host) {
    for (const [domain, sels] of Object.entries(cosmetic.siteSpecific || {})) {
      if (domainMatches(host, domain)) selectors.push(...sels);
    }
    // Saját, importált oldalspecifikus szabályok
    for (const [domain, sels] of Object.entries(options.siteSpecific || {})) {
      if (domainMatches(host, domain)) selectors.push(...sels);
    }
  }

  const unique = [...new Set(selectors.map((s) => s.trim()).filter(Boolean))];
  if (!unique.length) return '';
  return (
    '/* ReklámStop – kozmetikai szűrés */\n' +
    unique.map((s) => `${s} { display: none !important; }`).join('\n')
  );
}

/**
 * Felhasználói szabályok értelmezése (beállítások oldal).
 * Elfogad: 'pelda.com', '||pelda.com^', 'pelda.com/utvonal', 'pelda.hu##.reklam'
 */
export function parseCustomRules(text) {
  const network = [];
  const siteSpecific = {};
  const invalid = [];

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;

    if (line.includes('##')) {
      const [domainsPart, ...rest] = line.split('##');
      const selector = rest.join('##').trim();
      if (!selector) {
        invalid.push(line);
        continue;
      }
      const domains = domainsPart.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
      // csak domain alakú címeket fogadunk el (pl. 'pelda.hu', 'www.pelda.hu')
      if (!domains.length || domains.some((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d))) {
        invalid.push(line);
        continue;
      }
      for (const d of domains) (siteSpecific[d] ||= []).push(selector);
      continue;
    }

    if (line.startsWith('||')) {
      if (!/^\|\|[a-z0-9.*_-]+(\^|\/|\$|$)/i.test(line)) invalid.push(line);
      else network.push(line.split('$')[0]);
      continue;
    }

    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(line)) {
      const [domain, ...pathParts] = line.split('/');
      const path = pathParts.join('/');
      network.push(`||${domain.toLowerCase()}${path ? '/' + path : '^'}`);
      continue;
    }

    invalid.push(line);
  }

  return { network: [...new Set(network)], siteSpecific, invalid };
}

/**
 * EasyList / AdGuard formátumú lista "legjobb erőfeszítés" importja.
 * Csak a domain alapú hálózati szabályokat és a kozmetikai szelektorokat
 * emeljük át – a bonyolult szintaxist kihagyjuk.
 */
export function parseEasyList(text) {
  const network = [];
  const siteSpecific = {};
  const generic = [];
  let skipped = 0;
  let total = 0;

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    if (line.startsWith('@@')) { skipped++; continue; }      // kivétel
    if (line.startsWith('#') && !line.startsWith('##')) continue; // komment
    total++;

    if (line.includes('#@#') || line.includes('#$#') || line.includes('#%#')) { skipped++; continue; }
    if (line.includes('##') || line.includes('#?#') || line.includes('#@?')) {
      const marker = line.includes('##') ? '##' : '#?#';
      const idx = line.indexOf(marker);
      const domainsPart = line.slice(0, idx).trim();
      const selector = line.slice(idx + marker.length).trim();
      if (!selector) { skipped++; continue; }
      if (!domainsPart) {
        generic.push(selector);
        continue;
      }
      const domains = domainsPart.split(',').map((d) => d.trim().toLowerCase());
      if (domains.some((d) => d.startsWith('~'))) { skipped++; continue; }
      for (const d of domains.filter(Boolean)) (siteSpecific[d] ||= []).push(selector);
      continue;
    }

    // Hálózati szabály
    if (line.startsWith('/') && line.endsWith('/')) { skipped++; continue; } // regex
    if (line.startsWith('||')) {
      const filter = line.split('$')[0];
      if (/^\|\|[a-z0-9.*_-]+(\^|\/|$)/i.test(filter)) network.push(filter);
      else skipped++;
      continue;
    }
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\^|\/.*)?$/i.test(line)) {
      network.push(`||${line.replace(/\^$/, '').toLowerCase()}^`);
      continue;
    }
    skipped++;
  }

  return {
    network: [...new Set(network)],
    generic: [...new Set(generic)],
    siteSpecific,
    total,
    skipped,
  };
}

/** hosts fájl tartalma a beépített + saját domainekből */
export function buildHostsFile(data, extraDomains = []) {
  const hosts = new Set();
  for (const cat of CATEGORY_IDS) {
    for (const h of data?.categories?.[cat]?.hosts || []) hosts.add(h);
  }
  for (const f of extraDomains) {
    const d = domainOfFilter(f.startsWith('||') ? f : `||${f}^`);
    if (d) hosts.add(d);
  }
  const sorted = [...hosts].sort();
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  return (
    `# ReklámStop – ${sorted.length} blokkolt domain\n` +
    `# Generálva: ${stamp}\n` +
    '# Használat: másold a rendszer hosts fájljába, vagy állítsd be a DNS-blokkolóban.\n#\n' +
    '127.0.0.1 localhost\n::1 localhost\n\n' +
    sorted.map((h) => `0.0.0.0 ${h}`).join('\n') +
    '\n'
  );
}

/** Beállítások -> Chrome dynamic rules (saját szabályok + engedélyezett oldalak) */
export function buildDynamicRules(
  settings,
  extraNetwork = [],
  allowedIds = { blockStart: 1, allowStart: 40001 }
) {
  const rules = [];
  let id = allowedIds.blockStart;

  if (settings.enabled) {
    const parsed = parseCustomRules(settings.customRules);
    const filters = [...new Set([...parsed.network, ...extraNetwork])];
    for (const filter of filters) {
      rules.push({
        id: id++,
        priority: 2,
        action: { type: 'block' },
        condition: {
          urlFilter: filter,
          domainType: 'thirdParty',
          resourceTypes: [
            'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
            'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'webtransport',
            'webbundle', 'other',
          ],
        },
      });
    }
  }

  // Teljes oldal szüneteltetése: a fő dokumentum minden kérését engedjük
  let allowId = allowedIds.allowStart;
  for (const host of settings.allowlist || []) {
    if (!host) continue;
    rules.push({
      id: allowId++,
      priority: 100,
      action: { type: 'allowAllRequests' },
      condition: { urlFilter: `||${host}^`, resourceTypes: ['main_frame', 'sub_frame'] },
    });
  }

  return rules;
}
