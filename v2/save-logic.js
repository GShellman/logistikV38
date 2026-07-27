(() => {
  'use strict';

  const SCHEMA_VERSION = 6;
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

  const REASON_CATEGORIES = Object.freeze({
    'goods-daily-sales': 'sales',
    'network-maintenance': 'network-maintenance',
    'factory-operation': 'factory-operation',
    'fleet-daily': 'fleet-daily',
    'logistics-shipment-cost': 'shipment-distance',
    'logistics-repositioning-cost': 'repositioning-distance',
    'fleet-buy': 'vehicle-purchase',
    'fleet-sell': 'vehicle-sale',
    'factory-built': 'factory-build',
    'factory-upgraded': 'factory-upgrade',
    'network-build': 'network-build',
  });

  function changeCash(delta, reason = 'cash-changed', details = {}) {
    const amount = Math.round((Number(delta) || 0) * 100) / 100;
    const current = getState();
    current.finance = normalizeFinanceState(current.finance);
    const bookingId = String(details.bookingId || '').trim();
    if (bookingId && current.finance.journal.some(entry => entry.bookingId === bookingId)) return getCash();
    const absMinute = Number.isFinite(Number(details.absMinute)) ? Math.max(0, Math.trunc(Number(details.absMinute))) : absoluteMinute(current.time);
    const entry = {
      id: `finance-${current.finance.nextEntryId++}`,
      bookingId: bookingId || undefined,
      day: Math.floor(absMinute / 1440) + 1,
      absMinute,
      amount,
      category: String(details.category || REASON_CATEGORIES[reason] || 'other'),
      reason: String(reason || 'cash-changed'),
      reference: details.reference && typeof details.reference === 'object' ? deepClone(details.reference) : undefined,
    };
    current.cash = Math.round((getCash() + amount) * 100) / 100;
    current.finance.journal.push(entry);
    dispatchStateChanged(reason);
    return current.cash;
  }

  function absoluteMinute(time = {}) {
    return (Math.max(1, Math.trunc(Number(time.day) || 1)) - 1) * 1440 + Math.max(0, Math.trunc(Number(time.hour) || 0)) * 60 + Math.max(0, Math.trunc(Number(time.minute) || 0));
  }

  function normalizeFinanceState(finance = {}) {
    const journal = Array.isArray(finance?.journal) ? finance.journal.filter(entry => entry && typeof entry === 'object').map((entry, index) => ({
      ...entry,
      id: String(entry.id || `finance-${index + 1}`),
      day: Math.max(1, Math.trunc(Number(entry.day) || (Math.floor((Number(entry.absMinute) || 0) / 1440) + 1))),
      absMinute: Math.max(0, Math.trunc(Number(entry.absMinute) || 0)),
      amount: Math.round((Number(entry.amount) || 0) * 100) / 100,
      category: String(entry.category || REASON_CATEGORIES[entry.reason] || 'other'),
      reason: String(entry.reason || 'cash-changed'),
    })) : [];
    return {journal, nextEntryId: Math.max(1, Math.trunc(Number(finance?.nextEntryId) || 1), journal.length + 1), lastClosedDay: Math.max(0, Math.trunc(Number(finance?.lastClosedDay) || 0))};
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
    return {vehicles: [], nextVehicleId: 1, depotCityId: 'zurich'};
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
    return {orders: [], shipments: [], assignments: [], dispatchPlan: null, nextOrderId: 1, nextShipmentId: 1, nextAssignmentId: 1, schemaVersion: 3, shipmentSemantics: 'destination-fleet-v2'};
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
    const normalizedVehicles = [];
    const usedVehicleIds = new Set();
    let nextGeneratedVehicleId = 1;
    const addVehicle = (rawVehicle, fallbackCityId = null, fallbackType = null) => {
      if (!rawVehicle || typeof rawVehicle !== 'object') rawVehicle = {};
      let id = Math.max(1, Math.trunc(Number(rawVehicle.id) || nextGeneratedVehicleId));
      while (usedVehicleIds.has(id)) id += 1;
      usedVehicleIds.add(id);
      nextGeneratedVehicleId = Math.max(nextGeneratedVehicleId, id + 1);
      const vehicleType = String(rawVehicle.vehicleType || fallbackType || '').trim();
      if (!vehicleType) return;
      const activeAssignmentId = rawVehicle.activeAssignmentId == null ? null : String(rawVehicle.activeAssignmentId).trim() || null;
      const currentCityId = String(rawVehicle.currentCityId || fallbackCityId || '').trim() || null;
      const normalized = {
        id,
        vehicleType,
        status: activeAssignmentId ? (rawVehicle.status === 'returning' ? 'returning' : 'assigned') : 'available',
        currentCityId,
        availableAbsMinute: Math.max(0, Number(rawVehicle.availableAbsMinute) || 0),
        activeAssignmentId,
      };
      if (Array.isArray(rawVehicle.position) && rawVehicle.position.length >= 2 && rawVehicle.position.slice(0, 2).every(value => Number.isFinite(Number(value)))) normalized.position = rawVehicle.position.slice(0, 2).map(Number);
      if (rawVehicle.routeSegment && typeof rawVehicle.routeSegment === 'object' && !Array.isArray(rawVehicle.routeSegment)) {
        const fromCityId = String(rawVehicle.routeSegment.fromCityId || '').trim();
        const toCityId = String(rawVehicle.routeSegment.toCityId || '').trim();
        if (fromCityId && toCityId) normalized.routeSegment = {fromCityId, toCityId};
      }
      normalizedVehicles.push(normalized);
    };
    if (Array.isArray(fleet.vehicles)) fleet.vehicles.forEach(vehicle => addVehicle(vehicle));
    const legacyCityFleets = fleet.cityFleets && typeof fleet.cityFleets === 'object' && !Array.isArray(fleet.cityFleets) ? fleet.cityFleets : {};
    for (const [cityId, counts] of Object.entries(legacyCityFleets)) {
      if (!counts || typeof counts !== 'object') continue;
      for (const [vehicleType, rawCount] of Object.entries(counts)) {
        const count = Math.max(0, Math.trunc(Number(rawCount) || 0));
        for (let index = 0; index < count; index += 1) addVehicle({}, cityId, vehicleType);
      }
    }
    fleet.vehicles = normalizedVehicles;
    fleet.nextVehicleId = Math.max(1, Math.trunc(Number(fleet.nextVehicleId) || 1), nextGeneratedVehicleId);
    fleet.depotCityId = String(fleet.depotCityId || 'zurich').trim() || 'zurich';
    delete fleet.cityFleets;
    factories.cityFactories = factories.cityFactories && typeof factories.cityFactories === 'object' && !Array.isArray(factories.cityFactories) ? factories.cityFactories : {};
    factories.factoryUpgrades = factories.factoryUpgrades && typeof factories.factoryUpgrades === 'object' && !Array.isArray(factories.factoryUpgrades) ? factories.factoryUpgrades : {};
    for (const [cityId, rawList] of Object.entries(factories.cityFactories)) {
      const normalizedList = [];
      const normalizedUpgrades = {};
      if (Array.isArray(rawList)) {
        rawList.forEach((entry, index) => {
          const factoryId = typeof entry === 'string' ? String(entry || '').trim() : String(entry?.id ?? entry?.factoryId ?? '').trim();
          if (!factoryId) return;
          const normalizedIndex = normalizedList.length;
          normalizedList.push(factoryId);
          const inlineLevel = entry && typeof entry === 'object' ? entry.level : null;
          const savedLevel = factories.factoryUpgrades?.[cityId]?.[String(index)] ?? inlineLevel;
          const level = Math.max(1, Math.trunc(Number(savedLevel) || 1));
          if (level > 1) normalizedUpgrades[String(normalizedIndex)] = level;
        });
      }
      factories.cityFactories[cityId] = normalizedList;
      factories.factoryUpgrades[cityId] = normalizedUpgrades;
    }
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
    logistics.orders = Array.isArray(logistics.orders) ? logistics.orders.map(order => {
      if (!order || typeof order !== 'object') return order;
      const frequency = order.frequency === 'weekly' ? 'weekly' : order.frequency;
      // Stable v2 -> v3 migration: old weekly orders implicitly ran on Monday.
      const rawWeekday = Math.trunc(Number(order.weekday));
      const weekday = frequency === 'weekly' && Number.isFinite(rawWeekday) && rawWeekday >= 0 && rawWeekday <= 6 ? rawWeekday : (frequency === 'weekly' ? 0 : null);
      const legacyMinute = Math.max(0, Math.min(1439, Math.trunc(Number(order.departureHour) || 0) * 60 + Math.trunc(Number(order.departureMinute) || 0)));
      const plannedDepartureAbsMinute = Number.isFinite(Number(order.plannedDepartureAbsMinute)) ? Math.max(0, Math.trunc(Number(order.plannedDepartureAbsMinute))) : legacyMinute;
      return {...order, weekday, plannedDepartureAbsMinute};
    }) : [];
    logistics.shipments = Array.isArray(logistics.shipments) ? logistics.shipments : [];
    logistics.assignments = Array.isArray(logistics.assignments) ? logistics.assignments : [];
    logistics.assignments = logistics.assignments.filter(assignment => {
      if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) return false;
      if (!String(assignment.id || '').trim() || assignment.type !== 'repositioning') return false;
      if (!String(assignment.fromCityId || '').trim() || !String(assignment.toCityId || '').trim()) return false;
      if (!Array.isArray(assignment.vehicleIds) || !assignment.vehicleIds.length) return false;
      return Number.isFinite(Number(assignment.departureAbsMinute)) && Number.isFinite(Number(assignment.arrivalAbsMinute));
    }).map(assignment => ({
      ...assignment,
      id: String(assignment.id).trim(),
      fromCityId: String(assignment.fromCityId).trim(),
      toCityId: String(assignment.toCityId).trim(),
      vehicleIds: [...new Set(assignment.vehicleIds.map(Number).filter(Number.isFinite))],
      departureAbsMinute: Math.max(0, Number(assignment.departureAbsMinute)),
      arrivalAbsMinute: Math.max(0, Number(assignment.arrivalAbsMinute)),
      status: ['planned', 'active', 'completed', 'cancelled'].includes(assignment.status) ? assignment.status : 'active',
    })).filter(assignment => assignment.vehicleIds.length && assignment.arrivalAbsMinute >= assignment.departureAbsMinute);
    // Plans depend on live network capacity, inventory and fleet positions. They
    // are cheap to rebuild and are intentionally never trusted after hydration.
    logistics.dispatchPlan = null;
    logistics.nextOrderId = Math.max(1, Math.trunc(Number(logistics.nextOrderId) || 1));
    logistics.nextShipmentId = Math.max(1, Math.trunc(Number(logistics.nextShipmentId) || 1));
    logistics.nextAssignmentId = Math.max(1, Math.trunc(Number(logistics.nextAssignmentId) || 1));
    logistics.schemaVersion = 3;
    logistics.shipmentSemantics = 'destination-fleet-v2';
    delete network.cash;
    delete fleet.cash;
    delete factories.cash;
    delete goods.cash;
    delete time.cash;
    delete logistics.cash;
    const legacyCash = Number.isFinite(Number(sourceState.cash)) ? Number(sourceState.cash) : Number(sourceState.fleet?.cash ?? sourceState.network?.cash);
    const cash = Number.isFinite(legacyCash) ? legacyCash : STARTING_CASH;

    const finance = normalizeFinanceState(sourceState.finance);
    return {
      schemaVersion: SCHEMA_VERSION,
      savedAt: source.savedAt || new Date().toISOString(),
      state: {cash, network, fleet, factories, goods, time, logistics, finance},
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
    const source = savePackage || {state: {network: liveNetwork, fleet: liveFleet, factories: liveFactories || getState().factories, goods: liveGoods || getState().goods, time: liveTime || getState().time, logistics: liveLogistics || getState().logistics, finance: getState().finance, cash: getCash()}};
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
