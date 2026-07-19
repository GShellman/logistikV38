(() => {
  'use strict';

  const SCHEMA_VERSION = 3;
  const SAVE_FILE_PREFIX = 'helvetic-freight-v2';
  const STARTING_CASH = 500000;

  let state = null;

  function dispatchStateChanged(reason = 'state-updated') {
    window.dispatchEvent?.(new CustomEvent('hf:v2:state-changed', {detail: {reason, state, cash: state?.cash}}));
  }

  function getState() {
    if (!state) state = createDefaultState().state;
    return state;
  }

  function getCash() {
    return Number(getState().cash) || 0;
  }

  function setCash(value, reason = 'cash-changed') {
    const nextCash = Number(value);
    if (!Number.isFinite(nextCash)) return getCash();
    getState().cash = nextCash;
    dispatchStateChanged(reason);
    return nextCash;
  }

  function changeCash(delta, reason = 'cash-changed') {
    return setCash(getCash() + (Number(delta) || 0), reason);
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function defaultNetworkState() {
    if (window.HFNetwork?.createNetworkState) {
      return window.HFNetwork.createNetworkState({networkOriginNode: 'zurich', selected: 'zurich'});
    }
    return {connections: [], pendingProject: null, networkOriginNode: 'zurich', selected: 'zurich', cities: {zurich: {unlocked: true}}, junctions: [], usedCapacity: {}};
  }

  function defaultFleetState() {
    if (window.HFFleet?.createFleetState) return window.HFFleet.createFleetState();
    return {cityFleets: {}};
  }

  function defaultFactoryState() {
    if (window.HFV2Factories?.createFactoryState) return window.HFV2Factories.createFactoryState();
    return {cityFactories: {}};
  }

  function defaultGoodsState() {
    if (window.HFV2Goods?.createGoodsState) return window.HFV2Goods.createGoodsState();
    return {cityInventories: {}, producedGoods: {}, productionCycles: {}, lastProductionAt: null, salesTotals: {revenue: 0, soldKg: 0}, citySales: {}, dailyHistory: [], lastSalesAt: null, schemaVersion: 1};
  }

  function defaultTimeState() {
    return {day: 1, hour: 8, minute: 0};
  }

  function defaultLogisticsState() {
    if (window.HFV2Logistics?.createLogisticsState) return window.HFV2Logistics.createLogisticsState();
    return {orders: [], shipments: [], nextOrderId: 1, nextShipmentId: 1, schemaVersion: 1};
  }

  function normalizeTimeUnit(value, fallback, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const integer = Math.trunc(numeric);
    return integer >= min && integer <= max ? integer : fallback;
  }

  function normalizePackage(savePackage) {
    const source = savePackage && typeof savePackage === 'object' ? savePackage : {};
    const sourceState = source.state && typeof source.state === 'object' ? source.state : {};
    const network = {...defaultNetworkState(), ...(sourceState.network || {})};
    const fleet = {...defaultFleetState(), ...(sourceState.fleet || {})};
    const sourceFactories = sourceState.factories && typeof sourceState.factories === 'object' && !Array.isArray(sourceState.factories) ? sourceState.factories : {};
    const factories = {...defaultFactoryState(), ...sourceFactories};
    const sourceGoods = sourceState.goods && typeof sourceState.goods === 'object' && !Array.isArray(sourceState.goods) ? sourceState.goods : {};
    const goods = {...defaultGoodsState(), ...sourceGoods};
    const sourceTime = sourceState.time && typeof sourceState.time === 'object' && !Array.isArray(sourceState.time) ? sourceState.time : {};
    const sourceLogistics = sourceState.logistics && typeof sourceState.logistics === 'object' && !Array.isArray(sourceState.logistics) ? sourceState.logistics : {};
    const logistics = {...defaultLogisticsState(), ...sourceLogistics};
    const timeDefaults = defaultTimeState();
    const time = {
      day: normalizeTimeUnit(sourceTime.day, timeDefaults.day, 1, Number.MAX_SAFE_INTEGER),
      hour: normalizeTimeUnit(sourceTime.hour, timeDefaults.hour, 0, 23),
      minute: normalizeTimeUnit(sourceTime.minute, timeDefaults.minute, 0, 59),
    };
    network.connections = Array.isArray(network.connections) ? network.connections : [];
    network.junctions = Array.isArray(network.junctions) ? network.junctions : [];
    network.cities = network.cities && typeof network.cities === 'object' ? network.cities : {};
    network.cities.zurich = {...(network.cities.zurich || {}), unlocked: true};
    network.usedCapacity = network.usedCapacity && typeof network.usedCapacity === 'object' ? network.usedCapacity : {};
    fleet.cityFleets = fleet.cityFleets && typeof fleet.cityFleets === 'object' ? fleet.cityFleets : {};
    factories.cityFactories = factories.cityFactories && typeof factories.cityFactories === 'object' && !Array.isArray(factories.cityFactories) ? factories.cityFactories : {};
    goods.cityInventories = goods.cityInventories && typeof goods.cityInventories === 'object' && !Array.isArray(goods.cityInventories) ? goods.cityInventories : {};
    goods.producedGoods = goods.producedGoods && typeof goods.producedGoods === 'object' && !Array.isArray(goods.producedGoods) ? goods.producedGoods : {};
    goods.productionCycles = goods.productionCycles && typeof goods.productionCycles === 'object' && !Array.isArray(goods.productionCycles) ? goods.productionCycles : {};
    goods.lastProductionAt = typeof goods.lastProductionAt === 'string' && goods.lastProductionAt ? goods.lastProductionAt : null;
    const sourceSalesTotals = goods.salesTotals && typeof goods.salesTotals === 'object' && !Array.isArray(goods.salesTotals) ? goods.salesTotals : {};
    const normalizePositiveNumberMap = value => {
      const normalized = {};
      if (!value || typeof value !== 'object' || Array.isArray(value)) return normalized;
      for (const [key, rawAmount] of Object.entries(value)) {
        const amount = Math.max(0, Number(rawAmount) || 0);
        if (amount > 0) normalized[String(key)] = amount;
      }
      return normalized;
    };
    goods.salesTotals = {
      revenue: Math.max(0, Number(sourceSalesTotals.revenue) || 0),
      soldKg: Math.max(0, Number(sourceSalesTotals.soldKg) || 0),
    };
    goods.citySales = normalizePositiveNumberMap(Object.keys(normalizePositiveNumberMap(goods.citySales)).length ? goods.citySales : sourceSalesTotals.byCity);
    {
      const sourceDailyHistory = Array.isArray(goods.dailyHistory) && goods.dailyHistory.length ? goods.dailyHistory : goods.dailySalesHistory;
      goods.dailyHistory = Array.isArray(sourceDailyHistory) ? sourceDailyHistory.filter(entry => entry && typeof entry === 'object').slice(-30) : [];
    }
    goods.lastSalesAt = typeof goods.lastSalesAt === 'string' && goods.lastSalesAt ? goods.lastSalesAt : null;
    delete goods.dailySalesHistory;
    goods.schemaVersion = Number.isFinite(Number(goods.schemaVersion)) ? Number(goods.schemaVersion) : 1;
    logistics.orders = Array.isArray(logistics.orders) ? logistics.orders : [];
    logistics.shipments = Array.isArray(logistics.shipments) ? logistics.shipments : [];
    logistics.nextOrderId = Math.max(1, Math.trunc(Number(logistics.nextOrderId) || 1));
    logistics.nextShipmentId = Math.max(1, Math.trunc(Number(logistics.nextShipmentId) || 1));
    delete network.cash;
    delete fleet.cash;
    delete factories.cash;
    delete goods.cash;
    delete time.cash;
    delete logistics.cash;
    const legacyCash = Number.isFinite(Number(sourceState.cash)) ? Number(sourceState.cash) : Number(sourceState.fleet?.cash ?? sourceState.network?.cash);
    const cash = Number.isFinite(legacyCash) ? legacyCash : STARTING_CASH;

    return {
      schemaVersion: SCHEMA_VERSION,
      savedAt: source.savedAt || new Date().toISOString(),
      state: {cash, network, fleet, factories, goods, time, logistics},
    };
  }

  function createDefaultState() {
    return normalizePackage({schemaVersion: SCHEMA_VERSION, state: {network: defaultNetworkState(), fleet: defaultFleetState(), factories: defaultFactoryState(), goods: defaultGoodsState(), time: defaultTimeState(), logistics: defaultLogisticsState()}});
  }

  function serializeState(savePackage = null) {
    const liveNetwork = window.HFNetwork?.getState?.();
    const liveFleet = window.HFFleet?.getState?.();
    const liveFactories = window.HFV2Factories?.getState?.();
    const liveGoods = window.HFV2Goods?.getState?.();
    const liveTime = window.HFV2Time?.getState?.();
    const liveLogistics = window.HFV2Logistics?.getState?.();
    const source = savePackage || {state: {network: liveNetwork, fleet: liveFleet, factories: liveFactories || getState().factories, goods: liveGoods || getState().goods, time: liveTime || getState().time, logistics: liveLogistics || getState().logistics, cash: getCash()}};
    const normalized = normalizePackage(source);
    normalized.savedAt = new Date().toISOString();
    return deepClone(normalized);
  }

  function hydrateState(savePackage) {
    const normalized = normalizePackage(savePackage);
    return deepClone(normalized);
  }

  function configureState(savePackageOrState) {
    const nextState = savePackageOrState?.state || savePackageOrState || createDefaultState().state;
    const normalized = normalizePackage({state: nextState});
    state = normalized.state;
    dispatchStateChanged('state-configured');
    return state;
  }

  function downloadJson(savePackage) {
    const blob = new Blob([JSON.stringify(savePackage, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${SAVE_FILE_PREFIX}-${savePackage.savedAt.replace(/[:.]/g, '-')}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportSave(savePackage = null) {
    const serialized = serializeState(savePackage);
    if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && window.URL) downloadJson(serialized);
    return serialized;
  }

  async function importSave(fileOrJson) {
    let raw = fileOrJson;
    if (typeof File !== 'undefined' && fileOrJson instanceof File) raw = await fileOrJson.text();
    if (typeof Blob !== 'undefined' && fileOrJson instanceof Blob && typeof fileOrJson.text === 'function') raw = await fileOrJson.text();
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return hydrateState(parsed);
  }

  window.HFV2Save = {SCHEMA_VERSION, STARTING_CASH, defaultTimeState, defaultLogisticsState, createDefaultState, configureState, getState, getCash, setCash, changeCash, dispatchStateChanged, serializeState, hydrateState, exportSave, importSave};
})();
