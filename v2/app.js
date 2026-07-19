(() => {
  'use strict';

  const SWISS_BOUNDS = [[45.72, 5.72], [47.88, 10.72]];
  const MAP_CENTER = [46.82, 8.25];
  const MARKER_SIZE = {normal: 30, small: 22};

  let selectedId = null;
  let map = null;
  let savePackage = null;
  let networkState = null;
  let liveTimer = null;
  let citiesById = {};
  const markerById = new Map();

  function normaliseCity(raw) {
    const coordinates = raw.coordinates || {};
    return {
      id: String(raw.id || '').trim(),
      name: String(raw.name || raw.id || 'Unbekannter Ort'),
      lat: Number(raw.lat ?? coordinates.lat),
      lng: Number(raw.lng ?? coordinates.lng),
      tier: Number(raw.tier) || 1,
      slots: Number(raw.slots) || 0,
      population: Number(raw.population) || 0,
      wealthFactor: Number(raw.wealthFactor) || 1,
      demandProfile: String(raw.demandProfile || 'standard'),
    };
  }

  function loadCities() {
    return (window.HF_CITY_CATALOG || [])
      .map(normaliseCity)
      .filter(city => city.id && Number.isFinite(city.lat) && Number.isFinite(city.lng))
      .sort((a, b) => a.name.localeCompare(b.name, 'de-CH'));
  }

  function formatPopulation(value) {
    return value ? value.toLocaleString('de-CH') : 'nicht angegeben';
  }

  function tierLabel(tier) {
    if (tier >= 3) return 'Stufe 3 · Zentrum';
    if (tier === 2) return 'Stufe 2 · Regionalort';
    return 'Stufe 1 · kleiner Ort';
  }

  function fact(label, value) {
    return `<div class="hf-v2-fact"><dt>${label}</dt><dd>${value}</dd></div>`;
  }

  function formatCurrency(value) {
    return `CHF ${Math.max(0, Number(value) || 0).toLocaleString('de-CH', {maximumFractionDigits: 2})}`;
  }

  function formatDailyKg(value) {
    const kg = Math.max(0, Number(value) || 0);
    if (kg >= 1000) return `${(kg / 1000).toLocaleString('de-CH', {maximumFractionDigits: 1})} t/Tag`;
    return `${kg.toLocaleString('de-CH', {maximumFractionDigits: kg >= 10 ? 0 : 1})} kg/Tag`;
  }

  function goodIcon(good) {
    const src = window.HFV2GoodsAssets?.goodImage?.(good.id);
    return src ? `<img src="${src}" alt="" aria-hidden="true">` : `<span aria-hidden="true">${escapeHtml(good.icon || '📦')}</span>`;
  }

  function v2DemandRows(city) {
    const demandMap = window.HFV2Goods?.getCityDailyDemandMap?.(city.id) || {};
    return Object.entries(demandMap).map(([goodId, dailyKg]) => ({
      good: goodById(goodId),
      demand: {need: dailyKg, dailyRate: 1},
      dailyKg: Math.max(0, Number(dailyKg) || 0),
    })).filter(row => row.dailyKg > 0).sort((a, b) => b.dailyKg - a.dailyKg || a.good.name.localeCompare(b.good.name, 'de-CH'));
  }


  function formatWeightKg(value) {
    const kg = Math.max(0, Number(value) || 0);
    if (kg >= 1000) return `${(kg / 1000).toLocaleString('de-CH', {maximumFractionDigits: 1})} t`;
    return `${kg.toLocaleString('de-CH', {maximumFractionDigits: kg >= 10 ? 0 : 1})} kg`;
  }

  function goodById(goodId) {
    return (window.HFV2GoodsCatalog || []).find(good => good.id === goodId) || {id: goodId, name: goodId, icon: '📦'};
  }

  function formatGoodAmount(goodId, kg) {
    const good = goodById(goodId);
    const unit = good.unit || {unit: 'kg', kgPerUnit: 1};
    const kgPerUnit = Math.max(Number(unit.kgPerUnit) || 1, 0.000001);
    const amount = (Number(kg) || 0) / kgPerUnit;
    if (unit.unit === 'kg') return formatWeightKg(kg);
    if (unit.unit === 't') return `${amount.toLocaleString('de-CH', {maximumFractionDigits: 1})} t`;
    return `${amount.toLocaleString('de-CH', {maximumFractionDigits: amount >= 10 ? 0 : 1})} ${unit.unit}`;
  }

  function cityInventoryMarkup(cityId) {
    const inventory = window.HFV2Goods?.getCityInventory?.(cityId) || {};
    const rows = Object.entries(inventory).filter(([, kg]) => Number(kg) > 0.001).sort(([a], [b]) => goodById(a).name.localeCompare(goodById(b).name, 'de-CH'));
    return rows.length ? `<div class="hf-v2-inventory-grid">${rows.map(([goodId, kg]) => {
      const good = goodById(goodId);
      return `<article class="hf-v2-inventory-good"><div class="hf-v2-demand-icon">${goodIcon(good)}</div><div><b>${escapeHtml(good.name)}</b><span>${formatGoodAmount(goodId, kg)} · ${formatWeightKg(kg)}</span></div></article>`;
    }).join('')}</div>` : '<p class="hf-v2-muted hf-v2-inventory-empty">📦 Lager leer</p>';
  }

  function inventorySectionMarkup(city) {
    window.HFV2Goods?.ensureCityInventory?.(city.id);
    const usedKg = window.HFV2Goods?.getUsedCapacityKg?.(city.id) || 0;
    const capacityKg = window.HFV2Goods?.getCapacityKg?.(city.id) || 0;
    const fill = capacityKg > 0 ? Math.min(100, Math.max(0, usedKg / capacityKg * 100)) : 0;
    return `<section class="hf-v2-demand-card hf-v2-inventory-card" aria-labelledby="hfV2InventoryTitle"><div class="hf-v2-demand-head"><div><p class="hf-v2-kicker">Güter / Lager</p><h3 id="hfV2InventoryTitle">Lager</h3></div><strong>${formatWeightKg(usedKg)}</strong></div><div class="hf-v2-inventory-capacity"><span><i style="width:${fill}%"></i></span><small>${formatWeightKg(usedKg)} von ${formatWeightKg(capacityKg)} belegt</small></div>${cityInventoryMarkup(city.id)}</section>`;
  }

  function currentTimeState() {
    return window.HFV2Time?.getState?.() || window.HFV2Save?.getState?.().time || {day: 1, hour: 0, minute: 0};
  }

  function timeDay(time) {
    return Math.max(1, Math.trunc(Number(time?.day) || 1));
  }

  function timeMinuteOfDay(time) {
    const hour = Math.min(23, Math.max(0, Math.trunc(Number(time?.hour) || 0)));
    const minute = Math.min(59, Math.max(0, Math.trunc(Number(time?.minute) || 0)));
    return hour * 60 + minute;
  }

  function projectedEndOfDayStockKg(cityId, goodId, currentInventoryKg, dailyDemandKg) {
    const time = currentTimeState();
    const remainingMinutes = Math.max(0, 1440 - timeMinuteOfDay(time));
    const remainingDemandKg = Math.max(0, Number(dailyDemandKg) || 0) * (remainingMinutes / 1440);
    return Math.max(0, Math.max(0, Number(currentInventoryKg) || 0) - remainingDemandKg);
  }

  function demandPanel(city) {
    const rows = v2DemandRows(city);
    const total = rows.reduce((sum, row) => sum + row.dailyKg, 0);
    const inventory = window.HFV2Goods?.getCityInventory?.(city.id) || {};
    return `<section class="hf-v2-demand-card" aria-labelledby="hfV2DemandTitle"><div class="hf-v2-demand-head"><div><p class="hf-v2-kicker">Tagesbedarf</p><h3 id="hfV2DemandTitle">Alle Waren</h3></div><strong>${formatDailyKg(total)}</strong></div>${rows.length ? `<div class="hf-v2-demand-compact-grid">${rows.map(row => { const inventoryKg = Math.max(0, Number(inventory[row.good.id]) || 0); const projectedKg = projectedEndOfDayStockKg(city.id, row.good.id, inventoryKg, row.dailyKg); const coverage = row.dailyKg > 0 ? Math.min(100, projectedKg / row.dailyKg * 100) : 100; const salePrice = window.HFV2Goods?.salePriceForCity?.(city, row.good.id) ?? (Number(row.good.price) || 0); return `<article class="hf-v2-demand-tile"><div class="hf-v2-demand-icon">${goodIcon(row.good)}</div><div class="hf-v2-demand-tile__body"><b>${escapeHtml(row.good.name)}</b><strong>${formatDailyKg(row.dailyKg)}</strong><div class="hf-v2-demand-price"><small>Verkaufspreis</small><b>${formatCurrency(salePrice)}/kg</b></div><span class="hf-v2-demand-tile__bar"><i style="width:${coverage}%"></i></span><small class="hf-v2-muted">Prognose Tagesende: ${formatGoodAmount(row.good.id, projectedKg)}</small></div></article>`; }).join('')}</div>` : '<p class="hf-v2-muted">Für diese Stadt gibt es noch keinen berechneten Warenbedarf.</p>'}</section>`;
  }

  function factoryById(factoryId) {
    const id = String(factoryId || '').trim();
    return (window.HFV2FactoryCatalog || []).find(factory => factory.id === id) || null;
  }

  function factoryRecipeOptions(factory) {
    const recipes = Array.isArray(factory?.recipes) ? factory.recipes : [];
    if (recipes.length) return recipes.map(recipe => ({
      id: recipe.id || factory.id,
      name: recipe.name || factory.name,
      outputs: recipe.outputs || recipe.output || {},
    }));
    return [{id: factory?.id, name: factory?.name, outputs: factory?.outputs || factory?.output || {}}];
  }

  function factoryDailyCapacityKg(factory) {
    return factoryRecipeOptions(factory).reduce((sum, recipe) => sum + Object.values(recipe.outputs || {}).reduce((recipeSum, kg) => recipeSum + Math.max(0, Number(kg) || 0), 0), 0);
  }

  function factoryOutputsText(factory, outputMultiplier = 1) {
    const totals = {};
    for (const recipe of factoryRecipeOptions(factory)) {
      for (const [goodId, kg] of Object.entries(recipe.outputs || {})) {
        totals[goodId] = (Number(totals[goodId]) || 0) + Math.max(0, Number(kg) || 0) * Math.max(1, Number(outputMultiplier) || 1);
      }
    }
    const entries = Object.entries(totals).filter(([, kg]) => kg > 0);
    if (!entries.length) return 'Keine Outputs im Katalog';
    return entries.map(([goodId, kg]) => `${escapeHtml(goodById(goodId).name)} ${formatDailyKg(kg)}`).join(' · ');
  }

  function factoryOperatingDailyCost() {
    const factoryApi = window.HFV2Factories;
    const catalog = window.HFV2FactoryCatalog || [];
    const state = factoryApi?.getState?.();
    const cityFactories = state?.cityFactories || {};
    return Object.values(cityFactories).flat().reduce((sum, factoryId) => {
      const factory = catalog.find(item => item.id === factoryId);
      return sum + Math.max(0, Number(factory?.maintenance ?? factory?.dailyCost ?? factory?.operatingCost ?? 0) || 0);
    }, 0);
  }

  function networkDailyCost() {
    return (networkState?.connections || []).reduce((sum, connection) => sum + Math.max(0, Number(connection?.maintenance) || 0), 0);
  }

  function financeSummaryMarkup() {
    const cash = window.HFV2Save?.getCash?.() ?? 0;
    const networkCost = networkDailyCost();
    const factoryCost = factoryOperatingDailyCost();
    return `<section class="hf-v2-finance-hero" aria-label="Finanzübersicht"><div><p class="hf-v2-kicker">Finanzen</p><h3>Kontostand</h3><strong>${formatCurrency(cash)}</strong></div><div class="hf-v2-city-kpi-grid"><span><small>Netzunterhalt</small><b>${formatCurrency(networkCost)}/Tag</b></span><span><small>Fabrikbetrieb</small><b>${formatCurrency(factoryCost)}/Tag</b></span></div></section>`;
  }


  function productionDebugMarkup(city) {
    if (!window.HFV2_DEBUG_PRODUCTION) return '';
    const rows = window.HFV2Goods?.productionDebugRows?.(city.id) || [];
    if (!rows.length) return '';
    return `<section class="hf-v2-production-debug" aria-label="Lokale Produktionsplanung"><div class="hf-v2-demand-head"><div><p class="hf-v2-kicker">Debug</p><h3>Produktionsplanung · Eigenbedarf</h3></div><strong>${rows.length.toLocaleString('de-CH')}</strong></div><div class="hf-v2-production-debug-grid">${rows.map(row => {
      const good = goodById(row.goodId);
      const blockers = row.blockers?.length ? `<em>Blocker: ${row.blockers.map(escapeHtml).join(', ')}</em>` : '<small>Keine Blocker erkannt</small>';
      return `<article class="hf-v2-production-debug-row"><b>${escapeHtml(good.name || row.goodId)}</b><span><small>Lokaler Bedarf</small>${formatGoodAmount(row.goodId, row.localDemandKg)}</span><span><small>Exportbedarf</small>${formatGoodAmount(row.goodId, row.exportDemandKg)}</span><span><small>Zielbestand</small>${formatGoodAmount(row.goodId, row.targetDemandKg)}</span><span><small>Bestand</small>${formatGoodAmount(row.goodId, row.stockKg)}</span><span><small>Produktionsplan</small>${formatGoodAmount(row.goodId, row.plannedProductionKg)}</span>${blockers}</article>`;
    }).join('')}</div></section>`;
  }

  function factoryProductionMarkup(city) {
    const builtFactories = window.HFV2Factories?.getCityFactoryInstances?.(city.id) || (window.HFV2Factories?.getCityFactories?.(city.id) || []).map((factoryId, index) => ({id: factoryId, index}));
    if (!builtFactories.length) return '<section class="hf-v2-demand-card hf-v2-factory-production-list" aria-labelledby="hfV2FactoryProductionTitle"><div class="hf-v2-demand-head"><div><p class="hf-v2-kicker">Produktion</p><h3 id="hfV2FactoryProductionTitle">Fabriken in dieser Stadt</h3></div></div><p class="hf-v2-muted">Keine Fabriken gebaut.</p></section>' + productionDebugMarkup(city);
    const rows = builtFactories.map(factoryInstance => {
      const factory = factoryById(factoryInstance.id) || {id: factoryInstance.id, name: factoryInstance.id, icon: '🏭'};
      const estimate = window.HFV2Goods?.estimateCityFactoryProduction?.(city.id, factoryInstance);
      const capacityKg = Math.max(0, Number(estimate?.upgradeAdjustedCapacityKg) || factoryDailyCapacityKg(factory));
      const outputMultiplier = Math.max(1, Number(estimate?.outputMultiplier) || 1);
      const actualKg = Math.max(0, Number(estimate?.madeKg) || 0);
      const fill = capacityKg > 0 ? Math.min(100, actualKg / capacityKg * 100) : 0;
      const status = estimate?.reason === 'demand-limited' ? 'Nachfrage gedeckt' : estimate?.reason === 'capacity-limited' ? 'Lager voll' : estimate?.reason === 'input-limited' ? 'Inputs fehlen' : estimate?.reason === 'no-output' ? 'Kein Output' : 'Potenzial heute';
      return `<article class="hf-v2-factory-production-item"><div class="hf-v2-factory-production-head"><span>${escapeHtml(factory.icon || '🏭')}</span><div><b>${escapeHtml(factory.name || factory.id)}</b><small>${factoryOutputsText(factory, outputMultiplier)}</small></div></div><div class="hf-v2-factory-production-bar"><span><i style="width:${fill}%"></i></span><small>${formatDailyKg(actualKg)} von ${formatDailyKg(capacityKg)} · ${status}</small></div></article>`;
    }).join('');
    return `<section class="hf-v2-demand-card hf-v2-factory-production-list" aria-labelledby="hfV2FactoryProductionTitle"><div class="hf-v2-demand-head"><div><p class="hf-v2-kicker">Produktion</p><h3 id="hfV2FactoryProductionTitle">Fabriken in dieser Stadt</h3></div><strong>${builtFactories.length.toLocaleString('de-CH')}</strong></div>${rows}</section>${productionDebugMarkup(city)}`;
  }


  function cityName(cityId) {
    const id = String(cityId || '').trim();
    return citiesById[id]?.name || id || 'Unbekannte Stadt';
  }

  function vehicleLabel(vehicleType) {
    const type = String(vehicleType || '').trim();
    const spec = window.HFFleet?.VEHICLES?.[type] || window.HFVehicleCatalog?.VEHICLE_CATALOG?.[type] || null;
    return spec ? `${spec.icon || '🚚'} ${spec.name || type}` : (type || 'Fahrzeug');
  }

  function formatClockTime(hour, minute) {
    const h = Math.max(0, Math.min(23, Math.trunc(Number(hour) || 0)));
    const m = Math.max(0, Math.min(59, Math.trunc(Number(minute) || 0)));
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  function formatAbsMinute(absMinute) {
    const total = Math.max(0, Math.trunc(Number(absMinute) || 0));
    const day = Math.floor(total / 1440) + 1;
    const minuteOfDay = total % 1440;
    return `Tag ${day.toLocaleString('de-CH')} · ${formatClockTime(Math.floor(minuteOfDay / 60), minuteOfDay % 60)}`;
  }

  function shipmentProgressPercent(shipment) {
    const isReturnTrip = shipment?.status === 'returning';
    const start = Number(isReturnTrip ? shipment?.returnDepartureAbsMinute : shipment?.departureAbsMinute);
    const end = Number(isReturnTrip ? shipment?.returnArrivalAbsMinute : shipment?.arrivalAbsMinute);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return shipment?.status === 'active' || shipment?.status === 'returning' ? 0 : 100;
    const now = window.HFV2Logistics?.absoluteMinute?.(currentTimeState()) || 0;
    return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
  }

  function dispatchResultLabel(result) {
    const code = String(result || 'wartet');
    return {
      created: 'Transport gestartet',
      'stock-limited': 'Zu wenig Ware im Quelllager',
      'no-route': 'Keine Straßenroute',
      'no-vehicle': 'Kein Fahrzeug verfügbar',
      'not-enough-vehicles': 'Zu wenige Fahrzeuge',
      'route-overloaded': 'Straße zur Uhrzeit überlastet',
      wartet: 'Wartet auf Abfahrtszeit',
    }[code] || code;
  }

  function orderCardMarkup(order) {
    const good = goodById(order.goodId);
    const dispatchResult = order.lastDispatchResult || 'wartet';
    const dispatchAbsMinute = Number(order.lastDispatchAbsMinute);
    const dispatchTimeMarkup = Number.isFinite(dispatchAbsMinute) ? `<span><small>Letzter Versuch</small>${formatAbsMinute(dispatchAbsMinute)}</span>` : '';
    const warningClass = dispatchResult === 'stock-limited' ? ' hf-v2-logistics-row--warning' : '';
    return `<article class="hf-v2-production-debug-row hf-v2-logistics-row${warningClass}"><b>${escapeHtml(cityName(order.fromCityId))} → ${escapeHtml(cityName(order.toCityId))}</b><span><small>Ware</small>${escapeHtml(good.name || order.goodId)}</span><span><small>Menge</small>${formatGoodAmount(order.goodId, order.amountKg)} · ${formatWeightKg(order.amountKg)}</span><span><small>Frequenz</small>${order.frequency === 'weekly' ? 'wöchentlich' : 'täglich'}</span><span><small>Uhrzeit</small>${formatClockTime(order.departureHour, order.departureMinute)}</span><span><small>Fahrzeugtyp</small>${escapeHtml(vehicleLabel(order.vehicleType))}</span><span><small>Status</small>${order.enabled === false ? 'Inaktiv' : 'Aktiv'}</span><span><small>Versand</small>${escapeHtml(dispatchResultLabel(dispatchResult))}</span>${dispatchTimeMarkup}<span><small>Aktion</small><button type="button" data-hf-v2-order-toggle="${order.id}">${order.enabled === false ? 'Aktivieren' : 'Deaktivieren'}</button> <button type="button" data-hf-v2-order-delete="${order.id}">Löschen</button></span></article>`;
  }

  function shipmentStatusLabel(shipment) {
    return {
      active: 'Unterwegs',
      returning: 'Rückfahrt',
      returned: 'Zurück',
      delivered: 'Geliefert',
      failed: 'Fehlgeschlagen',
      partial: 'Teilweise geliefert',
    }[shipment?.status] || shipment?.status || 'Unterwegs';
  }

  function shipmentCardMarkup(shipment) {
    const good = goodById(shipment.goodId);
    const progress = shipmentProgressPercent(shipment);
    const isReturnTrip = shipment.status === 'returning';
    const arrivalAbsMinute = isReturnTrip ? shipment.returnArrivalAbsMinute : shipment.arrivalAbsMinute;
    const arrivalLabel = isReturnTrip ? 'Rückkehr' : 'Ankunft';
    return `<article class="hf-v2-production-debug-row hf-v2-logistics-row"><b>${escapeHtml(good.name || shipment.goodId)}</b><span><small>Menge</small>${formatGoodAmount(shipment.goodId, shipment.amountKg)} · ${formatWeightKg(shipment.amountKg)}</span><span><small>Fahrzeuge</small>${(Number(shipment.vehicleCount) || 0).toLocaleString('de-CH')} × ${escapeHtml(vehicleLabel(shipment.vehicleType))}</span><span><small>Fortschritt</small>${progress.toLocaleString('de-CH', {maximumFractionDigits: 0})}%</span><span><small>${arrivalLabel}</small>${formatAbsMinute(arrivalAbsMinute)}</span><span><small>Status</small>${escapeHtml(shipmentStatusLabel(shipment))}</span></article>`;
  }


  function shipmentCalendarDayKey(absMinute) {
    const total = Math.max(0, Math.trunc(Number(absMinute) || 0));
    const day = Math.floor(total / 1440) + 1;
    return `Tag ${day.toLocaleString('de-CH')}`;
  }

  function shipmentCalendarTimeLabel(absMinute) {
    const total = Math.max(0, Math.trunc(Number(absMinute) || 0));
    const minuteOfDay = total % 1440;
    return formatClockTime(Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  }

  function shipmentCalendarOrderAbsMinute(order) {
    const logisticsApi = window.HFV2Logistics;
    const nextDue = logisticsApi?.nextOrderDueAbsMinute?.(order, currentTimeState());
    if (Number.isFinite(Number(nextDue))) return Number(nextDue);

    const time = currentTimeState();
    const currentDay = timeDay(time);
    const currentDayMinute = timeMinuteOfDay(time);
    const departureHour = Math.max(0, Math.min(23, Math.trunc(Number(order?.departureHour) || 0)));
    const departureMinute = Math.max(0, Math.min(59, Math.trunc(Number(order?.departureMinute) || 0)));
    const departureDayMinute = departureHour * 60 + departureMinute;
    const lastDispatchedDay = Number.isFinite(Number(order?.lastDispatchedDay)) ? Math.trunc(Number(order.lastDispatchedDay)) : null;
    let dueDay = currentDay;

    if (order?.frequency === 'weekly') {
      dueDay = currentDay + ((7 - ((currentDay - 1) % 7)) % 7);
      if (lastDispatchedDay === dueDay || (dueDay === currentDay && currentDayMinute >= departureDayMinute)) dueDay += 7;
    } else if (lastDispatchedDay === currentDay || currentDayMinute >= departureDayMinute) {
      dueDay += 1;
    }

    return (Math.max(1, dueDay) - 1) * 1440 + departureDayMinute;
  }

  function shipmentCalendarRows(city, shipments, orders) {
    const cityId = city?.id;
    const relevantShipments = (Array.isArray(shipments) ? shipments : [])
      .filter(shipment => shipment?.fromCityId === cityId || shipment?.toCityId === cityId)
      .map(shipment => {
        const departure = Number(shipment.departureAbsMinute);
        const arrival = Number(shipment.arrivalAbsMinute);
        return {
          id: `shipment-${shipment.id}`,
          orderId: shipment.orderId,
          kind: shipment.status === 'returned' || shipment.status === 'delivered' ? 'delivered' : 'active',
          sortAbsMinute: Number.isFinite(departure) ? departure : arrival,
          departureAbsMinute: departure,
          arrivalAbsMinute: arrival,
          fromCityId: shipment.fromCityId,
          toCityId: shipment.toCityId,
          goodId: shipment.goodId,
          amountKg: shipment.amountKg,
          vehicleType: shipment.vehicleType,
          vehicleCount: shipment.vehicleCount,
          returnDepartureAbsMinute: Number(shipment.returnDepartureAbsMinute),
          returnArrivalAbsMinute: Number(shipment.returnArrivalAbsMinute),
          status: shipmentStatusLabel(shipment),
        };
      })
      .filter(row => Number.isFinite(row.sortAbsMinute));

    const activeOrderIds = new Set(relevantShipments.filter(row => row.kind === 'active').map(row => String(row.orderId)));
    const plannedOrders = (Array.isArray(orders) ? orders : [])
      .filter(order => (order?.fromCityId === cityId || order?.toCityId === cityId) && !activeOrderIds.has(String(order.id)))
      .map(order => {
        const departureAbsMinute = shipmentCalendarOrderAbsMinute(order);
        return {
          id: `order-${order.id}`,
          orderId: order.id,
          kind: 'planned',
          sortAbsMinute: departureAbsMinute,
          departureAbsMinute,
          arrivalAbsMinute: null,
          fromCityId: order.fromCityId,
          toCityId: order.toCityId,
          goodId: order.goodId,
          amountKg: order.amountKg,
          vehicleType: order.vehicleType,
          vehicleCount: null,
          status: order.enabled === false ? 'Geplant · inaktiv' : `Geplant · ${dispatchResultLabel(order.lastDispatchResult || 'wartet')}`,
        };
      })
      .filter(row => Number.isFinite(row.sortAbsMinute));

    return [...relevantShipments, ...plannedOrders].sort((a, b) => a.sortAbsMinute - b.sortAbsMinute || String(a.id).localeCompare(String(b.id), 'de-CH'));
  }

  function shipmentCalendarMarkup(city) {
    const logistics = window.HFV2Logistics?.getState?.() || {orders: [], shipments: []};
    const rows = shipmentCalendarRows(city, logistics.shipments, logistics.orders);
    if (!rows.length) return '<p class="hf-v2-muted">Keine Transporte oder geplanten Bestellungen.</p>';

    const groups = new Map();
    for (const row of rows) {
      const dayKey = shipmentCalendarDayKey(row.sortAbsMinute);
      if (!groups.has(dayKey)) groups.set(dayKey, []);
      groups.get(dayKey).push(row);
    }

    return `<div class="hf-v2-transport-calendar">${Array.from(groups.entries()).map(([dayKey, dayRows]) => `<section class="hf-v2-transport-calendar__day"><h4 class="hf-v2-transport-calendar__day-title">${escapeHtml(dayKey)}</h4>${dayRows.map(row => {
      const good = goodById(row.goodId);
      const eventClass = `hf-v2-transport-calendar__event hf-v2-transport-calendar__event--${row.kind}`;
      const arrivalLabel = row.status === 'Rückfahrt' && Number.isFinite(Number(row.returnArrivalAbsMinute)) ? `Rückkehr ${shipmentCalendarTimeLabel(row.returnArrivalAbsMinute)}` : (Number.isFinite(Number(row.arrivalAbsMinute)) ? shipmentCalendarTimeLabel(row.arrivalAbsMinute) : 'wartet');
      const vehicleText = row.vehicleCount ? `${Number(row.vehicleCount).toLocaleString('de-CH')} × ${vehicleLabel(row.vehicleType)}` : vehicleLabel(row.vehicleType);
      return `<article class="hf-v2-transport-calendar__slot"><time class="hf-v2-transport-calendar__time" datetime="${escapeHtml(String(row.sortAbsMinute))}"><strong>${escapeHtml(shipmentCalendarTimeLabel(row.departureAbsMinute))}</strong><span>bis ${escapeHtml(arrivalLabel)}</span></time><div class="${eventClass}"><div><b>${escapeHtml(cityName(row.fromCityId))} → ${escapeHtml(cityName(row.toCityId))}</b><span>${escapeHtml(good.name || row.goodId)}</span></div><dl><div><dt>Ware</dt><dd>${escapeHtml(good.name || row.goodId)}</dd></div><div><dt>Menge</dt><dd>${formatGoodAmount(row.goodId, row.amountKg)} · ${formatWeightKg(row.amountKg)}</dd></div><div><dt>Fahrzeuge</dt><dd>${escapeHtml(vehicleText)}</dd></div><div><dt>Status</dt><dd>${escapeHtml(row.status)}</dd></div></dl></div></article>`;
    }).join('')}</section>`).join('')}</div>`;
  }

  function logisticsListMarkup(items, emptyText, rowMarkup) {
    return items.length ? `<div class="hf-v2-production-debug-grid">${items.map(rowMarkup).join('')}</div>` : `<p class="hf-v2-muted">${emptyText}</p>`;
  }

  function cityLogisticsSectionMarkup(city) {
    const logistics = window.HFV2Logistics?.getState?.() || {orders: [], shipments: []};
    const orders = Array.isArray(logistics.orders) ? logistics.orders : [];
    const shipments = Array.isArray(logistics.shipments) ? logistics.shipments : [];
    const incomingOrders = orders.filter(order => order.toCityId === city.id);
    const outgoingOrders = orders.filter(order => order.fromCityId === city.id);
    const calendarRows = shipmentCalendarRows(city, shipments, orders);
    const total = incomingOrders.length + outgoingOrders.length + calendarRows.length;
    return `<section class="hf-v2-demand-card hf-v2-city-logistics" aria-labelledby="hfV2LogisticsTitle"><div class="hf-v2-demand-head"><div><p class="hf-v2-kicker">Warenlogistik</p><h3 id="hfV2LogisticsTitle">Warenlogistik</h3></div><strong>${total.toLocaleString('de-CH')}</strong></div><h4>Eingehende Bestellungen</h4>${logisticsListMarkup(incomingOrders, 'Keine eingehenden Bestellungen.', orderCardMarkup)}<h4>Ausgehende Bestellungen</h4>${logisticsListMarkup(outgoingOrders, 'Keine ausgehenden Bestellungen.', orderCardMarkup)}<h4>Transportkalender</h4>${shipmentCalendarMarkup(city)}</section>`;
  }

  function isCityUnlocked(cityId) {
    const id = String(cityId || '').trim();
    return id === 'zurich' || networkState?.cities?.[id]?.unlocked === true;
  }


  function selectedClass(city) {
    return selectedId === city.id ? ' selected' : '';
  }

  function cityLabel(city) {
    if (city.tier >= 3) return '◆';
    if (city.tier === 2) return '●';
    return '•';
  }

  function cityIcon(city) {
    const small = city.tier === 1;
    const size = small ? MARKER_SIZE.small : MARKER_SIZE.normal;
    const anchor = Math.round(size / 2);
    const classes = [
      'city-marker',
      isCityUnlocked(city.id) ? 'unlocked' : 'locked',
      small ? 'small-town' : '',
      city.id === 'zurich' ? 'hub' : '',
      selectedClass(city).trim(),
    ].filter(Boolean).join(' ');

    return L.divIcon({
      className: '',
      html: `<div id="mk-${city.id}" class="${classes}">${cityLabel(city)}</div>`,
      iconSize: [size, size],
      iconAnchor: [anchor, anchor],
    });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '\"': '&quot;',
    }[char]));
  }

  function bindCityTooltip(marker, city) {
    marker.unbindTooltip();
    marker.bindTooltip(city.name, {
      permanent: city.tier >= 3 || city.id === selectedId,
      direction: 'top',
      offset: [0, -13],
      className: 'city-label',
    });
  }

  function refreshMarkers(cities) {
    for (const city of cities) {
      const marker = markerById.get(city.id);
      if (!marker) continue;
      marker.setIcon(cityIcon(city));
      bindCityTooltip(marker, city);
    }
  }

  function selectCity(city, cities) {
    selectedId = city.id;
    refreshMarkers(cities);

    document.getElementById('hfV2SelectedName').textContent = city.name;
    document.getElementById('hfV2SelectedIntro').textContent = 'Produktions- und Finanzübersicht für die markierte Stadt.';
    document.getElementById('hfV2Facts').innerHTML = [
      financeSummaryMarkup(),
      `<div class="hf-v2-city-kpi-grid">${fact('Kategorie', tierLabel(city.tier))}${fact('Bauplätze', city.slots.toLocaleString('de-CH'))}</div>`,
      factoryProductionMarkup(city),
      inventorySectionMarkup(city),
      cityLogisticsSectionMarkup(city),
      demandPanel(city),
    ].join('');
  }

  function openNetworkModalForCity(city) {
    window.HF_V2?.openNetworkMenuForCity?.(city?.id);
  }

  function renderMarkers(cities) {
    markerById.clear();
    for (const city of cities) {
      const marker = L.marker([city.lat, city.lng], {
        icon: cityIcon(city),
        keyboard: true,
        title: city.name,
        zIndexOffset: city.id === 'zurich' ? 500 : (city.tier === 1 ? 120 : 0),
      }).addTo(map);
      marker.on('click', () => {
        selectCity(city, cities);
        window.showCityActionMenu?.(city);
      });
      marker.on('keypress', event => {
        if (event.originalEvent?.key === 'Enter' || event.originalEvent?.key === ' ') {
          selectCity(city, cities);
          window.showCityActionMenu?.(city);
        }
      });
      bindCityTooltip(marker, city);
      markerById.set(city.id, marker);
    }
  }

  function bootMap(cities) {
    const mapError = document.getElementById('hfV2MapError');
    if (!window.L) {
      mapError.hidden = false;
      return false;
    }

    const bounds = L.latLngBounds(SWISS_BOUNDS);
    map = L.map('hfV2Map', {
      zoomControl: true,
      minZoom: 7,
      maxZoom: 13,
      preferCanvas: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
      maxBounds: bounds.pad(.08),
      maxBoundsViscosity: 1,
    }).setView(MAP_CENTER, 8);
    window.HFV2Map = map;
    window.HFV2CitiesById = citiesById;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      minZoom: 7,
      maxZoom: 13,
      maxNativeZoom: 18,
      noWrap: true,
      bounds,
      keepBuffer: 0,
      updateWhenIdle: true,
      updateWhenZooming: false,
      detectRetina: false,
      attribution: '© OpenStreetMap-Mitwirkende',
    }).addTo(map);

    window.initCityActionMenu?.({
      map,
      onNetworkClick: city => {
        window.hideCityActionMenu?.();
        openNetworkModalForCity(city);
      },
      onFleetClick: city => {
        window.hideCityActionMenu?.();
        if (isCityUnlocked(city.id)) window.HF_V2?.openCityFleetForCity?.(city.id);
      },
      onFactoryClick: city => {
        window.hideCityActionMenu?.();
        if (isCityUnlocked(city.id)) window.HFV2FactoryMenu?.openFactoryMenuForCity?.(city.id);
      },
    });

    window.HFV2IsCityUnlocked = isCityUnlocked;
    renderMarkers(cities);
    window.HFNetwork?.initNetworkLayer?.(map);
    window.HFV2LogisticsLayer?.initLogisticsLayer?.(map);
    if (networkState) {
      window.HFNetwork?.renderNetworkLines?.(networkState.connections, citiesById);
    }
    renderActiveShipments();
    map.fitBounds(bounds, {padding: [16, 16], animate: false});
    return true;
  }

  function renderCurrentNetworkLines() {
    if (!networkState) return;
    window.HFNetwork?.renderNetworkLines?.(networkState.connections, citiesById);
  }

  function renderActiveShipments() {
    const shipments = window.HFV2Logistics?.getState?.().shipments || [];
    window.HFV2LogisticsLayer?.renderActiveShipments?.(shipments, citiesById);
  }

  function refreshNetworkView() {
    renderCurrentNetworkLines();
    renderActiveShipments();
    refreshMarkers(Object.values(citiesById));
  }

  function refreshChangedStateView(event) {
    const reason = String(event?.detail?.reason || '');
    if (reason === 'time-advanced' || reason.startsWith('logistics-')) {
      refreshNetworkView();
      refreshSelectedCity();
    }
  }

  function setSaveStatus(message) {
    const status = document.getElementById('hfV2SaveStatus');
    if (status) status.textContent = message;
  }

  function setTimeStatus(message) {
    const status = document.getElementById('hfV2TimeStatus');
    if (status) status.textContent = message;
  }

  function renderClock() {
    const clock = document.getElementById('hfV2Clock');
    if (clock) clock.textContent = window.HFV2Time?.formatClock?.() || 'Mo · Tag 1 · 08:00';
  }

  function dailyCycleSummaryText(summary) {
    if (!summary) return 'Kein Tagesabschluss ausgelöst.';
    const sales = summary.sales || {};
    const production = summary.production || {};
    const sold = formatWeightKg(sales.soldKg);
    const revenue = formatCurrency(sales.revenue);
    const made = formatWeightKg(production.madeKg);
    const blocked = Number(production.blocked) || 0;
    const blockedText = blocked > 0 ? ` · ${blocked.toLocaleString('de-CH')} blockiert` : '';
    return `Tagesabschluss: ${sold} verkauft für ${revenue} · ${made} produziert${blockedText}.`;
  }

  function runWithDailyCycleSummary(action) {
    const originalDailyCycle = window.HFV2DayCycle?.runDailyCycle;
    const summaries = [];
    if (typeof originalDailyCycle === 'function') {
      window.HFV2DayCycle.runDailyCycle = function wrappedDailyCycle(...args) {
        const summary = originalDailyCycle.apply(this, args);
        summaries.push(summary);
        return summary;
      };
    }
    try {
      const time = action();
      const summary = window.HFV2DayCycle?.aggregateDailyCycleSummaries?.(summaries) || summaries[summaries.length - 1] || null;
      return {time, summary};
    } finally {
      if (typeof originalDailyCycle === 'function') window.HFV2DayCycle.runDailyCycle = originalDailyCycle;
    }
  }

  function refreshSelectedCity() {
    if (!selectedId) return;
    const city = citiesById[selectedId];
    if (city) selectCity(city, Object.values(citiesById));
  }

  function updateAdvanceStatus(label, summary) {
    renderClock();
    renderActiveShipments();
    refreshSelectedCity();
    const message = `${label}: ${window.HFV2Time?.formatClock?.() || ''}. ${dailyCycleSummaryText(summary)}`;
    setSaveStatus(message);
    setTimeStatus(message);
  }

  function renderLiveButton() {
    const liveButton = document.getElementById('hfV2LiveButton');
    if (!liveButton) return;
    const isLive = Boolean(liveTimer);
    liveButton.classList.toggle('is-live', isLive);
    liveButton.setAttribute('aria-pressed', String(isLive));
    liveButton.textContent = isLive ? '⏸ Pause' : '▶ Live';
  }

  function stopLiveTime(message = '') {
    if (liveTimer) {
      window.clearInterval(liveTimer);
      liveTimer = null;
    }
    renderLiveButton();
    if (message) setTimeStatus(message);
  }

  function liveTick() {
    const result = runWithDailyCycleSummary(() => window.HFV2Time?.advanceMinutes?.(1, {reason: 'time-live'}));
    renderClock();
    renderActiveShipments();
    refreshSelectedCity();
    const message = `Live läuft: ${window.HFV2Time?.formatClock?.() || ''}. ${dailyCycleSummaryText(result.summary)}`;
    setTimeStatus(message);
    if (result.summary) setSaveStatus(message);
  }

  function toggleLiveTime() {
    if (liveTimer) {
      stopLiveTime(`Live pausiert: ${window.HFV2Time?.formatClock?.() || ''}.`);
      return;
    }
    liveTick();
    liveTimer = window.setInterval(liveTick, 1000);
    renderLiveButton();
    setTimeStatus('Live läuft: 1 Spielminute pro Sekunde.');
  }


  function bindLogisticsPanelActions() {
    document.addEventListener('click', event => {
      const toggleButton = event.target?.closest?.('[data-hf-v2-order-toggle]');
      const deleteButton = event.target?.closest?.('[data-hf-v2-order-delete]');
      if (!toggleButton && !deleteButton) return;
      const id = Number(toggleButton?.dataset.hfV2OrderToggle || deleteButton?.dataset.hfV2OrderDelete || 0);
      if (!id) return;
      if (toggleButton) {
        const order = (window.HFV2Logistics?.getState?.().orders || []).find(entry => entry.id === id);
        window.HFV2Logistics?.setOrderEnabled?.(id, order?.enabled === false);
      } else {
        window.HFV2Logistics?.cancelOrder?.(id);
      }
      refreshNetworkView();
      refreshSelectedCity();
    });
  }

  function bindTimeControls() {
    const liveButton = document.getElementById('hfV2LiveButton');
    const nextHourButton = document.getElementById('hfV2NextHourButton');
    const nextDayButton = document.getElementById('hfV2NextDayButton');

    liveButton?.addEventListener('click', toggleLiveTime);

    nextHourButton?.addEventListener('click', () => {
      const result = runWithDailyCycleSummary(() => window.HFV2Time?.nextHour?.());
      updateAdvanceStatus('+1 Stunde', result.summary);
    });

    nextDayButton?.addEventListener('click', () => {
      const result = runWithDailyCycleSummary(() => window.HFV2Time?.endDay?.());
      updateAdvanceStatus('Tag beendet', result.summary);
    });
  }

  function configureGameSystems(cities) {
    window.HFV2Save?.configureState?.(savePackage);
    window.HFV2Time?.configure?.({state: savePackage.state.time});
    networkState = window.HFNetwork?.configure({state: savePackage.state.network, cities, citiesById});
    window.HFFleet?.configure?.({state: savePackage.state.fleet});
    window.HFV2Factories?.configure?.({state: savePackage.state.factories});
    window.HFV2Goods?.configure?.({state: savePackage.state.goods, cities});
    window.HFV2Logistics?.configure?.({state: savePackage.state.logistics, cities, citiesById});
  }

  function applySavePackage(nextPackage) {
    savePackage = window.HFV2Save?.hydrateState?.(nextPackage) || nextPackage;
    configureGameSystems(Object.values(citiesById));
    refreshNetworkView();
    renderClock();
    renderActiveShipments();
    refreshSelectedCity();
    return savePackage;
  }

  function bindSaveControls() {
    const saveButton = document.getElementById('hfV2SaveButton');
    const exportButton = document.getElementById('hfV2ExportButton');
    const importButton = document.getElementById('hfV2ImportButton');
    const importInput = document.getElementById('hfV2ImportInput');

    function exportCurrentSave(label) {
      savePackage = window.HFV2Save?.exportSave?.() || savePackage;
      setSaveStatus(`${label} am ${new Date(savePackage.savedAt).toLocaleString('de-CH')} als JSON-Datei bereitgestellt.`);
    }

    saveButton?.addEventListener('click', () => exportCurrentSave('Spielstand gespeichert'));
    exportButton?.addEventListener('click', () => exportCurrentSave('Spielstand exportiert'));
    importButton?.addEventListener('click', () => importInput?.click());
    importInput?.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        const imported = await window.HFV2Save.importSave(file);
        stopLiveTime();
        applySavePackage(imported);
        setSaveStatus(`Spielstand vom ${new Date(imported.savedAt).toLocaleString('de-CH')} importiert.`);
      } catch (error) {
        setSaveStatus(`Import fehlgeschlagen: ${error.message}`);
      } finally {
        importInput.value = '';
      }
    });
  }

  function boot() {
    const cities = loadCities();
    citiesById = Object.fromEntries(cities.map(city => [city.id, city]));
    savePackage = window.HFV2Save?.createDefaultState?.() || {state: {network: window.HFNetwork.createNetworkState({networkOriginNode: 'zurich', selected: 'zurich'}), fleet: window.HFFleet?.createFleetState?.(), factories: window.HFV2Factories?.createFactoryState?.(), goods: window.HFV2Goods?.createGoodsState?.(), time: window.HFV2Save?.defaultTimeState?.() || {day: 1, hour: 8, minute: 0}, logistics: window.HFV2Save?.defaultLogisticsState?.() || window.HFV2Logistics?.createLogisticsState?.() || {orders: [], shipments: [], nextOrderId: 1, nextShipmentId: 1, schemaVersion: 1}}};
    configureGameSystems(cities);
    document.getElementById('hfV2CityCount').textContent = `${cities.length.toLocaleString('de-CH')} Orte`;
    bindSaveControls();
    bindTimeControls();
    bindLogisticsPanelActions();
    renderClock();
    renderLiveButton();
    window.addEventListener('hf:network:confirmed', refreshNetworkView);
    window.addEventListener('hf:v2:state-changed', refreshChangedStateView);
    window.addEventListener('hf:v2:state-changed', renderClock);
    if (!bootMap(cities)) return;
    const zurich = cities.find(city => city.id === 'zurich');
    if (zurich) selectCity(zurich, cities);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once: true});
  } else {
    boot();
  }
})();
