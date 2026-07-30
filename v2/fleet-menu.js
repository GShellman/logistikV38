(() => {
  'use strict';

  const MINUTES_PER_DAY = 1440;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[char]));
  }

  function formatMoney(value) { return `CHF ${Math.round(Number(value) || 0).toLocaleString('de-CH')}`; }
  function formatLoad(value) {
    const load = Number(value) || 0;
    return load >= 1000 ? `${(load / 1000).toLocaleString('de-CH', {maximumFractionDigits: 1})} t` : `${load.toLocaleString('de-CH', {maximumFractionDigits: 1})} t`;
  }
  function formatSpeed(value) { return `${Math.round(Number(value) || 0).toLocaleString('de-CH')} km/h`; }
  function formatDailyCost(vehicle) { return `${formatMoney(Number(vehicle.daily) || Math.round((Number(vehicle.kmCost) || 0) * 100))} / Tag`; }
  function formatCapacity(item, vehicleType, count = 1) {
    const cargo = item?.capacity || window.HFV2VehicleCapacity?.evaluate?.(vehicleType, [item], count);
    if (!cargo?.usage || !cargo?.capacity) return '';
    const tonnes = value => `${(Number(value || 0) / 1000).toLocaleString('de-CH', {minimumFractionDigits: 1, maximumFractionDigits: 1})} t`;
    return `${tonnes(cargo.usage.grossKg)}/${tonnes(cargo.capacity.grossKg)} · ${cargo.usage.palletSlots}/${cargo.capacity.palletSlots} Paletten · ${cargo.limitingFactor === 'volume' ? 'Volumenlimitiert' : 'Gewichtslimitiert'}`;
  }
  function citiesById() { return window.HFV2CitiesById || {}; }
  function cityById(cityId) { return citiesById()[cityId] || null; }
  function cityName(cityId) { return cityById(cityId)?.name || cityId || 'Unbekannt'; }
  function fleetApi() { return window.HFFleet || null; }
  function logisticsState() { return window.HFV2Logistics?.getState?.() || window.HFV2Save?.getState?.().logistics || {}; }
  function isCityUnlocked(cityId) { return cityId === 'zurich' || window.HFNetwork?.getState?.().cities?.[cityId]?.unlocked === true; }

  function formatAbsMinute(value) {
    const minute = Number(value);
    if (!Number.isFinite(minute)) return '–';
    const day = Math.floor(minute / MINUTES_PER_DAY) + 1;
    const inDay = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return `Tag ${day}, ${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(Math.floor(inDay % 60)).padStart(2, '0')}`;
  }

  function vehicleVisual(vehicleId, vehicle) {
    const image = window.HFV2VehicleAssets?.vehicleImage?.(vehicleId) || '';
    const fallback = window.HFV2VehicleAssets?.embeddedVehicleImage?.(vehicleId) || '';
    if (!image) return `<span class="hf-v2-fleet-card__emoji">${escapeHtml(vehicle.icon || '🚚')}</span>`;
    return `<img class="hf-v2-fleet-card__image" src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async"${fallback ? ` onerror="this.onerror=null;this.src='${escapeHtml(fallback)}';"` : ''}>`;
  }

  function unlockedCities() {
    return Object.values(citiesById()).filter(city => city?.id && isCityUnlocked(city.id)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
  }

  function depotSelect(selectedCityId = '') {
    return `<fieldset class="hf-v2-choice-field hf-v2-fleet-depot"><legend>Initiales Depot</legend><div class="hf-v2-choice-cards">${unlockedCities().map(city => `<label class="hf-v2-choice-card"><input type="radio" name="fleetDepot" data-fleet-depot value="${escapeHtml(city.id)}"${city.id === selectedCityId ? ' checked' : ''}><span aria-hidden="true">📍</span><b>${escapeHtml(city.name)}</b><small>Erster Standort</small></label>`).join('')}</div><small>Das gewählte Depot wird als erster realer Fahrzeugstandort gespeichert.</small></fieldset>`;
  }

  function fleetInventory(cityId = null) {
    const api = fleetApi();
    if (!api) return '<p class="hf-v2-fleet-empty">Der zentrale Fahrzeugbestand ist nicht geladen.</p>';
    const fleet = api.getFleetSummary?.(cityId ? {cityId} : {})?.byType || {};
    const vehicles = api.VEHICLES || {};
    const rows = (api.VEHICLE_TYPES || Object.keys(vehicles)).map(type => ({type, vehicle: vehicles[type] || {icon: '🚚'}, owned: Number(fleet[type]) || 0}));
    const total = rows.reduce((sum, row) => sum + row.owned, 0);
    return `<section class="hf-v2-fleet-overview" aria-label="Zentrale Bestandsübersicht"><div class="hf-v2-fleet-section-head"><span>${cityId ? `Standort ${escapeHtml(cityName(cityId))}` : 'Gesamtbestand'}</span><strong>${total.toLocaleString('de-CH')} Fahrzeuge</strong></div><div class="hf-v2-fleet-inventory-strip">${rows.map(row => `<article class="hf-v2-fleet-inventory-tile${row.owned ? '' : ' is-empty'}"><div class="hf-v2-fleet-inventory-tile__icon" aria-hidden="true">${vehicleVisual(row.type, row.vehicle)}</div><div><b>${escapeHtml(row.vehicle.name || row.type)}</b><strong>${row.owned.toLocaleString('de-CH')}</strong></div></article>`).join('')}</div></section>`;
  }

  function assignmentFor(vehicle, state) {
    return [...(state.shipments || []), ...(state.assignments || [])].find(item => item?.id === vehicle.activeAssignmentId) || null;
  }

  function nextLegFor(vehicle, plan) {
    return (plan?.legs || []).filter(leg => leg?.status === 'planned' && leg.vehicleIds?.includes(vehicle.id)).sort((a, b) => a.departureAbsMinute - b.departureAbsMinute)[0] || null;
  }

  function vehicleLocation(vehicle, assignment) {
    const from = assignment?.fromCityId || vehicle.routeSegment?.fromCityId;
    const to = assignment?.toCityId || vehicle.routeSegment?.toCityId;
    return vehicle.activeAssignmentId && from && to ? `${cityName(from)} → ${cityName(to)}` : cityName(vehicle.currentCityId);
  }

  function fleetVehicles(cityId = null) {
    const api = fleetApi();
    const vehicles = api?.getState?.().vehicles || [];
    const filtered = cityId ? vehicles.filter(vehicle => vehicle.currentCityId === cityId || vehicle.routeSegment?.fromCityId === cityId || vehicle.routeSegment?.toCityId === cityId) : vehicles;
    if (!filtered.length) return '<p class="hf-v2-fleet-empty">Keine Fahrzeuge in dieser Ansicht.</p>';
    const state = logisticsState();
    const plan = window.HFV2FleetDispatch?.ensurePlan?.() || state.dispatchPlan;
    const now = Number(window.HFV2Time?.getAbsoluteMinute?.() ?? window.HFV2Time?.getState?.().absoluteMinute) || 0;
    return `<section class="hf-v2-fleet-live" aria-label="Fahrzeuge nach Typ, Standort und Status"><div class="hf-v2-fleet-section-head"><span>Fahrzeugdisposition</span><strong>${filtered.length.toLocaleString('de-CH')} Einheiten</strong></div><div class="hf-v2-fleet-deployments">${filtered.map(vehicle => {
      const spec = api.VEHICLES?.[vehicle.vehicleType] || {};
      const assignment = assignmentFor(vehicle, state);
      const next = nextLegFor(vehicle, plan);
      const target = assignment?.toCityId || vehicle.routeSegment?.toCityId;
      const arrival = assignment?.arrivalAbsMinute ?? vehicle.availableAbsMinute;
      const departure = Number(assignment?.departureAbsMinute ?? vehicle.routeSegment?.departureAbsMinute ?? now);
      const progress = vehicle.activeAssignmentId && Number(arrival) > departure ? Math.max(0, Math.min(100, ((now - departure) / (Number(arrival) - departure)) * 100)) : 0;
      const cargo = assignment?.amountKg ?? assignment?.loadKg ?? vehicle.cargoKg ?? 0;
      return `<article class="hf-v2-deployment-card"><div class="hf-v2-deployment-card__visual">${vehicleVisual(vehicle.vehicleType, spec)}</div><div class="hf-v2-deployment-card__body"><header><span><b>${escapeHtml(vehicle.licensePlate || 'Ohne Kennzeichen')}</b><small>${escapeHtml(spec.name || vehicle.vehicleType)}</small></span><span class="hf-v2-fleet-status is-${escapeHtml(vehicle.status)}">${vehicle.status === 'available' ? 'Verfügbar' : vehicle.status === 'returning' ? 'Rückfahrt' : 'Im Einsatz'}</span></header><strong class="hf-v2-deployment-route">${escapeHtml(vehicleLocation(vehicle, assignment))}</strong><div class="hf-v2-deployment-meta"><span>📦 ${cargo ? formatLoad(cargo) : 'Keine Ladung'}</span><time>🕒 ${vehicle.activeAssignmentId ? formatAbsMinute(arrival) : 'Bereit'}</time></div><div class="hf-v2-deployment-progress" role="progressbar" aria-label="Fahrtfortschritt" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><i style="width:${progress.toFixed(1)}%"></i></div><small>${vehicle.activeAssignmentId ? `${Math.round(progress)} % der Strecke` : next ? `Nächste Fahrt ${cityName(next.fromCityId)} → ${cityName(next.toCityId)}` : 'Kein Einsatz geplant'}</small><details><summary>Technische Details</summary><dl><div><dt>Fahrzeug-ID</dt><dd>#${escapeHtml(vehicle.id)}</dd></div><div><dt>Assignment</dt><dd>${escapeHtml(assignment?.id || vehicle.activeAssignmentId || '–')}</dd></div><div><dt>Ziel-ID</dt><dd>${escapeHtml(target || '–')}</dd></div><div><dt>Verfügbar</dt><dd>${formatAbsMinute(Math.max(Number(vehicle.availableAbsMinute) || 0, Number(next?.arrivalAbsMinute) || 0))}</dd></div></dl></details></div></article>`;
    }).join('')}</div></section>`;
  }

  const PLAN_REASONS = {'no-on-time-vehicle': 'kein Fahrzeug rechtzeitig verfügbar', 'capacity-invalid': 'Kapazität unzureichend', 'no-route': 'keine Route', 'stock-limited': 'Ware nicht verfügbar', 'route-overloaded': 'Route ausgelastet', 'repositioning-overloaded': 'keine Kapazität für Leerfahrt'};
  function planningPreview() {
    const state = logisticsState();
    const plan = window.HFV2FleetDispatch?.ensurePlan?.() || state.dispatchPlan || {legs: [], unplanned: []};
    const orders = new Map((state.orders || []).map(order => [Number(order.id), order]));
    const loaded = (plan.legs || []).filter(leg => leg.type === 'shipment' && leg.status === 'planned');
    const empty = (plan.legs || []).filter(leg => leg.type === 'repositioning' && leg.status === 'planned');
    const unplanned = plan.unplanned || [];
    const rows = (items, kind) => items.map(item => { const order = orders.get(Number(item.orderId)); const from = item.fromCityId || order?.fromCityId; const to = item.toCityId || order?.toCityId; const capacity = item.type === 'shipment' ? formatCapacity(item, item.vehicleType, item.vehicleIds?.length || 1) : ''; return `<li><b>${kind}</b><span>${escapeHtml(cityName(from))} → ${escapeHtml(cityName(to))}${capacity ? `<small>${escapeHtml(capacity)}</small>` : ''}</span><time>${formatAbsMinute(item.departureAbsMinute)}</time>${item.reason ? `<strong>${escapeHtml(PLAN_REASONS[item.reason] || item.reason)}</strong>` : ''}</li>`; }).join('');
    return `<section class="hf-v2-fleet-plan" aria-label="Planungsvorschau"><div class="hf-v2-fleet-section-head"><span>Planungsvorschau</span><strong>${loaded.length} beladen · ${empty.length} leer · ${unplanned.length} nicht erfüllbar</strong></div><div class="hf-v2-fleet-plan-columns"><div><h4>Beladene Fahrten</h4><ul>${rows(loaded, 'Beladen') || '<li>Keine geplanten Fahrten.</li>'}</ul></div><div><h4>Notwendige Leerfahrten</h4><ul>${rows(empty, 'Leerfahrt') || '<li>Keine Leerfahrten notwendig.</li>'}</ul></div><div><h4>Nicht erfüllbare Aufträge</h4><ul>${rows(unplanned, 'Nicht erfüllbar') || '<li>Alle Aufträge erfüllbar.</li>'}</ul></div></div></section>`;
  }

  function vehicleRows(cityId = null) {
    const api = fleetApi();
    if (!api) return '<p class="hf-v2-fleet-empty">Der Fahrzeugkatalog ist nicht geladen.</p>';
    const fleet = api.getFleetSummary?.({})?.byType || {};
    const cash = window.HFV2Save?.getCash?.() ?? 0;
    return (api.VEHICLE_TYPES || []).map(type => {
      const vehicle = api.VEHICLES?.[type]; if (!vehicle) return '';
      const canAfford = cash >= (Number(vehicle.cost) || 0);
      const vehicleName = vehicle.name || type;
      const depotContext = cityId ? `Depot ${cityName(cityId)}` : 'das gewählte Depot';
      const buyLabel = `${vehicleName} für ${formatMoney(vehicle.cost)} für ${depotContext} kaufen${canAfford ? '' : ' – nicht genug Kapital'}`;
      return `<article class="hf-v2-fleet-card${canAfford ? '' : ' is-disabled'}"><div class="hf-v2-fleet-card__icon" aria-hidden="true">${vehicleVisual(type, vehicle)}</div><div class="hf-v2-fleet-card__main"><div class="hf-v2-fleet-card__head"><h4>${escapeHtml(vehicleName)}</h4><span class="hf-v2-fleet-owned">${Number(fleet[type] || 0).toLocaleString('de-CH')} zentral im Bestand</span></div><p>${escapeHtml(vehicle.desc || 'Kaufbares Fahrzeug für den zentral disponierten Fuhrpark.')}</p><dl class="hf-v2-fleet-stats"><div><dt>Kapazität</dt><dd>${formatLoad(vehicle.load)} · ${Number(vehicle.palletSlots || 0).toLocaleString('de-CH')} Paletten</dd></div><div><dt>Kosten</dt><dd>${formatMoney(vehicle.cost)}</dd></div><div><dt>Tempo</dt><dd>${formatSpeed(vehicle.speed)}</dd></div><div><dt>Betriebskosten</dt><dd>${formatDailyCost(vehicle)}</dd></div></dl></div><button class="hf-v2-fleet-buy" type="button" data-action="buy-fleet-vehicle" data-vehicle-type="${escapeHtml(type)}" aria-label="${escapeHtml(buyLabel)}"${canAfford ? '' : ' disabled aria-disabled="true" title="Nicht genug Kapital"'}><span>Kaufen</span><i aria-hidden="true">→</i><strong>${formatMoney(vehicle.cost)}</strong></button></article>`;
    }).join('');
  }

  function renderFleetMenu(cityId = null) {
    const city = cityId ? cityById(cityId) : null;
    if (cityId && !city) return '<p class="hf-v2-fleet-empty">Stadt nicht gefunden.</p>';
    const cash = window.HFV2Save?.getCash?.() ?? 0;
    return `<div class="hf-v2-fleet-menu" data-fleet-city-id="${escapeHtml(cityId || '')}"><section class="hf-v2-fleet-hero" aria-label="Zentrale Fuhrparkübersicht"><div class="hf-v2-fleet-hero__mark" aria-hidden="true">V2</div><div><p class="hf-v2-fleet-eyebrow">${city ? `Standortfilter: ${escapeHtml(city.name)}` : 'Alle Standorte'}</p><h3>Zentraler Fuhrpark</h3><p class="hf-v2-fleet-subline">Fahrzeuge standortübergreifend beschaffen, überwachen und vorausplanen.</p></div></section><div class="hf-v2-fleet-toolbar"><div class="hf-v2-fleet-tabs"><button class="is-active" type="button">Straße</button><button type="button" disabled>Schiene</button><button type="button" disabled>Spezial</button>${city ? '<button type="button" data-action="show-central-fleet">Alle Standorte</button>' : ''}</div><div class="hf-v2-fleet-cash"><span>Kapital</span><strong>${formatMoney(cash)}</strong></div></div><div class="hf-v2-fleet-info-row"><p class="hf-v2-fleet-hint"><span aria-hidden="true">i</span>${city ? 'Diese Stadtansicht filtert den zentralen Fuhrpark nach aktuellem Standort oder berührter Strecke.' : 'Alle Fahrzeuge werden zentral disponiert; Städte sind Standorte, keine getrennten Fuhrparks.'}</p></div>${fleetInventory(cityId)}${fleetVehicles(cityId)}${planningPreview()}<section class="hf-v2-fleet-purchase"><div class="hf-v2-fleet-section-head"><span>Zentrale Beschaffung</span><strong>Erststandort erforderlich</strong></div>${depotSelect(city?.id || '')}<div class="hf-v2-fleet-grid">${vehicleRows(cityId)}</div></section><div class="hf-v2-fleet-footer"><span><strong>Zentral disponiert</strong><small>Über alle Standorte</small></span><span><strong>Explizites Depot</strong><small>Als erster Standort gespeichert</small></span><span><strong>Gemeinsames Kapital</strong><small>Ein Budget für die Flotte</small></span></div></div>`;
  }

  function refreshFleetMenu(cityId = null) { window.HFV2Modal?.setModalBody?.(renderFleetMenu(cityId)); }
  function bindFleetMenuEvents() {
    document.addEventListener('click', event => {
      const centralButton = event.target.closest?.('[data-action="show-central-fleet"]');
      if (centralButton) { event.preventDefault(); refreshFleetMenu(null); return; }
      const button = event.target.closest?.('[data-action="buy-fleet-vehicle"]'); if (!button) return;
      const modalBody = document.getElementById('hfV2ModalBody'); if (modalBody && !modalBody.contains(button)) return;
      event.preventDefault();
      const menu = button.closest('[data-fleet-city-id]');
      const depotId = menu?.querySelector('[data-fleet-depot]:checked')?.value;
      if (!depotId) { menu?.querySelector('[data-fleet-depot]')?.focus(); return; }
      const result = fleetApi()?.buyVehicle?.(depotId, button.dataset.vehicleType);
      if (result?.ok) refreshFleetMenu(menu?.dataset.fleetCityId || null);
    });
  }
  function openFleet(cityId = null) {
    const city = cityId ? cityById(cityId) : null; if (cityId && !city) return;
    window.HFV2Modal?.openModal?.({className: 'hf-v2-fleet-modal', title: 'Zentraler Fuhrpark', subtitle: city ? `Standort ${city.name}` : 'Alle Standorte', bodyHtml: renderFleetMenu(cityId)});
  }
  function openCityFleetForCity(cityId) { openFleet(cityId); }
  function openCentralFleet() { openFleet(null); }

  bindFleetMenuEvents();
  window.HFV2FleetMenu = {openCentralFleet, openCityFleetForCity, renderFleetMenu, refreshFleetMenu};
})();
