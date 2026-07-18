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

  window.HFV2Goods = {createGoodsState, configure, getState, ensureCityInventory, getCityInventory, addToInventory, removeFromInventory, getUsedCapacityKg, getCapacityKg};
})();
