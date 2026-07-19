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
    'no-vehicle': 'Kein passendes Fahrzeug.',
    'stock-limited': 'Quelle hat nicht genug Ware.',
    'route-overloaded': 'Straße zur gewünschten Zeit voll.',
    'unknown-frequency': 'Unbekannte Frequenz.',
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

  function currentAbsMinute(hour, minute) {
    const time = window.HFV2Time?.getState?.() || window.HFV2Save?.getState?.().time || {day: 1};
    const day = Math.max(1, Math.trunc(Number(time.day) || 1));
    return (day - 1) * 1440 + Math.max(0, Math.trunc(Number(hour) || 0)) * 60 + Math.max(0, Math.trunc(Number(minute) || 0));
  }

  function demandOptions(targetId) {
    return Object.entries(window.HFV2Goods?.getCityDailyDemandMap?.(targetId) || {})
      .filter(([, kg]) => Math.max(0, Number(kg) || 0) > 0)
      .sort((a, b) => goodById(a[0]).name.localeCompare(goodById(b[0]).name, 'de-CH'));
  }

  function sourceOptions(targetId) {
    return cityList()
      .filter(city => city.id !== targetId && isCityUnlocked(city) && window.HFNetwork?.findPath?.(city.id, targetId, {mode: 'road'})?.reachable === true)
      .sort((a, b) => a.name.localeCompare(b.name, 'de-CH'));
  }

  function vehicleOptions(sourceId) {
    const fleet = sourceId ? window.HFFleet?.getCityFleet?.(sourceId) || {} : {};
    return Object.entries(fleet)
      .filter(([, count]) => Math.max(0, Number(count) || 0) > 0)
      .map(([type, count]) => ({type, count, spec: vehicleSpec(type)}))
      .filter(item => item.spec?.mode === 'road')
      .sort((a, b) => String(a.spec.name || a.type).localeCompare(String(b.spec.name || b.type), 'de-CH'));
  }

  function option(value, label, selected = false) {
    return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }

  function orderModalBody(targetCity) {
    const sources = sourceOptions(targetCity.id);
    const demands = demandOptions(targetCity.id);
    const sourceId = sources[0]?.id || '';
    const vehicles = vehicleOptions(sourceId);
    return `
      <form class="hf-v2-network-menu" id="hfV2OrderForm" data-target-id="${escapeHtml(targetCity.id)}">
        <p class="hf-v2-network-hint">Zielstadt: <strong>${escapeHtml(targetCity.name)}</strong></p>
        <p class="hf-v2-network-hint">Produktion startet beim nächsten Tageswechsel / Produktionszyklus.</p>
        <label>Quellstadt<select name="fromCityId">${sources.map(city => option(city.id, city.name)).join('')}</select></label>
        <label>Ware<select name="goodId">${demands.map(([goodId, kg]) => option(goodId, `${goodById(goodId).name} · Tagesbedarf ${formatWeightKg(kg)}`)).join('')}</select></label>
        <label>Frequenz<select name="frequency">${option('daily', 'daily = Tagesbedarf', true)}${option('weekly', 'weekly = 7x Tagesbedarf')}</select></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><label>Stunde<input name="departureHour" type="number" min="0" max="23" step="1" value="8"></label><label>Minute<input name="departureMinute" type="number" min="0" max="59" step="1" list="hfV2OrderMinutes" value="0"><datalist id="hfV2OrderMinutes"><option value="0"><option value="15"><option value="30"><option value="45"></datalist></label></div>
        <label>Fahrzeugtyp<select name="vehicleType">${vehicles.map(item => option(item.type, `${item.spec.icon || '🚚'} ${item.spec.name || item.type} · ${item.count} verfügbar · ${formatWeightKg(window.HFV2Logistics?.vehicleCapacityKg?.(item.type) || 0)}`)).join('')}</select></label>
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
      departureHour: Math.max(0, Math.min(23, Math.trunc(Number(form.elements.departureHour?.value) || 0))),
      departureMinute: Math.max(0, Math.min(59, Math.trunc(Number(form.elements.departureMinute?.value) || 0))),
      vehicleType: form.elements.vehicleType?.value || '',
    };
  }

  function previewOrder(form) {
    const data = collectOrderForm(form);
    const error = form.querySelector('#hfV2OrderError');
    const preview = form.querySelector('#hfV2OrderPreview');
    const vehicles = vehicleOptions(data.fromCityId);
    setSelectOptions(form.elements.vehicleType, vehicles.map(item => option(item.type, `${item.spec.icon || '🚚'} ${item.spec.name || item.type} · ${item.count} verfügbar · ${formatWeightKg(window.HFV2Logistics?.vehicleCapacityKg?.(item.type) || 0)}`, item.type === data.vehicleType)));
    if (!form.elements.vehicleType?.value && vehicles[0]) form.elements.vehicleType.value = vehicles[0].type;
    data.vehicleType = form.elements.vehicleType?.value || '';
    const demand = Math.max(0, Number(window.HFV2Goods?.getCityDailyDemandMap?.(data.toCityId)?.[data.goodId]) || 0);
    let amountKg = 0;
    try {
      amountKg = Math.max(0, Number(window.HFV2Logistics?.plannedOrderAmountKg?.(data.toCityId, data.goodId, data.frequency)) || 0);
    } catch (error) {
      amountKg = 0;
    }
    const path = window.HFNetwork?.findPath?.(data.fromCityId, data.toCityId, {mode: 'road'});
    const capacity = window.HFV2Logistics?.vehicleCapacityKg?.(data.vehicleType) || 0;
    const trips = capacity > 0 ? Math.ceil(amountKg / capacity) : 0;
    const start = currentAbsMinute(data.departureHour, data.departureMinute);
    const end = start + Math.round((Number(path?.duration) || 0) * 60);
    const stock = Math.max(0, Number(window.HFV2Goods?.getCityInventory?.(data.fromCityId)?.[data.goodId]) || 0);
    const capacityStatus = path?.reachable ? window.HFNetwork?.pathCapacityStatus?.(path, {startAbsMinute: start, endAbsMinute: end, units: Math.max(1, trips)}) : null;
    const warnings = [];
    if (!path?.reachable) warnings.push('no-route');
    if (demand <= 0) warnings.push('no-demand');
    if (!vehicles.length || !data.vehicleType || capacity <= 0) warnings.push('no-vehicle');
    if (amountKg > stock) warnings.push('stock-limited');
    if (capacityStatus?.ok === false) warnings.push('route-overloaded');
    if (preview) preview.innerHTML = `
      <span><em>Menge</em><strong>${formatWeightKg(amountKg)}</strong></span>
      <span><em>Fahrten</em><strong>${trips || '–'}</strong></span>
      <span><em>Route</em><strong>${path?.reachable ? `${(Number(path.distance) || 0).toLocaleString('de-CH', {maximumFractionDigits: 1})} km · ${formatDurationHours(path.duration)}` : ERROR_TEXTS['no-route']}</strong></span>
      <span><em>Ankunft</em><strong>${path?.reachable ? formatTime(data.departureHour, data.departureMinute, (Number(path.duration) || 0) * 60) : '–'}</strong></span>
      ${warnings.length ? `<span><em>Warnungen</em><strong>${warnings.map(code => ERROR_TEXTS[code]).join(' ')}</strong></span>` : ''}`;
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
      if (warnings.includes('no-route') || warnings.includes('no-demand') || warnings.includes('no-vehicle')) return;
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
})();
