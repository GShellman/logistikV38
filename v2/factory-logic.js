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
      factoryUpgrades: {},
      ...overrides,
    };
  }

  function configure(options = {}) {
    state = options.state || state || createFactoryState();
    state.cityFactories = state.cityFactories && typeof state.cityFactories === 'object' && !Array.isArray(state.cityFactories) ? state.cityFactories : {};
    state.factoryUpgrades = state.factoryUpgrades && typeof state.factoryUpgrades === 'object' && !Array.isArray(state.factoryUpgrades) ? state.factoryUpgrades : {};
    for (const cityId of Object.keys(state.cityFactories)) {
      const rawFactories = state.cityFactories[cityId];
      state.cityFactories[cityId] = normalizeFactoryList(rawFactories);
      state.factoryUpgrades[cityId] = normalizeUpgradeMap(state.factoryUpgrades[cityId], rawFactories);
    }
    delete state.cash;
    return state;
  }

  function assertCityId(cityId) {
    const id = String(cityId || '').trim();
    if (!id) throw new Error('cityId is required');
    return id;
  }

  function normalizeFactoryEntry(entry) {
    if (typeof entry === 'string') return String(entry || '').trim();
    if (entry && typeof entry === 'object') return String(entry.id ?? entry.factoryId ?? '').trim();
    return '';
  }

  function normalizeFactoryList(value = []) {
    return Array.isArray(value) ? value.map(normalizeFactoryEntry).filter(Boolean) : [];
  }

  function normalizeLevel(value) {
    const level = Math.trunc(Number(value) || 1);
    return Math.max(1, level);
  }

  function normalizeUpgradeMap(value = {}, factories = []) {
    const normalized = {};
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, level] of Object.entries(value)) normalized[String(key)] = normalizeLevel(level);
    }
    if (Array.isArray(factories)) {
      factories.forEach((entry, index) => {
        const inlineLevel = entry && typeof entry === 'object' ? entry.level : null;
        if (inlineLevel != null) normalized[String(index)] = normalizeLevel(inlineLevel);
      });
    }
    return normalized;
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
    state.factoryUpgrades[id] = normalizeUpgradeMap(state.factoryUpgrades[id], state.cityFactories[id]);
    return state.cityFactories[id];
  }

  function getCityFactoryInstances(cityId) {
    const id = assertCityId(cityId);
    const factories = getCityFactories(id);
    return factories.map((factoryId, index) => ({id: factoryId, index, key: String(index), level: getFactoryLevel(id, index)}));
  }

  function getUsedSlots(cityId) {
    return getCityFactories(cityId).length;
  }

  function resolveFactoryInstance(cityId, factoryRef) {
    const id = assertCityId(cityId);
    const factories = getCityFactories(id);
    if (!factories.length) return {cityId: id, index: -1, key: '', factoryId: '', factory: null};
    let index = -1;
    if (typeof factoryRef === 'number' || /^\d+$/.test(String(factoryRef ?? ''))) index = Math.trunc(Number(factoryRef));
    else if (factoryRef && typeof factoryRef === 'object') {
      if (factoryRef.index != null || factoryRef.key != null) index = Math.trunc(Number(factoryRef.index ?? factoryRef.key));
      else if (factoryRef.id || factoryRef.factoryId) index = factories.indexOf(String(factoryRef.id ?? factoryRef.factoryId));
    } else {
      index = factories.indexOf(String(factoryRef || '').trim());
    }
    const factoryId = index >= 0 && index < factories.length ? factories[index] : '';
    return {cityId: id, index, key: String(index), factoryId, factory: factorySpec(factoryId)};
  }

  function getFactoryLevel(cityId, factoryRef) {
    const resolved = resolveFactoryInstance(cityId, factoryRef);
    if (!resolved.factoryId) return 1;
    return normalizeLevel(state.factoryUpgrades?.[resolved.cityId]?.[resolved.key]);
  }

  function outputMultiplierForLevel(level) {
    return Math.max(1, normalizeLevel(level));
  }

  function operatingCostMultiplierForLevel(level) {
    const normalized = normalizeLevel(level);
    return Math.round((1 + (normalized - 1) * 0.75) * 100) / 100;
  }

  function baseOperatingCostForFactory(factory) {
    const explicit = Number(factory?.maintenance ?? factory?.dailyCost ?? factory?.operatingCost);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return Math.round(Math.max(0, Number(factory?.cost) || 0) * 0.01);
  }

  function operatingCostForFactory(factory, level = 1) {
    return Math.round(baseOperatingCostForFactory(factory) * operatingCostMultiplierForLevel(level));
  }

  function upgradeCostForFactory(factory, level = 1) {
    const nextLevel = normalizeLevel(level) + 1;
    const buildCost = Math.max(0, Number(factory?.cost) || 0);
    if (buildCost <= 0) return 0;
    return Math.round(buildCost * 0.6 * Math.pow(1.6, Math.max(0, nextLevel - 2)));
  }

  function canUpgradeFactory(cityId, factoryRef) {
    const resolved = resolveFactoryInstance(cityId, factoryRef);
    if (!resolved.factoryId) return {ok: false, reason: 'unknown-factory-instance', cityId: resolved.cityId, factoryRef};
    if (!resolved.factory) return {ok: false, reason: 'unknown-factory', cityId: resolved.cityId, factoryId: resolved.factoryId, index: resolved.index};
    const level = getFactoryLevel(resolved.cityId, resolved.index);
    const cost = upgradeCostForFactory(resolved.factory, level);
    const cash = window.HFV2Save?.getCash?.() ?? STARTING_CASH;
    if (cash < cost) return {ok: false, reason: 'not-enough-cash', cityId: resolved.cityId, factoryId: resolved.factoryId, index: resolved.index, level, nextLevel: level + 1, cash, cost};
    return {ok: true, cityId: resolved.cityId, factoryId: resolved.factoryId, index: resolved.index, key: resolved.key, factory: resolved.factory, level, nextLevel: level + 1, cash, cost};
  }

  function upgradeFactory(cityId, factoryRef) {
    const check = canUpgradeFactory(cityId, factoryRef);
    if (!check.ok) return check;
    window.HFV2Save?.changeCash?.(-check.cost, 'factory-upgraded');
    state.factoryUpgrades[check.cityId] = normalizeUpgradeMap(state.factoryUpgrades[check.cityId], state.cityFactories[check.cityId]);
    state.factoryUpgrades[check.cityId][check.key] = check.nextLevel;
    window.HFV2Save?.dispatchStateChanged?.('factory-upgraded');
    return {ok: true, cityId: check.cityId, factoryId: check.factoryId, index: check.index, level: check.nextLevel, previousLevel: check.level, cost: check.cost, state};
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
    state.factoryUpgrades[check.cityId] = normalizeUpgradeMap(state.factoryUpgrades[check.cityId], factories);
    window.HFV2Save?.dispatchStateChanged?.('factory-built');
    return {ok: true, cityId: check.cityId, factoryId: check.factoryId, owned: factories.length, cost: check.cost, state};
  }

  window.HFV2Factories = {FACTORIES, GROUP_MIN_TIERS, createFactoryState, configure, getState, getCityFactories, getCityFactoryInstances, getUsedSlots, isCityUnlocked, getFactoryLevel, upgradeFactory, canUpgradeFactory, upgradeCostForFactory, outputMultiplierForLevel, operatingCostMultiplierForLevel, operatingCostForFactory, canBuildFactory, buildFactory};
})();
