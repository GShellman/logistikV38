(function renderHelveticFreightShell(){
  'use strict';

  const root = document.createElement('div');
  root.id = 'app';
  root.innerHTML = `
    <div id="map"></div>
    <div class="legend">
      <b>Netzstatus</b>
      <div><i class="dot g"></i> Freigeschaltet</div>
      <div><i class="dot x"></i> Noch gesperrt</div>
      <div><i class="line-localroad"></i> Gemeindestraße</div>
      <div><i class="line-regional"></i> Regionalstraße</div>
      <div><i class="line-mainroad"></i> Kantonsstraße</div>
      <div><i class="line-expressway"></i> Schnellstraße</div>
      <div><i class="line-motorway"></i> Autobahn</div>
      <div><i class="line-rail"></i> Bahn</div>
      <div><i class="util-dot util-low"></i> geringe Auslastung</div>
      <div><i class="util-dot util-mid"></i> mittlere Auslastung</div>
      <div><i class="util-dot util-full"></i> hohe Auslastung</div>
    </div>
    <aside class="side" id="mobileSheet">
      <button aria-expanded="true" aria-label="Menügröße ändern" class="sheet-handle" id="sheetHandle" type="button"><span class="sheet-grip"></span><span class="sheet-handle-label">MENÜ</span><span class="sheet-handle-icon" id="sheetHandleIcon">↕</span></button>
      <header class="topbar">
        <div class="brand"><div class="brandmark">↔</div><div><h1>LOGISTIK</h1><small>CH</small></div></div>
        <div class="stats"><div class="stat"><span>Konto</span><b id="cash">CHF 0</b></div><div class="stat"><span>Zeit</span><b id="day">1</b></div><div class="stat"><span>Netz</span><b id="networkStat">1 Ort</b></div></div>
      </header>
      <nav class="tabs">
        <button class="tab active" data-tab="city">ORT</button><button class="tab" data-tab="network">NETZ</button><button class="tab" data-tab="logistics">LOGISTIK</button><button class="tab" data-tab="company">FIRMA</button>
      </nav>
      <main class="content" id="content"></main>
      <footer class="footer"><button class="btn secondary" id="saveBtn">Speichern</button><button class="btn orange" id="playBtn">▶ Play</button><button class="btn blue" id="nextHourBtn">+1 Std.</button><button class="btn primary" id="nextDayBtn">Tag beenden</button></footer>
    </aside>
    <div class="toast-wrap" id="toasts"></div>
    <div class="modal-back" id="modalBack"><div class="modal" id="modal"></div></div>
  `;

  document.body.appendChild(root);
})();
