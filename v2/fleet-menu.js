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
                <small>Typ</small>
                <h4>${escapeHtml(vehicle.name || type)}</h4>
              </span>
              <span class="hf-v2-fleet-owned">${owned.toLocaleString('de-CH')} im Bestand</span>
            </div>
            <p>${escapeHtml(vehicle.desc || 'Kaufbares Fahrzeug für den städtischen Fuhrpark.')}</p>
            <dl class="hf-v2-fleet-stats">
              <div><dt>Kapazität</dt><dd>${formatLoad(vehicle.load)}</dd></div>
              <div><dt>Kosten</dt><dd>${formatMoney(vehicle.cost)}</dd></div>
              <div><dt>Bestand</dt><dd>${owned.toLocaleString('de-CH')}</dd></div>
              <div><dt>Tempo</dt><dd>${formatSpeed(vehicle.speed)}</dd></div>
            </dl>
          </div>
          <button class="hf-v2-fleet-buy" type="button" data-action="buy-fleet-vehicle" data-city-id="${escapeHtml(cityId)}" data-vehicle-type="${escapeHtml(type)}"${disabledText}><span>${canAfford ? 'Kaufen' : 'Nicht leistbar'}</span><strong>${formatMoney(vehicle.cost)}</strong></button>
        </article>`;
    }).join('');
  }

  function renderFleetMenu(cityId) {
    const city = cityById(cityId);
    if (!city) return '<p class="hf-v2-fleet-empty">Stadt nicht gefunden.</p>';
    const cash = window.HFV2Save?.getCash?.() ?? 0;
    return `
      <div class="hf-v2-fleet-menu" data-fleet-city-id="${escapeHtml(city.id)}">
        <p class="hf-v2-fleet-eyebrow">Fuhrparkbeschaffung</p>
        <h3>Fahrzeuge für ${escapeHtml(city.name)}</h3>
        <div class="hf-v2-fleet-cash" aria-label="Verfügbares Kapital"><span>Kapital</span><strong>${formatMoney(cash)}</strong></div>
        <p class="hf-v2-fleet-hint">Kaufe Fahrzeuge und stationiere sie direkt in dieser Stadt. Käufe werden vom gemeinsamen V2-Kapital abgezogen.</p>
        <div class="hf-v2-fleet-grid">${vehicleRows(city.id)}</div>
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
