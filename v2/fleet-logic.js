(() => {
  'use strict';

  const VEHICLE_TYPES = window.HFVehicleCatalog?.VEHICLE_TYPES || [];
  const VEHICLES = window.HFVehicleCatalog?.VEHICLE_CATALOG || {};
  const STARTING_CASH = 500000;

  let state = null;

  function emptyFleet() {
    return Object.fromEntries(VEHICLE_TYPES.map(type => [type, 0]));
  }

  function createFleetState(overrides = {}) {
    return {
      cash: STARTING_CASH,
      cityFleets: {},
      ...overrides,
    };
  }

  function configure(options = {}) {
    state = options.state || state || createFleetState();
    state.cityFleets = state.cityFleets || {};
    state.cash = Number.isFinite(state.cash) ? state.cash : STARTING_CASH;
    return state;
  }

  function assertCityId(cityId) {
    const id = String(cityId || '').trim();
    if (!id) throw new Error('cityId is required');
    return id;
  }

  function normalizeFleet(fleet = {}) {
    return VEHICLE_TYPES.reduce((out, type) => {
      out[type] = Math.max(0, Math.floor(Number(fleet[type]) || 0));
      return out;
    }, {});
  }

  function getCityFleet(cityId) {
    const id = assertCityId(cityId);
    configure();
    state.cityFleets[id] = normalizeFleet(state.cityFleets[id] || emptyFleet());
    return state.cityFleets[id];
  }

  function vehicleSpec(vehicleType) {
    return VEHICLES[vehicleType] || null;
  }

  function getState() {
    return configure();
  }

  function buyVehicle(cityId, vehicleType) {
    const vehicle = vehicleSpec(vehicleType);
    if (!vehicle) return {ok: false, reason: 'unknown-vehicle'};
    const fleet = getCityFleet(cityId);
    if (Number.isFinite(state.cash) && state.cash < vehicle.cost) return {ok: false, reason: 'not-enough-cash'};
    if (Number.isFinite(state.cash)) state.cash -= vehicle.cost;
    fleet[vehicleType] += 1;
    return {ok: true, cityId: String(cityId).trim(), vehicleType, owned: fleet[vehicleType], cost: vehicle.cost, state};
  }

  function sellVehicle(cityId, vehicleType) {
    const vehicle = vehicleSpec(vehicleType);
    if (!vehicle) return {ok: false, reason: 'unknown-vehicle'};
    const fleet = getCityFleet(cityId);
    if (fleet[vehicleType] <= 0) return {ok: false, reason: 'none-owned'};
    fleet[vehicleType] -= 1;
    const refund = Math.round(vehicle.cost * .6);
    if (Number.isFinite(state.cash)) state.cash += refund;
    return {ok: true, cityId: String(cityId).trim(), vehicleType, owned: fleet[vehicleType], refund, state};
  }

  window.HFFleet = {VEHICLES, VEHICLE_TYPES, STARTING_CASH, createFleetState, configure, getState, getCityFleet, buyVehicle, sellVehicle};
})();
