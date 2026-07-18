(() => {
  'use strict';

  const DEFAULT_CITY_CAPACITY_KG = 50000;
  const TIER_CAPACITY_KG = Object.freeze({1: 25000, 2: 75000, 3: 150000});

  let state = null;
  let cities = [];
  let citiesById = {};

  function createGoodsState(overrides = {}) {
    return {
      cityInventories: {},
      producedGoods: {},
      productionCycles: {},
      lastProductionAt: null,
      salesTotals: {revenue: 0, soldKg: 0},
      citySales: {},
      dailyHistory: [],
      lastSalesAt: null,
      schemaVersion: 1,
      ...overrides,
    };
  }

  function normalizeInventory(inventory = {}) {
    const normalized = {};
    for (const [goodId, kg] of Object.entries(inventory || {})) {
      const amount = Math.max(0, Number(kg) || 0);
      if (amount > 0) normalized[String(goodId)] = amount;
    }
    return normalized;
  }

  function addPositive(target, key, amount) {
    const id = String(key || '').trim();
    const value = Math.max(0, Number(amount) || 0);
    if (!id || value <= 0) return;
    target[id] = Math.round(((Number(target[id]) || 0) + value) * 1000) / 1000;
  }

  function normalizePositiveNumberMap(value = {}) {
    const normalized = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return normalized;
    for (const [key, rawAmount] of Object.entries(value)) {
      const amount = Math.max(0, Number(rawAmount) || 0);
      if (amount > 0) normalized[String(key)] = amount;
    }
    return normalized;
  }

  function normalizeSalesTotals(totals = {}) {
    const source = totals && typeof totals === 'object' && !Array.isArray(totals) ? totals : {};
    return {
      revenue: Math.max(0, Number(source.revenue) || 0),
      soldKg: Math.max(0, Number(source.soldKg) || 0),
    };
  }

  function normalizeDailyHistory(history = []) {
    return Array.isArray(history) ? history.filter(entry => entry && typeof entry === 'object').slice(-30) : [];
  }

  function configure(options = {}) {
    state = options.state || state || createGoodsState();
    state.cityInventories = state.cityInventories && typeof state.cityInventories === 'object' && !Array.isArray(state.cityInventories) ? state.cityInventories : {};
    state.producedGoods = state.producedGoods && typeof state.producedGoods === 'object' && !Array.isArray(state.producedGoods) ? state.producedGoods : {};
    state.productionCycles = state.productionCycles && typeof state.productionCycles === 'object' && !Array.isArray(state.productionCycles) ? state.productionCycles : {};
    state.lastProductionAt = typeof state.lastProductionAt === 'string' && state.lastProductionAt ? state.lastProductionAt : null;
    const legacyCitySales = state.salesTotals && typeof state.salesTotals === 'object' && !Array.isArray(state.salesTotals) ? state.salesTotals.byCity : null;
    state.salesTotals = normalizeSalesTotals(state.salesTotals);
    state.citySales = normalizePositiveNumberMap(Object.keys(normalizePositiveNumberMap(state.citySales)).length ? state.citySales : legacyCitySales);
    state.dailyHistory = normalizeDailyHistory(Array.isArray(state.dailyHistory) && state.dailyHistory.length ? state.dailyHistory : state.dailySalesHistory);
    state.lastSalesAt = typeof state.lastSalesAt === 'string' && state.lastSalesAt ? state.lastSalesAt : null;
    delete state.dailySalesHistory;
    state.schemaVersion = Number.isFinite(Number(state.schemaVersion)) ? Number(state.schemaVersion) : 1;
    delete state.cash;

    cities = Array.isArray(options.cities) ? options.cities : cities;
    citiesById = Object.fromEntries(cities.map(city => [String(city.id), city]));
    for (const cityId of Object.keys(state.cityInventories)) {
      state.cityInventories[cityId] = normalizeInventory(state.cityInventories[cityId]);
    }
    return state;
  }

  function getState() {
    return configure();
  }

  function assertCityId(cityId) {
    const id = String(cityId || '').trim();
    if (!id) throw new Error('cityId is required');
    return id;
  }

  function assertGoodId(goodId) {
    const id = String(goodId || '').trim();
    if (!id) throw new Error('goodId is required');
    return id;
  }

  function normalizeKg(kg) {
    const amount = Number(kg);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('kg must be a non-negative number');
    return amount;
  }

  function ensureCityInventory(cityId) {
    const id = assertCityId(cityId);
    configure();
    state.cityInventories[id] = normalizeInventory(state.cityInventories[id]);
    return state.cityInventories[id];
  }

  function getCityInventory(cityId) {
    return {...ensureCityInventory(cityId)};
  }

  function getUsedCapacityKg(cityId) {
    return Object.values(ensureCityInventory(cityId)).reduce((sum, kg) => sum + (Number(kg) || 0), 0);
  }

  function getCapacityKg(cityId) {
    const id = assertCityId(cityId);
    const city = citiesById[id] || window.HFV2CitiesById?.[id] || null;
    const tier = Math.max(1, Math.min(3, Math.floor(Number(city?.tier) || 1)));
    const slots = Math.max(1, Math.floor(Number(city?.slots) || 1));
    return Math.max(DEFAULT_CITY_CAPACITY_KG, (TIER_CAPACITY_KG[tier] || DEFAULT_CITY_CAPACITY_KG) + (slots * 5000));
  }

  function getCityDailyDemandMap(cityId) {
    const id = assertCityId(cityId);
    const city = citiesById[id] || window.HFV2CitiesById?.[id] || null;
    if (!city) return {};
    const goods = window.HF_GOODS_DATABASE?.goods || {};
    const demandGoodIds = Object.keys(goods).filter(goodId => goods[goodId]?.demand?.enabled === true);
    const catalogGoodIds = (window.HFV2GoodsCatalog || []).filter(good => good?.demand?.enabled === true).map(good => good.id);
    const goodIds = Array.from(new Set([...demandGoodIds, ...catalogGoodIds])).filter(Boolean);
    const demandMap = {};
    for (const goodId of goodIds) {
      const kg = Math.max(0, Number(dailyDemandKgForCity(city, goodId)) || 0);
      if (kg > 0) demandMap[String(goodId)] = kg;
    }
    return demandMap;
  }

  function addOrderedDemandEntry(demandMap, cityId, entry) {
    if (!entry || typeof entry !== 'object') return;
    const status = String(entry.status || entry.state || '').toLowerCase();
    if (status && ['done', 'complete', 'completed', 'delivered', 'cancelled', 'canceled', 'closed'].includes(status)) return;
    const destinationId = String(entry.destinationCityId || entry.destinationId || entry.toCityId || entry.cityId || '').trim();
    if (destinationId !== cityId) return;
    const goodId = String(entry.goodId || entry.good || entry.goodsId || '').trim();
    if (!goodId) return;
    const orderedKg = Number(entry.remainingKg ?? entry.openKg ?? entry.pendingKg ?? entry.kg ?? entry.amountKg ?? entry.quantityKg ?? 0) || 0;
    const deliveredKg = Number(entry.deliveredKg ?? entry.fulfilledKg ?? 0) || 0;
    const kg = Math.max(0, orderedKg - deliveredKg);
    if (kg > 0) demandMap[goodId] = (Number(demandMap[goodId]) || 0) + kg;
  }

  function getCityOrderedDemandMap(cityId) {
    const id = assertCityId(cityId);
    const orderApi = window.HFV2Orders || window.HFV2DeliveryOrders || window.HFV2Deliveries;
    const orderState = orderApi?.getState?.() || orderApi?.state || null;
    if (!orderState || typeof orderState !== 'object') return {};
    const demandMap = {};
    const collections = [
      orderState.orders,
      orderState.openOrders,
      orderState.deliveryOrders,
      orderState.deliveries,
      orderState.cityOrders?.[id],
    ];
    for (const collection of collections) {
      if (Array.isArray(collection)) collection.forEach(entry => addOrderedDemandEntry(demandMap, id, entry));
      else if (collection && typeof collection === 'object') Object.values(collection).forEach(entry => addOrderedDemandEntry(demandMap, id, entry));
    }
    return demandMap;
  }

  function mergeDemandMaps(...maps) {
    const merged = {};
    for (const map of maps) {
      for (const [goodId, rawKg] of Object.entries(map || {})) {
        const kg = Math.max(0, Number(rawKg) || 0);
        if (kg > 0) merged[String(goodId)] = (Number(merged[String(goodId)]) || 0) + kg;
      }
    }
    return merged;
  }


  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function goodDefinition(goodId) {
    const id = assertGoodId(goodId);
    return (window.HFV2GoodsCatalog || []).find(good => good.id === id) || window.HF_GOODS_DATABASE?.goods?.[id] || {id, price: 0, category: 'unknown'};
  }

  function goodEconomics(good) {
    const fallbackByCategory = {
      consumer_goods: {maxDailyDemandKg: 160, saturationSensitivity: 0.9, securityCostPerKm: 0.05, marketVolatility: 0.05},
      processed_food: {maxDailyDemandKg: 600, saturationSensitivity: 0.35, securityCostPerKm: 0.01, marketVolatility: 0.02},
      vegetable: {maxDailyDemandKg: 1200, saturationSensitivity: 0.22, securityCostPerKm: 0, marketVolatility: 0.015},
      fruit: {maxDailyDemandKg: 900, saturationSensitivity: 0.28, securityCostPerKm: 0, marketVolatility: 0.02},
      animal_products: {maxDailyDemandKg: 650, saturationSensitivity: 0.38, securityCostPerKm: 0.015, marketVolatility: 0.025},
    };
    const catalogEconomics = good?.economics || {};
    const databaseEconomics = window.HF_GOODS_DATABASE?.goods?.[good?.id]?.economics || {};
    return {...(fallbackByCategory[good?.category] || {}), ...databaseEconomics, ...catalogEconomics};
  }

  function dailyDemandKgForCity(city, goodId) {
    const id = assertGoodId(goodId);
    const goods = window.HF_GOODS_DATABASE?.goods || {};
    const demandGoods = Object.keys(goods).filter(key => goods[key]?.demand?.enabled === true);
    const demands = window.HF_GAME_MECHANICS?.makeDemandsV2?.(city, demandGoods) || {};
    const demand = demands[id] || null;
    return Math.max(0, (Number(demand?.need) || 0) * (Number(demand?.dailyRate) || 1));
  }

  function stableVolatility(cityId, goodId, volatility) {
    const amount = clamp(Number(volatility) || 0, 0, 0.5);
    if (amount <= 0) return 1;
    const seed = String(cityId || '') + ':' + String(goodId || '');
    const rand = window.HF_GAME_MECHANICS?.seeded?.(seed)?.() ?? 0.5;
    return 1 + (rand * 2 - 1) * amount;
  }

  function salePriceForCity(cityOrId, goodId, options = {}) {
    const good = goodDefinition(goodId);
    const city = typeof cityOrId === 'object' && cityOrId ? cityOrId : citiesById[String(cityOrId)] || window.HFV2CitiesById?.[String(cityOrId)] || {id: cityOrId, wealthFactor: 1};
    const economics = goodEconomics(good);
    const basePrice = Math.max(0, Number(good.price) || 0);
    const stockKg = Math.max(0, Number(options.stockKg ?? ensureCityInventory(city.id)[good.id]) || 0);
    const computedDailyDemandKg = dailyDemandKgForCity(city, good.id);
    const maxDailyDemandKg = Math.max(1, Number(economics.maxDailyDemandKg) || computedDailyDemandKg || 1);
    const referenceDemandKg = Math.max(1, Math.min(maxDailyDemandKg, computedDailyDemandKg || maxDailyDemandKg));
    const saturationRatio = stockKg / referenceDemandKg;
    const sensitivity = Math.max(0, Number(economics.saturationSensitivity) || 0);
    const luxuryMultiplier = economics.luxuryDemand === true ? 1.35 : 1;
    const saturationDiscount = Math.pow(1 + Math.max(0, saturationRatio - 0.8), sensitivity * luxuryMultiplier);
    const wealthFactor = Math.max(0.25, Number(city?.wealthFactor) || 1);
    const price = basePrice * wealthFactor * stableVolatility(city?.id, good.id, economics.marketVolatility) / saturationDiscount;
    const minimumFactor = economics.luxuryDemand === true ? 0.18 : 0.45;
    return Math.round(Math.max(basePrice * minimumFactor, price) * 100) / 100;
  }

  function estimateDeliveryProfit({originCityId, destinationCityId, goodId, kg, distanceKm, transportCostPerKm = 0} = {}) {
    const amountKg = normalizeKg(kg || 0);
    const good = goodDefinition(goodId);
    const economics = goodEconomics(good);
    const destination = citiesById[String(destinationCityId)] || window.HFV2CitiesById?.[String(destinationCityId)] || {id: destinationCityId, wealthFactor: 1};
    const km = Math.max(0, Number(distanceKm) || 0);
    const salePrice = salePriceForCity(destination, good.id, {stockKg: (ensureCityInventory(destination.id)[good.id] || 0) + amountKg});
    const revenue = salePrice * amountKg;
    const transportCost = km * Math.max(0, Number(transportCostPerKm) || 0);
    const securityCost = km * Math.max(0, Number(economics.securityCostPerKm) || 0);
    return {originCityId, destinationCityId, goodId: good.id, kg: amountKg, distanceKm: km, salePrice, revenue: Math.round(revenue * 100) / 100, transportCost: Math.round(transportCost * 100) / 100, securityCost: Math.round(securityCost * 100) / 100, profit: Math.round((revenue - transportCost - securityCost) * 100) / 100};
  }

  function addToInventory(cityId, goodId, kg) {
    const id = assertGoodId(goodId);
    const amount = normalizeKg(kg);
    const free = Math.max(0, getCapacityKg(cityId) - getUsedCapacityKg(cityId));
    const inventory = ensureCityInventory(cityId);
    const added = Math.min(amount, free);
    if (added <= 0) return {ok: false, reason: 'capacity-full', addedKg: 0, requestedKg: amount, freeCapacityKg: free, inventory};
    inventory[id] = (Number(inventory[id]) || 0) + added;
    window.HFV2Save?.dispatchStateChanged?.('goods-inventory-added');
    return {ok: added === amount, reason: added === amount ? null : 'capacity-limited', addedKg: added, requestedKg: amount, freeCapacityKg: free, inventory};
  }

  function removeFromInventory(cityId, goodId, kg) {
    const id = assertGoodId(goodId);
    const amount = normalizeKg(kg);
    const inventory = ensureCityInventory(cityId);
    const current = Number(inventory[id]) || 0;
    const removed = Math.min(amount, current);
    if (removed <= 0) return {ok: false, reason: 'not-in-stock', removedKg: 0, requestedKg: amount, availableKg: current, inventory};
    const next = current - removed;
    if (next > 0) inventory[id] = next;
    else delete inventory[id];
    window.HFV2Save?.dispatchStateChanged?.('goods-inventory-removed');
    return {ok: removed === amount, reason: removed === amount ? null : 'stock-limited', removedKg: removed, requestedKg: amount, availableKg: current, inventory};
  }


  function knownCityIds() {
    return new Set([
      ...cities.map(city => String(city?.id || '').trim()).filter(Boolean),
      ...Object.keys(window.HFV2CitiesById || {}),
      ...Object.keys(state?.cityInventories || {}),
    ]);
  }

  function runDailySales() {
    configure();
    const goods = window.HF_GOODS_DATABASE?.goods || {};
    const demandGoodIds = Object.keys(goods).filter(goodId => goods[goodId]?.demand?.enabled === true);
    const summary = {revenue: 0, soldKg: 0, cities: 0, goods: 0, byCity: {}, byGood: {}};
    if (!demandGoodIds.length) return summary;

    for (const cityId of knownCityIds()) {
      const city = citiesById[cityId] || window.HFV2CitiesById?.[cityId] || {id: cityId, wealthFactor: 1};
      const inventory = ensureCityInventory(cityId);
      let cityRevenue = 0;
      let citySoldKg = 0;

      for (const goodId of demandGoodIds) {
        const inventoryKg = Math.max(0, Number(inventory[goodId]) || 0);
        if (inventoryKg <= 0) continue;
        const dailyDemandKg = Math.max(0, Number(dailyDemandKgForCity(city, goodId)) || 0);
        const soldKg = Math.min(inventoryKg, dailyDemandKg);
        if (soldKg <= 0) continue;

        const price = salePriceForCity(city, goodId, {stockKg: inventoryKg});
        const result = removeFromInventory(cityId, goodId, soldKg);
        const removedKg = Math.max(0, Number(result.removedKg) || 0);
        if (removedKg <= 0) continue;

        const bookedRevenue = Math.round(price * removedKg * 100) / 100;
        window.HFV2Save?.changeCash?.(bookedRevenue, 'goods-daily-sales');
        summary.revenue += bookedRevenue;
        summary.soldKg += removedKg;
        cityRevenue += bookedRevenue;
        citySoldKg += removedKg;
        addPositive(summary.byGood, goodId, removedKg);
      }

      if (citySoldKg > 0) {
        summary.cities += 1;
        addPositive(summary.byCity, cityId, cityRevenue);
      }
    }

    summary.revenue = Math.round(summary.revenue * 100) / 100;
    summary.soldKg = Math.round(summary.soldKg * 1000) / 1000;
    summary.goods = Object.keys(summary.byGood).length;
    state.salesTotals = normalizeSalesTotals(state.salesTotals);
    state.salesTotals.revenue = Math.round((state.salesTotals.revenue + summary.revenue) * 100) / 100;
    state.salesTotals.soldKg = Math.round((state.salesTotals.soldKg + summary.soldKg) * 1000) / 1000;
    state.citySales = normalizePositiveNumberMap(state.citySales);
    for (const [cityId, revenue] of Object.entries(summary.byCity)) addPositive(state.citySales, cityId, revenue);
    state.lastSalesAt = new Date().toISOString();
    if (summary.soldKg > 0 || summary.revenue > 0) {
      state.dailyHistory = normalizeDailyHistory(state.dailyHistory);
      state.dailyHistory.push({at: state.lastSalesAt, revenue: summary.revenue, soldKg: summary.soldKg, cities: summary.cities, goods: summary.goods});
      state.dailyHistory = state.dailyHistory.slice(-30);
    }
    window.HFV2Save?.dispatchStateChanged?.('goods-daily-sales');
    return summary;
  }

  const sellCityDemandAtMidnight = runDailySales;


  function factoryDefinition(factoryId) {
    const id = String(factoryId || '').trim();
    if (!id) return null;
    return (window.HFV2FactoryCatalog || []).find(factory => factory.id === id) || null;
  }

  function normalizeRecipeMap(value = {}) {
    const normalized = {};
    for (const [goodId, rawKg] of Object.entries(value || {})) {
      const amount = Math.max(0, Number(rawKg) || 0);
      if (amount > 0) normalized[String(goodId)] = amount;
    }
    return normalized;
  }

  function hasEnoughInputs(cityId, inputs) {
    const inventory = ensureCityInventory(cityId);
    return Object.entries(inputs).every(([goodId, kg]) => (Number(inventory[goodId]) || 0) >= kg);
  }

  function recipeOptions(factory) {
    const recipes = Array.isArray(factory?.recipes) ? factory.recipes : [];
    if (recipes.length) return recipes.map(recipe => ({
      id: recipe.id || factory.id,
      inputs: normalizeRecipeMap(recipe.inputs),
      outputs: normalizeRecipeMap(recipe.outputs ?? recipe.output),
    }));
    return [{id: factory?.id, inputs: normalizeRecipeMap(factory?.inputs), outputs: normalizeRecipeMap(factory?.outputs ?? factory?.output)}];
  }

  function recipeMissingKg(recipe, missingMap) {
    return Object.entries(recipe.outputs || {}).reduce((sum, [goodId, kg]) => sum + Math.min(Number(kg) || 0, Math.max(0, Number(missingMap[goodId]) || 0)), 0);
  }

  function maxInputScale(cityId, inputs) {
    const inventory = ensureCityInventory(cityId);
    let scale = Infinity;
    for (const [goodId, kg] of Object.entries(inputs || {})) {
      const required = Number(kg) || 0;
      if (required <= 0) continue;
      scale = Math.min(scale, (Number(inventory[goodId]) || 0) / required);
    }
    return scale === Infinity ? 1 : Math.max(0, scale);
  }

  function maxDemandScale(outputs, missingMap) {
    let scale = Infinity;
    for (const [goodId, kg] of Object.entries(outputs || {})) {
      const outputKg = Number(kg) || 0;
      if (outputKg <= 0) continue;
      scale = Math.min(scale, Math.max(0, Number(missingMap[goodId]) || 0) / outputKg);
    }
    return scale === Infinity ? 0 : Math.max(0, scale);
  }

  function runDailyProduction() {
    configure();
    const summary = {madeKg: 0, blocked: 0, factories: 0, demandLimited: 0, capacityLimited: 0};
    const factoryApi = window.HFV2Factories;
    if (!factoryApi?.getCityFactories) return summary;

    const cityIds = new Set([
      ...cities.map(city => String(city.id || '').trim()).filter(Boolean),
      ...Object.keys(window.HFV2CitiesById || {}),
      ...Object.keys(factoryApi.getState?.().cityFactories || {}),
    ]);

    for (const cityId of cityIds) {
      const targetDemand = mergeDemandMaps(getCityDailyDemandMap(cityId), getCityOrderedDemandMap(cityId));
      const inventory = ensureCityInventory(cityId);
      const missingMap = {};
      for (const [goodId, targetKg] of Object.entries(targetDemand)) {
        const missingKg = Math.max(0, (Number(targetKg) || 0) - (Number(inventory[goodId]) || 0));
        if (missingKg > 0) missingMap[goodId] = missingKg;
      }

      const builtFactories = factoryApi.getCityFactories(cityId);
      for (const factoryId of builtFactories) {
        const factory = factoryDefinition(factoryId);
        summary.factories += 1;
        if (!factory) {
          summary.blocked += 1;
          continue;
        }

        const recipes = recipeOptions(factory)
          .filter(recipe => Object.keys(recipe.outputs).length && recipeMissingKg(recipe, missingMap) > 0)
          .sort((a, b) => recipeMissingKg(b, missingMap) - recipeMissingKg(a, missingMap));
        const recipe = recipes[0] || null;
        if (!recipe) {
          summary.blocked += 1;
          summary.demandLimited += 1;
          continue;
        }

        const demandScale = Math.min(1, maxDemandScale(recipe.outputs, missingMap));
        const outputKgPerCycle = Object.values(recipe.outputs).reduce((sum, kg) => sum + (Number(kg) || 0), 0);
        const freeCapacityKg = Math.max(0, getCapacityKg(cityId) - getUsedCapacityKg(cityId));
        const capacityScale = outputKgPerCycle > 0 ? Math.min(1, freeCapacityKg / outputKgPerCycle) : 0;
        const inputScale = Math.min(1, maxInputScale(cityId, recipe.inputs));
        const scale = Math.min(demandScale, capacityScale, inputScale);

        if (scale <= 0) {
          summary.blocked += 1;
          if (demandScale <= 0) summary.demandLimited += 1;
          if (capacityScale <= 0) summary.capacityLimited += 1;
          continue;
        }
        if (inputScale < Math.min(demandScale, capacityScale)) summary.blocked += 1;
        if (demandScale < 1) summary.demandLimited += 1;
        if (capacityScale < Math.min(1, demandScale)) summary.capacityLimited += 1;

        for (const [goodId, kg] of Object.entries(recipe.inputs)) {
          removeFromInventory(cityId, goodId, (Number(kg) || 0) * scale);
        }
        for (const [goodId, kg] of Object.entries(recipe.outputs)) {
          const requestedKg = (Number(kg) || 0) * scale;
          const result = addToInventory(cityId, goodId, requestedKg);
          const addedKg = Number(result.addedKg) || 0;
          summary.madeKg += addedKg;
          missingMap[goodId] = Math.max(0, (Number(missingMap[goodId]) || 0) - addedKg);
        }
      }
    }

    summary.madeKg = Math.round(summary.madeKg * 1000) / 1000;
    state.lastProductionAt = new Date().toISOString();
    state.productionCycles.daily = (Number(state.productionCycles.daily) || 0) + 1;
    window.HFV2Save?.dispatchStateChanged?.('goods-daily-production');
    return summary;
  }

  window.HFV2Goods = {createGoodsState, configure, getState, ensureCityInventory, getCityInventory, addToInventory, removeFromInventory, getUsedCapacityKg, getCapacityKg, salePriceForCity, estimateDeliveryProfit, getCityDailyDemandMap, getCityOrderedDemandMap, mergeDemandMaps, runDailyProduction, runDailySales, sellCityDemandAtMidnight};
})();
