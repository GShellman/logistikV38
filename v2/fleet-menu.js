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

  function isCityUnlocked(cityId) {
    const id = String(cityId || '').trim();
    return id === 'zurich' || window.HFNetwork?.getState?.().cities?.[id]?.unlocked === true;
  }

  function vehicleImage(vehicleId) {
    return window.HFV2VehicleAssets?.vehicleImage?.(vehicleId) || '';
  }

  function embeddedVehicleImage(vehicleId) {
    return window.HFV2VehicleAssets?.embeddedVehicleImage?.(vehicleId) || '';
  }

  function vehicleVisual(vehicleId, vehicle) {
    const image = vehicleImage(vehicleId);
    const fallbackImage = embeddedVehicleImage(vehicleId);
    const fallbackAttribute = fallbackImage
      ? ` onerror="this.onerror=null;this.src='${escapeHtml(fallbackImage)}';"`
      : '';
    if (!image) return `<span class="hf-v2-fleet-card__emoji">${escapeHtml(vehicle.icon || '🚚')}</span>`;
    return `<img class="hf-v2-fleet-card__image" src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async"${fallbackAttribute}>`;
  }


  const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

  function formatTime(value) {
    const minute = Math.max(0, Math.min(1439, Math.trunc(Number(value) || 0)));
    return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  }

  function formatQuantityKg(value) {
    const kg = Number(value) || 0;
    if (kg >= 1000) return `${(kg / 1000).toLocaleString('de-CH', {maximumFractionDigits: 1})} t`;
    return `${Math.round(kg).toLocaleString('de-CH')} kg`;
  }


  function statusInfo(status) {
    const normalized = String(status || 'planned').trim();
    const labels = {
      planned: {label: 'Geplant', title: 'Abfahrt geplant'},
      running: {label: 'Unterwegs', title: 'Ware ist abgefahren'},
      completed: {label: 'Angekommen', title: 'Ins Ziellager gebucht'},
      partial: {label: 'Teillieferung', title: 'Nur teilweise geliefert'},
      blocked: {label: 'Blockiert', title: 'Transport konnte nicht starten'},
      'waiting-production': {label: 'Wartet auf Produktion', title: 'Quelle produziert erst nach Tagesabschluss'},
    };
    return labels[normalized] || {label: normalized || 'Unbekannt', title: normalized || 'Unbekannter Status'};
  }

  function transportTimeLabel(entry) {
    if (entry.status === 'running' && entry.arrivalDay) return `Ankunft Tag ${entry.arrivalDay} · ${formatTime(entry.arrivalMinute)}`;
    if (entry.status === 'completed' || entry.status === 'partial') return entry.arrivalDay ? `Angekommen Tag ${entry.arrivalDay} · ${formatTime(entry.arrivalMinute)}` : 'Angekommen';
    if (entry.status === 'waiting-production' || entry.waitingForProduction === true) return 'Wartet auf Produktion';
    if (entry.status === 'blocked') return 'Blockiert';
    return `Abfahrt ${formatTime(entry.minute)}`;
  }

  function weekdayLabel(day) {
    const absoluteDay = Math.max(1, Math.trunc(Number(day) || 1));
    const weekday = WEEKDAYS[(absoluteDay - 1) % WEEKDAYS.length];
    return `Tag ${absoluteDay} · ${weekday}`;
  }

  function vehicleName(type) {
    return fleetApi()?.VEHICLES?.[type]?.name || type || '—';
  }

  function goodName(goodId) {
    return (window.HFV2GoodsCatalog || []).find(good => good.id === goodId)?.name || goodId || '—';
  }

  function cityName(cityId) {
    return cityById(cityId)?.name || cityId || '—';
  }

  function fleetInventory(cityId) {
    const api = fleetApi();
    if (!api) return '<p class="hf-v2-fleet-empty">Der Fahrzeugbestand ist nicht geladen.</p>';
    const fleet = api.getCityFleet?.(cityId) || {};
    const vehicles = api.VEHICLES || {};
    const types = api.VEHICLE_TYPES || Object.keys(vehicles);
    const rows = types.map(type => ({type, vehicle: vehicles[type] || {icon: '🚚'}, owned: Number(fleet[type]) || 0}));
    const total = rows.reduce((sum, row) => sum + row.owned, 0);
    return `
      <section class="hf-v2-fleet-overview" aria-label="Bestandsübersicht">
        <div class="hf-v2-fleet-section-head">
          <span>Bestand</span>
          <strong>${total.toLocaleString('de-CH')} Fahrzeuge</strong>
        </div>
        <div class="hf-v2-fleet-inventory-strip">
          ${rows.map(row => `
            <article class="hf-v2-fleet-inventory-tile${row.owned ? '' : ' is-empty'}">
              <div class="hf-v2-fleet-inventory-tile__icon" aria-hidden="true">${vehicleVisual(row.type, row.vehicle)}</div>
              <div><b>${escapeHtml(row.vehicle.name || row.type)}</b><strong>${row.owned.toLocaleString('de-CH')}</strong></div>
            </article>`).join('')}
        </div>
      </section>`;
  }

  function transportEntries(cityId) {
    const id = String(cityId || '').trim();
    const byKey = new Map();
    const add = (entry = {}) => {
      const sourceCityId = String(entry.sourceCityId || (entry.sourceType === 'city' ? entry.sourceId : '') || '').trim();
      const destinationCityId = String(entry.destinationCityId || entry.cityId || '').trim();
      if (sourceCityId !== id && destinationCityId !== id) return;
      const day = Math.max(1, Math.trunc(Number(entry.day ?? entry.scheduledDay ?? entry.deliveryDay) || 1));
      const minute = Math.max(0, Math.min(1439, Math.trunc(Number(entry.minute ?? entry.scheduledMinute ?? entry.deliveryMinute) || 0)));
      const normalized = {
        id: String(entry.id || `${entry.orderId || 'transport'}-${day}-${minute}-${sourceCityId}-${destinationCityId}`),
        day, minute, sourceCityId, destinationCityId,
        goodId: String(entry.goodId || '').trim(),
        quantityKg: Number(entry.quantityKg) || 0,
        tripCount: Array.isArray(entry.tripSegments) && entry.tripSegments.length ? entry.tripSegments.length : Math.max(1, Math.trunc(Number(entry.tripCount) || 1)),
        vehicleType: String(entry.vehicleType || '').trim(),
        status: String(entry.status || 'planned').trim(),
        arrivalDay: entry.arrivalDay ? Math.max(1, Math.trunc(Number(entry.arrivalDay) || 1)) : null,
        arrivalMinute: Math.max(0, Math.min(1439, Math.trunc(Number(entry.arrivalMinute) || 0))),
        message: String(entry.message || entry.statusMessage || '').trim(),
      };
      byKey.set(normalized.id, normalized);
    };
    (window.HFV2Transport?.getState?.().weekPlan || []).forEach(add);
    (window.HFV2Orders?.getState?.().deliveries || []).forEach(add);
    return [...byKey.values()].sort((a, b) => a.day - b.day || a.minute - b.minute || cityName(a.sourceCityId).localeCompare(cityName(b.sourceCityId), 'de-CH'));
  }

  function transportCalendar(cityId) {
    const entries = transportEntries(cityId);
    if (!entries.length) return `
      <section class="hf-v2-fleet-calendar" aria-label="Transport-Wochenplan">
        <div class="hf-v2-fleet-section-head"><span>Transportkalender</span><strong>Keine Einträge</strong></div>
        <p class="hf-v2-fleet-empty">Für diese Stadt sind noch keine Transporte als Quelle oder Ziel geplant.</p>
      </section>`;
    const groups = new Map();
    entries.forEach(entry => {
      const key = String(entry.day);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });
    return `
      <section class="hf-v2-fleet-calendar" aria-label="Transport-Wochenplan">
        <div class="hf-v2-fleet-section-head"><span>Transportkalender</span><strong>${entries.length.toLocaleString('de-CH')} Einträge</strong></div>
        <div class="hf-v2-fleet-calendar-grid">
          ${[...groups.entries()].map(([day, rows]) => `
            <article class="hf-v2-fleet-day-card">
              <h4>${escapeHtml(weekdayLabel(day))}</h4>
              ${rows.map(row => `
                <div class="hf-v2-fleet-transport-row">
                  <time>${formatTime(row.minute)}</time>
                  <span><b>${escapeHtml(goodName(row.goodId))}</b><small>${formatQuantityKg(row.quantityKg)}${row.tripCount > 1 ? ` · ${row.tripCount} Fahrten` : ''} · ${escapeHtml(cityName(row.sourceCityId))} → ${escapeHtml(cityName(row.destinationCityId))} · ${escapeHtml(transportTimeLabel(row))}${row.message ? ` · ${escapeHtml(row.message)}` : ''}</small></span>
                  <em>${escapeHtml(vehicleName(row.vehicleType))}</em>
                  <strong title="${escapeHtml(statusInfo(row.status).title)}">${escapeHtml(statusInfo(row.status).label)}</strong>
                </div>`).join('')}
            </article>`).join('')}
        </div>
      </section>`;
  }

  function vehicleRows(cityId) {
    const api = fleetApi();
    if (!api) return '<p class="hf-v2-fleet-empty">Der Fahrzeugkatalog ist nicht geladen.</p>';

    const fleet = api.getCityFleet?.(cityId) || {};
    const cash = window.HFV2Save?.getCash?.() ?? 0;
    const cityUnlocked = isCityUnlocked(cityId);
    const vehicleTypes = api.VEHICLE_TYPES || [];
    const vehicles = api.VEHICLES || {};

    if (!vehicleTypes.length) return '<p class="hf-v2-fleet-empty">Keine kaufbaren Fahrzeuge verfügbar.</p>';

    return vehicleTypes.map(type => {
      const vehicle = vehicles[type];
      if (!vehicle) return '';
      const owned = Number(fleet[type]) || 0;
      const canAfford = cash >= (Number(vehicle.cost) || 0);
      const canBuy = cityUnlocked && canAfford;
      const disabledTitle = cityUnlocked ? 'Nicht genug Kapital' : 'Stadt ist noch nicht ans Netz angebunden';
      const disabledText = canBuy ? '' : ` disabled aria-disabled="true" title="${escapeHtml(disabledTitle)}"`;
      const buttonLabel = cityUnlocked ? (canAfford ? 'Kaufen' : 'Nicht leistbar') : 'Stadt gesperrt';
      return `
        <article class="hf-v2-fleet-card${canBuy ? '' : ' is-disabled'}">
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
          <button class="hf-v2-fleet-buy" type="button" data-action="buy-fleet-vehicle" data-city-id="${escapeHtml(cityId)}" data-vehicle-type="${escapeHtml(type)}"${disabledText}><span>${buttonLabel}</span><strong>${formatMoney(vehicle.cost)}</strong><i aria-hidden="true">→</i></button>
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
        <div class="hf-v2-fleet-compact-panels">
          ${fleetInventory(city.id)}
          ${transportCalendar(city.id)}
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

  function refreshOpenFleetMenu() {
    const openCityId = document.querySelector('#hfV2ModalBody [data-fleet-city-id]')?.dataset?.fleetCityId;
    if (openCityId) refreshFleetMenu(openCityId);
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
    window.addEventListener('hf:v2:state-changed', event => {
      const reason = String(event.detail?.reason || '');
      if (reason.startsWith('transport-') || reason === 'order-created') refreshOpenFleetMenu();
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

  window.HFV2FleetMenu = {openCityFleetForCity, renderFleetMenu, refreshFleetMenu};
})();
