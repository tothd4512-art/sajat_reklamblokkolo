/**
 * ReklámStop – élő demó
 * A valódi szűrőlistát (extension/data/filters.json) és a valódi motorlogikát
 * (extension/shared/engine.js) használja, hogy megmutassa a döntéseket.
 */
import {
  buildCosmeticCss,
  buildHostIndex,
  domainMatches,
  matchHost,
} from '../extension/shared/engine.js';

const CATEGORIES = [
  { id: 'ads', label: 'Reklám' },
  { id: 'trackers', label: 'Követés' },
  { id: 'privacy', label: 'Adatvédelem' },
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
const CAT_LABEL_WITH_CUSTOM = { ...CAT_LABEL, custom: 'Saját' };

const settings = {
  enabled: true,
  categories: { ads: true, trackers: true, privacy: true },
  cosmetic: { ads: true, consent: true, widget: true },
};

let filterData = null;
let hostIndex = new Map();
let counters = { blocked: 0, allowed: 0 };
let animToken = 0;

const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------------ */
/* segédek                                                            */
/* ------------------------------------------------------------------ */

function ruleFor(domain, category) {
  const filters = filterData?.categories?.[category]?.filters || [];
  return filters.find((f) => domainMatches(domain, f.replace(/^\|\|/, '').split(/[\^/$]/)[0])) || `||${domain}^`;
}

function addLog({ kind, domain, category, info }) {
  const log = $('#log');
  const item = document.createElement('div');
  item.className = 'log-item ' + kind;
  const mark = kind === 'blocked' ? '✕' : kind === 'allowed' ? '→' : '◍';
  item.innerHTML = `
    <span class="mark">${mark}</span>
    <span class="dom"></span>
    <span class="cat"></span>
  `;
  item.querySelector('.dom').textContent = domain;
  item.querySelector('.cat').textContent = category;
  item.__info = info;
  item.addEventListener('click', () => showExplain(info));
  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
  $('#logCount').textContent = `${log.children.length} esemény`;
}

function showExplain(info) {
  const el = $('#explain');
  const decisionLabel = info.decision === 'blocked' ? 'blokkolva' : info.decision === 'hidden' ? 'elrejtve' : 'átengedve';
  el.innerHTML = `
    <div class="row-line"><span>Kérés</span><span>${info.domain}</span></div>
    <div class="row-line"><span>Döntés</span><span>${decisionLabel}</span></div>
    <div class="row-line"><span>Kategória</span><span>${info.category}</span></div>
    <div class="row-line"><span>Illeszkedő domain</span><span>${info.matched || '—'}</span></div>
    <div class="rule">${info.rule || 'nincs illeszkedő szabály'}</div>
    <p style="margin:8px 0 0;color:var(--muted-2)">${info.reason}</p>
  `;
}

function updateCounters() {
  $('#blockedCount').textContent = counters.blocked;
  $('#allowedCount').textContent = counters.allowed;
}

/* ------------------------------------------------------------------ */
/* hálózati szimuláció                                                */
/* ------------------------------------------------------------------ */

function evaluateZone(zone) {
  const domain = zone.dataset.domain;
  const cat = zone.dataset.cat;

  let decision = 'allowed';
  let matched = null;
  let rule = null;
  let reason = '';

  if (!settings.enabled) {
    reason = 'A főkapcsoló ki van kapcsolva, ezért minden kérés változatlanul átmegy.';
  } else if (!settings.categories[cat]) {
    reason = `A(z) „${CAT_LABEL[cat]}” kategória ki van kapcsolva, ezért ez a kérés átmegy.`;
  } else {
    const match = matchHost(hostIndex, domain);
    if (match && settings.categories[match.category] !== false) {
      decision = 'blocked';
      matched = match.domain;
      rule = ruleFor(match.domain, match.category);
      reason = `A(z) „${CAT_LABEL_WITH_CUSTOM[match.category]}” listában szerepel a(z) ${match.domain}, ezért a böngésző declarativeNetRequest motorja blokkolja a kérést.`;
    } else {
      reason = 'Erre a domainre nincs szabály a listában, ezért a kérés átmegy.';
    }
  }

  zone.classList.toggle('blocked', decision === 'blocked');
  if (decision === 'blocked') counters.blocked += 1;
  else counters.allowed += 1;
  updateCounters();

  addLog({
    kind: decision,
    domain,
    category: CAT_LABEL[cat],
    info: { domain, decision, category: CAT_LABEL[cat], matched, rule, reason },
  });
}

/* ------------------------------------------------------------------ */
/* kozmetikai szimuláció                                              */
/* ------------------------------------------------------------------ */

function applyCosmetic() {
  const styleId = 'demo-cosmetic';
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }

  const groups = Object.entries(settings.cosmetic)
    .filter(([, on]) => on)
    .map(([g]) => g);

  const css = settings.enabled ? buildCosmeticCss(filterData, 'hirportal.hu', groups) : '';
  style.textContent = css;

  // mit rejtett el ténylegesen a CSS?
  const checks = [
    { el: '#consentBanner', group: 'consent', name: 'cookie-/hozzájárulás-banner', selector: '.cookie-consent-banner' },
    { el: '#newsletterPopup', group: 'widget', name: 'hírlevél-felugró', selector: '.newsletter-popup' },
  ];

  for (const check of checks) {
    const el = document.querySelector(check.el);
    if (!el) continue;
    const hidden = getComputedStyle(el).display === 'none';
    if (hidden) {
      addLog({
        kind: 'hidden-cosmetic',
        domain: check.name,
        category: 'kozmetikai',
        info: {
          domain: check.name,
          decision: 'hidden',
          category: 'Kozmetikai szűrés',
          matched: 'CSS-szelektor',
          rule: `${check.selector} { display: none !important; }`,
          reason: 'A content script által injektált CSS rejti el az elemet – ehhez nem kell blokkolni a hálózati kérést.',
        },
      });
    } else if (settings.enabled && settings.cosmetic[check.group] && groupWouldMatch(check.selector)) {
      addLog({
        kind: 'allowed',
        domain: check.name,
        category: 'kozmetikai',
        info: {
          domain: check.name,
          decision: 'allowed',
          category: 'Kozmetikai szűrés',
          matched: null,
          rule: null,
          reason: 'Az elem látható maradt.',
        },
      });
    }
  }
}

function groupWouldMatch(selector) {
  const groups = filterData?.cosmetic?.groups || {};
  return Object.values(groups).some((list) => list.includes(selector));
}

/* ------------------------------------------------------------------ */
/* teljes újraszimulálás                                              */
/* ------------------------------------------------------------------ */

function simulate() {
  const token = ++animToken;
  counters = { blocked: 0, allowed: 0 };
  updateCounters();
  $('#log').innerHTML = '';
  $('#logCount').textContent = '0 esemény';
  $('#browserTag').textContent = settings.enabled ? 'szűrés be' : 'szűrés ki';
  $('#browserTag').classList.toggle('off', !settings.enabled);
  $('#panelStatus').closest('.card').classList.toggle('is-off', !settings.enabled);
  $('#panelStatus').lastElementChild.textContent = settings.enabled ? 'Szűrés aktív' : 'Szűrés kikapcsolva';

  // kozmetikai rész azonnal (hiszen a CSS az oldalbetöltés előtt fut)
  applyCosmetic();

  const zones = [...document.querySelectorAll('.zone')];
  zones.forEach((zone, i) => {
    setTimeout(() => {
      if (token !== animToken) return;
      evaluateZone(zone);
    }, 130 + i * 150);
  });
}

/* ------------------------------------------------------------------ */
/* vezérlők                                                           */
/* ------------------------------------------------------------------ */

function renderChips() {
  const holder = $('#chips');
  holder.innerHTML = '';
  for (const cat of CATEGORIES) {
    const on = settings.enabled && settings.categories[cat.id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (on ? '' : ' off');
    btn.innerHTML = `
      <span class="chip-top">
        <span class="chip-name">${cat.label}</span>
        <span class="led"></span>
      </span>
      <span class="chip-count">${(filterData?.counts?.[cat.id] || 0)}</span>
    `;
    btn.title = 'Kattints a ki/be kapcsoláshoz';
    btn.addEventListener('click', () => {
      settings.categories[cat.id] = !settings.categories[cat.id];
      renderChips();
      simulate();
    });
    holder.appendChild(btn);
  }
}

function bindControls() {
  $('#masterToggle').addEventListener('change', (e) => {
    settings.enabled = e.target.checked;
    renderChips();
    simulate();
  });

  $('#replayBtn').addEventListener('click', simulate);

  $('#clearBtn').addEventListener('click', () => {
    animToken += 1;
    counters = { blocked: 0, allowed: 0 };
    updateCounters();
    $('#log').innerHTML = '';
    $('#logCount').textContent = '0 esemény';
    document.querySelectorAll('.zone').forEach((z) => z.classList.remove('blocked'));
  });

  document.querySelectorAll('.consent-btn, .nl-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.closest('.cookie-consent-banner, .newsletter-popup');
      if (target) target.style.display = 'none';
    });
  });
}

/* ------------------------------------------------------------------ */
/* indítás                                                            */
/* ------------------------------------------------------------------ */

(async () => {
  try {
    const res = await fetch('../extension/data/filters.json', { cache: 'no-store' });
    filterData = await res.json();
    hostIndex = buildHostIndex(filterData);
    $('#ruleInfo').textContent =
      `${filterData.counts.totalRules} szabály · ${filterData.counts.totalHosts} domain · ` +
      `${filterData.counts.cosmeticGeneric} kozmetikai szelektor`;
  } catch (err) {
    filterData = { categories: {}, cosmetic: { groups: {}, siteSpecific: {} }, counts: {} };
    $('#ruleInfo').textContent = 'a szűrőlista nem tölthető be (futtasd: npm run build)';
  }

  bindControls();
  renderChips();
  simulate();
})();
