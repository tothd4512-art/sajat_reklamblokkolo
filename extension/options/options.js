import '../shared/mock.js';
import { applyI18n, formatNumber, t } from '../shared/i18n.js';
import { parseCustomRules } from '../shared/engine.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const send = (msg) => chrome.runtime.sendMessage(msg);

let state = null;
let lang = 'hu';
let toastTimer = null;
let customSaveTimer = null;

/* ---------------------------------------------------------------- */
/* segédek                                                          */
/* ---------------------------------------------------------------- */

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

function normalizeDomain(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '');
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function save(patch, { renderAfter = true, quiet = false } = {}) {
  const res = await send({ type: 'updateSettings', patch });
  if (res?.settings) state.settings = res.settings;
  if (renderAfter) render();
  if (!quiet) toast(t(lang, 'opt.saved'));
  return res;
}

/* ---------------------------------------------------------------- */
/* render                                                           */
/* ---------------------------------------------------------------- */

function render() {
  const s = state.settings;
  lang = s.lang || 'hu';

  applyI18n(lang);
  document.documentElement.lang = lang;
  for (const btn of $$('.seg button')) btn.classList.toggle('active', btn.dataset.lang === lang);
  document.body.classList.toggle('is-mock', Boolean(state.mock));

  $('#masterToggle').checked = Boolean(s.enabled);
  $('#countToggle').checked = Boolean(s.countStats);

  for (const cat of ['ads', 'trackers', 'privacy']) {
    $('#cat-' + cat).checked = s.categories?.[cat] !== false;
  }
  for (const group of ['ads', 'consent', 'widget']) {
    $('#cos-' + group).checked = s.cosmetic?.[group] !== false;
  }

  const counts = state.counts || {};
  $('#catRulesTotal').textContent = formatNumber(
    (counts.ads || 0) + (counts.trackers || 0) + (counts.privacy || 0),
    lang
  );

  if (document.activeElement !== $('#customRules')) {
    $('#customRules').value = s.customRules || '';
  }
  updateCustomParsed();

  renderAllowlist();
  renderImport();
  renderStats();
  renderAbout();
}

function updateCustomParsed() {
  const parsed = parseCustomRules($('#customRules').value);
  const total = parsed.network.length + Object.values(parsed.siteSpecific).flat().length;
  $('#customCount').textContent = `${formatNumber(total, lang)} ${t(lang, 'opt.ruleCount')}`;

  const note = $('#invalidNote');
  if (parsed.invalid.length) {
    note.classList.remove('hidden');
    $('#invalidList').textContent = parsed.invalid.slice(0, 4).join(' · ');
  } else {
    note.classList.add('hidden');
  }
}

function renderAllowlist() {
  const list = $('#allowList');
  const entries = state.settings.allowlist || [];
  list.innerHTML = '';
  if (!entries.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = t(lang, 'opt.allowEmpty');
    list.appendChild(p);
    return;
  }
  for (const entry of entries) {
    const item = document.createElement('div');
    item.className = 'list-item';
    const span = document.createElement('span');
    span.textContent = entry;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '✕';
    btn.title = t(lang, 'common.remove');
    btn.addEventListener('click', async () => {
      const next = entries.filter((e) => e !== entry);
      await save({ allowlist: next });
    });
    item.append(span, btn);
    list.appendChild(item);
  }
}

function renderImport() {
  const note = $('#importNote');
  const removeBtn = $('#importRemove');
  const info = state.imported;
  if (!info) {
    note.classList.add('hidden');
    removeBtn.classList.add('hidden');
    return;
  }
  note.classList.remove('hidden');
  removeBtn.classList.remove('hidden');
  const when = new Date(info.at).toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-US');
  note.innerHTML =
    `<strong>${t(lang, 'opt.importActive')}</strong><br>` +
    `<span class="mono">${info.name}</span> · ${when}<br>` +
    t(lang, 'opt.importCounts', {
      n: formatNumber(info.network, lang),
      c: formatNumber(info.cosmetic, lang),
    });
}

function renderStats() {
  const stats = state.stats || {};
  const by = stats.byCategory || {};
  $('#statTotal').textContent = formatNumber(stats.total || 0, lang);
  $('#statAds').textContent = formatNumber(by.ads || 0, lang);
  $('#statTrackers').textContent = formatNumber(by.trackers || 0, lang);
  $('#statPrivacy').textContent = formatNumber(by.privacy || 0, lang);
  $('#statSince').textContent = stats.since
    ? new Date(stats.since).toLocaleDateString(lang === 'hu' ? 'hu-HU' : 'en-US')
    : '—';
}

function renderAbout() {
  const counts = state.counts || {};
  const manifest = chrome.runtime.getManifest?.();
  const version = manifest?.version || '1.0.0';
  $('#verChip').textContent = 'v' + version;
  $('#aboutVersion').textContent = version;
  $('#aboutRules').textContent = t(lang, 'opt.builtinValue', {
    n: formatNumber(counts.totalRules || 0, lang),
    h: formatNumber(counts.totalHosts || 0, lang),
    c: formatNumber(counts.cosmeticGeneric || 0, lang),
  });
  $('#aboutGenerated').textContent = state.generatedAt
    ? new Date(state.generatedAt).toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-US')
    : '—';
}

/* ---------------------------------------------------------------- */
/* események                                                        */
/* ---------------------------------------------------------------- */

$('#masterToggle').addEventListener('change', (e) => save({ enabled: e.target.checked }));
$('#countToggle').addEventListener('change', (e) => save({ countStats: e.target.checked }));

for (const cat of ['ads', 'trackers', 'privacy']) {
  $('#cat-' + cat).addEventListener('change', (e) =>
    save({ categories: { [cat]: e.target.checked } }, { renderAfter: false })
  );
}
for (const group of ['ads', 'consent', 'widget']) {
  $('#cos-' + group).addEventListener('change', (e) =>
    save({ cosmetic: { [group]: e.target.checked } }, { renderAfter: false })
  );
}

for (const btn of $$('.seg button')) {
  btn.addEventListener('click', async () => {
    const next = btn.dataset.lang;
    if (next === lang) return;
    const res = await send({ type: 'updateSettings', patch: { lang: next } });
    state.settings = res.settings;
    lang = next;
    render();
  });
}

$('#customRules').addEventListener('input', () => {
  updateCustomParsed();
  clearTimeout(customSaveTimer);
  customSaveTimer = setTimeout(() => {
    const el = $('#customRules');
    if (el) save({ customRules: el.value }, { renderAfter: false, quiet: true });
  }, 600);
});
$('#customRules').addEventListener('blur', () => {
  clearTimeout(customSaveTimer);
  save({ customRules: $('#customRules').value }, { renderAfter: false, quiet: true });
});

$('#allowAdd').addEventListener('click', async () => {
  const domain = normalizeDomain($('#allowInput').value);
  if (!domain || !domain.includes('.')) {
    $('#allowInput').focus();
    return;
  }
  const list = new Set(state.settings.allowlist || []);
  list.add(domain);
  $('#allowInput').value = '';
  await save({ allowlist: [...list] });
});

$('#allowInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#allowAdd').click();
});

$('#importBtn').addEventListener('click', () => $('#importFile').click());

$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const res = await send({ type: 'importList', text, name: file.name });
  e.target.value = '';

  const note = $('#importNote');
  note.classList.remove('hidden');
  if (!res?.ok) {
    note.innerHTML = t(lang, 'opt.importNothing');
    return;
  }
  state.imported = res.imported;
  renderImport();
  toast(t(lang, 'opt.saved'));
});

$('#importRemove').addEventListener('click', async () => {
  await send({ type: 'removeImport' });
  state.imported = null;
  renderImport();
  toast(t(lang, 'opt.saved'));
});

$('#exportHosts').addEventListener('click', async () => {
  const res = await send({ type: 'exportHosts' });
  if (res?.text) download('reklamstop-hosts.txt', res.text);
});

$('#exportDomains').addEventListener('click', async () => {
  const res = await send({ type: 'exportDomains' });
  if (res?.text) download('reklamstop-domains.txt', res.text);
});

$('#resetStats').addEventListener('click', async () => {
  const res = await send({ type: 'resetStats' });
  if (res?.stats) state.stats = res.stats;
  renderStats();
});

/* ---------------------------------------------------------------- */
/* indítás                                                          */
/* ---------------------------------------------------------------- */

(async () => {
  try {
    state = await send({ type: 'state' });
    if (!state || state.error) throw new Error(state?.error || 'nincs állapot');
    render();
  } catch (err) {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<p style="padding:20px;color:#f87171;font-family:system-ui">Nem sikerült betölteni a beállításokat.<br><small>${String(
        err
      )}</small></p>`
    );
  }
})();
