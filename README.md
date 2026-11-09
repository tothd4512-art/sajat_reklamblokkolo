# ReklámStop – saját reklámblokkoló

Saját reklámblokkoló, három formában, **egyetlen szűrőlistából**:

1. **Böngésző-kiegészítő** (Chrome / Edge / Brave, illetve Firefox) – hirdetések,
   trackerek, cookie-bannerek szűrése, statisztika, saját szabályok.
2. **Szűrőlista-generátor** – a `filters/sources/*.txt` fájlokból legyártja a
   bővítmény szabályait, a `hosts` fájlt és a domain listát.
3. **Helyi DNS-blokkoló** (`dns/blocker.py`) – az egész gépre / otthoni hálózatra
   szóló védelem, ugyanazzal a listával.

Plusz egy **élő demó oldal**, ahol kipróbálható a szűrés működése böngészőben,
kiegészítő telepítése nélkül.

```
261 domain · 262 hálózati szabály · 83 kozmetikai szelektor · HU/EN felület
```

---

## Gyors indítás

```bash
npm run build          # szűrőlisták -> extension/rules/*.json, dist/hosts.txt
npm run dev            # demó: http://localhost:4173/
```

A demóban a bal oldali „weboldalon” valódi hirdetési helyek, cookie-banner és
tracker-pixel van; a jobb oldali panel a **tényleges szabályok döntéseit** mutatja
(hálózati blokk vs. kozmetikai elrejtés), és minden naplósorra kattintva látszik,
melyik szabály illeszkedett.

## Kiegészítő telepítése

### Chrome / Edge / Brave

1. `npm run build`
2. `chrome://extensions` → **Fejlesztői mód** be
3. **Kicsomagolt kiterjesztés betöltése** → válaszd az `extension/` mappát
4. Az ikonra kattintva jön a popup; a fogaskerék/Beállítások gomb a beállításokhoz visz

### Firefox

```bash
cp extension/manifest.firefox.json extension/manifest.json   # Windowson: copy
```

Majd `about:debugging#/runtime/this-firefox` → **Ideiglenes kiegészítő betöltése**
→ `extension/manifest.json`. (A `manifest.firefox.json` a `background.scripts`
formát használja, mert a Firefox nem futtat MV3 service workert.)

> A `extension/manifest.json` az eredeti Chrome-változat – ha Firefoxhoz írtad át,
> `git checkout extension/manifest.json` visszaállítja.

## Mit tud?

| Funkció | Leírás |
| --- | --- |
| Hálózati szűrés | `declarativeNetRequest` szabályok, csak harmadik féltől jövő kérésekre (nem töri el az oldal saját működését) |
| 3 kategória | **Reklám**, **Követés**, **Adatvédelem** – külön ki-/bekapcsolható |
| Kozmetikai szűrés | hirdetési helyek, cookie/consent bannerek, közösségi widgetek elrejtése CSS-sel (3 csoportban kapcsolható) |
| Statisztika | blokkolt kérések összesen / adott lapon, kategóriánként; nullázható, kikapcsolható |
| Oldal-szüneteltetés | egy kattintás a popupban: az adott oldalon minden szűrés leáll (`allowAllRequests` szabály) |
| Saját szabályok | soronként egy szabály: `pelda.hu`, `||pelda.hu^`, `pelda.hu/utvonal`, `pelda.hu##.szelektor` |
| EasyList import | `.txt` lista behúzása fájlból (a domain alapú és kozmetikai szabályok) |
| Export | hosts fájl és domain lista letöltése a beállításokból |
| Nyelv | magyar / angol, azonnal váltható |

## Projektstruktúra

```
filters/sources/          A SZŰRŐLISTA forrása (ezt szerkeszd!)
  ads.txt                 reklámszerverek, hirdetési hálózatok
  trackers.txt            analitika, viselkedéskövetés
  privacy.txt             fingerprinting, social widgetek, consent-cégek
  cosmetic.txt            CSS-elrejtés (##szelektor, pelda.hu##szelektor)

tools/
  build.mjs               forrás -> extension/rules/*.json, data/filters.json, dist/*
  dev-server.mjs          helyi statikus szerver (demó, popup, beállítások)
  make-icons.py           ikongenerátor (nincs külső függőség)
  smoke-test.mjs          füstteszt (jsdom, opcionális)

extension/
  manifest.json           Chrome/Edge MV3
  manifest.firefox.json   Firefox MV3
  background.js           szabályok, számlálás, üzenetek (service worker)
  content/cosmetic.js     CSS-injektálás document_start-kor
  popup/                  a kis panel
  options/                beállítások oldal
  shared/
    engine.js             közös motor (illesztés, CSS, import, export) – tiszta függvények
    settings.js           tárolás, alapértékek
    i18n.js               HU/EN szótárak
    mock.js               chrome.* mock, hogy a felület böngészőben is fusson
    ui.css                közös design
  rules/*.json            GENERÁLT – ne szerkeszd
  data/filters.json       GENERÁLT – ne szerkeszd
  icons/icon-*.png        GENERÁLT

dns/
  blocker.py              hosts generátor + helyi DNS-szerver (csak stdlib)
  README.md

demo/                     élő demó (ugyanazt a listát és motort használja)
dist/hosts.txt            GENERÁLT – hosts fájl
dist/domains.txt          GENERÁLT – sima domain lista
```

## A szűrőlista szerkesztése

Minden generált fájl a `filters/sources/` mappából származik. Szerkesztés után:

```bash
npm run build
```

és a bővítménynél `chrome://extensions` → ↻ (újratöltés).

### Hálózati szabályok

Soronként egy [DNR urlFilter](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest):

```
||doubleclick.net^        # a domain és minden aldomainje
||example.com/hirdetes^   # csak a megadott útvonal
# komment
```

A build `domainType: "thirdParty"` feltétellel egészíti ki őket, tehát egy oldal
saját kéréseit nem bántja. A blokkolt domainek automatikusan bekerülnek a
`hosts` fájlba és a DNS-listába is.

### Kozmetikai szabályok (`cosmetic.txt`)

```
##.adsbygoogle            # minden oldalon
telex.hu##.cikk-hirdetes  # csak a telex.hu-n (és aldomainjein)
a.hu,b.hu##.banner        # több oldalon
#!group consent           # a következő sorok a cookie-banner csoportba kerülnek
```

Csoportok: `ads` (hirdetési helyek), `consent` (cookie-bannerek), `widget`
(közösségi widgetek, hírlevél-popupok) – mindegyik külön kapcsolható.

> ⚠️ Csak olyan szelektort vegyél fel, amit ellenőriztél. Egy túl általános
> szelektor (`##.content`, `##.banner`) hasznos tartalmat is elrejthet.

## Saját szabályok és import

A beállítások oldalon:

- **Saját szabályok** – azonnal érvénybe lépnek (dinamikus DNR szabályként),
  max. 5000 sor. Az érvénytelen sorokat pirosan jelzi.
- **Szűrőlista importja** – EasyList/AdGuard `.txt` fájl. A `||domain^` alakú
  hálózati szabályok és a kozmetikai szelektorok kerülnek át; a bonyolult
  szintaxist (regex, `$` módosítók, kivételszabályok) kihagyja, és megmondja,
  mennyit.
- **Engedélyezett oldalak** – itt a blokkoló teljesen szünetel.

## Böngészőn kívül: DNS / hosts

```bash
python3 dns/blocker.py hosts                  # dist/hosts.txt
python3 dns/blocker.py serve --port 5335      # helyi DNS, 0.0.0.0 / :: válasz
python3 dns/blocker.py check doubleclick.net
```

Részletek: [`dns/README.md`](dns/README.md).

## Fejlesztés

```bash
npm run build     # szűrőlisták generálása
npm run dev       # http://localhost:4173/  (demó, popup, beállítások)
npm run icons     # ikonok újragenerálása (Python, PIL nélkül)
npm run test      # füstteszt; jsdom kell hozzá: npm i --no-save jsdom
```

A popup és a beállítások oldal **kiegészítő nélkül is** működik a `npm run dev`
szerveren: a `shared/mock.js` leutánozza a `chrome.*` API-t (localStorage-ban
tárol), így a felület fejleszthető és tesztelhető Böngészőben. Ilyenkor a
fejlécben sárga „előnézet” jelzés látható.

### Hogyan működik a szűrés?

| Réteg | Mechanizmus |
| --- | --- |
| Hálózat | statikus DNR szabálykészletek (`rules/ads.json`, `trackers.json`, `privacy.json`), kategóriánként ki-/bekapcsolva `updateEnabledRulesets`-szel |
| Saját + importált szabályok | dinamikus DNR szabályok (2-es prioritás) |
| Oldal-szüneteltetés | dinamikus `allowAllRequests` szabály (100-as prioritás) a fő dokumentumra |
| Kozmetika | content script kér CSS-t a háttérfolyamattól, és `<style>`-t injektál `document_start`-kor |
| Statisztika | `webRequest` megfigyelés (nem blokkol!) + domain-illesztés a betöltött listára, 2,5 s-enként mentve |

## Korlátok, jó tudni

- A beépített lista **kézzel válogatott** (~260 domain): a legismertebb hirdetési,
  tracking- és consent-hálózatokat fedi le. Teljes lefedettséghez importálj
  EasyListet a beállításokban.
- Csak **harmadik féltől** jövő kéréseket blokkol – így nem esik szét az oldal
  saját JS-e, de pl. a YouTube saját videóhirdetéseit nem érinti.
- A kozmetikai szabályok oldalfüggőek: egy redesign után a szelektor elavulhat.
- A DNS/hosts mód domain szinten blokkol, tehát egy domainen belüli hirdetést
  (pl. `ujsag.hu/reklam`) nem tud megkülönböztetni.
- Ha egy oldal eltörik, használd a popupban az **oldal szüneteltetése** kapcsolót,
  vagy vedd fel az engedélyezett oldalak közé.

## English summary

**ReklámStop** is a self-hosted ad blocker in three shapes, built from one filter
list: a Manifest V3 browser extension (Chrome/Edge + Firefox), a filter-list
generator, and a local DNS/hosts blocker in pure Python. Features: three filter
categories, cosmetic filtering (ads, cookie banners, widgets), per-site pause,
custom rules, EasyList import, stats, HU/EN UI, and a live demo page that shows
the actual rule decisions. Build with `npm run build`, preview with `npm run dev`,
test with `npm run test`. See the structure section above for where to edit
filters (`filters/sources/*.txt`).

## Licenc

MIT – használd, alakítsd, terjeszd szabadon. A szűrőlisták saját válogatásúak.
