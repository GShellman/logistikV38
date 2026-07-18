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
    const goods = window.HF_GOODS_DATABASE?.goods || {};
    const demandGoods = Object.keys(goods).filter(id => goods[id]?.demand?.enabled === true);
    const demands = window.HF_GAME_MECHANICS?.makeDemandsV2?.(city, demandGoods) || {};
    return Object.entries(demands).map(([goodId, demand]) => {
      const good = goods[goodId] || {id: goodId, name: goodId, icon: '📦'};
      const dailyKg = Math.max(0, (Number(demand.need) || 0) * (Number(demand.dailyRate) || 1));
      return {good, demand, dailyKg};
    }).filter(row => row.dailyKg > 0).sort((a, b) => b.dailyKg - a.dailyKg || a.good.name.localeCompare(b.good.name, 'de-CH'));
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

  function demandPanel(city) {
    const rows = v2DemandRows(city);
    const total = rows.reduce((sum, row) => sum + row.dailyKg, 0);
    const inventory = window.HFV2Goods?.getCityInventory?.(city.id) || {};
    return `<section class="hf-v2-demand-card" aria-labelledby="hfV2DemandTitle"><div class="hf-v2-demand-head"><div><p class="hf-v2-kicker">Tagesbedarf</p><h3 id="hfV2DemandTitle">Alle Waren</h3></div><strong>${formatDailyKg(total)}</strong></div>${rows.length ? `<div class="hf-v2-demand-compact-grid">${rows.map(row => { const inventoryKg = Math.max(0, Number(inventory[row.good.id]) || 0); const coverage = row.dailyKg > 0 ? Math.min(100, inventoryKg / row.dailyKg * 100) : 100; const salePrice = window.HFV2Goods?.salePriceForCity?.(city, row.good.id) ?? (Number(row.good.price) || 0); return `<article class="hf-v2-demand-tile"><div class="hf-v2-demand-icon">${goodIcon(row.good)}</div><div class="hf-v2-demand-tile__body"><b>${escapeHtml(row.good.name)}</b><strong>${formatDailyKg(row.dailyKg)}</strong><div class="hf-v2-demand-price"><small>Verkaufspreis</small><b>${formatCurrency(salePrice)}/kg</b></div><span class="hf-v2-demand-tile__bar"><i style="width:${coverage}%"></i></span></div></article>`; }).join('')}</div>` : '<p class="hf-v2-muted">Für diese Stadt gibt es noch keinen berechneten Warenbedarf.</p>'}</section>`;
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
    document.getElementById('hfV2SelectedIntro').textContent = 'Basisdaten aus dem bestehenden Ortskatalog. In V2.1 gibt es nur einfaches In-Memory-Kapital für Fahrzeugkäufe, aber noch keine Wirtschaftssimulation.';
    document.getElementById('hfV2Facts').innerHTML = [
      fact('ID', city.id),
      fact('Kategorie', tierLabel(city.tier)),
      fact('Bevölkerung', formatPopulation(city.population)),
      fact('Bauplätze', city.slots.toLocaleString('de-CH')),
      fact('Wohlstandsfaktor', city.wealthFactor.toFixed(2)),
      fact('Nachfrageprofil', city.demandProfile),
      fact('Koordinaten', `${city.lat.toFixed(4)}, ${city.lng.toFixed(4)}`),
    ].join('') + inventorySectionMarkup(city) + demandPanel(city);
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
    if (networkState) {
      window.HFNetwork?.renderNetworkLines?.(networkState.connections, citiesById);
    }
    map.fitBounds(bounds, {padding: [16, 16], animate: false});
    return true;
  }

  function renderCurrentNetworkLines() {
    if (!networkState) return;
    window.HFNetwork?.renderNetworkLines?.(networkState.connections, citiesById);
  }

  function refreshNetworkView() {
    renderCurrentNetworkLines();
    refreshMarkers(Object.values(citiesById));
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
    liveTimer = window.setInterval(liveTick, 1000);
    renderLiveButton();
    setTimeStatus('Live läuft: 1 Spielminute pro Sekunde.');
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

  function applySavePackage(nextPackage) {
    savePackage = window.HFV2Save?.hydrateState?.(nextPackage) || nextPackage;
    window.HFV2Save?.configureState?.(savePackage);
    window.HFV2Time?.configure?.({state: savePackage.state.time});
    networkState = window.HFNetwork?.configure({state: savePackage.state.network, cities: Object.values(citiesById), citiesById});
    window.HFFleet?.configure?.({state: savePackage.state.fleet});
    window.HFV2Factories?.configure?.({state: savePackage.state.factories});
    window.HFV2Goods?.configure?.({state: savePackage.state.goods, cities: Object.values(citiesById)});
    refreshNetworkView();
    renderClock();
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
    savePackage = window.HFV2Save?.createDefaultState?.() || {state: {network: window.HFNetwork.createNetworkState({networkOriginNode: 'zurich', selected: 'zurich'}), fleet: window.HFFleet?.createFleetState?.(), factories: window.HFV2Factories?.createFactoryState?.(), goods: window.HFV2Goods?.createGoodsState?.(), time: window.HFV2Save?.defaultTimeState?.() || {day: 1, hour: 8, minute: 0}}};
    window.HFV2Save?.configureState?.(savePackage);
    window.HFV2Time?.configure?.({state: savePackage.state.time});
    networkState = window.HFNetwork?.configure({state: savePackage.state.network, cities, citiesById});
    window.HFFleet?.configure?.({state: savePackage.state.fleet});
    window.HFV2Factories?.configure?.({state: savePackage.state.factories});
    window.HFV2Goods?.configure?.({state: savePackage.state.goods, cities});
    document.getElementById('hfV2CityCount').textContent = `${cities.length.toLocaleString('de-CH')} Orte`;
    bindSaveControls();
    bindTimeControls();
    renderClock();
    renderLiveButton();
    window.addEventListener('hf:network:confirmed', refreshNetworkView);
    window.addEventListener('hf:v2:state-changed', refreshNetworkView);
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
