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

  function configure(options = {}) {
    state = options.state || state || createGoodsState();
    state.cityInventories = state.cityInventories && typeof state.cityInventories === 'object' && !Array.isArray(state.cityInventories) ? state.cityInventories : {};
    state.producedGoods = state.producedGoods && typeof state.producedGoods === 'object' && !Array.isArray(state.producedGoods) ? state.producedGoods : {};
    state.productionCycles = state.productionCycles && typeof state.productionCycles === 'object' && !Array.isArray(state.productionCycles) ? state.productionCycles : {};
    state.lastProductionAt = typeof state.lastProductionAt === 'string' && state.lastProductionAt ? state.lastProductionAt : null;
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
    const inventory = ensureCityInventory(cityId);
    const free = Math.max(0, getCapacityKg(cityId) - getUsedCapacityKg(cityId));
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

  window.HFV2Goods = {createGoodsState, configure, getState, ensureCityInventory, getCityInventory, addToInventory, removeFromInventory, getUsedCapacityKg, getCapacityKg, salePriceForCity, estimateDeliveryProfit};
})();
