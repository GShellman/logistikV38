(() => {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    }[char]));
  }

  function formatMoney(value) {
    return `CHF ${Math.round(Number(value) || 0).toLocaleString('de-CH')}`;
  }

  function formatLoad(value) {
    const load = Number(value) || 0;
    if (load >= 1000) return `${(load / 1000).toLocaleString('de-CH', {maximumFractionDigits: 1})} t`;
    return `${load.toLocaleString('de-CH', {maximumFractionDigits: 1})} t`;
  }

  function formatSpeed(value) {
    return `${Math.round(Number(value) || 0).toLocaleString('de-CH')} km/h`;
  }

  function formatDailyCost(vehicle) {
    const daily = Number(vehicle.daily) || Math.round((Number(vehicle.kmCost) || 0) * 100);
    return `${formatMoney(daily)} / Tag`;
  }

  function citiesById() {
    return window.HFV2CitiesById || {};
  }

  function cityById(cityId) {
    return citiesById()[cityId] || null;
  }

  function fleetApi() {
    return window.HFFleet || null;
  }

  function vehicleImage(vehicleId) {
    return window.HFV2VehicleAssets?.vehicleImage?.(vehicleId) || '';
  }

  function vehicleVisual(vehicleId, vehicle) {
    const image = vehicleImage(vehicleId);
    if (!image) return `<span class="hf-v2-fleet-card__emoji">${escapeHtml(vehicle.icon || '🚚')}</span>`;
    return `<img class="hf-v2-fleet-card__image" src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">`;
  }

  function vehicleRows(cityId) {
    const api = fleetApi();
    if (!api) return '<p class="hf-v2-fleet-empty">Der Fahrzeugkatalog ist nicht geladen.</p>';

    const fleet = api.getCityFleet?.(cityId) || {};
    const cash = window.HFV2Save?.getCash?.() ?? 0;
    const vehicleTypes = api.VEHICLE_TYPES || [];
    const vehicles = api.VEHICLES || {};

    if (!vehicleTypes.length) return '<p class="hf-v2-fleet-empty">Keine kaufbaren Fahrzeuge verfügbar.</p>';

    return vehicleTypes.map(type => {
      const vehicle = vehicles[type];
      if (!vehicle) return '';
      const owned = Number(fleet[type]) || 0;
      const canAfford = cash >= (Number(vehicle.cost) || 0);
      const disabledText = canAfford ? '' : ' disabled aria-disabled="true" title="Nicht genug Kapital"';
      return `
        <article class="hf-v2-fleet-card${canAfford ? '' : ' is-disabled'}">
          <div class="hf-v2-fleet-card__icon" aria-hidden="true">${vehicleVisual(type, vehicle)}</div>
          <div class="hf-v2-fleet-card__main">
            <div class="hf-v2-fleet-card__head">
              <span>
                <h4>${escapeHtml(vehicle.name || type)}</h4>
              </span>
              <span class="hf-v2-fleet-owned" aria-label="Fahrzeuge im Bestand">${owned.toLocaleString('de-CH')} im Bestand</span>
            </div>
            <p>${escapeHtml(vehicle.desc || 'Kaufbares Fahrzeug für den städtischen Fuhrpark.')}</p>
            <dl class="hf-v2-fleet-stats">
              <div><dt>Kapazität</dt><dd>${formatLoad(vehicle.load)}</dd></div>
              <div><dt>Kosten</dt><dd>${formatMoney(vehicle.cost)}</dd></div>
              <div><dt>Tempo</dt><dd>${formatSpeed(vehicle.speed)}</dd></div>
              <div><dt>Betriebskosten</dt><dd>${formatDailyCost(vehicle)}</dd></div>
              <div><dt>Bestand</dt><dd>${owned.toLocaleString('de-CH')}</dd></div>
            </dl>
          </div>
          <button class="hf-v2-fleet-buy" type="button" data-action="buy-fleet-vehicle" data-city-id="${escapeHtml(cityId)}" data-vehicle-type="${escapeHtml(type)}"${disabledText}><span>${canAfford ? 'Kaufen' : 'Nicht leistbar'}</span><strong>${formatMoney(vehicle.cost)}</strong><i aria-hidden="true">→</i></button>
        </article>`;
    }).join('');
  }

  function renderFleetMenu(cityId) {
    const city = cityById(cityId);
    if (!city) return '<p class="hf-v2-fleet-empty">Stadt nicht gefunden.</p>';
    const cash = window.HFV2Save?.getCash?.() ?? 0;
    return `
      <div class="hf-v2-fleet-menu" data-fleet-city-id="${escapeHtml(city.id)}">
        <section class="hf-v2-fleet-hero" aria-label="Fahrzeugkauf Übersicht">
          <div class="hf-v2-fleet-hero__mark" aria-hidden="true">V2</div>
          <div>
            <p class="hf-v2-fleet-eyebrow">${escapeHtml(city.name)}</p>
            <h3>Fuhrparkbeschaffung</h3>
            <p class="hf-v2-fleet-subline">Erweitern Sie Ihre Flotte und bringen Sie Ihre Logistik auf die Überholspur.</p>
          </div>
        </section>
        <div class="hf-v2-fleet-toolbar">
          <div class="hf-v2-fleet-tabs" role="tablist" aria-label="Fahrzeugklassen">
            <button class="is-active" type="button" role="tab" aria-selected="true">Straße</button>
            <button type="button" role="tab" aria-selected="false" disabled>Schiene</button>
            <button type="button" role="tab" aria-selected="false" disabled>Spezial</button>
          </div>
          <div class="hf-v2-fleet-cash" aria-label="Verfügbares Kapital"><span>Kapital</span><strong>${formatMoney(cash)}</strong></div>
        </div>
        <div class="hf-v2-fleet-info-row">
          <p class="hf-v2-fleet-hint"><span aria-hidden="true">i</span>Kaufen Sie Fahrzeuge und stationieren Sie sie direkt in dieser Stadt. Käufe werden vom gemeinsamen V2-Kapital abgezogen.</p>
          <button class="hf-v2-fleet-sort" type="button" disabled>Nach Kapazität</button>
        </div>
        <div class="hf-v2-fleet-grid">${vehicleRows(city.id)}</div>
        <div class="hf-v2-fleet-footer" aria-label="Vorteile des Fahrzeugkaufs">
          <span><strong>Sofort verfügbar</strong><small>Direkt in dieser Stadt</small></span>
          <span><strong>Lokale Stationierung</strong><small>Optimale Routen ab Stadt</small></span>
          <span><strong>Vom V2-Kapital bezahlt</strong><small>Gemeinsames Budget nutzen</small></span>
          <button type="button" disabled>Mehr über Fahrzeuge</button>
        </div>
      </div>`;
  }

  function refreshFleetMenu(cityId) {
    window.HFV2Modal?.setModalBody?.(renderFleetMenu(cityId));
  }

  function bindFleetMenuEvents() {
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-action="buy-fleet-vehicle"]');
      if (!button) return;

      const modalBody = document.getElementById('hfV2ModalBody');
      if (modalBody && !modalBody.contains(button)) return;

      event.preventDefault();
      const {cityId, vehicleType} = button.dataset;
      const result = fleetApi()?.buyVehicle?.(cityId, vehicleType);
      if (result?.ok) refreshFleetMenu(cityId);
    });
  }

  function openCityFleetForCity(cityId) {
    const city = cityById(cityId);
    if (!city || !window.HFV2Modal?.openModal) return;
    window.HFV2Modal.openModal({
      className: 'hf-v2-fleet-modal',
      title: 'Fuhrparkbeschaffung',
      subtitle: city.name,
      bodyHtml: renderFleetMenu(city.id),
    });
  }

  bindFleetMenuEvents();

  window.HFV2FleetMenu = {openCityFleetForCity, renderFleetMenu};
})();
