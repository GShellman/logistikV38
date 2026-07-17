(() => {
  'use strict';

  const VEHICLE_TYPES = ['van', 'lightTruck', 'heavyTruck', 'artic', 'reefer', 'tipper'];

  const VEHICLES = {
    van: {name: 'Lieferwagen', icon: '🚐', mode: 'road', load: 2, speed: 80, minRoad: 'localroad', cost: 28000, daily: 180, kmCost: 4.2, desc: 'Klein, flexibel und auf jeder Straße einsetzbar.'},
    lightTruck: {name: 'Leicht-LKW', icon: '🚚', mode: 'road', load: 5, speed: 85, minRoad: 'localroad', cost: 65000, daily: 420, kmCost: 6.2, desc: 'Flexibler LKW, der auf allen Straßen eingesetzt werden kann.'},
    heavyTruck: {name: 'Schwer-LKW', icon: '🚛', mode: 'road', load: 9, speed: 80, minRoad: 'localroad', cost: 115000, daily: 760, kmCost: 8.8, desc: 'Hohe Nutzlast und auf allen Straßen einsetzbar.'},
    artic: {name: 'Sattelzug', icon: '🚛', mode: 'road', load: 14, speed: 78, minRoad: 'localroad', cost: 175000, daily: 1180, kmCost: 11.8, desc: 'Effizient für große Mengen und auf allen Straßen einsetzbar.'},
    reefer: {name: 'Kühl-LKW', icon: '🧊', mode: 'road', load: 8, speed: 82, minRoad: 'localroad', cost: 118000, daily: 2100, kmCost: 8.8, desc: 'Für Fisch und Kühlwaren. Auf allen Straßen einsetzbar und mit 8 Paletten Kühlkapazität.'},
    tipper: {name: 'Kipplaster', icon: '🚛', mode: 'road', load: 16000, speed: 72, minRoad: 'localroad', cost: 152000, daily: 940, kmCost: 9.6, desc: 'Spezialfahrzeug für Schüttgut wie Getreide, Erz und Aluminiumerz. Auf allen Straßen einsetzbar.', physicalLoad: true},
  };

  let state = null;

  function emptyFleet() {
    return Object.fromEntries(VEHICLE_TYPES.map(type => [type, 0]));
  }

  function createFleetState(overrides = {}) {
    return {
      cityFleets: {},
      ...overrides,
    };
  }

  function configure(options = {}) {
    state = options.state || state || createFleetState();
    state.cityFleets = state.cityFleets || {};
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

  window.HFFleet = {VEHICLES, VEHICLE_TYPES, createFleetState, configure, getCityFleet, buyVehicle, sellVehicle};
})();
