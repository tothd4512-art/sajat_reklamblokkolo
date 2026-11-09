#!/usr/bin/env node
/**
 * ReklámStop – füstteszt
 * ----------------------
 * Kiegészítő telepítése nélkül ellenőrzi, hogy a generált szűrőlista érvényes,
 * és hogy a popup / beállítások / demó oldal JavaScriptje hibátlanul lefut.
 *
 * Futtatás:  npm run test        (jsdom szükséges: npm i --no-save jsdom)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

let failures = 0;
let passes = 0;
function check(name, condition, extra = '') {
  if (condition) {
    passes++;
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${extra ? '  → ' + extra : ''}`);
  }
}
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* 1. generált adatok                                                 */
/* ------------------------------------------------------------------ */
console.log('\nGenerált szűrőlista');

const data = readJson('extension/data/filters.json');
check('filters.json betölthető', !!data.categories);
check('van mindhárom kategória', ['ads', 'trackers', 'privacy'].every((c) => data.categories[c]));
check('van domain a listákban', data.counts.totalHosts > 100, `totalHosts=${data.counts.totalHosts}`);
check('van kozmetikai szelektor', data.counts.cosmeticGeneric > 20);

for (const cat of ['ads', 'trackers', 'privacy']) {
  const rules = readJson(`extension/rules/${cat}.json`);
  const ok = rules.every(
    (r) =>
      Number.isInteger(r.id) &&
      r.action?.type === 'block' &&
      typeof r.condition?.urlFilter === 'string' &&
      r.condition.resourceTypes?.length
  );
  const ids = new Set(rules.map((r) => r.id));
  check(`rules/${cat}.json érvényes (${rules.length} szabály)`, ok && ids.size === rules.length);
}

const hosts = read('dist/hosts.txt');
check('hosts.txt generálódott', hosts.includes('0.0.0.0 doubleclick.net'));
check('hosts.txt nem tartalmaz duplikált sort', new Set(hosts.split('\n').filter((l) => l.startsWith('0.0.0.0 '))).size === hosts.split('\n').filter((l) => l.startsWith('0.0.0.0 ')).length);

const manifest = readJson('extension/manifest.json');
check('manifest MV3', manifest.manifest_version === 3);
const referenced = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...manifest.content_scripts.flatMap((c) => c.js),
  ...manifest.declarative_net_request.rule_resources.map((r) => r.path),
  ...Object.values(manifest.icons),
];
const missing = referenced.filter((p) => !fs.existsSync(path.join(ROOT, 'extension', p)));
check('a manifest minden hivatkozott fájlja létezik', missing.length === 0, missing.join(', '));

/* ------------------------------------------------------------------ */
/* 2. felület jsdom-ban                                               */
/* ------------------------------------------------------------------ */
let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('\n(jsdom nincs telepítve – a felület tesztje kimarad: npm i --no-save jsdom)\n');
  process.exit(failures ? 1 : 0);
}

const ORIGIN = 'http://localhost:4173';

async function mount(pageRelPath) {
  const html = read(pageRelPath);
  const dom = new JSDOM(html, {
    url: `${ORIGIN}/${pageRelPath}`,
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });

  const define = (name, value) => {
    try {
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    } catch {
      globalThis[name] = value;
    }
  };
  define('window', dom.window);
  define('document', dom.window.document);
  define('location', dom.window.location);
  define('localStorage', dom.window.localStorage);
  define('navigator', dom.window.navigator);
  define('HTMLElement', dom.window.HTMLElement);
  define('Event', dom.window.Event);
  define('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
  // a mock modult csak egyszer importáljuk, ezért a chrome mock végig él

  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url), `${ORIGIN}/`).pathname;
    const file = path.join(ROOT, pathname);
    if (!fs.existsSync(file)) throw new Error('404 ' + pathname);
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')), text: async () => fs.readFileSync(file, 'utf8') };
  };

  return dom;
}

const fire = (dom, el, type) => el.dispatchEvent(new dom.window.Event(type, { bubbles: true }));

/* ---------------- popup ---------------- */
console.log('\nPopup');
{
  const dom = await mount('extension/popup/popup.html');
  await import('../extension/popup/popup.js');
  await tick(150);

  const $ = (s) => dom.window.document.querySelector(s);
  check('mock chrome API aktiválódik', Boolean(globalThis.__REKLAMSTOP_MOCK__));
  check('állapotszöveg megjelenik', /Védelem/.test($('#statusText').textContent), $('#statusText').textContent);
  check('összesített számláló nem nulla', Number($('#totalNum').textContent.replace(/\s/g, '')) > 0, $('#totalNum').textContent);
  check('3 kategória-chip van', dom.window.document.querySelectorAll('.chip').length === 3);
  check('oldal hosztja megjelenik', $('.site-host').textContent.includes('telex.hu'), $('.site-host').textContent);

  // főkapcsoló kikapcsolása
  const master = $('#masterToggle');
  master.checked = false;
  fire(dom, master, 'change');
  await tick(120);
  check('főkapcsoló kikapcsolva átvált a szöveg', /kikapcsolva/.test($('#statusText').textContent), $('#statusText').textContent);

  // kategória chip
  const chip = dom.window.document.querySelectorAll('.chip')[0];
  chip.click();
  await tick(120);
  check('chip kattintás kikapcsolja a kategóriát', dom.window.document.querySelectorAll('.chip')[0].classList.contains('off'));

  // oldal szüneteltetése
  master.checked = true;
  fire(dom, master, 'change');
  await tick(100);
  const siteToggle = $('#siteToggle');
  siteToggle.checked = true;
  fire(dom, siteToggle, 'change');
  await tick(120);
  check('oldal szüneteltetése működik', /szünetel/.test($('#siteHint').textContent), $('#siteHint').textContent);

  // nyelvváltás
  $('#langBtn').click();
  await tick(120);
  check('nyelvváltás angolra', /Protection/.test($('#statusText').textContent), $('#statusText').textContent);
  $('#langBtn').click();
  await tick(120);
}

/* ---------------- beállítások ---------------- */
console.log('\nBeállítások');
{
  const dom = await mount('extension/options/options.html');
  await import('../extension/options/options.js');
  await tick(150);
  const $ = (s) => dom.window.document.querySelector(s);
  const doc = dom.window.document;

  check('szabályszám megjelenik', /\d/.test($('#catRulesTotal').textContent), $('#catRulesTotal').textContent);
  check('névjegy kitöltve', $('#aboutRules').textContent.includes('szabály'), $('#aboutRules').textContent);

  // saját szabályok
  const ta = $('#customRules');
  ta.value = 'pelda.hu\n||ads.pelda.hu^\npelda.hu##.banner\nez nem szabaly!!!';
  fire(dom, ta, 'input');
  fire(dom, ta, 'blur');
  await tick(80);
  check('saját szabály számláló frissül', /3/.test($('#customCount').textContent), $('#customCount').textContent);
  check('érvénytelen sor jelzése megjelenik', !$('#invalidNote').classList.contains('hidden'));

  // engedélyezett oldal
  $('#allowInput').value = 'https://www.pelda.hu/cikk?x=1';
  $('#allowAdd').click();
  await tick(120);
  const allowItems = [...doc.querySelectorAll('#allowList .list-item span')].map((el) => el.textContent);
  check('engedélyezett oldal normalizálva kerül a listára', allowItems.includes('pelda.hu'), allowItems.join(', '));

  // import
  const res = await globalThis.chrome.runtime.sendMessage({
    type: 'importList',
    name: 'teszt.txt',
    text: '! cim\n||ads.teszt.hu^\n##.teszt-szelektor\nteszt.hu##.sajat\n@@||kivetel.hu^\n',
  });
  check('EasyList import működik', res.ok && res.imported.network === 1 && res.imported.cosmetic === 1, JSON.stringify(res));

  // export
  const exp = await globalThis.chrome.runtime.sendMessage({ type: 'exportHosts' });
  check('hosts export tartalmazza a saját domaint', exp.text.includes('0.0.0.0 ads.teszt.hu'), 'nincs benne');
  check('hosts export tartalmazza a beépített domaineket', exp.text.includes('0.0.0.0 doubleclick.net'));

  // statisztika nullázás
  $('#resetStats').click();
  await tick(120);
  check('statisztika nullázható', $('#statTotal').textContent === '0', $('#statTotal').textContent);
}

/* ---------------- demó ---------------- */
console.log('\nDemó oldal');
{
  const dom = await mount('demo/index.html');
  await import('../demo/demo.js');
  await tick(2200);
  const $ = (s) => dom.window.document.querySelector(s);
  const doc = dom.window.document;

  check('szűrőlista betöltött a demóban', /\d+ szabály/.test($('#ruleInfo').textContent), $('#ruleInfo').textContent);
  check('zónák blokkolva lettek', Number($('#blockedCount').textContent) >= 4, $('#blockedCount').textContent);
  check('kérésnapló feltöltődött', doc.querySelectorAll('.log-item').length >= 4);
  check('hirdetési zóna "blocked" állapotban', doc.querySelector('.zone').classList.contains('blocked'));
  check('kozmetikai szűrés naplózva (cookie-banner)', [...doc.querySelectorAll('.log-item .cat')].some((el) => el.textContent === 'kozmetikai'));
  check('naplósor kiválasztása magyarázatot ad', (() => {
    doc.querySelector('.log-item').click();
    return doc.querySelector('#explain .rule')?.textContent.length > 2;
  })());

  // főkapcsoló ki
  const master = $('#masterToggle');
  master.checked = false;
  fire(dom, master, 'change');
  await tick(2000);
  check('kikapcsolva a zónák megjelennek', Number($('#allowedCount').textContent) >= 4, $('#allowedCount').textContent);
  check('kikapcsolva nincs blocked zóna', doc.querySelectorAll('.zone.blocked').length === 0);
}

console.log(`\n${passes} ellenőrzés rendben, ${failures} hiba\n`);
process.exit(failures ? 1 : 0);
