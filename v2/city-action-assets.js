(() => {
  'use strict';

  function svgDataUri(markup) {
    return `data:image/svg+xml,${encodeURIComponent(markup)}`;
  }

  const ACTION_ASSETS = Object.freeze({
    network: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Straße">
        <defs>
          <linearGradient id="road" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stop-color="#737f7d"/>
            <stop offset="1" stop-color="#3b4545"/>
          </linearGradient>
        </defs>
        <path d="M15 78 42 14h12l27 64H59l-3-15H40l-3 15Z" fill="url(#road)" stroke="#263232" stroke-width="4" stroke-linejoin="round"/>
        <path d="M48 18v14M48 42v12M48 64v12" fill="none" stroke="#f2d46b" stroke-width="5" stroke-linecap="round"/>
        <path d="M16 78h64" stroke="#182423" stroke-width="5" stroke-linecap="round" opacity=".45"/>
      </svg>`),
    fleet: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Lastwagen">
        <path d="M16 28h43v34H16z" fill="#e8e9e4" stroke="#4a5553" stroke-width="4" stroke-linejoin="round"/>
        <path d="M59 40h12l10 11v11H59Z" fill="#596568" stroke="#344042" stroke-width="4" stroke-linejoin="round"/>
        <path d="M66 44h5l6 7H66Z" fill="#b7d7e6"/>
        <circle cx="30" cy="68" r="8" fill="#262d2e"/><circle cx="30" cy="68" r="3" fill="#9ba4a2"/>
        <circle cx="68" cy="68" r="8" fill="#262d2e"/><circle cx="68" cy="68" r="3" fill="#9ba4a2"/>
        <path d="M20 34h35" stroke="#fff" stroke-width="4" opacity=".65"/>
      </svg>`),
    factory: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Fabrik">
        <path d="M12 74V45l16 9V42l18 10V38l18 10v26Z" fill="#6d7671" stroke="#303936" stroke-width="4" stroke-linejoin="round"/>
        <path d="M18 74V27h10v47M39 74V20h10v54" fill="#8a918d" stroke="#303936" stroke-width="4" stroke-linejoin="round"/>
        <path d="M63 74V52h16v22Z" fill="#8a918d" stroke="#303936" stroke-width="4" stroke-linejoin="round"/>
        <path d="M18 27h10M39 20h10" stroke="#cfd6d2" stroke-width="4"/>
        <path d="M20 62h8M36 62h8M52 62h8" stroke="#d5ddda" stroke-width="4" stroke-linecap="round"/>
        <ellipse cx="48" cy="78" rx="39" ry="7" fill="#1e2927" opacity=".22"/>
      </svg>`),
  });

  function actionImage(action) {
    return ACTION_ASSETS[String(action || '').trim()] || '';
  }

  window.HFV2CityActionAssets = Object.freeze({actionImage});
})();
