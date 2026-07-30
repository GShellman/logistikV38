(() => {
  'use strict';

  let map = null;
  let onNetworkClick = null;
  let onFleetClick = null;
  let onFactoryClick = null;
  let actionPopup = null;
  let activeCity = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    }[char]));
  }

  const ERROR_TEXTS = Object.freeze({
    'no-route': 'Keine Straßenroute.',
    'no-demand': 'Zielstadt braucht diese Ware nicht.',
    'no-vehicle': 'Dieser Fahrzeugtyp ist im Fuhrpark nicht vorhanden.',
    'stock-limited': 'Quelle hat nicht genug Ware.',
    'route-overloaded': 'Straße zur gewünschten Zeit voll.',
    'no-feasible-slot': 'Der Fahrzeugtyp ist vorhanden, aber im Planungshorizont nicht rechtzeitig verfügbar.',
    'unknown-frequency': 'Unbekannte Frequenz.',
    'incompatible-load-carrier': 'Fahrzeug und Ladungsträger sind nicht kompatibel.',
  });

  function stopLeafletPropagation(element) {
    if (!window.L?.DomEvent || !element) return;
    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);
  }

  function hideCityActionMenu() {
    if (actionPopup && map) map.closePopup(actionPopup);
    actionPopup = null;
    activeCity = null;
  }

  function handleMapClick() {
    hideCityActionMenu();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') hideCityActionMenu();
  }

  function actionPosition(index, total) {
    const safeTotal = Math.max(1, Number(total) || 1);
    const angle = -90 + (360 / safeTotal) * index;
    const radians = angle * Math.PI / 180;
    const radius = 42;
    const x = 50 + Math.cos(radians) * radius;
    const y = 50 + Math.sin(radians) * radius;
    return `style="--hf-action-x:${x.toFixed(3)}%;--hf-action-y:${y.toFixed(3)}%;"`;
  }

  function actionButton(action, label, city, index, total) {
    const image = window.HFV2CityActionAssets?.actionImage?.(action) || '';
    const icon = image
      ? `<img class="hf-v2-city-action-icon" src="${image}" alt="" aria-hidden="true">`
      : '<span class="hf-v2-city-action-icon" aria-hidden="true">📦</span>';
    return `
          <button class="hf-v2-city-action-button hf-v2-city-action-button--${action}" type="button" data-action="${action}" ${actionPosition(index, total)} aria-label="${label} für ${escapeHtml(city.name)} öffnen" title="${label}">
            ${icon}
          </button>`;
  }

  function isCityUnlocked(city) {
    return window.HFV2IsCityUnlocked?.(city?.id) === true;
  }

  function cityActions(city) {
    const actions = [
      {action: 'network', label: 'Netzwerkoptionen'},
      ...(isCityUnlocked(city) ? [
        {action: 'fleet', label: 'Fuhrpark'},
        {action: 'factory', label: 'Betriebe'},
        {action: 'order', label: 'Waren bestellen'},
      ] : []),
    ];
    return actions.map((item, index) => actionButton(item.action, item.label, city, index, actions.length)).join('');
  }


  function cityList() {
    return Object.values(window.HFV2CitiesById || {}).filter(city => city?.id && !city.isJunction);
  }

  function goodById(goodId) {
    return (window.HFV2GoodsCatalog || []).find(good => good.id === goodId) || window.HF_GOODS_DATABASE?.goods?.[goodId] || {id: goodId, name: goodId, icon: '📦'};
  }

  function vehicleSpec(vehicleType) {
    return window.HFFleet?.VEHICLES?.[vehicleType] || window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicleType] || {id: vehicleType, name: vehicleType, mode: 'road'};
  }

  function formatWeightKg(value) {
    const kg = Math.max(0, Number(value) || 0);
    if (kg >= 1000) return `${(kg / 1000).toLocaleString('de-CH', {maximumFractionDigits: 1})} t`;
    return `${kg.toLocaleString('de-CH', {maximumFractionDigits: kg >= 10 ? 0 : 1})} kg`;
  }

  function formatDurationHours(hours) {
    const minutes = Math.max(0, Math.round((Number(hours) || 0) * 60));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h} h ${m.toString().padStart(2, '0')} min` : `${m} min`;
  }

  function formatTime(hour, minute, addMinutes = 0) {
    const total = (Math.max(0, Math.trunc(Number(hour) || 0)) * 60) + Math.max(0, Math.trunc(Number(minute) || 0)) + Math.max(0, Math.round(Number(addMinutes) || 0));
    const dayOffset = Math.floor(total / 1440);
    const dayMinute = ((total % 1440) + 1440) % 1440;
    const label = `${Math.floor(dayMinute / 60).toString().padStart(2, '0')}:${(dayMinute % 60).toString().padStart(2, '0')}`;
    return dayOffset ? `${label} (+${dayOffset} Tag${dayOffset === 1 ? '' : 'e'})` : label;
  }

  function formatAbsMinute(value) {
    const minute = Math.max(0, Math.trunc(Number(value) || 0));
    const day = Math.floor(minute / 1440) + 1;
    const dayMinute = minute % 1440;
    return `Tag ${day}, ${String(Math.floor(dayMinute / 60)).padStart(2, '0')}:${String(dayMinute % 60).padStart(2, '0')}`;
  }

  function currentAbsMinute(hour, minute) {
    const time = window.HFV2Time?.getState?.() || window.HFV2Save?.getState?.().time || {day: 1};
    const day = Math.max(1, Math.trunc(Number(time.day) || 1));
    return (day - 1) * 1440 + Math.max(0, Math.trunc(Number(hour) || 0)) * 60 + Math.max(0, Math.trunc(Number(minute) || 0));
  }

  function addOutputGoodIds(targetSet, outputs) {
    if (!outputs) return;
    if (Array.isArray(outputs)) {
      outputs.forEach(output => {
        if (typeof output === 'string') targetSet.add(output);
        else if (output?.goodId) targetSet.add(String(output.goodId));
        else if (output?.id) targetSet.add(String(output.id));
      });
      return;
    }
    for (const [goodId, kg] of Object.entries(outputs || {})) {
      if (Math.max(0, Number(kg) || 0) > 0) targetSet.add(String(goodId));
    }
  }

  function factoryById(factoryId) {
    const id = String(factoryId || '').trim();
    if (!id) return null;
    return (window.HFV2FactoryCatalog || []).find(factory => factory?.id === id) || null;
  }

  function producedGoodIdsInUnlockedNetwork() {
    const producedGoodIds = new Set();
    const cityFactories = window.HFV2Factories?.getState?.().cityFactories || {};
    for (const [cityId, factoryIds] of Object.entries(cityFactories)) {
      if (!isCityUnlocked({id: cityId}) || !Array.isArray(factoryIds)) continue;
      for (const factoryId of factoryIds) {
        const factory = factoryById(factoryId);
        if (!factory) continue;
        addOutputGoodIds(producedGoodIds, factory.outputs);
        addOutputGoodIds(producedGoodIds, factory.output);
        for (const recipe of Array.isArray(factory.recipes) ? factory.recipes : []) {
          addOutputGoodIds(producedGoodIds, recipe?.outputs);
          addOutputGoodIds(producedGoodIds, recipe?.output);
        }
      }
    }
    return producedGoodIds;
  }

  function demandOptions(targetId) {
    const producedGoodIds = producedGoodIdsInUnlockedNetwork();
    return Object.entries(window.HFV2Goods?.getCityDailyDemandMap?.(targetId) || {})
      .filter(([goodId, kg]) => producedGoodIds.has(String(goodId)) && Math.max(0, Number(kg) || 0) > 0)
      .sort((a, b) => goodById(a[0]).name.localeCompare(goodById(b[0]).name, 'de-CH'));
  }

  function sourceOptions(targetId) {
    return cityList()
      .filter(city => city.id !== targetId && isCityUnlocked(city) && window.HFNetwork?.findPath?.(city.id, targetId, {mode: 'road'})?.reachable === true)
      .sort((a, b) => a.name.localeCompare(b.name, 'de-CH'));
  }

  function vehicleOptions(sourceId) {
    if (!sourceId) return [];
    const time = window.HFV2Time?.getState?.() || window.HFV2Save?.getState?.().time || {};
    const now = currentAbsMinute(time.hour, time.minute);
    const counts = new Map();
    for (const vehicle of window.HFFleet?.getState?.().vehicles || []) {
      const spec = vehicleSpec(vehicle.vehicleType);
      if (spec?.mode !== 'road') continue;
      const futureCityId = vehicle.routeSegment?.toCityId || vehicle.currentCityId;
      const canReachSource = futureCityId === sourceId || window.HFNetwork?.findPath?.(futureCityId, sourceId, {mode: 'road'})?.reachable === true;
      if (!canReachSource) continue;
      const item = counts.get(vehicle.vehicleType) || {type: vehicle.vehicleType, nowCount: 0, totalCount: 0, spec};
      item.totalCount += 1;
      if (vehicle.currentCityId === sourceId && vehicle.status === 'available' && !vehicle.activeAssignmentId && Number(vehicle.availableAbsMinute || 0) <= now) item.nowCount += 1;
      counts.set(vehicle.vehicleType, item);
    }
    return [...counts.values()]
      .filter(item => item.spec?.mode === 'road')
      .sort((a, b) => String(a.spec.name || a.type).localeCompare(String(b.spec.name || b.type), 'de-CH'));
  }

  function vehicleOptionLabel(item) {
    return `${item.spec.icon || '🚚'} ${item.spec.name || item.type} · jetzt ${item.nowCount} verfügbar · insgesamt/voraussichtlich ${item.totalCount} verfügbar · ${formatWeightKg(window.HFV2Logistics?.vehicleCapacityKg?.(item.type) || 0)}`;
  }

  function option(value, label, selected = false) {
    return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }

  function choiceCards(name, entries, label, className = '') {
    return `<fieldset class="hf-v2-choice-field ${className}"><legend>${escapeHtml(label)}</legend><div class="hf-v2-choice-cards">${entries.map((entry, index) => `<label class="hf-v2-choice-card"><input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(entry.value)}"${entry.selected || (!entries.some(item => item.selected) && index === 0) ? ' checked' : ''}><span aria-hidden="true">${escapeHtml(entry.icon || '◆')}</span><b>${escapeHtml(entry.label)}</b>${entry.detail ? `<small>${escapeHtml(entry.detail)}</small>` : ''}</label>`).join('')}</div></fieldset>`;
  }

  function vehicleCards(vehicles, selectedType = '') {
    return choiceCards('vehicleType', vehicles.map(item => ({value: item.type, selected: item.type === selectedType, icon: item.spec.icon || '🚚', label: item.spec.name || item.type, detail: `jetzt ${item.nowCount} verfügbar · insgesamt/voraussichtlich ${item.totalCount} verfügbar · ${formatWeightKg(window.HFV2Logistics?.vehicleCapacityKg?.(item.type) || 0)}`})), 'Fahrzeugtyp', 'hf-v2-vehicle-choices');
  }

  function orderModalBody(targetCity) {
    const sources = sourceOptions(targetCity.id);
    const demands = demandOptions(targetCity.id);
    const sourceId = sources[0]?.id || '';
    const vehicles = vehicleOptions(sourceId);
    const demandHint = demands.length ? '' : '<p class="hf-v2-network-empty">Keine bestellbaren Waren: Baue zuerst eine passende Produktionsstätte.</p>';
    return `
      <form class="hf-v2-network-menu" id="hfV2OrderForm" data-target-id="${escapeHtml(targetCity.id)}">
        <p class="hf-v2-network-hint">Zielstadt: <strong>${escapeHtml(targetCity.name)}</strong></p>
        <p class="hf-v2-network-hint">Produktion startet beim nächsten Tageswechsel / Produktionszyklus.</p>
        <label>Quellstadt<select name="fromCityId">${sources.map(city => option(city.id, city.name)).join('')}</select></label>
        <label>Ware<select name="goodId">${demands.map(([goodId, kg]) => option(goodId, `${goodById(goodId).name} · Tagesbedarf ${formatWeightKg(kg)}`)).join('')}</select></label>
        ${demandHint}
        ${choiceCards('frequency', [{value: 'daily', label: 'Täglich', icon: '☀️', selected: true}, {value: 'weekly', label: 'Wöchentlich', icon: '7'}], 'Frequenz')}
        ${choiceCards('packagingStrategy', [{value: 'automatic', label: 'Automatisch', icon: '✨', selected: true}, {value: 'pallet', label: 'Palette', icon: '▦'}, {value: 'swap-body', label: 'Wechselbehälter', icon: '▣'}], 'Verpackung')}
        <label id="hfV2OrderWeekday" hidden>Wochentag<select name="weekday" required disabled>${['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'].map((label, index) => option(index, label)).join('')}</select></label>
        <div id="hfV2VehicleChoices">${vehicleCards(vehicles)}</div>
        <div class="hf-v2-network-option__rows" id="hfV2OrderPreview"></div>
        <p class="hf-v2-network-empty" id="hfV2OrderError" hidden></p>
        <button class="hf-v2-network-back" type="submit" style="padding:12px 14px;font-weight:900;">Waren bestellen</button>
      </form>`;
  }

  function setSelectOptions(select, entries) {
    if (select) select.innerHTML = entries.join('');
  }

  function collectOrderForm(form) {
    return {
      fromCityId: form.elements.fromCityId?.value || '',
      toCityId: form.dataset.targetId || '',
      goodId: form.elements.goodId?.value || '',
      frequency: form.elements.frequency?.value || 'daily',
      weekday: form.elements.frequency?.value === 'weekly' ? Number(form.elements.weekday?.value) : null,
      vehicleType: form.elements.vehicleType?.value || '',
      packagingStrategy: form.elements.packagingStrategy?.value || 'automatic',
    };
  }

  function previewOrder(form) {
    const data = collectOrderForm(form);
    const error = form.querySelector('#hfV2OrderError');
    const preview = form.querySelector('#hfV2OrderPreview');
    const weekdayField = form.querySelector('#hfV2OrderWeekday');
    if (weekdayField) weekdayField.hidden = data.frequency !== 'weekly';
    if (form.elements.weekday) form.elements.weekday.disabled = data.frequency !== 'weekly';
    const vehicles = vehicleOptions(data.fromCityId);
    const vehicleContainer = form.querySelector('#hfV2VehicleChoices');
    const availableTypes = vehicles.map(item => item.type);
    if (!availableTypes.includes(data.vehicleType) && vehicleContainer) vehicleContainer.innerHTML = vehicleCards(vehicles, vehicles[0]?.type);
    data.vehicleType = form.elements.vehicleType?.value || '';
    const demand = Math.max(0, Number(window.HFV2Goods?.getCityDailyDemandMap?.(data.toCityId)?.[data.goodId]) || 0);
    const inventoryKg = Math.max(0, Number(window.HFV2Goods?.getCityInventory?.(data.fromCityId)?.[data.goodId]) || 0);
    const exportableKg = Math.max(0, Number(window.HFV2Goods?.getExportableStockKg?.(data.fromCityId, data.goodId)) || 0);
    let amountKg = 0;
    try {
      amountKg = Math.max(0, Number(window.HFV2Logistics?.plannedOrderAmountKg?.(data.toCityId, data.goodId, data.frequency)) || 0);
    } catch (error) {
      amountKg = 0;
    }
    const schedule = amountKg > 0 && data.vehicleType ? window.HFV2Logistics?.findOrderSchedule?.({...data, amountKg}) : {ok: false, reason: demand <= 0 ? 'no-demand' : 'no-vehicle'};
    const path = schedule?.path;
    const trips = schedule?.vehicleCount || 0;
    const packagingAlternatives = schedule?.packagingAlternatives || window.HFV2Logistics?.packagingAlternatives?.({...data, amountKg, path}) || [];
    const warnings = [];
    if (demand <= 0) warnings.push('no-demand');
    if (!schedule?.ok && !warnings.includes(schedule?.reason)) warnings.push(schedule?.reason || 'no-feasible-slot');
    const previewOrderRecord = schedule?.ok ? {
      ...data, id: 'order-preview', amountKg, enabled: true, lastDispatchedDay: null,
      plannedDepartureAbsMinute: schedule.departureAbsMinute,
      departureHour: Math.floor((schedule.departureAbsMinute % 1440) / 60),
      departureMinute: schedule.departureAbsMinute % 60,
    } : null;
    const previewPlan = previewOrderRecord ? window.HFV2FleetDispatch?.previewOrder?.(previewOrderRecord, {
      fromAbsMinute: Math.max(0, schedule.departureAbsMinute - 1), horizonDays: data.frequency === 'weekly' ? 14 : 7,
    }) : null;
    const previewLegs = (previewPlan?.legs || []).filter(leg => String(leg.orderId) === 'order-preview');
    const calendar = previewOrderRecord ? window.HFV2ShipmentCalendar?.markup?.({id: data.toCityId}, {
      state: window.HFV2Logistics?.getState?.(), extraLegs: previewLegs,
    }) : '';
    if (preview) preview.innerHTML = `
      <span><em>Menge</em><strong>${formatWeightKg(amountKg)}</strong></span>
      <span><em>Bestand Quelle</em><strong>${formatWeightKg(inventoryKg)}</strong></span>
      <span><em>Tatsächlich exportierbar</em><strong>${formatWeightKg(exportableKg)}</strong></span>
      ${schedule?.stockProducedBeforeDeparture ? `<span><em>Nächste Produktion</em><strong>Fehlende ${formatWeightKg(Math.max(0, amountKg - exportableKg))} werden erst beim nächsten Produktionszyklus hergestellt.</strong></span>` : ''}
      <span><em>Fahrzeuge</em><strong>${trips || '–'}</strong></span>
      <div class="hf-v2-order-preview-alternatives"><h4>Verpackungsalternativen</h4>${packagingAlternatives.map(item => `<span><em>${escapeHtml(item.label)}${item.strategy === schedule?.packagingStrategy ? ' · gewählt' : ''}</em><strong>${item.compatible ? `${item.vehicleCount} Fahrzeug${item.vehicleCount === 1 ? '' : 'e'} · ${(item.utilization * 100).toLocaleString('de-CH', {maximumFractionDigits: 0})}% Auslastung · ${formatDurationHours(item.durationHours)} · CHF ${item.costs.total.toLocaleString('de-CH', {maximumFractionDigits: 2})}` : 'Nicht kompatibel'}</strong></span>`).join('')}</div>
      <span><em>Route</em><strong>${path?.reachable ? `${(Number(path.distance) || 0).toLocaleString('de-CH', {maximumFractionDigits: 1})} km · ${formatDurationHours(path.duration)}` : ERROR_TEXTS['no-route']}</strong></span>
      <span><em>Abfahrt</em><strong>${schedule?.ok ? formatAbsMinute(schedule.departureAbsMinute) : '–'}</strong></span>
      <span><em>Ankunft</em><strong>${schedule?.ok ? formatAbsMinute(schedule.arrivalAbsMinute) : '–'}</strong></span>
      <span><em>Bündelung</em><strong>${schedule?.bundle ? `Mit Bestellung #${schedule.bundle.orderId} · Score ${schedule.bundle.score}` : 'Keine kompatible Bündelung'}</strong></span>
      ${warnings.length ? `<span><em>Warnungen</em><strong>${warnings.map(code => ERROR_TEXTS[code]).join(' ')}</strong></span>` : ''}
      ${calendar ? `<div class="hf-v2-order-preview-calendar"><h4>Vorschau Transportkalender</h4>${calendar}</div>` : ''}`;
    if (error) {
      error.hidden = !warnings.length;
      error.textContent = warnings.length ? warnings.map(code => `${code}: ${ERROR_TEXTS[code]}`).join(' ') : '';
    }
    return {data, warnings};
  }

  function bindOrderModal(targetCity) {
    const form = document.getElementById('hfV2OrderForm');
    if (!form) return;
    form.addEventListener('change', () => previewOrder(form));
    form.addEventListener('input', () => previewOrder(form));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const {data, warnings} = previewOrder(form);
      if (warnings.length) return;
      try {
        window.HFV2Logistics?.createOrder?.(data);
        window.HFV2Modal?.closeModal?.();
      } catch (error) {
        const errorElement = form.querySelector('#hfV2OrderError');
        if (errorElement) {
          errorElement.hidden = false;
          const code = error?.reason || error?.message;
          errorElement.textContent = ERROR_TEXTS[code] || error?.message || 'Bestellung konnte nicht erstellt werden.';
        }
      }
    });
    previewOrder(form);
  }

  function openOrderModal(city) {
    if (!city || !window.HFV2Modal?.openModal) return;
    window.HFV2Modal.openModal({
      className: 'hf-v2-order-modal',
      title: 'Waren bestellen',
      subtitle: city.name,
      bodyHtml: orderModalBody(city),
    });
    bindOrderModal(city);
  }

  function bindPopupEvents() {
    const element = actionPopup?.getElement?.();
    const buttons = element?.querySelectorAll?.('.hf-v2-city-action-button');
    if (!element || !buttons?.length) return;

    stopLeafletPropagation(element);
    buttons.forEach(button => {
      button.addEventListener('click', event => {
        L.DomEvent.stopPropagation(event);
        event.preventDefault();
        let callback = onNetworkClick;
        if (button.dataset.action === 'fleet') callback = onFleetClick;
        if (button.dataset.action === 'factory') callback = onFactoryClick;
        if (button.dataset.action === 'order') {
          openOrderModal(activeCity);
          return;
        }
        callback?.(activeCity);
      });
    });
  }

  function showCityActionMenu(city) {
    if (!map || !window.L || !city) return;

    hideCityActionMenu();
    activeCity = city;
    actionPopup = L.popup({
      className: 'hf-v2-city-action',
      closeButton: false,
      autoClose: false,
      closeOnClick: false,
      offset: [0, 52],
    })
      .setLatLng([city.lat, city.lng])
      .setContent(`
        <div class="hf-v2-city-action-panel" data-city-id="${escapeHtml(city.id)}">
          ${cityActions(city)}
        </div>`)
      .openOn(map);

    bindPopupEvents();
  }

  function initCityActionMenu(options) {
    map = options?.map || null;
    onNetworkClick = typeof options?.onNetworkClick === 'function' ? options.onNetworkClick : null;
    onFleetClick = typeof options?.onFleetClick === 'function' ? options.onFleetClick : null;
    onFactoryClick = typeof options?.onFactoryClick === 'function' ? options.onFactoryClick : null;
    hideCityActionMenu();

    if (!map) return;
    map.off('click', handleMapClick);
    map.on('click', handleMapClick);
    document.removeEventListener('keydown', handleKeydown);
    document.addEventListener('keydown', handleKeydown);
  }

  window.initCityActionMenu = initCityActionMenu;
  window.showCityActionMenu = showCityActionMenu;
  window.hideCityActionMenu = hideCityActionMenu;
  window.HFV2CityOrderUI = {vehicleOptions, orderModalBody, previewOrder};
})();
