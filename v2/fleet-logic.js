(() => {
  'use strict';

  const VEHICLE_TYPES = window.HFVehicleCatalog?.VEHICLE_TYPES || [];
  const VEHICLES = window.HFVehicleCatalog?.VEHICLE_CATALOG || {};
  const STARTING_CASH = window.HFV2Save?.STARTING_CASH ?? 500000;
  const DEFAULT_DEPOT_CITY_ID = 'zurich';
  const SAFE_PLATE_DIGITS = '23456789';
  const CITY_CANTONS = Object.freeze({
    zurich: 'ZH', winterthur: 'ZH', uster: 'ZH', geneva: 'GE', meyrin: 'GE', carouge: 'GE', vernier: 'GE', onex: 'GE',
    basel: 'BS', liestal: 'BL', reinach_bl: 'BL', muttenz: 'BL', pratteln: 'BL', bern: 'BE', biel: 'BE', thun: 'BE', koeniz: 'BE', interlaken: 'BE',
    lausanne: 'VD', yverdon_les_bains: 'VD', montreux: 'VD', vevey: 'VD', nyon: 'VD', morges: 'VD', renens: 'VD', lucerne: 'LU',
    st_gallen: 'SG', rapperswil: 'SG', wil_sg: 'SG', rorschach: 'SG', buchs_sg: 'SG', lugano: 'TI', bellinzona: 'TI', locarno: 'TI',
    la_chaux_de_fonds: 'NE', neuchatel: 'NE', schaffhausen: 'SH', fribourg: 'FR', chur: 'GR', davos: 'GR', st_moritz: 'GR',
    zug: 'ZG', sion: 'VS', brig: 'VS', sierre: 'VS', aarau: 'AG', baden: 'AG', rheinfelden: 'AG', wohlen: 'AG', wettingen: 'AG', brugg: 'AG', zofingen: 'AG',
    solothurn: 'SO', olten: 'SO', kreuzlingen: 'TG', frauenfeld: 'TG', weinfelden: 'TG', arbon: 'TG', herisau: 'AR', appenzell: 'AI', glarus: 'GL',
  });
  let state = null;

  function createFleetState(overrides = {}) {
    return {vehicles: [], nextVehicleId: 1, depotCityId: DEFAULT_DEPOT_CITY_ID, ...overrides};
  }

  function normalizeId(value) {
    return String(value ?? '').trim();
  }

  function plateForSeed(cityId, seed) {
    const canton = CITY_CANTONS[normalizeId(cityId)] || 'CH';
    let value = Math.abs(Math.trunc(Number(seed) || 0)) + 1;
    let number = '';
    for (let index = 0; index < 6; index += 1) {
      number = SAFE_PLATE_DIGITS[value % SAFE_PLATE_DIGITS.length] + number;
      value = Math.floor(value / SAFE_PLATE_DIGITS.length);
    }
    return `${canton} ${number}`;
  }

  // Swiss-style canton prefix plus unambiguous digits. Collision retries live here,
  // so callers create one visible identity rather than assembling plates themselves.
  function generateLicensePlate(cityId, usedPlates = new Set(), options = {}) {
    const used = usedPlates instanceof Set ? usedPlates : new Set(usedPlates || []);
    const deterministicSeed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : null;
    for (let attempt = 0; attempt < 1000000; attempt += 1) {
      const seed = deterministicSeed == null
        ? Math.floor((typeof options.random === 'function' ? options.random() : Math.random()) * (SAFE_PLATE_DIGITS.length ** 6)) + attempt
        : deterministicSeed + attempt;
      const plate = plateForSeed(cityId, seed);
      if (!used.has(plate)) return plate;
    }
    throw new Error('Kein eindeutiges Kennzeichen verfügbar.');
  }

  function normalizeVehicle(vehicle, fallbackId) {
    if (!vehicle || typeof vehicle !== 'object') return null;
    const id = Math.max(1, Math.trunc(Number(vehicle.id) || fallbackId));
    const vehicleType = normalizeId(vehicle.vehicleType);
    if (!vehicleType) return null;
    const activeAssignmentId = vehicle.activeAssignmentId == null ? null : normalizeId(vehicle.activeAssignmentId) || null;
    const availableAbsMinute = Math.max(0, Number(vehicle.availableAbsMinute) || 0);
    const currentCityId = normalizeId(vehicle.currentCityId) || null;
    const status = activeAssignmentId ? (vehicle.status === 'returning' ? 'returning' : 'assigned') : 'available';
    const position = Array.isArray(vehicle.position) && vehicle.position.length >= 2 ? [Number(vehicle.position[0]), Number(vehicle.position[1])] : null;
    const routeSegment = vehicle.routeSegment && typeof vehicle.routeSegment === 'object' ? {...vehicle.routeSegment} : null;
    const licensePlate = normalizeId(vehicle.licensePlate).toUpperCase() || null;
    return {id, vehicleType, status, currentCityId, availableAbsMinute, activeAssignmentId, ...(licensePlate ? {licensePlate} : {}), ...(position ? {position} : {}), ...(routeSegment ? {routeSegment} : {})};
  }

  function configure(options = {}) {
    state = options.state || state || createFleetState();
    const usedIds = new Set();
    const usedPlates = new Set();
    state.vehicles = (Array.isArray(state.vehicles) ? state.vehicles : []).map((vehicle, index) => normalizeVehicle(vehicle, index + 1)).filter(vehicle => {
      if (!vehicle || usedIds.has(vehicle.id)) return false;
      usedIds.add(vehicle.id);
      if (!vehicle.licensePlate || usedPlates.has(vehicle.licensePlate)) vehicle.licensePlate = generateLicensePlate(vehicle.currentCityId || state.depotCityId, usedPlates, {seed: vehicle.id});
      usedPlates.add(vehicle.licensePlate);
      return true;
    });
    state.nextVehicleId = Math.max(1, Math.trunc(Number(state.nextVehicleId) || 1), ...state.vehicles.map(vehicle => vehicle.id + 1));
    state.depotCityId = normalizeId(state.depotCityId) || DEFAULT_DEPOT_CITY_ID;
    delete state.cityFleets;
    delete state.cash;
    return state;
  }

  function getState() { return configure(); }
  function vehicleSpec(vehicleType) { return VEHICLES[vehicleType] || null; }

  function getVehiclesAtCity(cityId, options = {}) {
    const id = normalizeId(cityId);
    if (!id) return [];
    return getState().vehicles.filter(vehicle => vehicle.currentCityId === id && (!options.vehicleType || vehicle.vehicleType === options.vehicleType));
  }

  function getAvailableVehicles(options = {}) {
    const cityId = normalizeId(options.cityId) || null;
    const vehicleType = normalizeId(options.vehicleType) || null;
    const atAbsMinute = options.atAbsMinute == null ? Number.POSITIVE_INFINITY : Math.max(0, Number(options.atAbsMinute) || 0);
    return getState().vehicles.filter(vehicle => vehicle.status === 'available' && !vehicle.activeAssignmentId && vehicle.availableAbsMinute <= atAbsMinute && (!cityId || vehicle.currentCityId === cityId) && (!vehicleType || vehicle.vehicleType === vehicleType));
  }

  function getOwnedCountByType(vehicleType, options = {}) {
    const type = normalizeId(vehicleType);
    const cityId = normalizeId(options.cityId) || null;
    return getState().vehicles.filter(vehicle => vehicle.vehicleType === type && (!cityId || vehicle.currentCityId === cityId)).length;
  }

  function getFleetSummary(options = {}) {
    const cityId = normalizeId(options.cityId) || null;
    const vehicles = cityId ? getVehiclesAtCity(cityId) : getState().vehicles;
    const byType = Object.fromEntries(VEHICLE_TYPES.map(type => [type, 0]));
    const availableByType = Object.fromEntries(VEHICLE_TYPES.map(type => [type, 0]));
    for (const vehicle of vehicles) {
      byType[vehicle.vehicleType] = (byType[vehicle.vehicleType] || 0) + 1;
      if (vehicle.status === 'available' && !vehicle.activeAssignmentId) availableByType[vehicle.vehicleType] = (availableByType[vehicle.vehicleType] || 0) + 1;
    }
    return {total: vehicles.length, available: Object.values(availableByType).reduce((sum, count) => sum + count, 0), byType, availableByType};
  }

  function isCityUnlocked(cityId) {
    const id = normalizeId(cityId);
    return id === DEFAULT_DEPOT_CITY_ID || window.HFNetwork?.getState?.().cities?.[id]?.unlocked === true;
  }

  function buyVehicle(cityIdOrVehicleType, maybeVehicleType) {
    const vehicleType = normalizeId(maybeVehicleType === undefined ? cityIdOrVehicleType : maybeVehicleType);
    const requestedCityId = maybeVehicleType === undefined ? null : normalizeId(cityIdOrVehicleType) || null;
    const vehicle = vehicleSpec(vehicleType);
    if (!vehicle) return {ok: false, reason: 'unknown-vehicle', vehicleType};
    if (requestedCityId && !isCityUnlocked(requestedCityId)) return {ok: false, reason: 'city-locked', cityId: requestedCityId, vehicleType};
    const cash = window.HFV2Save?.getCash?.() ?? STARTING_CASH;
    if (cash < vehicle.cost) return {ok: false, reason: 'not-enough-cash'};
    const fleet = getState();
    const currentCityId = requestedCityId || fleet.depotCityId;
    const licensePlate = generateLicensePlate(currentCityId, new Set(fleet.vehicles.map(entry => entry.licensePlate).filter(Boolean)));
    const record = {id: fleet.nextVehicleId++, vehicleType, licensePlate, status: 'available', currentCityId, availableAbsMinute: 0, activeAssignmentId: null};
    fleet.vehicles.push(record);
    window.HFV2FleetDispatch?.invalidate?.('vehicle-bought');
    window.HFV2Save?.changeCash?.(-vehicle.cost, 'fleet-buy', {reference: {vehicleId: record.id}});
    return {ok: true, cityId: currentCityId, vehicleType, vehicle: record, owned: getOwnedCountByType(vehicleType), cost: vehicle.cost, state: fleet};
  }

  function sellVehicle(cityId, vehicleType) {
    const vehicle = vehicleSpec(vehicleType);
    if (!vehicle) return {ok: false, reason: 'unknown-vehicle'};
    const candidate = getAvailableVehicles({cityId, vehicleType})[0];
    if (!candidate) return {ok: false, reason: 'none-available'};
    state.vehicles = state.vehicles.filter(entry => entry.id !== candidate.id);
    window.HFV2FleetDispatch?.invalidate?.('vehicle-sold');
    const refund = Math.round(vehicle.cost * .6);
    window.HFV2Save?.changeCash?.(refund, 'fleet-sell', {reference: {vehicleId: candidate.id}});
    return {ok: true, cityId: normalizeId(cityId), vehicleType, vehicleId: candidate.id, owned: getOwnedCountByType(vehicleType), refund, state};
  }

  function assignVehicles({cityId, vehicleType, vehicleIds = null, count = 1, assignmentId, departureAbsMinute = 0, availableAbsMinute = 0, routeSegment = null}) {
    const requestedIds = Array.isArray(vehicleIds) ? vehicleIds.map(Number) : null;
    const candidates = getAvailableVehicles({cityId, vehicleType, atAbsMinute: departureAbsMinute});
    const vehicles = requestedIds ? requestedIds.map(id => candidates.find(vehicle => vehicle.id === id)).filter(Boolean) : candidates.slice(0, Math.max(0, Math.trunc(Number(count) || 0)));
    if (vehicles.length !== Math.max(0, Math.trunc(Number(count) || 0))) return [];
    for (const vehicle of vehicles) Object.assign(vehicle, {status: 'assigned', activeAssignmentId: normalizeId(assignmentId), availableAbsMinute: Math.max(0, Number(availableAbsMinute) || 0), ...(routeSegment ? {routeSegment} : {})});
    return vehicles;
  }

  function releaseAssignment(assignmentId, cityId, availableAbsMinute = 0) {
    const id = normalizeId(assignmentId);
    const released = getState().vehicles.filter(vehicle => vehicle.activeAssignmentId === id);
    for (const vehicle of released) {
      Object.assign(vehicle, {status: 'available', activeAssignmentId: null, currentCityId: normalizeId(cityId) || vehicle.currentCityId, availableAbsMinute: Math.max(0, Number(availableAbsMinute) || 0)});
      delete vehicle.routeSegment;
      delete vehicle.position;
    }
    return released;
  }

  function updateAssignment(assignmentId, updates = {}) {
    const id = normalizeId(assignmentId);
    if (!id) return [];
    const assigned = getState().vehicles.filter(vehicle => vehicle.activeAssignmentId === id);
    for (const vehicle of assigned) {
      if (updates.status === 'assigned' || updates.status === 'returning') vehicle.status = updates.status;
      if (updates.currentCityId !== undefined) vehicle.currentCityId = normalizeId(updates.currentCityId) || vehicle.currentCityId;
      if (Number.isFinite(Number(updates.availableAbsMinute))) vehicle.availableAbsMinute = Math.max(0, Number(updates.availableAbsMinute));
      if (updates.routeSegment === null) delete vehicle.routeSegment;
      else if (updates.routeSegment && typeof updates.routeSegment === 'object') vehicle.routeSegment = {...updates.routeSegment};
    }
    return assigned;
  }

  window.HFFleet = {VEHICLES, VEHICLE_TYPES, STARTING_CASH, createFleetState, normalizeVehicle, generateLicensePlate, configure, getState, getVehiclesAtCity, getAvailableVehicles, getOwnedCountByType, getFleetSummary, buyVehicle, sellVehicle, assignVehicles, releaseAssignment, updateAssignment};
})();
