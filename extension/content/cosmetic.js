/**
 * ReklámStop – kozmetikai content script
 * A háttérfolyamattól kapott CSS-t injektálja az oldalba.
 * document_start-kor fut, így a hirdetési helyek már megjelenés előtt rejtve vannak.
 */
(() => {
  const STYLE_ID = 'reklamstop-cosmetic-style';
  let lastCss = null;

  function ensureStyle(css) {
    let el = document.getElementById(STYLE_ID);
    if (!css) {
      if (el) el.remove();
      lastCss = '';
      return;
    }
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      el.setAttribute('type', 'text/css');
      (document.head || document.documentElement).appendChild(el);
    }
    if (css !== lastCss) {
      el.textContent = css;
      lastCss = css;
    }
  }

  async function refresh() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'getCosmetic', host: location.hostname });
      ensureStyle(res?.css || '');
    } catch {
      /* kiegészítő frissítés / újratöltés közben előfordulhat */
    }
  }

  refresh();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'cosmeticRefresh') refresh();
  });

  // ha az oldal később tölti be a <head>-et, a stílus akkor is maradjon
  if (!document.head) {
    const observer = new MutationObserver(() => {
      if (document.head) {
        observer.disconnect();
        if (lastCss) ensureStyle(lastCss + '\n');
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
