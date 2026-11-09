#!/usr/bin/env node
/**
 * ReklámStop build
 * ----------------
 * Egy forrásból (filters/sources/*.txt) generálja:
 *   extension/rules/<kategória>.json  – declarativeNetRequest statikus szabályok
 *   extension/data/filters.json       – domain lista + kozmetikai szabályok (UI, demó, DNS)
 *   dist/hosts.txt                    – hosts fájl (0.0.0.0 blokkolás)
 *   dist/domains.txt                  – sima domain lista (DNS/pihole/AdGuard)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'filters', 'sources');

const CATEGORIES = [
  { id: 'ads', label: 'Reklám', file: 'ads.txt' },
  { id: 'trackers', label: 'Követés', file: 'trackers.txt' },
  { id: 'privacy', label: 'Adatvédelem', file: 'privacy.txt' },
];

const RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
  'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket',
  'webtransport', 'webbundle', 'other',
];

const log = (...a) => console.log(...a);


function readLines(file) {
  const p = path.join(SRC, file);
  if (!fs.existsSync(p)) throw new Error(`Hiányzó forrásfájl: ${p}`);
  return fs
    .readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('!'));
}

/**
 * A kozmetikai fájlban a sorok '##szelektor' alakúak, ezért ott a '#' nem
 * kommentjelölő — csak a '!'-dzsel kezdődő sorokat és a sima '# szöveget'
 * tekintjük kommentnek.
 */
function readCosmeticLines(file) {
  const p = path.join(SRC, file);
  if (!fs.existsSync(p)) throw new Error(`Hiányzó forrásfájl: ${p}`);
  return fs
    .readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !l.startsWith('!'))
    .filter((l) => !(l.startsWith('#') && !l.startsWith('##') && !l.startsWith('#!group')));
}

/** ||example.com^ vagy ||example.com/path -> example.com */
function hostFromFilter(filter) {
  const m = filter.match(/^\|\|([a-z0-9.*_-]+)(?:\^|\/|$)/i);
  if (!m) return null;
  return m[1].replace(/^\*\./, '').replace(/^\./, '');
}

function writeJson(relPath, data) {
  const p = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
  return p;
}

/* ---------------- 1. Hálózati szabályok ---------------- */
const seen = new Map(); // urlFilter -> kategória
const categories = {};
const ruleCounts = {};

for (const cat of CATEGORIES) {
  const filters = [...new Set(readLines(cat.file))];
  const rules = [];
  let id = 1;

  for (const filter of filters) {
    if (seen.has(filter)) {
      log(`  ! duplikált szabály (${cat.id}), kihagyva: ${filter} (már: ${seen.get(filter)})`);
      continue;
    }
    seen.set(filter, cat.id);
    rules.push({
      id: id++,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: filter,
        // Csak harmadik féltől jövő kéréseket blokkolunk: így nem törik el
        // egy oldal saját működése, ha saját magára hivatkozik.
        domainType: 'thirdParty',
        resourceTypes: RESOURCE_TYPES,
      },
    });
  }

  writeJson(`extension/rules/${cat.id}.json`, rules);
  ruleCounts[cat.id] = rules.length;
  categories[cat.id] = {
    label: cat.label,
    filters,
    hosts: [...new Set(filters.map(hostFromFilter).filter(Boolean))].sort(),
  };
}

/* ---------------- 2. Kozmetikai szabályok ---------------- */
const cosmetic = {
  groups: { ads: [], consent: [], widget: [] },
  siteSpecific: {},
};
let currentGroup = 'ads';
for (const line of readCosmeticLines('cosmetic.txt')) {
  const groupMatch = line.match(/^#!group\s+(\w+)$/);
  if (groupMatch) {
    currentGroup = cosmetic.groups[groupMatch[1]] ? groupMatch[1] : 'ads';
    continue;
  }
  const idx = line.indexOf('##');
  if (idx === -1) {
    log(`  ! érvénytelen kozmetikai szabály, kihagyva: ${line}`);
    continue;
  }
  const domainsPart = line.slice(0, idx).trim();
  const selector = line.slice(idx + 2).trim();
  if (!selector) continue;

  if (!domainsPart) {
    cosmetic.groups[currentGroup].push(selector);
    continue;
  }
  for (const d of domainsPart.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    (cosmetic.siteSpecific[d] ||= []).push(selector);
  }
}

/* ---------------- 3. Összesített adatcsomag ---------------- */
const allHosts = new Set();
for (const cat of Object.values(categories)) cat.hosts.forEach((h) => allHosts.add(h));

const hostCategory = {};
for (const [catId, cat] of Object.entries(categories)) {
  for (const h of cat.hosts) if (!hostCategory[h]) hostCategory[h] = catId;
}

const filterUrl = path.join(ROOT, 'extension', 'data', 'filters.json');
const buildStamp = new Date().toISOString();
writeJson('extension/data/filters.json', {
  version: '1.0.0',
  generatedAt: buildStamp,
  categories,
  hostCategory,
  cosmetic,
  counts: {
    ...ruleCounts,
    totalRules: Object.values(ruleCounts).reduce((a, b) => a + b, 0),
    totalHosts: allHosts.size,
    cosmeticGeneric:
      cosmetic.groups.ads.length + cosmetic.groups.consent.length + cosmetic.groups.widget.length,
    cosmeticSites: Object.keys(cosmetic.siteSpecific).length,
  },
});

/* ---------------- 4. hosts fájl + domain lista ---------------- */
const stamp = buildStamp.slice(0, 19).replace('T', ' ');
const hostsLines = [
  '# ReklámStop – generált hosts fájl',
  `# Generálva: ${stamp}`,
  '# Használat: másold a rendszer hosts fájljába, vagy állítsd be a DNS-blokkolóban.',
  '#',
  '127.0.0.1 localhost',
  '::1 localhost',
  '',
];
const sortedHosts = [...allHosts].sort();
for (const h of sortedHosts) hostsLines.push(`0.0.0.0 ${h}`);

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'hosts.txt'), hostsLines.join('\n') + '\n');
fs.writeFileSync(
  path.join(ROOT, 'dist', 'domains.txt'),
  `# ReklámStop – ${sortedHosts.length} blokkolt domain (${stamp})\n` + sortedHosts.join('\n') + '\n'
);

/* ---------------- 5. Összefoglaló ---------------- */
log('');
log('  ReklámStop build kész');
log('  ' + '─'.repeat(46));
for (const [catId, count] of Object.entries(ruleCounts)) {
  log(`   ${catId.padEnd(10)} ${String(count).padStart(4)} szabály`);
}
for (const [g, list] of Object.entries(cosmetic.groups)) {
  log(`   kozmetika/${g.padEnd(8)} ${String(list.length).padStart(4)} szelektor`.replace('kozmetika/consent   ','kozmetika/consent '));
}
log(`   domain     ${String(allHosts.size).padStart(4)} egyedi hosztnév`);
log('  ' + '─'.repeat(46));
log('   -> extension/rules/{ads,trackers,privacy}.json');
log('   -> extension/data/filters.json');
log('   -> dist/hosts.txt, dist/domains.txt');
log('');
