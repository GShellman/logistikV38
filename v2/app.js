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
  const feedbackLog = [];
  const feedbackWarnings = new Map();
  const deliveredStopKeys = new Set();
  let receiptSequence = 0;
  const FEEDBACK_META = {
    positive: {icon: '✓', label: 'Erfolg'},
    neutral: {icon: 'ℹ', label: 'Info'},
    negative: {icon: '!', label: 'Warnung'},
  };

  function feedbackTime() {
    return window.HFV2Time?.formatClock?.() || new Date().toLocaleTimeString('de-CH', {hour: '2-digit', minute: '2-digit'});
  }

  function ensureFeedbackUi() {
    if (document.getElementById('hfV2Feedback')) return;
    const root = document.createElement('section');
    root.id = 'hfV2Feedback';
    root.className = 'hf-v2-feedback';
    root.setAttribute('aria-label', 'Benachrichtigungen');
    root.innerHTML = `<div class="hf-v2-feedback__toasts" aria-live="polite" aria-atomic="false"></div><div class="hf-v2-feedback__cards" aria-live="polite" aria-atomic="false"></div><details class="hf-v2-event-log"><summary><span aria-hidden="true">☷</span> Ereignisprotokoll <b>0</b></summary><div class="hf-v2-event-log__list"><p class="hf-v2-event-log__empty">Noch keine Ereignisse.</p></div></details>`;
    document.body.append(root);
  }

  function renderFeedbackLog() {
    const root = document.getElementById('hfV2Feedback');
    if (!root) return;
    const list = root.querySelector('.hf-v2-event-log__list');
    root.querySelector('.hf-v2-event-log summary b').textContent = feedbackLog.length.toLocaleString('de-CH');
    list.innerHTML = feedbackLog.length ? feedbackLog.map(entry => {
      const meta = FEEDBACK_META[entry.tone];
      return `<article class="is-${entry.tone}"><span class="hf-v2-feedback__icon" aria-hidden="true">${meta.icon}</span><div><b>${escapeHtml(entry.title)}</b><p>${escapeHtml(entry.message)}${entry.count > 1 ? ` <strong>×${entry.count}</strong>` : ''}</p><small>${meta.label} · ${escapeHtml(entry.time)}</small></div></article>`;
    }).join('') : '<p class="hf-v2-event-log__empty">Noch keine Ereignisse.</p>';
  }

  function notify({level = 'toast', tone = 'neutral', title, message, dedupeKey = ''}) {
    ensureFeedbackUi();
    const meta = FEEDBACK_META[tone] || FEEDBACK_META.neutral;
    let entry = dedupeKey ? feedbackWarnings.get(dedupeKey) : null;
    if (entry) {
      entry.count += 1;
      entry.time = feedbackTime();
      entry.message = message;
    } else {
      entry = {tone, title, message, time: feedbackTime(), count: 1};
      feedbackLog.unshift(entry);
      if (feedbackLog.length > 30) feedbackLog.pop();
      if (dedupeKey) feedbackWarnings.set(dedupeKey, entry);
    }
    renderFeedbackLog();
    const host = document.querySelector(level === 'card' ? '.hf-v2-feedback__cards' : '.hf-v2-feedback__toasts');
    let node = dedupeKey ? host?.querySelector(`[data-feedback-key="${CSS.escape(dedupeKey)}"]`) : null;
    if (!node) {
      node = document.createElement('article');
      node.className = `hf-v2-feedback-item hf-v2-feedback-item--${level} is-${tone}`;
      if (dedupeKey) node.dataset.feedbackKey = dedupeKey;
      host?.prepend(node);
    }
    node.innerHTML = `<span class="hf-v2-feedback__icon" aria-hidden="true">${meta.icon}</span><div><span class="hf-v2-feedback__label">${meta.label}</span><h3>${escapeHtml(title)}${entry.count > 1 ? ` <small>×${entry.count}</small>` : ''}</h3><p>${escapeHtml(message)}</p></div><button type="button" aria-label="Meldung schließen">×</button>`;
    node.querySelector('button').onclick = () => node.remove();
    window.setTimeout(() => node?.remove(), level === 'card' ? 9000 : 4500);
  }

  function actionConfirmation(title, cost, result, tone = 'positive') {
    notify({level: 'card', tone, title, message: `Kosten ${formatCurrency(cost)} · Konto ${formatCurrency(window.HFV2Save?.getCash?.())} · ${result}`});
  }

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

  function formatHudCurrency(value) {
    const amount = Number(value) || 0;
    const sign = amount < 0 ? '−' : '';
    return `${sign}CHF ${Math.abs(amount).toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
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
    return rows.length ? limitedEntriesMarkup(rows, ([goodId, kg]) => {
      const good = goodById(goodId);
      return `<article class="hf-v2-inventory-good"><div class="hf-v2-demand-icon">${goodIcon(good)}</div><div><b>${escapeHtml(good.name)}</b><span>${formatGoodAmount(goodId, kg)} · ${formatWeightKg(kg)}</span></div></article>`;
    }, 4, 'hf-v2-inventory-grid') : '<p class="hf-v2-muted hf-v2-inventory-empty">📦 Lager leer</p>';
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

  function stockCoverageLabel(inventoryKg, dailyDemandKg) {
    const demand = Math.max(0, Number(dailyDemandKg) || 0);
    const stock = Math.max(0, Number(inventoryKg) || 0);
    if (!demand) return 'kein Verbrauch';
    const days = stock / demand;
    if (days < .25) return 'kritisch';
    if (days < 1) {
      const now = currentTimeState();
      const minutesLeft = Math.round(days * 1440);
      const absoluteMinutes = timeMinuteOfDay(now) + minutesLeft;
      if (absoluteMinutes < 1440) return `bis heute ${formatClockTime(Math.floor(absoluteMinutes / 60), absoluteMinutes % 60)}`;
    }
    return `${days.toLocaleString('de-CH', {maximumFractionDigits: 1})} Tage`;
  }

  function limitedEntriesMarkup(entries, renderEntry, limit = 4, className = '') {
    const visible = entries.slice(0, limit).map(renderEntry).join('');
    const remainder = entries.slice(limit).map(renderEntry).join('');
    const content = `<div class="${className}">${visible}</div>`;
    if (!remainder) return content;
    return `${content}<details class="hf-v2-more"><summary>Alle anzeigen (${entries.length.toLocaleString('de-CH')})</summary><div class="${className}">${remainder}</div></details>`;
  }

  function demandPanel(city) {
    const rows = v2DemandRows(city);
    const total = rows.reduce((sum, row) => sum + row.dailyKg, 0);
    const inventory = window.HFV2Goods?.getCityInventory?.(city.id) || {};
    const renderRow = row => { const inventoryKg = Math.max(0, Number(inventory[row.good.id]) || 0); const projectedKg = projectedEndOfDayStockKg(city.id, row.good.id, inventoryKg, row.dailyKg); const coverage = row.dailyKg > 0 ? Math.min(100, projectedKg / row.dailyKg * 100) : 100; const salePrice = window.HFV2Goods?.salePriceForCity?.(city, row.good.id) ?? (Number(row.good.price) || 0); return `<article class="hf-v2-demand-tile"><div class="hf-v2-demand-icon">${goodIcon(row.good)}</div><div class="hf-v2-demand-tile__body"><b>${escapeHtml(row.good.name)}</b><strong>Reichweite: ${stockCoverageLabel(inventoryKg, row.dailyKg)}</strong><small>${formatDailyKg(row.dailyKg)} Bedarf</small><div class="hf-v2-demand-price"><small>Verkaufspreis</small><b>${formatCurrency(salePrice)}/kg</b></div><span class="hf-v2-demand-tile__bar" aria-hidden="true"><i style="width:${coverage}%"></i></span><small class="hf-v2-muted">Tagesende: ${formatGoodAmount(row.good.id, projectedKg)}</small></div></article>`; };
    return `<section class="hf-v2-demand-card" aria-labelledby="hfV2DemandTitle"><div class="hf-v2-demand-head"><div><p class="hf-v2-kicker">Tagesbedarf</p><h3 id="hfV2DemandTitle">Waren und Reichweiten</h3></div><strong>${formatDailyKg(total)}</strong></div>${rows.length ? limitedEntriesMarkup(rows, renderRow, 4, 'hf-v2-demand-compact-grid') : '<p class="hf-v2-muted">Für diese Stadt gibt es noch keinen berechneten Warenbedarf.</p>'}</section>`;
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


  function factoryMaxLevel(factory) {
    const maxLevel = Number(factory?.maxLevel ?? factory?.maxUpgradeLevel ?? factory?.levels);
    return Number.isFinite(maxLevel) && maxLevel >= 1 ? Math.trunc(maxLevel) : Infinity;
  }

  function factoryUpgradeButtonState(cityId, factoryRef, factory, level, upgradeCost) {
    const factoryApi = window.HFV2Factories;
    const maxLevel = factoryMaxLevel(factory);
    if (!factoryApi?.upgradeFactory || !factoryApi?.canUpgradeFactory) return {disabled: true, title: 'Factory-API nicht verfügbar.'};
    if (level >= maxLevel) return {disabled: true, title: 'Maximallevel erreicht.'};
    const check = factoryApi.canUpgradeFactory(cityId, factoryRef);
    if (!check?.ok && check?.reason === 'not-enough-cash') return {disabled: true, title: `Nicht genug Geld: benötigt ${formatCurrency(upgradeCost)}.`};
    if (!check?.ok) return {disabled: true, title: 'Upgrade derzeit nicht möglich.'};
    return {disabled: false, title: `Für ${formatCurrency(upgradeCost)} auf Stufe ${level + 1} ausbauen.`};
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
      const factoryRef = factoryInstance.key ?? factoryInstance.index ?? factoryInstance.id;
      const estimate = window.HFV2Goods?.estimateCityFactoryProduction?.(city.id, factoryInstance);
      const level = Math.max(1, Math.trunc(Number(estimate?.level ?? factoryInstance.level ?? window.HFV2Factories?.getFactoryLevel?.(city.id, factoryRef)) || 1));
      const outputMultiplier = Math.max(1, Number(estimate?.outputMultiplier ?? window.HFV2Factories?.outputMultiplierForLevel?.(level)) || level);
      const nextOutputMultiplier = Math.max(1, Number(window.HFV2Factories?.outputMultiplierForLevel?.(level + 1)) || (level + 1));
      const baseCapacityKg = Math.max(0, Number(estimate?.capacityKg) || factoryDailyCapacityKg(factory));
      const capacityKg = Math.max(0, Number(estimate?.upgradeAdjustedCapacityKg) || baseCapacityKg * outputMultiplier);
      const nextCapacityKg = baseCapacityKg * nextOutputMultiplier;
      const currentOperatingCost = Number(window.HFV2Factories?.operatingCostForFactory?.(factory, level));
      const nextOperatingCost = Number(window.HFV2Factories?.operatingCostForFactory?.(factory, level + 1));
      const upgradeCost = Number(window.HFV2Factories?.upgradeCostForFactory?.(factory, level)) || 0;
      const buttonState = factoryUpgradeButtonState(city.id, factoryRef, factory, level, upgradeCost);
      const actualKg = Math.max(0, Number(estimate?.madeKg) || 0);
      const fill = capacityKg > 0 ? Math.min(100, actualKg / capacityKg * 100) : 0;
      const status = estimate?.reason === 'demand-limited' ? 'Nachfrage gedeckt' : estimate?.reason === 'capacity-limited' ? 'Lager voll' : estimate?.reason === 'input-limited' ? 'Inputs fehlen' : estimate?.reason === 'no-output' ? 'Kein Output' : 'Potenzial heute';
      return `<article class="hf-v2-factory-production-item"><div class="hf-v2-factory-production-head"><span>${escapeHtml(factory.icon || '🏭')}</span><div><b>${escapeHtml(factory.name || factory.id)}</b><small>Stufe ${level.toLocaleString('de-CH')} · ${factoryOutputsText(factory, outputMultiplier)}</small></div></div><div class="hf-v2-factory-production-bar"><span><i style="width:${fill}%"></i></span><small>${formatDailyKg(actualKg)} von ${formatDailyKg(capacityKg)} · ${status}</small></div><dl class="hf-v2-factory-production-stats"><div><dt>Kapazität aktuell</dt><dd>${formatDailyKg(capacityKg)}</dd></div><div><dt>Nach Ausbau</dt><dd>${formatDailyKg(nextCapacityKg)}</dd></div><div><dt>Betriebskosten</dt><dd>${formatCurrency(currentOperatingCost)}/Tag</dd></div><div><dt>Betriebskosten nach Ausbau</dt><dd>${formatCurrency(nextOperatingCost)}/Tag</dd></div><div><dt>Upgrade-Kosten</dt><dd>${formatCurrency(upgradeCost)}</dd></div></dl><button type="button" data-hf-v2-factory-upgrade data-city-id="${escapeHtml(city.id)}" data-factory-ref="${escapeHtml(factoryRef)}" title="${escapeHtml(buttonState.title)}"${buttonState.disabled ? ' disabled' : ''}>Fabrik ausbauen</button></article>`;
    });
    return `<section class="hf-v2-demand-card hf-v2-factory-production-list" aria-labelledby="hfV2FactoryProductionTitle"><div class="hf-v2-demand-head"><div><p class="hf-v2-kicker">Produktion</p><h3 id="hfV2FactoryProductionTitle">Fabriken in dieser Stadt</h3></div><strong>${builtFactories.length.toLocaleString('de-CH')}</strong></div>${limitedEntriesMarkup(rows, row => row, 3, 'hf-v2-factory-production-grid')}</section>${productionDebugMarkup(city)}`;
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
    return `<article class="hf-v2-production-debug-row hf-v2-logistics-row${warningClass}"><b>${escapeHtml(cityName(order.fromCityId))} → ${escapeHtml(cityName(order.toCityId))}</b><span><small>Ware</small>${escapeHtml(good.name || order.goodId)}</span><span><small>Menge</small>${formatGoodAmount(order.goodId, order.amountKg)} · ${formatWeightKg(order.amountKg)}</span><span><small>Frequenz</small>${order.frequency === 'weekly' ? 'wöchentlich' : 'täglich'}</span><span><small>Uhrzeit</small>${formatClockTime(order.departureHour, order.departureMinute)}</span><span><small>Fahrzeugtyp</small>${escapeHtml(vehicleLabel(order.vehicleType))}</span><span><small>Status</small>${order.enabled === false ? 'Inaktiv' : 'Aktiv'}</span><span><small>Versand</small>${escapeHtml(dispatchResultLabel(dispatchResult))}</span>${dispatchTimeMarkup}<span><small>Aktion</small><button type="button" data-hf-v2-order-toggle="${order.id}">${order.enabled === false ? 'Aktivieren' : 'Deaktivieren'}</button> <button class="hf-v2-action-danger" type="button" data-hf-v2-order-delete="${order.id}">Löschen</button></span></article>`;
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

  function shipmentStops(shipment) {
    return Array.isArray(shipment?.stops) ? shipment.stops.filter(stop => stop?.toCityId && stop?.goodId && Number(stop.amountKg) > 0) : [];
  }

  function shipmentRouteLabel(shipment) {
    const stops = shipmentStops(shipment);
    const cityIds = [shipment.fromCityId, ...(stops.length ? stops.map(stop => stop.toCityId) : [shipment.toCityId])];
    return cityIds.map(cityName).join(' → ');
  }

  function stopAmountsMarkup(stops, separator = '<br>') {
    return stops.map(stop => {
      const good = goodById(stop.goodId);
      return `${escapeHtml(cityName(stop.toCityId))}: ${escapeHtml(good.name || stop.goodId)} · ${formatGoodAmount(stop.goodId, stop.amountKg)}`;
    }).join(separator);
  }

  function shipmentCardMarkup(shipment) {
    const stops = shipmentStops(shipment);
    const isBundled = stops.length > 0;
    const good = goodById(shipment.goodId);
    const progress = shipmentProgressPercent(shipment);
    const isReturnTrip = shipment.status === 'returning';
    const arrivalAbsMinute = isReturnTrip ? shipment.returnArrivalAbsMinute : shipment.arrivalAbsMinute;
    const arrivalLabel = isReturnTrip ? 'Rückkehr' : 'Ankunft';
    const title = isBundled ? 'Sammellieferung' : escapeHtml(good.name || shipment.goodId);
    const amountMarkup = isBundled ? stopAmountsMarkup(stops) : `${formatGoodAmount(shipment.goodId, shipment.amountKg)} · ${formatWeightKg(shipment.amountKg)}`;
    const routeMarkup = isBundled ? `<span><small>Route</small>${escapeHtml(shipmentRouteLabel(shipment))}</span>` : '';
    return `<article class="hf-v2-production-debug-row hf-v2-logistics-row"><b>${title}</b>${routeMarkup}<span><small>${isBundled ? 'Stopps' : 'Menge'}</small>${amountMarkup}</span><span><small>Fahrzeuge</small>${(Number(shipment.vehicleCount) || 0).toLocaleString('de-CH')} × ${escapeHtml(vehicleLabel(shipment.vehicleType))}</span><span><small>Fortschritt</small>${progress.toLocaleString('de-CH', {maximumFractionDigits: 0})}%</span><span><small>${arrivalLabel}</small>${formatAbsMinute(arrivalAbsMinute)}</span><span><small>Status</small>${escapeHtml(shipmentStatusLabel(shipment))}</span></article>`;
  }

  function repositioningCardMarkup(assignment) {
    const progress = shipmentProgressPercent(assignment);
    const cost = Math.max(0, Number(assignment.costs?.total) || 0);
    return `<article class="hf-v2-production-debug-row hf-v2-logistics-row"><b>Leerfahrt</b><span><small>Route</small>${escapeHtml(cityName(assignment.fromCityId))} → ${escapeHtml(cityName(assignment.toCityId))}</span><span><small>Fahrzeuge</small>${assignment.vehicleIds.length.toLocaleString('de-CH')} × ${escapeHtml(vehicleLabel(assignment.vehicleType))}</span><span><small>Fortschritt</small>${progress.toLocaleString('de-CH', {maximumFractionDigits: 0})}%</span><span><small>Ankunft</small>${formatAbsMinute(assignment.arrivalAbsMinute)}</span><span><small>Kosten</small>CHF ${cost.toLocaleString('de-CH', {maximumFractionDigits: 2})}</span><span><small>Status</small>${assignment.status === 'active' ? 'Repositionierung' : 'Abgeschlossen'}</span></article>`;
  }

  function waitingVehicleCardMarkup(vehicle) {
    return `<article class="hf-v2-production-debug-row hf-v2-logistics-row"><b>Wartendes Fahrzeug</b><span><small>Standort</small>${escapeHtml(cityName(vehicle.currentCityId))}</span><span><small>Fahrzeug</small>${escapeHtml(vehicleLabel(vehicle.vehicleType))}</span><span><small>ID</small>#${Number(vehicle.id).toLocaleString('de-CH')}</span><span><small>Status</small>Verfügbar</span></article>`;
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
          stops: shipmentStops(shipment),
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
      const stops = Array.isArray(row.stops) ? row.stops : [];
      const isBundled = stops.length > 0;
      const good = goodById(row.goodId);
      const eventClass = `hf-v2-transport-calendar__event hf-v2-transport-calendar__event--${row.kind}`;
      const arrivalLabel = row.status === 'Rückfahrt' && Number.isFinite(Number(row.returnArrivalAbsMinute)) ? `Rückkehr ${shipmentCalendarTimeLabel(row.returnArrivalAbsMinute)}` : (Number.isFinite(Number(row.arrivalAbsMinute)) ? shipmentCalendarTimeLabel(row.arrivalAbsMinute) : 'wartet');
      const vehicleText = row.vehicleCount ? `${Number(row.vehicleCount).toLocaleString('de-CH')} × ${vehicleLabel(row.vehicleType)}` : vehicleLabel(row.vehicleType);
      const routeText = isBundled ? [row.fromCityId, ...stops.map(stop => stop.toCityId)].map(cityName).join(' → ') : `${cityName(row.fromCityId)} → ${cityName(row.toCityId)}`;
      const summaryText = isBundled ? 'Sammellieferung' : escapeHtml(good.name || row.goodId);
      const amountText = isBundled ? stopAmountsMarkup(stops, '<br>') : `${formatGoodAmount(row.goodId, row.amountKg)} · ${formatWeightKg(row.amountKg)}`;
      return `<article class="hf-v2-transport-calendar__slot"><time class="hf-v2-transport-calendar__time" datetime="${escapeHtml(String(row.sortAbsMinute))}"><strong>${escapeHtml(shipmentCalendarTimeLabel(row.departureAbsMinute))}</strong><span>bis ${escapeHtml(arrivalLabel)}</span></time><div class="${eventClass}"><div><b>${escapeHtml(routeText)}</b><span>${summaryText}</span>${isBundled ? `<small>${amountText}</small>` : ''}</div><dl><div><dt>Ware</dt><dd>${summaryText}</dd></div><div><dt>${isBundled ? 'Stop-Mengen' : 'Menge'}</dt><dd>${amountText}</dd></div><div><dt>Fahrzeuge</dt><dd>${escapeHtml(vehicleText)}</dd></div><div><dt>Status</dt><dd>${escapeHtml(row.status)}</dd></div></dl></div></article>`;
    }).join('')}</section>`).join('')}</div>`;
  }

  function logisticsListMarkup(items, emptyText, rowMarkup) {
    return items.length ? limitedEntriesMarkup(items, rowMarkup, 3, 'hf-v2-production-debug-grid') : `<p class="hf-v2-muted">${emptyText}</p>`;
  }

  function cityLogisticsSectionMarkup(city) {
    const logistics = window.HFV2Logistics?.getState?.() || {orders: [], shipments: []};
    const orders = Array.isArray(logistics.orders) ? logistics.orders : [];
    const shipments = Array.isArray(logistics.shipments) ? logistics.shipments : [];
    const assignments = (Array.isArray(logistics.assignments) ? logistics.assignments : []).filter(assignment => assignment?.fromCityId === city.id || assignment?.toCityId === city.id);
    const waitingVehicles = (window.HFFleet?.getState?.().vehicles || []).filter(vehicle => vehicle?.status === 'available' && vehicle?.currentCityId === city.id);
    const incomingOrders = orders.filter(order => order.toCityId === city.id);
    const outgoingOrders = orders.filter(order => order.fromCityId === city.id);
    const calendarRows = shipmentCalendarRows(city, shipments, orders);
    const total = incomingOrders.length + outgoingOrders.length + calendarRows.length + assignments.length + waitingVehicles.length;
    return `<section class="hf-v2-demand-card hf-v2-city-logistics" aria-labelledby="hfV2LogisticsTitle"><div class="hf-v2-demand-head"><div><p class="hf-v2-kicker">Warenlogistik</p><h3 id="hfV2LogisticsTitle">Warenlogistik</h3></div><strong>${total.toLocaleString('de-CH')}</strong></div><h4>Eingehende Bestellungen</h4>${logisticsListMarkup(incomingOrders, 'Keine eingehenden Bestellungen.', orderCardMarkup)}<h4>Ausgehende Bestellungen</h4>${logisticsListMarkup(outgoingOrders, 'Keine ausgehenden Bestellungen.', orderCardMarkup)}<h4>Leerfahrten / Repositionierungen</h4>${logisticsListMarkup(assignments, 'Keine disponierten Leerfahrten.', repositioningCardMarkup)}<h4>Wartende Fahrzeuge</h4>${logisticsListMarkup(waitingVehicles, 'Keine verfügbaren Fahrzeuge an diesem Standort.', waitingVehicleCardMarkup)}<h4>Transportkalender</h4>${shipmentCalendarMarkup(city)}</section>`;
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

  function cityMapState(city) {
    const logistics = window.HFV2Logistics?.getState?.() || {};
    const openDelivery = (logistics.shipments || []).some(item =>
      (item.status === 'active' || item.status === 'returning') && item.toCityId === city.id);
    const factories = window.HFV2Factories?.getCityFactoryInstances?.(city.id) || [];
    const stopped = factories.some(factory => {
      const estimate = window.HFV2Goods?.estimateCityFactoryProduction?.(city.id, factory);
      return estimate && Number(estimate.actualKg ?? estimate.productionKg ?? 0) <= 0;
    });
    const used = Number(window.HFV2Goods?.getUsedCapacityKg?.(city.id)) || 0;
    const capacity = Number(window.HFV2Goods?.getCapacityKg?.(city.id)) || 0;
    const shortage = v2DemandRows(city).some(row => {
      const stock = Number(window.HFV2Goods?.getCityInventory?.(city.id)?.[row.good.id]) || 0;
      return stock < row.dailyKg * .25;
    });
    if (stopped) return {id: 'stopped', label: 'Produktionsstillstand', symbol: '×'};
    if (shortage) return {id: 'shortage', label: 'Warenmangel', symbol: '!'};
    if (capacity > 0 && used / capacity >= .9) return {id: 'full', label: 'Volle Lager', symbol: '■'};
    if (openDelivery) return {id: 'delivery', label: 'Offene Lieferung', symbol: '↓'};
    return {id: 'normal', label: 'Normal', symbol: '✓'};
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

    const state = cityMapState(city);
    const hasProduction = (window.HFV2Factories?.getCityFactoryInstances?.(city.id) || window.HFV2Factories?.getCityFactories?.(city.id) || []).length > 0;
    return L.divIcon({
      className: '',
      html: `<div id="mk-${city.id}" class="${classes}" data-map-layer="city"><span aria-hidden="true">${cityLabel(city)}</span><span class="hf-v2-city-state hf-v2-city-state--${state.id}" role="img" aria-label="Zustand: ${state.label}">${state.symbol}</span>${hasProduction ? '<span class="hf-v2-production-site" aria-hidden="true">🏭</span>' : ''}</div>`,
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
    const state = cityMapState(city);
    marker.options.title = `${city.name} – ${state.label}`;
    marker.bindTooltip(`${escapeHtml(city.name)}<span class="hf-v2-city-label-state">${escapeHtml(state.symbol)} ${escapeHtml(state.label)}</span>`, {
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
    const state = cityMapState(city);
    const demandRows = v2DemandRows(city);
    const inventory = window.HFV2Goods?.getCityInventory?.(city.id) || {};
    const warnings = demandRows.filter(row => (Number(inventory[row.good.id]) || 0) / row.dailyKg < 1).sort((a, b) => ((Number(inventory[a.good.id]) || 0) / a.dailyKg) - ((Number(inventory[b.good.id]) || 0) / b.dailyKg));
    const usedKg = window.HFV2Goods?.getUsedCapacityKg?.(city.id) || 0;
    const capacityKg = window.HFV2Goods?.getCapacityKg?.(city.id) || 0;
    const factories = window.HFV2Factories?.getCityFactoryInstances?.(city.id) || [];
    const problems = warnings.length ? limitedEntriesMarkup(warnings, row => `<article class="hf-v2-city-warning"><span aria-hidden="true">⚠</span><p><b>${escapeHtml(row.good.name)}</b> reicht noch ${stockCoverageLabel(Number(inventory[row.good.id]) || 0, row.dailyKg)}<small>Ursache: Bestand liegt unter dem Tagesbedarf.</small></p><button class="hf-v2-action-primary" type="button" data-hf-v2-show-tab="transporte">Lieferung planen</button></article>`, 3, 'hf-v2-city-warning-list') : '<p class="hf-v2-city-ok"><span aria-hidden="true">✓</span> Keine akuten Probleme erkannt.</p>';
    document.getElementById('hfV2SelectedIntro').textContent = `${state.symbol} ${state.label}`;
    document.getElementById('hfV2Facts').innerHTML = `<div class="hf-v2-city-summary" aria-label="Kennzahlen für ${escapeHtml(city.name)}"><div class="hf-v2-city-kpi-grid">${fact('Einwohner', formatPopulation(city.population))}${fact('Lager', capacityKg ? `${Math.round(usedKg / capacityKg * 100)} %` : '–')}${fact('Fabriken', factories.length.toLocaleString('de-CH'))}${fact('Bauplätze', city.slots.toLocaleString('de-CH'))}</div></div><div class="hf-v2-city-tabs" role="tablist" aria-label="Stadtbereiche"><button type="button" role="tab" id="hfV2TabOverview" aria-controls="hfV2PanelOverview" aria-selected="true" data-hf-v2-tab="overview">Übersicht</button><button type="button" role="tab" id="hfV2TabGoods" aria-controls="hfV2PanelGoods" aria-selected="false" tabindex="-1" data-hf-v2-tab="goods">Waren</button><button type="button" role="tab" id="hfV2TabProduction" aria-controls="hfV2PanelProduction" aria-selected="false" tabindex="-1" data-hf-v2-tab="production">Produktion</button><button type="button" role="tab" id="hfV2TabTransport" aria-controls="hfV2PanelTransport" aria-selected="false" tabindex="-1" data-hf-v2-tab="transporte">Transporte</button></div><section id="hfV2PanelOverview" role="tabpanel" aria-labelledby="hfV2TabOverview" data-hf-v2-panel="overview"><h3>Aktuelle Probleme</h3>${problems}<section class="hf-v2-next-action" aria-labelledby="hfV2NextAction"><h3 id="hfV2NextAction">Nächste sinnvolle Aktion</h3><p>${warnings.length ? `Versorgung mit ${escapeHtml(warnings[0].good.name)} sichern, bevor der Bestand ausläuft.` : 'Kapazitäten und laufende Kosten prüfen.'}</p><button class="hf-v2-action-primary" type="button" data-hf-v2-show-tab="${warnings.length ? 'transporte' : 'production'}">${warnings.length ? 'Lieferung planen' : 'Produktion prüfen'}</button></section>${financeSummaryMarkup()}</section><section id="hfV2PanelGoods" role="tabpanel" aria-labelledby="hfV2TabGoods" data-hf-v2-panel="goods" hidden>${inventorySectionMarkup(city)}${demandPanel(city)}</section><section id="hfV2PanelProduction" role="tabpanel" aria-labelledby="hfV2TabProduction" data-hf-v2-panel="production" hidden>${factoryProductionMarkup(city)}</section><section id="hfV2PanelTransport" role="tabpanel" aria-labelledby="hfV2TabTransport" data-hf-v2-panel="transporte" hidden>${cityLogisticsSectionMarkup(city)}</section>`;
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

  function addMapControls() {
    const Control = L.Control.extend({
      options: {position: 'bottomleft'},
      onAdd() {
        const container = L.DomUtil.create('div', 'hf-v2-map-tools leaflet-bar');
        container.innerHTML = `<details open><summary>Kartenanzeige</summary><div class="hf-v2-layer-control" role="group" aria-label="Kartenebenen">${[
          ['network', 'Netzwerk'], ['goods', 'Warenlage'], ['production', 'Produktion'], ['vehicles', 'Fahrzeuge'],
        ].map(([id, label]) => `<label><input type="checkbox" data-hf-map-layer="${id}" checked> ${label}</label>`).join('')}</div></details><details><summary>Legende</summary><div class="hf-v2-map-legend"><span><i class="legend-city">◆</i>Stadt</span><span><i>🏭</i>Produktionsort</span><span><i class="legend-road"></i>Strasse</span><span><i class="legend-rail"></i>Schiene</span><span><i>➤</i>Aktiver Transport</span><span><i>⚠</i>Warnung</span><span><i>◆</i>Engpass</span><hr><span>✓ Normal</span><span>! Warenmangel</span><span>■ Volles Lager</span><span>× Produktionsstillstand</span><span>↓ Offene Lieferung</span></div></details>`;
        L.DomEvent.disableClickPropagation(container);
        container.addEventListener('change', event => {
          const input = event.target.closest('[data-hf-map-layer]');
          if (!input) return;
          const layer = input.dataset.hfMapLayer;
          map.getContainer().classList.toggle(`hf-v2-hide-${layer}`, !input.checked);
          if (layer === 'network') window.HFNetworkLayer?.setNetworkLayerVisible?.(input.checked, map);
          if (layer === 'vehicles') window.HFV2LogisticsLayer?.setLogisticsLayerVisible?.(input.checked, map);
        });
        return container;
      },
    });
    new Control().addTo(map);
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
    addMapControls();
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
    const logistics = window.HFV2Logistics?.getState?.() || {};
    const vehicles = window.HFFleet?.getState?.().vehicles || [];
    window.HFV2LogisticsLayer?.renderActiveShipments?.(logistics.shipments || [], citiesById, logistics.assignments || [], vehicles);
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

  function renderHud() {
    const saveState = window.HFV2Save?.getState?.() || {};
    const time = window.HFV2Time?.getState?.() || saveState.time || {day: 1};
    const logistics = window.HFV2Logistics?.getState?.() || {};
    const activeTransports = (logistics.shipments || []).filter(shipment => ['active', 'returning'].includes(shipment.status)).length;
    const today = Math.max(1, Math.trunc(Number(time.day) || 1));
    const todaySummary = window.HFV2DayCycle?.summaryForDay?.(today) || {operatingResult: 0};
    const cashNode = document.getElementById('hfV2HudCash');
    const transportNode = document.getElementById('hfV2HudTransports');
    const resultNode = document.getElementById('hfV2HudResult');
    if (cashNode) cashNode.textContent = formatHudCurrency(window.HFV2Save?.getCash?.() ?? saveState.cash);
    if (transportNode) transportNode.textContent = `${activeTransports.toLocaleString('de-CH')} ${activeTransports === 1 ? 'Transport' : 'Transporte'}`;
    if (resultNode) {
      const result = Number(todaySummary.operatingResult) || 0;
      resultNode.textContent = formatHudCurrency(result);
      resultNode.classList.toggle('is-positive', result > 0);
      resultNode.classList.toggle('is-negative', result < 0);
    }
    renderClock();
  }

  function dailyCycleSummaryText(summary) {
    if (!summary) return 'Kein Tagesabschluss ausgelöst.';
    const costs = summary.costs || {};
    const rows = [`Einnahmen ${formatCurrency(summary.revenue?.sales || 0)}`];
    const networkFactories = (Number(costs.network) || 0) + (Number(costs.factories) || 0);
    if (networkFactories) rows.push(`Netz & Fabriken −${formatCurrency(networkFactories)}`);
    if (Number(costs.fleet)) rows.push(`Fuhrpark −${formatCurrency(costs.fleet)}`);
    if (Number(costs.transport)) rows.push(`Fahrten −${formatCurrency(costs.transport)}`);
    rows.push(`Gesamtkosten −${formatCurrency(costs.total || 0)}`);
    const operatingResult = Number(summary.operatingResult) || 0;
    rows.push(`Operativer ${operatingResult >= 0 ? 'Gewinn' : 'Verlust'} ${formatCurrency(Math.abs(operatingResult))}`);
    if (Number(summary.investments)) rows.push(`Investitionen ${formatCurrency(summary.investments)}`);
    rows.push(`Kontoveränderung ${formatCurrency(summary.cashChange || 0)}`, `Neuer Kontostand ${formatCurrency(summary.closingCash || 0)}`);
    return `Tagesabschluss: ${rows.join(' · ')}.`;
  }

  function receiptAmount(value, {empty = '–', signed = false} = {}) {
    const amount = Number(value) || 0;
    if (!amount && empty != null) return empty;
    const formatted = Math.abs(amount).toLocaleString('de-CH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    return `${signed ? (amount < 0 ? '−' : '+') + ' ' : ''}CHF ${formatted}`;
  }

  function receiptDateLabel() {
    const time = window.HFV2Time?.getState?.() || window.HFV2Save?.getState?.().time || {};
    const day = Math.max(1, Math.trunc(Number(time.day) || 1));
    const hour = Math.max(0, Math.trunc(Number(time.hour) || 0));
    const minute = Math.max(0, Math.trunc(Number(time.minute) || 0));
    return `Tag ${day.toLocaleString('de-CH')} · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  function receiptNumber(prefix) {
    const day = Math.max(1, Math.trunc(Number(window.HFV2Time?.getState?.().day) || 1));
    receiptSequence += 1;
    return `${prefix}-${String(day).padStart(5, '0')}-${String(receiptSequence).padStart(3, '0')}`;
  }

  function receiptPositionRow({label, detail = '', amount, className = ''}) {
    return `<tr class="${escapeHtml(className)}"><th scope="row" data-label="Position">${escapeHtml(label)}${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</th><td data-label="Betrag">${receiptAmount(amount, {empty: 'CHF 0.00'})}</td></tr>`;
  }

  function renderReceipt({icon, documentLabel, number, date = receiptDateLabel(), positions = [], total = 0, closingCash, caption = 'Positionen', bodyMarkup = '', note = 'Automatisch verbucht · Beträge in Schweizer Franken', actionLabel = 'Schließen'}) {
    const positionsMarkup = bodyMarkup || `<table class="hf-v2-receipt__table hf-v2-receipt__table--positions"><caption>${escapeHtml(caption)}</caption><thead><tr><th scope="col">Position</th><th scope="col">Betrag <small>CHF</small></th></tr></thead><tbody>${positions.map(receiptPositionRow).join('')}</tbody></table>`;
    return `<article class="hf-v2-receipt">
      <header class="hf-v2-receipt__head"><div class="hf-v2-receipt__identity"><span class="hf-v2-receipt__icon" aria-hidden="true">${escapeHtml(icon)}</span><div><span>Helvetic Freight</span><strong>${escapeHtml(documentLabel)}</strong></div></div><dl><div><dt>Beleg</dt><dd>${escapeHtml(number)}</dd></div><div><dt>Datum</dt><dd>${escapeHtml(date)}</dd></div></dl></header>
      ${positionsMarkup}
      <footer class="hf-v2-receipt__footer"><div><span>Gesamtsumme</span><strong>${receiptAmount(total, {empty: 'CHF 0.00', signed: total < 0})}</strong></div><div class="hf-v2-receipt__balance"><span>Neuer Kontostand</span><strong>${receiptAmount(closingCash, {empty: 'CHF 0.00'})}</strong></div></footer>
      <p class="hf-v2-receipt__note">${escapeHtml(note)}</p>
      ${actionLabel ? `<div class="hf-v2-receipt__actions"><button class="hf-v2-action-primary" type="button" data-hf-v2-receipt-close>${escapeHtml(actionLabel)}</button></div>` : ''}
    </article>`;
  }

  function openTransactionReceipt(options) {
    window.HFV2Modal?.openModal?.({className: 'hf-v2-receipt-modal', title: options.documentLabel, subtitle: 'Buchungsbeleg', bodyHtml: renderReceipt(options)});
  }

  function receiptRow(label, amount, side, className = '', note = '') {
    const debit = side === 'debit' ? receiptAmount(amount, {empty: 'CHF 0.00'}) : '–';
    const credit = side === 'credit' ? receiptAmount(amount, {empty: 'CHF 0.00'}) : '–';
    return `<tr class="${className}"><th scope="row" data-label="Position">${label}${note ? `<small>${note}</small>` : ''}</th><td data-label="Aufwand">${debit}</td><td data-label="Ertrag">${credit}</td></tr>`;
  }

  function dailyCycleReceiptMarkup(summary) {
    const costs = summary?.costs || {};
    const operatingResult = Number(summary?.operatingResult) || 0;
    const investments = Number(summary?.investments) || 0;
    const cashChange = Number(summary?.cashChange) || 0;
    const days = Array.isArray(summary?.days) ? summary.days : [summary?.day].filter(Boolean);
    const dayLabel = days.length > 1 ? `Tage ${days[0]}–${days[days.length - 1]}` : `Tag ${days[0] || '–'}`;
    const documentNumber = days.length > 1 ? `TA-${days[0]}-${days[days.length - 1]}` : `TA-${String(days[0] || 0).padStart(5, '0')}`;
    const operatingRows = [
      receiptRow('Verkaufserlöse', summary?.revenue?.sales, 'credit'),
      Number(costs.network) ? receiptRow('Netzunterhalt', costs.network, 'debit') : '',
      Number(costs.factories) ? receiptRow('Fabrikbetrieb', costs.factories, 'debit') : '',
      Number(costs.fleet) ? receiptRow('Fuhrpark-Fixkosten', costs.fleet, 'debit') : '',
      Number(costs.transport) ? receiptRow('Transportaufwand', costs.transport, 'debit') : '',
      receiptRow('Laufende Kosten gesamt', costs.total, 'debit', 'hf-v2-receipt__subtotal'),
      receiptRow(operatingResult >= 0 ? 'Operativer Gewinn' : 'Operativer Verlust', operatingResult, operatingResult >= 0 ? 'credit' : 'debit', `hf-v2-receipt__result ${operatingResult >= 0 ? 'is-positive' : 'is-negative'}`),
    ].join('');
    const investmentRow = investments ? receiptRow('Investitionen, netto', investments, investments >= 0 ? 'debit' : 'credit', 'hf-v2-receipt__investment', 'nicht im operativen Ergebnis enthalten') : '';
    const table = `<table class="hf-v2-receipt__table"><caption>Erfolgsrechnung</caption><thead><tr><th scope="col">Position</th><th scope="col">Aufwand <small>CHF</small></th><th scope="col">Ertrag <small>CHF</small></th></tr></thead><tbody>${operatingRows}${investmentRow}</tbody></table>`;
    return renderReceipt({icon: '▤', documentLabel: 'Tagesabschluss', number: documentNumber, date: dayLabel, bodyMarkup: table, total: cashChange, closingCash: summary?.closingCash, actionLabel: 'Weiter'});
  }

  function largeGoodsSaleReceiptMarkup(summary) {
    const revenue = Math.max(0, Number(summary?.sales?.revenue ?? summary?.revenue?.sales) || 0);
    if (revenue < 10000) return '';
    const soldKg = Math.max(0, Number(summary?.sales?.soldKg) || 0);
    return renderReceipt({
      icon: '◈', documentLabel: 'Warenverkaufsbeleg', number: receiptNumber('WV'), date: receiptDateLabel(),
      positions: [{label: 'Warenverkauf', detail: `${soldKg.toLocaleString('de-CH', {maximumFractionDigits: 3})} kg verkauft`, amount: revenue}],
      total: revenue, closingCash: summary?.closingCash, actionLabel: '',
    });
  }

  function openDailyCycleReceipt(summary) {
    if (!summary) return;
    const result = Number(summary.operatingResult) || 0;
    notify({tone: result < 0 ? 'negative' : 'positive', title: 'Tagesabschluss gebucht', message: `${result < 0 ? 'Verlust' : 'Gewinn'} ${formatCurrency(Math.abs(result))} · Konto ${formatCurrency(summary.closingCash)}`});
    const salesReceipt = largeGoodsSaleReceiptMarkup(summary);
    window.HFV2Modal?.openModal?.({className: 'hf-v2-receipt-modal', title: 'Tagesabschluss', subtitle: salesReceipt ? 'Buchungsbelege' : 'Buchungsbeleg', bodyHtml: `${salesReceipt}${dailyCycleReceiptMarkup(summary)}`});
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
    renderHud();
    renderActiveShipments();
    refreshSelectedCity();
    const message = `${label}: ${window.HFV2Time?.formatClock?.() || ''}. ${dailyCycleSummaryText(summary)}`;
    setSaveStatus(message);
    setTimeStatus(message);
    openDailyCycleReceipt(summary);
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
    renderHud();
    renderActiveShipments();
    refreshSelectedCity();
    const message = `Live läuft: ${window.HFV2Time?.formatClock?.() || ''}. ${dailyCycleSummaryText(result.summary)}`;
    setTimeStatus(message);
    if (result.summary) setSaveStatus(message);
    if (result.summary) {
      stopLiveTime('Live pausiert: Tagesabschluss zur Prüfung geöffnet.');
      openDailyCycleReceipt(result.summary);
    }
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
      const requestedTab = event.target?.closest?.('[data-hf-v2-tab], [data-hf-v2-show-tab]');
      if (requestedTab) {
        const tabName = requestedTab.dataset.hfV2Tab || requestedTab.dataset.hfV2ShowTab;
        const facts = document.getElementById('hfV2Facts');
        facts?.querySelectorAll('[data-hf-v2-tab]').forEach(tab => {
          const selected = tab.dataset.hfV2Tab === tabName;
          tab.setAttribute('aria-selected', String(selected));
          tab.tabIndex = selected ? 0 : -1;
        });
        facts?.querySelectorAll('[data-hf-v2-panel]').forEach(panel => { panel.hidden = panel.dataset.hfV2Panel !== tabName; });
        facts?.querySelector(`[data-hf-v2-tab="${tabName}"]`)?.focus();
        return;
      }
      const upgradeButton = event.target?.closest?.('[data-hf-v2-factory-upgrade]');
      if (upgradeButton) {
        const cityId = upgradeButton.dataset.cityId;
        const factoryRef = upgradeButton.dataset.factoryRef;
        window.HFV2Factories?.upgradeFactory?.(cityId, factoryRef);
        refreshNetworkView();
        refreshSelectedCity();
        return;
      }
      const toggleButton = event.target?.closest?.('[data-hf-v2-order-toggle]');
      const deleteButton = event.target?.closest?.('[data-hf-v2-order-delete]');
      if (!toggleButton && !deleteButton) return;
      const id = Number(toggleButton?.dataset.hfV2OrderToggle || deleteButton?.dataset.hfV2OrderDelete || 0);
      if (!id) return;
      if (toggleButton) {
        const order = (window.HFV2Logistics?.getState?.().orders || []).find(entry => entry.id === id);
        window.HFV2Logistics?.setOrderEnabled?.(id, order?.enabled === false);
      } else {
        if (!window.confirm('Bestellung wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;
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
    // Complete overdue persisted events only after fleet, network, goods and
    // logistics all point at the hydrated state. The transitions are idempotent.
    window.HFV2Time?.reconcileCurrentTime?.();
  }

  function applySavePackage(nextPackage) {
    savePackage = window.HFV2Save?.hydrateState?.(nextPackage) || nextPackage;
    configureGameSystems(Object.values(citiesById));
    refreshNetworkView();
    renderHud();
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

  function installActionFeedback() {
    ensureFeedbackUi();
    const wrap = (api, method, after) => {
      const original = api?.[method];
      if (typeof original !== 'function' || original.hfFeedbackWrapped) return;
      function wrapped(...args) {
        const beforeCash = window.HFV2Save?.getCash?.() || 0;
        const result = original.apply(this, args);
        if (result?.ok !== false && result != null) after(result, args, beforeCash);
        return result;
      }
      wrapped.hfFeedbackWrapped = true;
      api[method] = wrapped;
    };

    wrap(window.HFFleet, 'buyVehicle', (result) => {
      actionConfirmation('Fahrzeug gekauft', result.cost, `${vehicleLabel(result.vehicleType)} in ${cityName(result.cityId)}`);
      openTransactionReceipt({icon: '▣', documentLabel: 'Fahrzeugkaufbeleg', number: receiptNumber('FK'), positions: [{label: vehicleLabel(result.vehicleType), detail: `Standort ${cityName(result.cityId)} · Fahrzeug ${result.vehicle?.id || '–'}`, amount: result.cost}], total: result.cost, closingCash: window.HFV2Save?.getCash?.()});
    });
    wrap(window.HFV2Factories, 'buildFactory', (result) => {
      const factory = factoryById(result.factoryId);
      actionConfirmation('Fabrik gebaut', result.cost, `${factory?.name || result.factoryId} in ${cityName(result.cityId)}`);
      openTransactionReceipt({icon: '▰', documentLabel: 'Fabrikbaubeleg', number: receiptNumber('FB'), positions: [{label: factory?.name || result.factoryId, detail: `Neubau in ${cityName(result.cityId)}`, amount: result.cost}], total: result.cost, closingCash: window.HFV2Save?.getCash?.()});
    });
    wrap(window.HFV2Factories, 'upgradeFactory', (result) => {
      const factory = factoryById(result.factoryId);
      actionConfirmation('Upgrade abgeschlossen', result.cost, `${factory?.name || result.factoryId} erreicht Stufe ${result.level}`);
      openTransactionReceipt({icon: '▱', documentLabel: 'Fabrikausbaubeleg', number: receiptNumber('FA'), positions: [{label: factory?.name || result.factoryId, detail: `${cityName(result.cityId)} · Stufe ${result.previousLevel} auf ${result.level}`, amount: result.cost}], total: result.cost, closingCash: window.HFV2Save?.getCash?.()});
    });
    wrap(window.HFNetwork, 'confirmProject', (result, args, beforeCash) => {
      const edge = result;
      const cost = Math.max(0, beforeCash - (window.HFV2Save?.getCash?.() || 0));
      actionConfirmation('Netz erweitert', cost, `${cityName(edge?.a)} ↔ ${cityName(edge?.b)} erschlossen`);
      const spec = window.HFNetwork?.TRANSPORT_TYPES?.[edge?.type] || {};
      const rail = spec.mode === 'rail';
      openTransactionReceipt({icon: rail ? '═' : '↔', documentLabel: rail ? 'Schienenbaubeleg' : 'Straßenbaubeleg', number: receiptNumber(rail ? 'SB' : 'ST'), positions: [{label: spec.name || (rail ? 'Bahnstrecke' : 'Straßenverbindung'), detail: `${cityName(edge?.a)} ↔ ${cityName(edge?.b)} · ${(Number(edge?.distance) || 0).toLocaleString('de-CH', {maximumFractionDigits: 1})} km`, amount: cost}], total: cost, closingCash: window.HFV2Save?.getCash?.()});
    });
  }

  function reportShipmentChanges() {
    const shipments = window.HFV2Logistics?.getState?.().shipments || [];
    for (const shipment of shipments) {
      const stops = Array.isArray(shipment.stops) && shipment.stops.length ? shipment.stops : [shipment];
      stops.forEach((stop, index) => {
        if (!['delivered', 'partial', 'failed'].includes(stop.status) && !Number.isFinite(Number(stop.deliveredAbsMinute ?? shipment.deliveredAbsMinute))) return;
        const key = `${shipment.id}:${stop.orderId || index}:${stop.deliveredAbsMinute ?? shipment.deliveredAbsMinute}`;
        if (deliveredStopKeys.has(key)) return;
        deliveredStopKeys.add(key);
        const kg = Math.max(0, Number(stop.deliveredKg ?? shipment.deliveredKg) || 0);
        const goodId = stop.goodId || shipment.goodId;
        const targetId = stop.toCityId || shipment.toCityId;
        if (kg > 0) {
          const price = window.HFV2Goods?.salePriceForCity?.(targetId, goodId) || 0;
          notify({level: 'card', tone: stop.status === 'partial' ? 'neutral' : 'positive', title: stop.status === 'partial' ? 'Teillieferung angekommen' : 'Lieferung abgeschlossen', message: `${goodById(goodId).name} · ${formatGoodAmount(goodId, kg)} · Erlös ${formatCurrency(price * kg)} · ${cityName(targetId)}`});
        } else {
          notify({tone: 'negative', title: 'Lieferung fehlgeschlagen', message: `${goodById(goodId).name} konnte ${cityName(targetId)} nicht erreichen.`, dedupeKey: `delivery-failed:${goodId}:${targetId}`});
        }
      });
    }
  }

  function feedbackForStateChange(event) {
    const reason = String(event?.detail?.reason || '');
    if (reason === 'logistics-order-created') notify({title: 'Auftrag eingeplant', message: 'Die Disposition hat den Transportplan aktualisiert.'});
    if (reason === 'logistics-shipments-created') notify({title: 'Fahrt disponiert', message: 'Fahrzeug und Route sind für die Lieferung reserviert.'});
    if (reason === 'logistics-shipments-advanced') reportShipmentChanges();
  }

  function boot() {
    const cities = loadCities();
    citiesById = Object.fromEntries(cities.map(city => [city.id, city]));
    savePackage = window.HFV2Save?.createDefaultState?.() || {state: {network: window.HFNetwork.createNetworkState({networkOriginNode: 'zurich', selected: 'zurich'}), fleet: window.HFFleet?.createFleetState?.(), factories: window.HFV2Factories?.createFactoryState?.(), goods: window.HFV2Goods?.createGoodsState?.(), time: window.HFV2Save?.defaultTimeState?.() || {day: 1, hour: 8, minute: 0}, logistics: window.HFV2Save?.defaultLogisticsState?.() || window.HFV2Logistics?.createLogisticsState?.() || {orders: [], shipments: [], nextOrderId: 1, nextShipmentId: 1, schemaVersion: 1}}};
    configureGameSystems(cities);
    installActionFeedback();
    document.addEventListener('click', event => {
      if (event.target.closest('[data-hf-v2-receipt-close]')) window.HFV2Modal?.closeModal?.();
    });
    document.getElementById('hfV2CityCount').textContent = `${cities.length.toLocaleString('de-CH')} Orte`;
    bindSaveControls();
    bindTimeControls();
    bindLogisticsPanelActions();
    renderHud();
    renderLiveButton();
    window.addEventListener('hf:network:confirmed', refreshNetworkView);
    window.addEventListener('hf:network:confirmed', () => window.HFV2FleetDispatch?.invalidate?.('network-changed'));
    window.addEventListener('hf:v2:state-changed', refreshChangedStateView);
    window.addEventListener('hf:v2:state-changed', renderHud);
    window.addEventListener('hf:v2:state-changed', feedbackForStateChange);
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
