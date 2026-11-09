/** ReklámStop – felületi szövegek (magyar / angol) */

export const LANGS = ['hu', 'en'];

const dict = {
  hu: {
    'app.name': 'ReklámStop',
    'app.subtitle': 'saját reklámblokkoló',
    'common.on': 'be',
    'common.off': 'ki',
    'common.save': 'Mentés',
    'common.remove': 'Törlés',
    'common.add': 'Hozzáadás',
    'common.none': 'Nincs',
    'lang.label': 'Nyelv',

    'popup.status.on': 'Védelem aktív',
    'popup.status.off': 'Védelem kikapcsolva',
    'popup.status.onHint': 'Reklámok, trackerek és cookie-bannerek szűrése fut.',
    'popup.status.offHint': 'Minden kérés változatlanul átmegy.',
    'popup.blockedTotal': 'blokkolt kérés összesen',
    'popup.onThisPage': 'ezen az oldalon',
    'popup.site': 'Ezen az oldal',
    'popup.pauseHere': 'Szüneteltetés ezen az oldalon',
    'popup.pausedNote': 'Ezen az oldalon minden szűrés szünetel.',
    'popup.reload': 'Oldal újratöltése',
    'popup.reloadHint': 'A változás a következő oldalbetöltéskor lép életbe.',
    'popup.categories': 'Kategóriák',
    'popup.options': 'Beállítások',
    'popup.noSite': 'Ezen a lapon nincs szűrhető oldal.',
    'popup.statsOff': 'A statisztika ki van kapcsolva.',
    'popup.activeCat': 'aktív',

    'cat.ads': 'Reklám',
    'cat.trackers': 'Követés',
    'cat.privacy': 'Adatvédelem',
    'cat.custom': 'Saját',

    'opt.title': 'Beállítások',
    'opt.subtitle': 'ReklámStop – saját reklámblokkoló',
    'opt.general': 'Általános',
    'opt.master': 'Reklámblokkolás',
    'opt.masterDesc': 'A fő kapcsoló. Kikapcsolva a beépített szabályok is leállnak.',
    'opt.lang': 'Felület nyelve',
    'opt.cosmeticTitle': 'Kozmetikai szűrés (CSS-elrejtés)',
    'opt.cosmeticDesc': 'A hirdetési helyek és bannerek elrejtése az oldalról.',
    'opt.group.ads': 'Hirdetési helyek',
    'opt.group.consent': 'Cookie-/hozzájárulás-bannerek',
    'opt.group.widget': 'Közösségi widgetek és felugró hírlevél-ablakok',
    'opt.categories': 'Kategóriák',
    'opt.categoriesDesc': 'Hálózati szűrés – melyik listát használja a blokkoló.',
    'opt.customTitle': 'Saját szabályok',
    'opt.customDesc':
      'Soronként egy szabály. Elfogadott: <code>pelda.hu</code>, <code>||pelda.hu^</code>, <code>pelda.hu/utvonal</code>, <code>pelda.hu##.szelektor</code>.',
    'opt.customPh': 'pelda.hu\n||reklam.pelda.hu^\npelda.hu##.sajat-banner',
    'opt.invalidLines': 'Nem értelmezhető sorok',
    'opt.ruleCount': 'szabály',
    'opt.allowTitle': 'Engedélyezett oldalak',
    'opt.allowDesc': 'Ezeken az oldalakon a blokkoló teljesen szünetel (pl. ha eltör egy funkciót).',
    'opt.allowPh': 'pelda.hu',
    'opt.allowEmpty': 'Még nincs engedélyezett oldal.',
    'opt.importTitle': 'Szűrőlista importja',
    'opt.importDesc':
      'EasyList / AdGuard formátumú .txt fájl (pl. easylist.txt). Csak a domain alapú és kozmetikai szabályok emelhetők át.',
    'opt.importBtn': 'Fájl kiválasztása',
    'opt.importOk': 'Importálva: {n} hálózati szabály, {c} kozmetikai szelektor. Kihagyva: {s}.',
    'opt.importNothing': 'Nem találtam használható szabályt a fájlban.',
    'opt.importActive': 'Importált lista aktív',
    'opt.importCounts': 'Importálva: {n} hálózati szabály, {c} kozmetikai szelektor.',
    'opt.importRemove': 'Importált lista törlése',
    'opt.exportTitle': 'DNS / hosts export',
    'opt.exportDesc':
      'Ugyanez a lista használható böngészőn kívül is: hosts fájlként vagy helyi DNS-blokkolóval (lásd dns/ mappa).',
    'opt.exportHosts': 'hosts fájl letöltése',
    'opt.exportDomains': 'domain lista letöltése',
    'opt.statsTitle': 'Statisztika',
    'opt.statsTotal': 'Összes blokkolt kérés',
    'opt.statsSince': 'Mérés kezdete',
    'opt.statsReset': 'Statisztika nullázása',
    'opt.countStats': 'Kérésszámlálás',
    'opt.countStatsDesc': 'Ha kikapcsolod, a blokkoló nem számolja a kéréseket.',
    'opt.aboutTitle': 'Névjegy',
    'opt.version': 'Verzió',
    'opt.generated': 'Szűrőlista generálva',
    'opt.builtin': 'Beépített szabályok',
    'opt.builtinValue': '{n} szabály · {h} domain · {c} szelektor',
    'opt.saved': 'Mentve',
    'opt.hint': 'A módosítások a következő oldalbetöltéskor lépnek életbe.',
    'opt.dynamicLimit': 'Legfeljebb 5000 saját szabály vehető fel.',
    'opt.tooMany': 'Túl sok saját szabály (max. 5000).',
  },
  en: {
    'app.name': 'AdStop',
    'app.subtitle': 'your own ad blocker',
    'common.on': 'on',
    'common.off': 'off',
    'common.save': 'Save',
    'common.remove': 'Remove',
    'common.add': 'Add',
    'common.none': 'None',
    'lang.label': 'Language',

    'popup.status.on': 'Protection on',
    'popup.status.off': 'Protection off',
    'popup.status.onHint': 'Ads, trackers and cookie banners are being filtered.',
    'popup.status.offHint': 'All requests go through untouched.',
    'popup.blockedTotal': 'requests blocked in total',
    'popup.onThisPage': 'on this page',
    'popup.site': 'This site',
    'popup.pauseHere': 'Pause on this site',
    'popup.pausedNote': 'Filtering is paused on this site.',
    'popup.reload': 'Reload page',
    'popup.reloadHint': 'Changes take effect on the next page load.',
    'popup.categories': 'Categories',
    'popup.options': 'Settings',
    'popup.noSite': 'No filterable page in this tab.',
    'popup.statsOff': 'Request counting is off.',
    'popup.activeCat': 'active',

    'cat.ads': 'Ads',
    'cat.trackers': 'Trackers',
    'cat.privacy': 'Privacy',
    'cat.custom': 'Custom',

    'opt.title': 'Settings',
    'opt.subtitle': 'AdStop – your own ad blocker',
    'opt.general': 'General',
    'opt.master': 'Ad blocking',
    'opt.masterDesc': 'Master switch. When off, built-in rules are disabled too.',
    'opt.lang': 'Interface language',
    'opt.cosmeticTitle': 'Cosmetic filtering (CSS hiding)',
    'opt.cosmeticDesc': 'Hides ad slots and banners on the page.',
    'opt.group.ads': 'Ad slots',
    'opt.group.consent': 'Cookie / consent banners',
    'opt.group.widget': 'Social widgets and newsletter popups',
    'opt.categories': 'Categories',
    'opt.categoriesDesc': 'Network filtering – which lists the blocker uses.',
    'opt.customTitle': 'Custom rules',
    'opt.customDesc':
      'One rule per line. Accepted: <code>example.com</code>, <code>||example.com^</code>, <code>example.com/path</code>, <code>example.com##.selector</code>.',
    'opt.customPh': 'example.com\n||ads.example.com^\nexample.com##.my-banner',
    'opt.invalidLines': 'Unparsable lines',
    'opt.ruleCount': 'rules',
    'opt.allowTitle': 'Allowed sites',
    'opt.allowDesc': 'The blocker is fully paused on these sites (e.g. when it breaks something).',
    'opt.allowPh': 'example.com',
    'opt.allowEmpty': 'No allowed sites yet.',
    'opt.importTitle': 'Import filter list',
    'opt.importDesc':
      'EasyList / AdGuard .txt file (e.g. easylist.txt). Only domain-based and cosmetic rules can be imported.',
    'opt.importBtn': 'Choose file',
    'opt.importOk': 'Imported: {n} network rules, {c} cosmetic selectors. Skipped: {s}.',
    'opt.importNothing': 'No usable rules found in the file.',
    'opt.importActive': 'Imported list is active',
    'opt.importCounts': 'Imported: {n} network rules, {c} cosmetic selectors.',
    'opt.importRemove': 'Remove imported list',
    'opt.exportTitle': 'DNS / hosts export',
    'opt.exportDesc':
      'The same list works outside the browser: as a hosts file or with the local DNS blocker (see dns/).',
    'opt.exportHosts': 'Download hosts file',
    'opt.exportDomains': 'Download domain list',
    'opt.statsTitle': 'Statistics',
    'opt.statsTotal': 'Total blocked requests',
    'opt.statsSince': 'Counting since',
    'opt.statsReset': 'Reset statistics',
    'opt.countStats': 'Request counting',
    'opt.countStatsDesc': 'When off, the blocker does not count requests.',
    'opt.aboutTitle': 'About',
    'opt.version': 'Version',
    'opt.generated': 'Filter list generated',
    'opt.builtin': 'Built-in rules',
    'opt.builtinValue': '{n} rules · {h} domains · {c} selectors',
    'opt.saved': 'Saved',
    'opt.hint': 'Changes take effect on the next page load.',
    'opt.dynamicLimit': 'Up to 5000 custom rules can be added.',
    'opt.tooMany': 'Too many custom rules (max. 5000).',
  },
};

export function t(lang, key, vars) {
  const table = dict[lang] || dict.hu;
  let value = table[key] ?? dict.hu[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) value = value.replaceAll(`{${k}}`, String(v));
  }
  return value;
}

export function detectLang() {
  const nav = (globalThis.navigator?.language || 'hu').slice(0, 2);
  return LANGS.includes(nav) ? nav : 'hu';
}

/**
 * Lefordítja a [data-i18n], [data-i18n-title], [data-i18n-ph] attribútumú
 * elemeket. A HTML-t tartalmazó szövegeknél innerHTML-t használ.
 */
export function applyI18n(lang, root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    const text = t(lang, key);
    el.innerHTML = text;
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = t(lang, el.getAttribute('data-i18n-title'));
  }
  for (const el of root.querySelectorAll('[data-i18n-ph]')) {
    el.placeholder = t(lang, el.getAttribute('data-i18n-ph'));
  }
  for (const el of root.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(lang, el.getAttribute('data-i18n-aria')));
  }
  if (root === document.documentElement || root === document) {
    document.documentElement.lang = lang;
  }
}

export function formatNumber(n, lang) {
  try {
    return new Intl.NumberFormat(lang === 'hu' ? 'hu-HU' : 'en-US').format(n || 0);
  } catch {
    return String(n || 0);
  }
}
