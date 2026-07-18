(() => {
  'use strict';

  const FACTORIES = window.HFV2FactoryCatalog || [];
  const STARTING_CASH = window.HFV2Save?.STARTING_CASH ?? 500000;
  const GROUP_MIN_TIERS = Object.freeze({
    agriculture: 1,
    natural: 1,
    mines: 1,
    food: 2,
    industry: 2,
    tech: 3,
  });

  let state = null;

  function createFactoryState(overrides = {}) {
    return {
      cityFactories: {},
      ...overrides,
    };
  }

  function configure(options = {}) {
    state = options.state || state || createFactoryState();
    state.cityFactories = state.cityFactories && typeof state.cityFactories === 'object' && !Array.isArray(state.cityFactories) ? state.cityFactories : {};
    delete state.cash;
    return state;
  }

  function assertCityId(cityId) {
    const id = String(cityId || '').trim();
    if (!id) throw new Error('cityId is required');
    return id;
  }

  function normalizeFactoryList(value = []) {
    return Array.isArray(value) ? value.filter(Boolean).map(factoryId => String(factoryId)) : [];
  }

  function getState() {
    return configure();
  }

  function citySpec(cityId) {
    const id = assertCityId(cityId);
    const fromMap = window.HFV2CitiesById?.[id];
    if (fromMap) return fromMap;
    const raw = (window.HF_CITY_CATALOG || []).find(city => String(city.id || '').trim() === id);
    if (!raw) return null;
    const coordinates = raw.coordinates || {};
    return {
      ...raw,
      lat: Number(raw.lat ?? coordinates.lat),
      lng: Number(raw.lng ?? coordinates.lng),
      tier: Number(raw.tier) || 1,
      slots: Number(raw.slots) || 0,
    };
  }

  function factorySpec(factoryId) {
    const id = String(factoryId || '').trim();
    if (!id) return null;
    return FACTORIES.find(factory => factory.id === id) || null;
  }

  function getCityFactories(cityId) {
    const id = assertCityId(cityId);
    configure();
    state.cityFactories[id] = normalizeFactoryList(state.cityFactories[id]);
    return state.cityFactories[id];
  }

  function getUsedSlots(cityId) {
    return getCityFactories(cityId).length;
  }

  function minTierForFactory(factory) {
    return Number(factory?.minTier ?? factory?.minCityTier ?? GROUP_MIN_TIERS[factory?.group] ?? 1) || 1;
  }

  function isCityUnlocked(cityId) {
    const id = assertCityId(cityId);
    return id === 'zurich' || window.HFNetwork?.getState?.().cities?.[id]?.unlocked === true;
  }

  function canBuildFactory(cityId, factoryId) {
    const id = assertCityId(cityId);
    const city = citySpec(id);
    if (!city) return {ok: false, reason: 'unknown-city', cityId: id, factoryId};

    const factory = factorySpec(factoryId);
    if (!factory) return {ok: false, reason: 'unknown-factory', cityId: id, factoryId};

    if (!isCityUnlocked(id)) return {ok: false, reason: 'city-locked', cityId: id, factoryId};

    const usedSlots = getUsedSlots(id);
    const slots = Math.max(0, Math.floor(Number(city.slots) || 0));
    if (usedSlots >= slots) return {ok: false, reason: 'no-free-slots', cityId: id, factoryId: factory.id, usedSlots, slots};

    const cash = window.HFV2Save?.getCash?.() ?? STARTING_CASH;
    const cost = Number(factory.cost) || 0;
    if (cash < cost) return {ok: false, reason: 'not-enough-cash', cityId: id, factoryId: factory.id, cash, cost};

    const cityTier = Number(city.tier) || 1;
    const minTier = minTierForFactory(factory);
    if (cityTier < minTier) return {ok: false, reason: 'tier-too-low', cityId: id, factoryId: factory.id, cityTier, minTier};

    return {ok: true, cityId: id, factoryId: factory.id, city, factory, usedSlots, slots, cash, cost, cityTier, minTier};
  }

  function buildFactory(cityId, factoryId) {
    const check = canBuildFactory(cityId, factoryId);
    if (!check.ok) return check;

    window.HFV2Save?.changeCash?.(-check.cost, 'factory-built');
    const factories = getCityFactories(check.cityId);
    factories.push(check.factoryId);
    return {ok: true, cityId: check.cityId, factoryId: check.factoryId, owned: factories.length, cost: check.cost, state};
  }

  window.HFV2Factories = {FACTORIES, GROUP_MIN_TIERS, createFactoryState, configure, getState, getCityFactories, getUsedSlots, isCityUnlocked, canBuildFactory, buildFactory};
})();
