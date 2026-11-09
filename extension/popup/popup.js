import '../shared/mock.js';
import { applyI18n, formatNumber, t } from '../shared/i18n.js';
import { CATEGORY_IDS } from '../shared/engine.js';

const $ = (sel) => document.querySelector(sel);

let state = null;
let lang = 'hu';
let dirty = false; // történt-e olyan változás, ami újratöltést igényel

const send = (msg) => chrome.runtime.sendMessage(msg);

function render() {
  const { settings, stats, host, tabCount, paused } = state;
  lang = settings.lang || 'hu';
  const enabled = settings.enabled;

  applyI18n(lang);
  document.documentElement.lang = lang;

  const langBtn = $('#langBtn');
  langBtn.textContent = lang === 'hu' ? 'EN' : 'HU';
  langBtn.title = t(lang, 'lang.label');

  document.body.classList.toggle('paused', paused);
  document.getElementById('hero').classList.toggle('is-off', !enabled);
  document.body.classList.toggle('is-mock', Boolean(state.mock));

  $('#masterToggle').checked = enabled;
  $('#statusText').textContent = t(lang, enabled ? 'popup.status.on' : 'popup.status.off');
  $('#statusHint').textContent = t(lang, enabled ? 'popup.status.onHint' : 'popup.status.offHint');

  if (!settings.countStats) {
    $('#totalNum').textContent = '–';
    $('#totalNum').title = t(lang, 'popup.statsOff');
  } else {
    $('#totalNum').textContent = formatNumber(stats.total, lang);
    $('#totalNum').title = '';
  }

  const pageCount = !enabled || paused ? 0 : tabCount;
  $('#tabNum').textContent = settings.countStats ? formatNumber(pageCount, lang) : '–';

  // --- kategória chipek ---
  const chips = $('#chips');
  chips.innerHTML = '';
  for (const cat of CATEGORY_IDS) {
    const on = enabled && settings.categories?.[cat] !== false;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (on ? '' : ' off');
    btn.title = t(lang, `cat.${cat}`);
    btn.innerHTML = `
      <span class="chip-top">
        <span class="chip-name">${t(lang, `cat.${cat}`)}</span>
        <span class="led"></span>
      </span>
      <span class="chip-count">${formatNumber(stats.byCategory?.[cat] || 0, lang)}</span>
    `;
    btn.addEventListener('click', async () => {
      const next = { ...settings.categories, [cat]: !(settings.categories?.[cat] !== false) };
      state = { ...state, ...(await send({ type: 'updateSettings', patch: { categories: next } })) };
      dirty = true;
      await refresh();
    });
    chips.appendChild(btn);
  }

  // --- aktuális oldal ---
  const siteHost = $('#siteHost');
  const siteToggle = $('#siteToggle');
  if (host) {
    siteHost.innerHTML = `${host}<small>${t(lang, 'popup.site')}</small>`;
    siteToggle.disabled = false;
    siteToggle.checked = paused;
    $('#siteHint').textContent = paused
      ? t(lang, 'popup.pausedNote')
      : dirty
        ? t(lang, 'popup.reloadHint')
        : '';
  } else {
    siteHost.innerHTML = `${t(lang, 'popup.noSite')}`;
    siteToggle.disabled = true;
    siteToggle.checked = false;
    $('#siteHint').textContent = '';
  }

  const manifest = chrome.runtime.getManifest?.();
  $('#verLabel').textContent = 'v' + (manifest?.version || '1.0.0');

  $('#reloadBtn').classList.toggle('hidden', !host);
}

async function refresh() {
  const next = await send({ type: 'state' });
  if (next && !next.error) state = { ...state, ...next };
  render();
}

/* ------------------------- események ------------------------- */

$('#masterToggle').addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  const res = await send({ type: 'updateSettings', patch: { enabled } });
  state = { ...state, settings: res.settings, tabCount: enabled ? state.tabCount : 0 };
  dirty = true;
  render();
});

$('#siteToggle').addEventListener('change', async (e) => {
  if (!state.host) return;
  const res = await send({ type: 'toggleSite', host: state.host, paused: e.target.checked });
  state = { ...state, settings: res.settings, paused: res.paused, tabCount: 0 };
  dirty = true;
  render();
});

$('#langBtn').addEventListener('click', async () => {
  const next = lang === 'hu' ? 'en' : 'hu';
  const res = await send({ type: 'updateSettings', patch: { lang: next } });
  state = { ...state, settings: res.settings };
  render();
});

$('#reloadBtn').addEventListener('click', async () => {
  await send({ type: 'reloadTab' });
  dirty = false;
  if (chrome.tabs?.reload) window.close?.();
});

$('#optionsBtn').addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  else location.assign('../options/options.html');
});

/* ------------------------- indítás ------------------------- */

(async () => {
  try {
    state = await send({ type: 'state' });
    if (!state || state.error) throw new Error(state?.error || 'nincs állapot');
    render();
  } catch (err) {
    document.body.innerHTML =
      '<p style="padding:20px;color:#f87171;font-family:system-ui">' +
      'Nem sikerült betölteni a beállításokat.<br><small>' +
      String(err) +
      '</small></p>';
  }
})();
