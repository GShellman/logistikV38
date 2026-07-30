(() => {
  'use strict';

  const FREQUENCIES = new Set(['daily', 'weekly']);
  const DEFAULT_VEHICLE_TYPE = 'fluto-gianco';

  const MINUTES_PER_DAY = 1440;
  const DAYS_PER_WEEK = 7;
  // 0 = Monday … 6 = Sunday. Legacy weekly orders ran on day 1 and therefore
  // deliberately migrate to Monday when their saved weekday is absent.
  const LEGACY_WEEKDAY = 0;

  let state = null;
  let cities = [];
  let citiesById = {};

  function createLogisticsState(overrides = {}) {
    return {
      orders: [],
      shipments: [],
      assignments: [],
      dispatchPlan: null,
      nextOrderId: 1,
      nextShipmentId: 1,
      nextAssignmentId: 1,
      schemaVersion: 3,
      shipmentSemantics: 'destination-fleet-v2',
      bundleWindowMinutes: 60,
      ...overrides,
    };
  }

  function positiveInteger(value, fallback = 1) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function normalizeHour(value) {
    const hour = Math.trunc(Number(value));
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
    return hour;
  }

  function normalizeMinute(value) {
    const minute = Math.trunc(Number(value));
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
    return minute;
  }

  function normalizeId(value) {
    return String(value || '').trim();
  }

  function cargoMetrics(goodId, amountKg, packagingStrategy = 'default', options = {}) {
    return window.HFV2LoadCarrierCatalog?.metrics?.(goodId, amountKg, packagingStrategy, options)
      || {loadCarrier: 'loose', carrierCount: 0, netKg: Math.max(0, Number(amountKg) || 0), tareKg: 0, grossKg: Math.max(0, Number(amountKg) || 0), stackable: false};
  }

  function normalizeWeekday(value, frequency = 'weekly') {
    if (frequency !== 'weekly') return null;
    const weekday = Math.trunc(Number(value));
    return Number.isFinite(weekday) && weekday >= 0 && weekday < DAYS_PER_WEEK ? weekday : LEGACY_WEEKDAY;
  }

  function normalizeOrder(order) {
    if (!order || typeof order !== 'object') return null;
    const id = positiveInteger(order.id, null);
    const fromCityId = normalizeId(order.fromCityId);
    const toCityId = normalizeId(order.toCityId);
    const goodId = normalizeId(order.goodId);
    const frequency = String(order.frequency || '').trim();
    const planned = Number(order.plannedDepartureAbsMinute);
    const legacyHour = normalizeHour(order.departureHour);
    const legacyMinute = normalizeMinute(order.departureMinute);
    const plannedDepartureAbsMinute = Number.isFinite(planned) && planned >= 0
      ? Math.trunc(planned)
      : (legacyHour ?? 8) * 60 + (legacyMinute ?? 0);
    const departureHour = Math.floor((plannedDepartureAbsMinute % MINUTES_PER_DAY) / 60);
    const departureMinute = plannedDepartureAbsMinute % 60;
    const amountKg = Math.max(0, Number(order.amountKg) || 0);
    const packagingStrategy = ['automatic', 'pallet', 'swap-body'].includes(order.packagingStrategy) ? order.packagingStrategy : 'pallet';
    const resolvedPackagingStrategy = ['pallet', 'swap-body'].includes(order.resolvedPackagingStrategy) ? order.resolvedPackagingStrategy : (packagingStrategy === 'automatic' ? 'pallet' : packagingStrategy);
    if (!id || !fromCityId || !toCityId || !goodId || !FREQUENCIES.has(frequency) || amountKg <= 0) return null;
    return {
      ...order,
      id,
      fromCityId,
      toCityId,
      goodId,
      frequency,
      weekday: normalizeWeekday(order.weekday, frequency),
      plannedDepartureAbsMinute,
      departureHour,
      departureMinute,
      vehicleType: normalizeId(order.vehicleType) || null,
      amountKg,
      ...cargoMetrics(goodId, amountKg, resolvedPackagingStrategy, {deferCount: true}),
      packagingStrategy,
      resolvedPackagingStrategy,
      enabled: order.enabled !== false,
      lastDispatchedDay: Number.isFinite(Number(order.lastDispatchedDay)) ? Math.trunc(Number(order.lastDispatchedDay)) : null,
    };
  }

  function normalizeShipment(shipment) {
    if (!shipment || typeof shipment !== 'object') return null;
    const id = positiveInteger(shipment.id, null);
    const orderId = positiveInteger(shipment.orderId, null);
    const fromCityId = normalizeId(shipment.fromCityId);
    const toCityId = normalizeId(shipment.toCityId);
    const goodId = normalizeId(shipment.goodId);
    const amountKg = Math.max(0, Number(shipment.amountKg) || 0);
    const departureAbsMinute = Number(shipment.departureAbsMinute);
    const arrivalAbsMinute = Number(shipment.arrivalAbsMinute);
    if (!id || !orderId || !fromCityId || !toCityId || !goodId || amountKg <= 0 || !Number.isFinite(departureAbsMinute) || !Number.isFinite(arrivalAbsMinute)) return null;
    const vehicleIds = Array.isArray(shipment.vehicleIds) ? [...new Set(shipment.vehicleIds.map(value => Number(value)).filter(Number.isFinite))] : [];
    const vehicleCount = vehicleIds.length || positiveInteger(shipment.vehicleCount, 1);
    const status = ['active', 'delivering', 'returning', 'returned', 'delivered', 'failed', 'partial'].includes(shipment.status) ? shipment.status : 'active';
    const createdAtAbsMinute = Number.isFinite(Number(shipment.createdAtAbsMinute)) ? Number(shipment.createdAtAbsMinute) : departureAbsMinute;
    const pathNodeIds = Array.isArray(shipment.pathNodeIds) ? shipment.pathNodeIds.map(normalizeId).filter(Boolean) : [];
    const pathEdgeIds = Array.isArray(shipment.pathEdgeIds) ? shipment.pathEdgeIds.map(normalizeId).filter(Boolean) : [];
    const geometry = Array.isArray(shipment.geometry) ? shipment.geometry : (Array.isArray(shipment.routeGeometry) ? shipment.routeGeometry : []);
    const returnDepartureAbsMinute = Number.isFinite(Number(shipment.returnDepartureAbsMinute)) ? Number(shipment.returnDepartureAbsMinute) : null;
    const returnArrivalAbsMinute = Number.isFinite(Number(shipment.returnArrivalAbsMinute)) ? Number(shipment.returnArrivalAbsMinute) : null;
    const returnGeometry = Array.isArray(shipment.returnGeometry) ? shipment.returnGeometry : [...geometry].reverse();
    const stops = Array.isArray(shipment.stops) ? shipment.stops.map(stop => {
      const amountKg = Math.max(0, Number(stop?.amountKg) || 0);
      const deliveredKg = Math.max(0, Math.min(amountKg, Number(stop?.deliveredKg) || 0));
      const undeliveredKg = Number.isFinite(Number(stop?.undeliveredKg)) ? Math.max(0, Number(stop.undeliveredKg)) : Math.max(0, amountKg - deliveredKg);
      const status = ['pending', 'processing', 'delivered', 'failed', 'partial'].includes(stop?.status) ? stop.status : (deliveredKg > 0 ? (deliveredKg >= amountKg ? 'delivered' : 'partial') : 'pending');
      const stopArrivalAbsMinute = Number(stop?.arrivalAbsMinute);
      return {
        ...stop,
        toCityId: normalizeId(stop?.toCityId),
        goodId: normalizeId(stop?.goodId),
        amountKg,
        ...cargoMetrics(normalizeId(stop?.goodId), amountKg),
        orderId: positiveInteger(stop?.orderId, null),
        arrivalAbsMinute: Number.isFinite(stopArrivalAbsMinute) ? stopArrivalAbsMinute : null,
        status,
        deliveredKg,
        undeliveredKg,
      };
    }).filter(stop => stop.toCityId && stop.goodId && stop.amountKg > 0 && stop.orderId) : null;
    const shipmentSemantics = normalizeId(shipment.shipmentSemantics) || 'legacy-return-v1';
    const costs = shipment.costs && typeof shipment.costs === 'object' ? {...shipment.costs, booked: shipment.costs.booked === true} : undefined;
    return {...shipment, id, orderId, fromCityId, toCityId, goodId, amountKg, ...cargoMetrics(goodId, amountKg), vehicleIds, vehicleCount, pathNodeIds, pathEdgeIds, geometry, routeGeometry: geometry, returnGeometry, departureAbsMinute, arrivalAbsMinute, returnDepartureAbsMinute, returnArrivalAbsMinute, status, createdAtAbsMinute, shipmentSemantics, ...(costs ? {costs} : {}), ...(stops ? {stops} : {})};
  }

  function normalizeAssignment(assignment) {
    if (!assignment || typeof assignment !== 'object' || assignment.type !== 'repositioning') return null;
    const id = normalizeId(assignment.id);
    const fromCityId = normalizeId(assignment.fromCityId);
    const toCityId = normalizeId(assignment.toCityId);
    const departureAbsMinute = Number(assignment.departureAbsMinute);
    const arrivalAbsMinute = Number(assignment.arrivalAbsMinute);
    const vehicleIds = Array.isArray(assignment.vehicleIds) ? [...new Set(assignment.vehicleIds.map(Number).filter(Number.isFinite))] : [];
    if (!id || !fromCityId || !toCityId || !vehicleIds.length || !Number.isFinite(departureAbsMinute) || !Number.isFinite(arrivalAbsMinute)) return null;
    const costs = assignment.costs && typeof assignment.costs === 'object' ? {...assignment.costs, booked: assignment.costs.booked === true} : {total: Math.max(0, Number(assignment.cost) || 0), booked: false};
    return {...assignment, id, type: 'repositioning', fromCityId, toCityId, vehicleIds, departureAbsMinute, arrivalAbsMinute, route: assignment.route && typeof assignment.route === 'object' ? assignment.route : {}, capacityReservationIds: Array.isArray(assignment.capacityReservationIds) ? assignment.capacityReservationIds.map(normalizeId).filter(Boolean) : [], costs, status: ['planned', 'active', 'completed', 'cancelled'].includes(assignment.status) ? assignment.status : 'active'};
  }

  function configure(options = {}) {
    const mustNormalize = Boolean(options.state) || !state;
    state = options.state || state || createLogisticsState();
    if (mustNormalize) {
      state.orders = Array.isArray(state.orders) ? state.orders.map(normalizeOrder).filter(Boolean) : [];
      state.shipments = Array.isArray(state.shipments) ? state.shipments.map(normalizeShipment).filter(Boolean) : [];
      state.assignments = Array.isArray(state.assignments) ? state.assignments.map(normalizeAssignment).filter(Boolean) : [];
    }
    state.nextOrderId = Math.max(positiveInteger(state.nextOrderId), ...state.orders.map(order => order.id + 1), 1);
    state.nextShipmentId = Math.max(positiveInteger(state.nextShipmentId), ...state.shipments.map(shipment => shipment.id + 1), 1);
    state.nextAssignmentId = Math.max(positiveInteger(state.nextAssignmentId), ...state.assignments.map(assignment => Number(String(assignment.id).match(/\d+$/)?.[0] || 0) + 1), 1);
    state.schemaVersion = 3;
    state.shipmentSemantics = 'destination-fleet-v2';
    state.bundleWindowMinutes = Math.max(0, Math.trunc(Number(state.bundleWindowMinutes) || 60));
    cities = Array.isArray(options.cities) ? options.cities : cities;
    if (options.citiesById && typeof options.citiesById === 'object') citiesById = options.citiesById;
    else if (Array.isArray(options.cities)) citiesById = Object.fromEntries(cities.map(city => [String(city.id), city]));
    window.HFV2FleetDispatch?.configure?.({state});
    return state;
  }

  function getState() {
    return state || configure();
  }

  function absoluteMinute(time) {
    const day = Math.max(1, Math.trunc(Number(time?.day) || 1));
    const hour = Math.max(0, Math.min(23, Math.trunc(Number(time?.hour) || 0)));
    const minute = Math.max(0, Math.min(59, Math.trunc(Number(time?.minute) || 0)));
    return (day - 1) * MINUTES_PER_DAY + hour * 60 + minute;
  }

  function orderDueToday(order, time) {
    if (!order?.enabled) return false;
    const currentDay = Math.max(1, Math.trunc(Number(time?.day) || 1));
    if (order.lastDispatchedDay === currentDay) return false;
    if (order.frequency === 'weekly' && ((currentDay - 1) % DAYS_PER_WEEK) !== normalizeWeekday(order.weekday)) return false;
    const currentDayMinute = Math.max(0, Math.trunc(Number(time?.hour) || 0) * 60 + Math.trunc(Number(time?.minute) || 0));
    return currentDayMinute >= order.departureHour * 60 + order.departureMinute;
  }

  function vehicleSpec(vehicleType) {
    return window.HFFleet?.VEHICLES?.[vehicleType] || window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicleType] || null;
  }

  function goodSpec(goodId) {
    const id = normalizeId(goodId);
    return (window.HFV2GoodsCatalog || []).find(good => good.id === id) || window.HF_GOODS_DATABASE?.goods?.[id] || null;
  }

  function vehicleCanTransportGood(vehicleType, goodId) {
    const properties = goodSpec(goodId)?.properties || {};
    const requiresRefrigeration = properties.requiresRefrigeration === true || properties.refrigeratedRequired === true;
    return !requiresRefrigeration || vehicleSpec(vehicleType)?.refrigerated === true;
  }

  function vehicleSupportsCarrier(vehicleType, carrierId) {
    const supported = vehicleSpec(vehicleType)?.supportedLoadCarriers || ['loose', 'euro-pallet', 'industrial-pallet'];
    return supported.includes(carrierId);
  }

  function packagingAlternatives(options = {}) {
    const goodId = normalizeId(options.goodId);
    const vehicleType = normalizeId(options.vehicleType) || DEFAULT_VEHICLE_TYPE;
    const amountKg = Math.max(0, Number(options.amountKg) || 0);
    const distanceKm = Math.max(0, Number(options.distanceKm ?? options.path?.distance) || 0);
    const baseDurationHours = Math.max(0, Number(options.durationHours ?? options.path?.duration) || 0);
    return ['pallet', 'swap-body'].map(strategy => {
      const cargo = cargoMetrics(goodId, amountKg, strategy);
      const compatible = cargo.compatibleGood !== false && vehicleSupportsCarrier(vehicleType, cargo.loadCarrier);
      const vehicleCount = compatible ? requiredVehicleCount(vehicleType, cargo) : Infinity;
      const finiteCount = Number.isFinite(vehicleCount) && vehicleCount > 0 ? vehicleCount : 0;
      const capacity = finiteCount ? capacityCheck(vehicleType, cargo, finiteCount) : null;
      const handlingMinutes = cargo.carrierCount * (strategy === 'swap-body' ? 12 : 6);
      const transportCost = finiteCount * distanceKm * Math.max(0, Number(vehicleSpec(vehicleType)?.kmCost) || 0);
      const handlingCost = cargo.carrierCount * (strategy === 'swap-body' ? 35 : 25);
      const rentalCost = Math.max(0, Number(cargo.rentalCost) || 0);
      return {strategy, label: strategy === 'swap-body' ? 'Wechselbehälter' : 'Palette', compatible: compatible && finiteCount > 0, vehicleCount: finiteCount, utilization: capacity ? Math.max(capacity.weightRatio || 0, capacity.volumeRatio || 0) : 0, durationHours: baseDurationHours + handlingMinutes / 60, costs: {transport: transportCost, handling: handlingCost, rental: rentalCost, total: Math.round((transportCost + handlingCost + rentalCost) * 100) / 100}, cargo};
    });
  }

  function selectPackagingStrategy(options = {}) {
    const alternatives = packagingAlternatives(options);
    const requested = ['pallet', 'swap-body'].includes(options.packagingStrategy) ? options.packagingStrategy : 'automatic';
    const viable = alternatives.filter(item => item.compatible);
    const selected = requested === 'automatic'
      ? viable.sort((a, b) => a.costs.total - b.costs.total || b.utilization - a.utilization)[0]
      : alternatives.find(item => item.strategy === requested && item.compatible);
    return {requested, selected: selected || null, alternatives};
  }

  function tripCosts(distanceKm, vehicleType, vehicleCount) {
    const distance = Math.max(0, Number(distanceKm) || 0);
    const perVehicleKm = Math.max(0, Number(vehicleSpec(vehicleType)?.kmCost) || 0);
    const count = Math.max(1, Math.trunc(Number(vehicleCount) || 1));
    return {distanceKm: distance, perVehicleKm, vehicleCount: count, total: Math.round(distance * perVehicleKm * count * 100) / 100, booked: false};
  }

  function bookTripCosts(record, category, prefix) {
    if (!record?.costs || record.costs.booked) return false;
    const bookingId = record.costBookingId || `${prefix}:${record.id}`;
    record.costBookingId = bookingId;
    const total = Math.max(0, Number(record.costs.total) || 0);
    if (total) window.HFV2Save?.changeCash?.(-total, category, {bookingId, absMinute: record.departureAbsMinute, reference: prefix === 'shipment' ? {shipmentId: record.id} : {assignmentId: record.id}});
    record.costs.booked = true;
    return true;
  }

  function vehicleCapacityKg(vehicleType) {
    const shared = window.HFV2VehicleCapacity?.limits?.(vehicleType, 1)?.grossKg;
    if (Number.isFinite(shared)) return shared;
    const load = Number(vehicleSpec(vehicleType)?.load);
    return Number.isFinite(load) && load > 0 ? (load < 100 ? load * 1000 : load) : 0;
  }

  function capacityCheck(vehicleType, cargoes, vehicleCount = 1) {
    const shared = window.HFV2VehicleCapacity?.evaluate?.(vehicleType, cargoes, vehicleCount);
    if (shared) return shared;
    const grossKg = (Array.isArray(cargoes) ? cargoes : [cargoes]).reduce((sum, cargo) => sum + Math.max(0, Number(cargo?.grossKg ?? cargo?.amountKg) || 0), 0);
    const capacityKg = vehicleCapacityKg(vehicleType) * vehicleCount;
    return {ok: capacityKg > 0 && grossKg <= capacityKg, limitingFactor: 'weight', usage: {grossKg, palletSlots: 0}, capacity: {grossKg: capacityKg, palletSlots: 0}};
  }

  function requiredVehicleCount(vehicleType, cargoes) {
    return window.HFV2VehicleCapacity?.requiredVehicleCount?.(vehicleType, cargoes)
      ?? Math.ceil((Array.isArray(cargoes) ? cargoes : [cargoes]).reduce((sum, cargo) => sum + Number(cargo?.grossKg || 0), 0) / vehicleCapacityKg(vehicleType));
  }

  function splitIntoVehicleLoads(goodId, amountKg, vehicleType) {
    // Keep the historic numeric signature usable for third-party integrations.
    if (typeof vehicleType === 'undefined') {
      const amount = Math.max(0, Number(goodId) || 0), capacity = Math.max(0, Number(amountKg) || 0);
      if (!amount || !capacity) return [];
      const loads = [];
      for (let remaining = amount; remaining > 0;) { const load = Math.min(capacity, remaining); loads.push(load); remaining = Math.round((remaining - load) * 1000) / 1000; }
      return loads;
    }
    const amount = Math.max(0, Number(amountKg) || 0);
    if (!amount || requiredVehicleCount(vehicleType, cargoMetrics(goodId, amount)) <= 0) return [];
    const loads = [];
    let remaining = amount;
    while (remaining > 0) {
      let low = 0, high = remaining;
      for (let i = 0; i < 32; i += 1) { const mid = (low + high) / 2; if (capacityCheck(vehicleType, cargoMetrics(goodId, mid)).ok) low = mid; else high = mid; }
      const loadKg = Math.round(Math.min(remaining, low) * 1000) / 1000;
      if (loadKg <= 0) return [];
      loads.push(Math.round(loadKg * 1000) / 1000);
      remaining = Math.round((remaining - loadKg) * 1000) / 1000;
    }
    return loads;
  }


  function nextOrderDueAbsMinute(order, time = currentTime()) {
    if (!order?.enabled) return null;
    const currentDay = Math.max(1, Math.trunc(Number(time?.day) || 1));
    const departureDayMinute = Number.isFinite(Number(order.plannedDepartureAbsMinute))
      ? Math.trunc(Number(order.plannedDepartureAbsMinute)) % MINUTES_PER_DAY
      : order.departureHour * 60 + order.departureMinute;
    const currentDayMinute = Math.max(0, Math.trunc(Number(time?.hour) || 0) * 60 + Math.trunc(Number(time?.minute) || 0));

    if (order.frequency === 'daily') {
      let dueDay = currentDay;
      if (order.lastDispatchedDay === currentDay || currentDayMinute >= departureDayMinute) dueDay += 1;
      return (dueDay - 1) * MINUTES_PER_DAY + departureDayMinute;
    }

    if (order.frequency === 'weekly') {
      const weekday = normalizeWeekday(order.weekday);
      let dueDay = currentDay + ((weekday - ((currentDay - 1) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK);
      if ((order.lastDispatchedDay === dueDay) || (dueDay === currentDay && currentDayMinute >= departureDayMinute)) dueDay += 7;
      return (dueDay - 1) * MINUTES_PER_DAY + departureDayMinute;
    }

    return null;
  }

  function addPositive(target, key, amount) {
    const id = normalizeId(key);
    const value = Math.max(0, Number(amount) || 0);
    if (!id || value <= 0) return;
    target[id] = Math.round(((Number(target[id]) || 0) + value) * 1000) / 1000;
  }

  function getOutgoingProductionDemandMap(cityId, options = {}) {
    configure();
    const id = normalizeId(cityId);
    if (!id) return {};
    const demandMap = {};
    const time = options.time || currentTime();
    const nowAbsMinute = absoluteMinute(time);
    const dueWithinDays = Number(options.dueWithinDays ?? (options.onlyDueWithinNext7Days ? 7 : NaN));
    const dueCutoffAbsMinute = Number.isFinite(dueWithinDays) && dueWithinDays >= 0 ? nowAbsMinute + dueWithinDays * MINUTES_PER_DAY : null;

    for (const order of state.orders) {
      if (!order || String(order.fromCityId || '') !== id || order.enabled === false) continue;
      if (dueCutoffAbsMinute !== null) {
        const dueAbsMinute = nextOrderDueAbsMinute(order, time);
        if (!Number.isFinite(dueAbsMinute) || dueAbsMinute > dueCutoffAbsMinute) continue;
      }
      addPositive(demandMap, order.goodId, order.amountKg);
    }

    if (options.subtractActiveShipments !== false) {
      for (const shipment of state.shipments) {
        if (!shipment || shipment.status !== 'active' || String(shipment.fromCityId || '') !== id) continue;
        const goodId = normalizeId(shipment.goodId);
        if (!goodId || !(goodId in demandMap)) continue;
        demandMap[goodId] = Math.max(0, Math.round(((Number(demandMap[goodId]) || 0) - (Number(shipment.amountKg) || 0)) * 1000) / 1000);
        if (demandMap[goodId] <= 0) delete demandMap[goodId];
      }
    }

    return demandMap;
  }

  function plannedOrderAmountKg(toCityId, goodId, frequency) {
    const dailyDemand = window.HFV2Goods?.getCityDailyDemandMap?.(toCityId)?.[goodId] || 0;
    if (frequency === 'daily') return dailyDemand;
    if (frequency === 'weekly') return dailyDemand * 7;
    const error = new Error('unknown-frequency');
    error.reason = 'unknown-frequency';
    throw error;
  }

  function validateRoute(fromCityId, toCityId, options = {}) {
    const path = window.HFNetwork?.findPath?.(fromCityId, toCityId, {mode: 'road', ...options});
    if (!path?.reachable) {
      const error = new Error('No road route exists between source and target city');
      error.reason = 'no-route';
      throw error;
    }
    return path;
  }

  function coordinatesEqual(a, b) {
    return Array.isArray(a) && Array.isArray(b) && Math.abs(Number(a[0]) - Number(b[0])) < 0.000001 && Math.abs(Number(a[1]) - Number(b[1])) < 0.000001;
  }

  function edgeRouteGeometry(edge, fromNodeId, toNodeId) {
    const from = citiesById[fromNodeId] || window.HFV2CitiesById?.[fromNodeId] || window.HFNetwork?.nodeInfo?.(fromNodeId);
    const to = citiesById[toNodeId] || window.HFV2CitiesById?.[toNodeId] || window.HFNetwork?.nodeInfo?.(toNodeId);
    const fallback = [[Number(from?.lat), Number(from?.lng)], [Number(to?.lat), Number(to?.lng)]].filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    const geometry = Array.isArray(edge?.geometry) && edge.geometry.length > 1 ? edge.geometry : fallback;
    if (edge?.a === fromNodeId && edge?.b === toNodeId) return geometry;
    if (edge?.b === fromNodeId && edge?.a === toNodeId) return [...geometry].reverse();
    return geometry;
  }

  function pathEdgeId(edge) {
    return normalizeId(edge?.id || `${edge?.a || ''}-${edge?.b || ''}-${edge?.type || ''}`);
  }

  function pathRouteGeometry(path) {
    const nodes = Array.isArray(path?.nodes) ? path.nodes : [];
    const edges = Array.isArray(path?.edges) ? path.edges : [];
    const coords = [];
    for (let index = 0; index < edges.length; index += 1) {
      for (const point of edgeRouteGeometry(edges[index], nodes[index], nodes[index + 1])) {
        if (!Array.isArray(point) || point.length < 2) continue;
        const normalized = [Number(point[0]), Number(point[1])];
        if (!Number.isFinite(normalized[0]) || !Number.isFinite(normalized[1])) continue;
        if (!coords.length || !coordinatesEqual(coords[coords.length - 1], normalized)) coords.push(normalized);
      }
    }
    return coords;
  }

  function assertFleetVehicle(cityId, vehicleType) {
    if (!vehicleType) return;
    const available = window.HFFleet?.getAvailableVehicles?.({cityId, vehicleType}) || [];
    const vehicle = window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicleType] || null;
    if (!vehicle || vehicle.mode !== 'road' || available.length <= 0) throw new Error('Selected road vehicle type is not available in the source city fleet');
  }

  function validateRoadShipment({fromCityId, toCityId, goodId, vehicleType, amountKg, departureAbsMinute, reservationId}) {
    if (!vehicleCanTransportGood(vehicleType, goodId)) return {ok: false, reason: 'refrigeration-required'};
    const path = window.HFNetwork?.findPath?.(fromCityId, toCityId, {mode: 'road'});
    if (!path?.reachable) return {ok: false, reason: 'no-route'};

    const vehicle = window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicleType] || null;
    const availableVehicles = window.HFFleet?.getAvailableVehicles?.({cityId: fromCityId, vehicleType, atAbsMinute: departureAbsMinute}) || [];
    if (!vehicle || vehicle.mode !== 'road' || availableVehicles.length <= 0) return {ok: false, reason: 'no-vehicle'};

    const load = Number(vehicle.load);
    const capacityKg = Number.isFinite(load) && load > 0 ? (load >= 100 ? load : load * 1000) : 0;
    if (capacityKg <= 0) return {ok: false, reason: 'capacity-invalid'};

    const cargo = cargoMetrics(goodId, amountKg);
    const grossKg = cargo.grossKg;
    const vehicleCount = requiredVehicleCount(vehicleType, cargo);
    if (vehicleCount <= 0) return {ok: false, reason: 'capacity-invalid'};
    if (vehicleCount > availableVehicles.length) return {ok: false, reason: 'not-enough-vehicles', path, capacityKg, vehicleCount};

    const startAbsMinute = Number(departureAbsMinute);
    const endAbsMinute = startAbsMinute + Math.ceil((Number(path.duration) || 0) * 60);
    const capacityStatus = window.HFNetwork?.pathCapacityStatus?.(path, {startAbsMinute, endAbsMinute, units: vehicleCount, reservationId, vehicleType, vehicleSpeed: vehicle.speed});
    if (capacityStatus && capacityStatus.ok === false) return {ok: false, reason: capacityStatus.reason || 'route-overloaded', path, capacityKg, vehicleCount, arrivalAbsMinute: endAbsMinute, capacityStatus};

    return {ok: true, path, capacityKg, vehicleCount, grossKg, capacity: capacityCheck(vehicleType, cargo, vehicleCount), departureAbsMinute: startAbsMinute, arrivalAbsMinute: endAbsMinute};
  }

  function compatibleBundles(candidate, departureAbsMinute) {
    const candidates = (state?.orders || []).filter(order => order.enabled && order.fromCityId === candidate.fromCityId
      && (order.vehicleType || DEFAULT_VEHICLE_TYPE) === candidate.vehicleType
      && Math.abs(nextOrderDueAbsMinute(order, currentTime()) - departureAbsMinute) <= bundleWindowMinutes());
    const bundles = [];
    for (const order of candidates) {
      const combinedCargo = [cargoMetrics(order.goodId, order.amountKg), cargoMetrics(candidate.goodId, candidate.amountKg)];
      const capacity = capacityCheck(candidate.vehicleType, combinedCargo);
      if (!capacity.ok) continue;
      const route = buildMultiStopRoute(candidate.fromCityId, [candidate, order].map(item => ({toCityId: item.toCityId, goodId: item.goodId, amountKg: item.amountKg, orderId: item.id})), {vehicleType: candidate.vehicleType, departureAbsMinute});
      if (!route) continue;
      const utilization = Math.max(capacity.weightRatio || 0, capacity.volumeRatio || 0);
      bundles.push({orderId: order.id, route, score: Math.round((1000 + utilization * 1000 - route.distance) * 100) / 100});
    }
    return bundles.sort((a, b) => b.score - a.score);
  }

  // Single source of truth used by the modal and createOrder. It scans stable
  // 15-minute slots and includes deadheading, fleet timelines, stock and road capacity.
  function findOrderSchedule(options = {}) {
    configure();
    const fromCityId = normalizeId(options.fromCityId);
    const toCityId = normalizeId(options.toCityId);
    const goodId = normalizeId(options.goodId);
    const frequency = String(options.frequency || 'daily');
    const weekday = normalizeWeekday(options.weekday, frequency);
    const vehicleType = normalizeId(options.vehicleType) || DEFAULT_VEHICLE_TYPE;
    const amountKg = Number(options.amountKg) > 0 ? Number(options.amountKg) : plannedOrderAmountKg(toCityId, goodId, frequency);
    if (!vehicleCanTransportGood(vehicleType, goodId)) return {ok: false, reason: 'refrigeration-required'};
    const path = window.HFNetwork?.findPath?.(fromCityId, toCityId, {mode: 'road'});
    if (!path?.reachable) return {ok: false, reason: 'no-route'};
    const packaging = selectPackagingStrategy({...options, goodId, vehicleType, amountKg, path});
    if (!packaging.selected) return {ok: false, reason: 'incompatible-load-carrier', packagingAlternatives: packaging.alternatives};
    const resolvedPackagingStrategy = packaging.selected.strategy;
    const capacityKg = vehicleCapacityKg(vehicleType);
    const vehicleCount = capacityKg > 0 ? requiredVehicleCount(vehicleType, cargoMetrics(goodId, amountKg, resolvedPackagingStrategy)) : 0;
    const vehicles = window.HFFleet?.getState?.().vehicles || [];
    const matchingVehicles = vehicles.filter(vehicle => vehicle.vehicleType === vehicleType);
    // `no-vehicle` means exactly that the requested type is not owned. Busy
    // vehicles remain valid candidates: their timeline may end early enough for
    // this order (including a deadhead trip back to the source city).
    if (!matchingVehicles.length) return {ok: false, reason: 'no-vehicle'};
    if (!vehicleCount) return {ok: false, reason: 'capacity-invalid'};
    const now = absoluteMinute(options.time || currentTime());
    const currentStockKg = sourceStockKg(fromCityId, goodId);
    const currentExportableKg = exportableStockKg(fromCityId, goodId);
    // Creating the order itself adds its amount to outgoing production demand.
    // If the requested amount is not exportable yet, plan no earlier than the
    // next production cycle instead of making an otherwise valid order impossible.
    const stockReadyAbsMinute = currentExportableKg >= amountKg
      ? now
      : (Math.floor(now / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY;
    const horizonDays = Math.max(frequency === 'weekly' ? 14 : 7, Math.trunc(Number(options.horizonDays) || 0));
    const first = Math.ceil((now + 1) / 15) * 15;
    for (let departureAbsMinute = first; departureAbsMinute <= now + horizonDays * MINUTES_PER_DAY; departureAbsMinute += 15) {
      if (departureAbsMinute < stockReadyAbsMinute) continue;
      const day = Math.floor(departureAbsMinute / MINUTES_PER_DAY) + 1;
      if (frequency === 'weekly' && (day - 1) % DAYS_PER_WEEK !== weekday) continue;
      const duration = shipmentDurationMinutes(path, vehicleType);
      const arrivalAbsMinute = departureAbsMinute + duration;
      const capacityStatus = window.HFNetwork?.pathCapacityStatus?.(path, {startAbsMinute: departureAbsMinute, endAbsMinute: arrivalAbsMinute, units: vehicleCount, vehicleType, vehicleSpeed: vehicleSpec(vehicleType).speed, tripId: `order-slot-${fromCityId}-${toCityId}-${departureAbsMinute}`});
      if (capacityStatus?.ok === false) continue;
      const feasibleVehicles = matchingVehicles.filter(vehicle => {
        if (Number(vehicle.availableAbsMinute || 0) > departureAbsMinute) return false;
        const cityId = vehicle.routeSegment?.toCityId || vehicle.currentCityId;
        if (cityId === fromCityId) return true;
        const repositionPath = window.HFNetwork?.findPath?.(cityId, fromCityId, {mode: 'road'});
        if (!repositionPath?.reachable) return false;
        const repositionDuration = shipmentDurationMinutes(repositionPath, vehicleType);
        if (Number(vehicle.availableAbsMinute || 0) + repositionDuration > departureAbsMinute) return false;
        return window.HFNetwork?.pathCapacityStatus?.(repositionPath, {startAbsMinute: departureAbsMinute - repositionDuration, endAbsMinute: departureAbsMinute, units: 1, vehicleType, vehicleSpeed: vehicleSpec(vehicleType).speed, vehicleId: vehicle.id, tripId: `order-reposition-${vehicle.id}-${departureAbsMinute}`})?.ok !== false;
      });
      if (feasibleVehicles.length < vehicleCount) continue;
      const candidate = {fromCityId, toCityId, goodId, frequency, weekday, vehicleType, amountKg};
      const bundles = compatibleBundles(candidate, departureAbsMinute);
      return {ok: true, departureAbsMinute, arrivalAbsMinute, vehicleCount, vehicleIds: feasibleVehicles.slice(0, vehicleCount).map(vehicle => vehicle.id), path, bundles, bundle: bundles[0] || null, packagingStrategy: resolvedPackagingStrategy, packagingAlternatives: packaging.alternatives, expectedStockKg: Math.max(currentExportableKg, amountKg), stockProducedBeforeDeparture: currentExportableKg < amountKg};
    }
    return {ok: false, reason: 'no-feasible-slot'};
  }

  function createOrder(options = {}) {
    configure();
    const fromCityId = normalizeId(options.fromCityId);
    const toCityId = normalizeId(options.toCityId);
    const goodId = normalizeId(options.goodId);
    const frequency = String(options.frequency || '').trim();
    const vehicleType = normalizeId(options.vehicleType) || null;
    const weekday = normalizeWeekday(options.weekday, frequency);
    if (!fromCityId || !toCityId || !goodId || !FREQUENCIES.has(frequency) || (frequency === 'weekly' && options.weekday == null)) throw new Error('Missing or invalid order fields');
    if (fromCityId === toCityId) throw new Error('Source and target city must be different');
    if (citiesById[fromCityId] === undefined && window.HFV2CitiesById?.[fromCityId] === undefined) throw new Error('Unknown source city');
    if (citiesById[toCityId] === undefined && window.HFV2CitiesById?.[toCityId] === undefined) throw new Error('Unknown target city');
    const amountKg = plannedOrderAmountKg(toCityId, goodId, frequency);
    if (amountKg <= 0) {
      const error = new Error('no-demand');
      error.reason = 'no-demand';
      throw error;
    }
    const schedule = findOrderSchedule({...options, fromCityId, toCityId, goodId, frequency, weekday, vehicleType, amountKg});
    if (!schedule.ok) { const error = new Error(schedule.reason); error.reason = schedule.reason; throw error; }
    const departureHour = Math.floor((schedule.departureAbsMinute % MINUTES_PER_DAY) / 60);
    const departureMinute = schedule.departureAbsMinute % 60;
    const packagingStrategy = ['automatic', 'pallet', 'swap-body'].includes(options.packagingStrategy) ? options.packagingStrategy : 'automatic';
    const order = {id: state.nextOrderId++, fromCityId, toCityId, goodId, frequency, weekday, plannedDepartureAbsMinute: schedule.departureAbsMinute, plannedArrivalAbsMinute: schedule.arrivalAbsMinute, plannedVehicleCount: schedule.vehicleCount, departureHour, departureMinute, vehicleType, amountKg, packagingStrategy, resolvedPackagingStrategy: schedule.packagingStrategy, ...cargoMetrics(goodId, amountKg, schedule.packagingStrategy, {deferCount: true}), enabled: true, lastDispatchedDay: null};
    state.orders.push(order);
    window.HFV2FleetDispatch?.invalidate?.('order-created');
    window.HFV2Save?.dispatchStateChanged?.('logistics-order-created');
    return order;
  }

  function cancelOrder(orderId) {
    configure();
    const id = positiveInteger(orderId, null);
    const before = state.orders.length;
    state.orders = state.orders.filter(order => order.id !== id);
    const removed = before !== state.orders.length;
    if (removed) {
      window.HFV2FleetDispatch?.invalidate?.('order-cancelled');
      window.HFV2Save?.dispatchStateChanged?.('logistics-order-cancelled');
    }
    return removed;
  }

  function setOrderEnabled(orderId, enabled) {
    configure();
    const order = state.orders.find(entry => entry.id === positiveInteger(orderId, null));
    if (!order) return null;
    order.enabled = enabled === true;
    window.HFV2FleetDispatch?.invalidate?.('order-enabled-changed');
    window.HFV2Save?.dispatchStateChanged?.('logistics-order-enabled');
    return order;
  }

  function currentTime() {
    return window.HFV2Time?.getState?.() || window.HFV2Save?.getState?.().time || {day: 1, hour: 0, minute: 0};
  }

  function shipmentDurationMinutes(path, vehicleType) {
    const specSpeed = Math.max(1, Number(vehicleSpec(vehicleType)?.speed) || 0);
    if (specSpeed > 0 && Number(path?.distance) > 0) return Math.max(1, Math.ceil((Number(path.distance) / specSpeed) * 60));
    return Math.max(1, Math.ceil((Number(path?.duration) || 1) * 60));
  }

  function sourceStockKg(cityId, goodId) {
    return Math.max(0, Number(window.HFV2Goods?.getCityInventory?.(cityId)?.[goodId]) || 0);
  }

  function exportableStockKg(cityId, goodId) {
    const exportableKg = window.HFV2Goods?.getExportableStockKg?.(cityId, goodId);
    if (Number.isFinite(Number(exportableKg))) return Math.max(0, Number(exportableKg));
    const reserveKg = Math.max(0, Number(window.HFV2Goods?.getCityDailyDemandMap?.(cityId)?.[goodId]) || 0);
    return Math.max(0, sourceStockKg(cityId, goodId) - reserveKg);
  }

  function markOrderDispatchResult(order, result) {
    order.lastDispatchResult = result;
    order.lastDispatchAbsMinute = absoluteMinute(currentTime());
  }


  function bundleWindowMinutes() {
    return Math.max(0, Math.trunc(Number(state?.bundleWindowMinutes ?? window.HFV2LogisticsBundleWindowMinutes ?? 60) || 60));
  }

  function routeDurationMinutes(route) {
    return Math.max(1, (route?.segments || []).reduce((total, segment) => total + Math.max(1, Number(segment.durationMinutes) || 1), 0));
  }

  function appendPathDetails(target, path) {
    const segmentGeometry = pathRouteGeometry(path);
    for (const point of segmentGeometry) {
      if (!target.geometry.length || !coordinatesEqual(target.geometry[target.geometry.length - 1], point)) target.geometry.push(point);
    }
    for (const nodeId of (Array.isArray(path.nodes) ? path.nodes : []).map(normalizeId).filter(Boolean)) {
      if (!target.pathNodeIds.length || target.pathNodeIds[target.pathNodeIds.length - 1] !== nodeId) target.pathNodeIds.push(nodeId);
    }
    for (const edgeId of (Array.isArray(path.edges) ? path.edges.map(pathEdgeId).filter(Boolean) : [])) target.pathEdgeIds.push(edgeId);
  }

  function buildMultiStopRoute(fromCityId, stops, options = {}) {
    const startCityId = normalizeId(fromCityId);
    const pendingStops = (Array.isArray(stops) ? stops : [])
      .map((stop, index) => ({...stop, toCityId: normalizeId(stop?.toCityId), originalIndex: index}))
      .filter(stop => stop.toCityId && stop.toCityId !== startCityId);
    if (!startCityId || !pendingStops.length) return null;

    const vehicleType = normalizeId(options.vehicleType) || DEFAULT_VEHICLE_TYPE;
    const departureAbsMinute = Number(options.departureAbsMinute);
    const efficientDistanceFactor = Math.max(0, Number(options.efficientDistanceFactor ?? 1) || 1);
    const efficientDurationFactor = Math.max(0, Number(options.efficientDurationFactor ?? 0.9) || 0.9);
    const pathCache = new Map();
    const routeDetails = {segments: [], pathNodeIds: [], pathEdgeIds: [], geometry: []};

    function pathBetween(a, b) {
      const key = `${a}|${b}`;
      if (!pathCache.has(key)) {
        const path = window.HFNetwork?.findPath?.(a, b, {mode: 'road'});
        pathCache.set(key, path?.reachable ? path : null);
      }
      return pathCache.get(key);
    }

    let directDistance = 0;
    let directDurationMinutes = 0;
    for (const stop of pendingStops) {
      const directPath = pathBetween(startCityId, stop.toCityId);
      if (!directPath) return null;
      directDistance += Math.max(0, Number(directPath.distance) || 0);
      directDurationMinutes += shipmentDurationMinutes(directPath, vehicleType);
    }

    let currentCityId = startCityId;
    const orderedStops = [];
    let cursorAbsMinute = Number.isFinite(departureAbsMinute) ? departureAbsMinute : null;
    while (pendingStops.length) {
      let bestIndex = -1;
      let bestPath = null;
      let bestDistance = Infinity;
      for (let index = 0; index < pendingStops.length; index += 1) {
        const candidate = pendingStops[index];
        const path = pathBetween(currentCityId, candidate.toCityId);
        const distance = path ? Math.max(0, Number(path.distance) || 0) : Infinity;
        if (distance < bestDistance) {
          bestIndex = index;
          bestPath = path;
          bestDistance = distance;
        }
      }
      if (bestIndex < 0 || !bestPath) return null;
      const [stop] = pendingStops.splice(bestIndex, 1);
      const durationMinutes = shipmentDurationMinutes(bestPath, vehicleType);
      if (Number.isFinite(cursorAbsMinute)) cursorAbsMinute += durationMinutes;
      const routeStop = {
        ...stop,
        arrivalAbsMinute: Number.isFinite(cursorAbsMinute) ? cursorAbsMinute : null,
        status: ['pending', 'delivered', 'failed', 'partial'].includes(stop.status) ? stop.status : 'pending',
        deliveredKg: Math.max(0, Math.min(Math.max(0, Number(stop.amountKg) || 0), Number(stop.deliveredKg) || 0)),
        undeliveredKg: Number.isFinite(Number(stop.undeliveredKg)) ? Math.max(0, Number(stop.undeliveredKg)) : Math.max(0, Math.max(0, Number(stop.amountKg) || 0) - (Number(stop.deliveredKg) || 0)),
      };
      routeDetails.segments.push({fromCityId: currentCityId, toCityId: stop.toCityId, stop: routeStop, path: bestPath, distance: bestDistance, durationMinutes});
      appendPathDetails(routeDetails, bestPath);
      orderedStops.push(routeStop);
      currentCityId = stop.toCityId;
    }

    const totalDistance = routeDetails.segments.reduce((total, segment) => total + Math.max(0, Number(segment.distance) || 0), 0);
    const durationMinutes = routeDurationMinutes(routeDetails);
    const distanceOk = totalDistance <= directDistance * efficientDistanceFactor;
    const durationOk = durationMinutes <= directDurationMinutes * efficientDurationFactor;
    if (options.force !== true && !distanceOk && !durationOk) return null;

    const arrivalAbsMinute = Number.isFinite(departureAbsMinute) ? departureAbsMinute + durationMinutes : null;
    return {
      segments: routeDetails.segments,
      stops: orderedStops.map(({originalIndex, ...stop}) => stop),
      pathNodeIds: routeDetails.pathNodeIds,
      pathEdgeIds: routeDetails.pathEdgeIds,
      geometry: routeDetails.geometry,
      routeGeometry: routeDetails.geometry,
      distance: totalDistance,
      directDistance,
      durationMinutes,
      directDurationMinutes,
      departureAbsMinute: Number.isFinite(departureAbsMinute) ? departureAbsMinute : null,
      arrivalAbsMinute,
      efficient: distanceOk || durationOk,
    };
  }

  function combinedRoute(fromCityId, stops, vehicleType, options = {}) {
    return buildMultiStopRoute(fromCityId, stops, {vehicleType, ...options});
  }

  function reserveRouteCapacity(route, options) {
    const reservationIds = [];
    let cursorAbsMinute = Number(options.startAbsMinute);
    try {
      for (let index = 0; index < route.segments.length; index += 1) {
        const segment = route.segments[index];
        const endAbsMinute = cursorAbsMinute + segment.durationMinutes;
        const reservationId = `${options.reservationId}-segment-${index + 1}`;
        const capacityStatus = window.HFNetwork?.pathCapacityStatus?.(segment.path, {startAbsMinute: cursorAbsMinute, endAbsMinute, units: options.units, vehicleType: options.vehicleType, vehicleSpeed: vehicleSpec(options.vehicleType).speed, vehicleIds: options.vehicleIds, tripId: options.tripId || options.reservationId});
        if (capacityStatus && capacityStatus.ok === false) {
          for (const id of reservationIds) window.HFNetwork?.releaseCapacityReservation?.(id);
          return {ok: false, reason: capacityStatus.reason || 'route-overloaded'};
        }
        const reservation = window.HFNetwork?.reservePathCapacity?.(segment.path, {startAbsMinute: cursorAbsMinute, endAbsMinute, units: options.units, reservationId, vehicleType: options.vehicleType, vehicleSpeed: vehicleSpec(options.vehicleType).speed, vehicleIds: options.vehicleIds, tripId: options.tripId || options.reservationId});
        if (reservation && reservation.ok === false) {
          for (const id of reservationIds) window.HFNetwork?.releaseCapacityReservation?.(id);
          return {ok: false, reason: reservation.reason || 'route-overloaded'};
        }
        reservationIds.push(reservation?.reservationId || reservationId);
        cursorAbsMinute = endAbsMinute;
      }
    } catch (error) {
      for (const id of reservationIds) window.HFNetwork?.releaseCapacityReservation?.(id);
      throw error;
    }
    return {ok: true, reservationIds, arrivalAbsMinute: cursorAbsMinute};
  }

  function releaseRouteReservations(reservation) {
    if (Array.isArray(reservation?.reservationIds)) {
      for (const id of reservation.reservationIds) window.HFNetwork?.releaseCapacityReservation?.(id);
      return;
    }
    if (reservation?.reservationId) window.HFNetwork?.releaseCapacityReservation?.(reservation.reservationId);
  }

  function releaseShipmentReservations(shipment, fields) {
    const ids = new Set();
    for (const field of fields) {
      const value = shipment?.[field];
      if (Array.isArray(value)) {
        for (const id of value) if (id) ids.add(id);
      } else if (value) ids.add(value);
    }
    for (const id of ids) window.HFNetwork?.releaseCapacityReservation?.(id);
    for (const field of fields) delete shipment[field];
  }

  function reserveShipmentVehicles({shipmentId, cityId, vehicleType, vehicleIds = null, count, departureAbsMinute, finalAvailableAbsMinute, toCityId}) {
    const assigned = window.HFFleet?.assignVehicles?.({
      cityId,
      vehicleType,
      vehicleIds,
      count,
      assignmentId: shipmentId,
      departureAbsMinute,
      availableAbsMinute: finalAvailableAbsMinute,
      routeSegment: {fromCityId: cityId, toCityId},
    }) || [];
    if (assigned.length === count) return assigned;
    window.HFFleet?.releaseAssignment?.(shipmentId, cityId, departureAbsMinute);
    return [];
  }

  function rollbackVehicleReservation(shipmentId, cityId, departureAbsMinute) {
    window.HFFleet?.releaseAssignment?.(shipmentId, cityId, departureAbsMinute);
  }

  function createSingleShipment(order, time, nowAbsMinute, created) {
    const vehicleType = order.vehicleType || DEFAULT_VEHICLE_TYPE;
    const departureAbsMinute = nowAbsMinute;
    const plannedTrip = window.HFV2FleetDispatch?.plannedTrip?.(order.id, departureAbsMinute);
    const plannedAmountKg = Number(plannedTrip?.amountKg);
    const requestedAmountKg = Number.isFinite(plannedAmountKg) && plannedAmountKg > 0
      ? Math.min(Number(order.amountKg), plannedAmountKg)
      : Number(order.amountKg);
    const amountKg = Math.min(requestedAmountKg, exportableStockKg(order.fromCityId, order.goodId));
    if (amountKg <= 0) {
      markOrderDispatchResult(order, 'stock-limited');
      return null;
    }
    const plannedReservationId = plannedTrip?.capacityReservationIds?.length === 1 ? plannedTrip.capacityReservationIds[0] : null;
    const validation = validateRoadShipment({fromCityId: order.fromCityId, toCityId: order.toCityId, goodId: order.goodId, vehicleType, amountKg, departureAbsMinute, reservationId: plannedReservationId});
    if (!validation.ok) {
      markOrderDispatchResult(order, validation.reason);
      return null;
    }

    const {path, vehicleCount, arrivalAbsMinute} = validation;
    const reservationId = `shipment-${state.nextShipmentId}`;
    const plannedVehicleIds = plannedTrip?.vehicleIds?.slice(0, vehicleCount);
    const assigned = reserveShipmentVehicles({shipmentId: state.nextShipmentId, cityId: order.fromCityId, vehicleType, vehicleIds: plannedVehicleIds, count: vehicleCount, departureAbsMinute, finalAvailableAbsMinute: arrivalAbsMinute, toCityId: order.toCityId});
    if (assigned.length !== vehicleCount) {
      markOrderDispatchResult(order, 'not-enough-vehicles');
      return null;
    }
    const consumedTrip = window.HFV2FleetDispatch?.consumeTrip?.(order.id, departureAbsMinute, {
      transferReservations: true,
      vehicleIds: assigned.map(vehicle => vehicle.id),
    });
    const transferredOutboundId = consumedTrip?.capacityReservationIds?.length === 1 ? consumedTrip.capacityReservationIds[0] : null;
    let reservation;
    try {
      if (transferredOutboundId) reservation = {ok: true, reservationId: transferredOutboundId};
      else {
        for (const id of consumedTrip?.capacityReservationIds || []) window.HFNetwork?.releaseCapacityReservation?.(id);
        reservation = window.HFNetwork?.reservePathCapacity?.(path, {startAbsMinute: departureAbsMinute, endAbsMinute: arrivalAbsMinute, units: vehicleCount, reservationId, vehicleType, vehicleSpeed: vehicleSpec(vehicleType).speed, tripId: reservationId});
      }
    } catch (error) {
      for (const id of consumedTrip?.capacityReservationIds || []) window.HFNetwork?.releaseCapacityReservation?.(id);
      for (const id of consumedTrip?.plannedReturn?.capacityReservationIds || []) window.HFNetwork?.releaseCapacityReservation?.(id);
      rollbackVehicleReservation(state.nextShipmentId, order.fromCityId, departureAbsMinute);
      markOrderDispatchResult(order, error?.reason || 'route-reservation-failed');
      window.HFV2FleetDispatch?.invalidate?.('shipment-failed', departureAbsMinute);
      return null;
    }
    if (reservation && reservation.ok === false) {
      for (const id of consumedTrip?.plannedReturn?.capacityReservationIds || []) window.HFNetwork?.releaseCapacityReservation?.(id);
      rollbackVehicleReservation(state.nextShipmentId, order.fromCityId, departureAbsMinute);
      markOrderDispatchResult(order, reservation.reason || 'route-overloaded');
      window.HFV2FleetDispatch?.invalidate?.('shipment-failed', departureAbsMinute);
      return null;
    }

    let removed;
    try {
      removed = window.HFV2Goods?.removeFromInventory?.(order.fromCityId, order.goodId, amountKg);
    } catch (error) {
      releaseRouteReservations({reservationId: reservation?.reservationId || reservationId});
      for (const id of consumedTrip?.plannedReturn?.capacityReservationIds || []) window.HFNetwork?.releaseCapacityReservation?.(id);
      rollbackVehicleReservation(state.nextShipmentId, order.fromCityId, departureAbsMinute);
      markOrderDispatchResult(order, error?.reason || 'stock-removal-failed');
      return null;
    }
    if (!removed?.ok || Number(removed.removedKg) !== amountKg) {
      releaseRouteReservations({reservationId: reservation?.reservationId || reservationId});
      for (const id of consumedTrip?.plannedReturn?.capacityReservationIds || []) window.HFNetwork?.releaseCapacityReservation?.(id);
      rollbackVehicleReservation(state.nextShipmentId, order.fromCityId, departureAbsMinute);
      if (Number(removed?.removedKg) > 0) window.HFV2Goods?.addToInventory?.(order.fromCityId, order.goodId, Number(removed.removedKg));
      markOrderDispatchResult(order, removed?.reason || 'stock-limited');
      return null;
    }

    const geometry = pathRouteGeometry(path);
    const shipment = {
      id: state.nextShipmentId++,
      orderId: order.id,
      fromCityId: order.fromCityId,
      toCityId: order.toCityId,
      goodId: order.goodId,
      amountKg,
      ...cargoMetrics(order.goodId, amountKg, order.resolvedPackagingStrategy || order.packagingStrategy),
      vehicleType,
      vehicleIds: assigned.map(vehicle => vehicle.id),
      vehicleCount: assigned.length,
      pathNodeIds: Array.isArray(path.nodes) ? path.nodes.map(normalizeId).filter(Boolean) : [],
      pathEdgeIds: Array.isArray(path.edges) ? path.edges.map(pathEdgeId).filter(Boolean) : [],
      geometry,
      routeGeometry: geometry,
      departureAbsMinute,
      arrivalAbsMinute,
      reservationId: reservation?.reservationId || reservationId,
      plannedReturnReservationIds: consumedTrip?.plannedReturn?.capacityReservationIds || [],
      plannedReturnDepartureAbsMinute: consumedTrip?.plannedReturn?.departureAbsMinute ?? null,
      plannedReturnArrivalAbsMinute: consumedTrip?.plannedReturn?.arrivalAbsMinute ?? null,
      postDeliveryAction: consumedTrip?.postDelivery?.action || 'stay',
      postDeliveryTargetCityId: consumedTrip?.postDelivery?.targetCityId ?? order.toCityId,
      postDeliveryDepartureAbsMinute: consumedTrip?.postDelivery?.departureAbsMinute ?? arrivalAbsMinute,
      postDeliveryArrivalAbsMinute: consumedTrip?.postDelivery?.arrivalAbsMinute ?? arrivalAbsMinute,
      postDeliveryReservationIds: consumedTrip?.postDelivery?.capacityReservationIds || [],
      status: 'active',
      shipmentSemantics: 'destination-fleet-v2',
      createdAtAbsMinute: nowAbsMinute,
      costs: tripCosts(path.distance, vehicleType, assigned.length),
    };
    state.shipments.push(shipment);
    bookTripCosts(shipment, 'logistics-shipment-cost', 'shipment');
    created.push(shipment);
    order.lastDispatchedDay = Math.max(1, Math.trunc(Number(time.day) || 1));
    markOrderDispatchResult(order, amountKg < Number(order.amountKg) ? 'partial-delivery' : 'created');
    return shipment;
  }

  function createFallbackBundledShipment(orders, time, nowAbsMinute, created) {
    if (orders.length < 2) return false;
    const vehicleType = orders[0].vehicleType || DEFAULT_VEHICLE_TYPE;
    if (orders.some(order => !vehicleCanTransportGood(vehicleType, order.goodId))) return false;
    const capacityKg = vehicleCapacityKg(vehicleType);
    if (capacityKg <= 0) return false;
    const vehicle = window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicleType] || null;
    const availableVehicles = window.HFFleet?.getAvailableVehicles?.({cityId: orders[0].fromCityId, vehicleType, atAbsMinute: nowAbsMinute}) || [];
    if (!vehicle || vehicle.mode !== 'road' || availableVehicles.length <= 0) return false;

    const remainingByGood = new Map();
    const dispatches = [];
    for (const order of orders) {
      if (!remainingByGood.has(order.goodId)) remainingByGood.set(order.goodId, exportableStockKg(order.fromCityId, order.goodId));
      const plannedTrip = window.HFV2FleetDispatch?.plannedTrip?.(order.id, nowAbsMinute);
      const plannedAmountKg = Number(plannedTrip?.amountKg);
      const requestedAmountKg = Number.isFinite(plannedAmountKg) && plannedAmountKg > 0
        ? Math.min(Number(order.amountKg), plannedAmountKg)
        : Number(order.amountKg);
      const amountKg = Math.min(requestedAmountKg, remainingByGood.get(order.goodId));
      if (amountKg <= 0) {
        markOrderDispatchResult(order, 'stock-limited');
        continue;
      }
      dispatches.push({order, amountKg});
      remainingByGood.set(order.goodId, Math.max(0, remainingByGood.get(order.goodId) - amountKg));
    }
    if (dispatches.length < 2) return false;
    const amountKg = Math.round(dispatches.reduce((total, dispatch) => total + dispatch.amountKg, 0) * 1000) / 1000;
    const bundledCargo = dispatches.map(dispatch => cargoMetrics(dispatch.order.goodId, dispatch.amountKg, dispatch.order.resolvedPackagingStrategy || dispatch.order.packagingStrategy));
    const bundleCapacity = capacityCheck(vehicleType, bundledCargo);
    if (!bundleCapacity.ok) return false;
    const bundledGrossKg = bundleCapacity.usage.grossKg;

    const dispatchedOrders = dispatches.map(dispatch => dispatch.order);
    // Bundling may only combine trips whose persisted post-delivery decision is
    // compatible with ending at the last stop.  Return trips keep their planned
    // calendar leg and reservation by falling back to single-shipment dispatch.
    if (dispatchedOrders.some(order => window.HFV2FleetDispatch?.plannedTrip?.(order.id, nowAbsMinute)?.postDeliveryAction === 'return')) return false;
    const stops = dispatches.map(({order, amountKg: stopAmountKg}) => ({toCityId: order.toCityId, goodId: order.goodId, amountKg: stopAmountKg, orderId: order.id}));
    const route = combinedRoute(orders[0].fromCityId, stops, vehicleType, {departureAbsMinute: nowAbsMinute});
    if (!route) return false;
    if (window.HFV2FleetDispatch?.canBundleOrders?.(dispatchedOrders, route.arrivalAbsMinute) === false) return false;
    const routeStops = route.stops;
    for (const order of dispatchedOrders) window.HFV2FleetDispatch?.consumeTrip?.(order.id, nowAbsMinute);
    const reservationId = `shipment-${state.nextShipmentId}`;
    const assigned = reserveShipmentVehicles({shipmentId: state.nextShipmentId, cityId: orders[0].fromCityId, vehicleType, count: 1, departureAbsMinute: nowAbsMinute, finalAvailableAbsMinute: route.arrivalAbsMinute, toCityId: routeStops[routeStops.length - 1].toCityId});
    if (assigned.length !== 1) return false;
    let reservation;
    try {
      reservation = reserveRouteCapacity(route, {startAbsMinute: nowAbsMinute, units: 1, reservationId, vehicleType, vehicleIds: [vehicle.id], tripId: reservationId});
    } catch (error) {
      rollbackVehicleReservation(state.nextShipmentId, orders[0].fromCityId, nowAbsMinute);
      return false;
    }
    if (!reservation.ok) {
      rollbackVehicleReservation(state.nextShipmentId, orders[0].fromCityId, nowAbsMinute);
      return false;
    }

    const removedStops = [];
    for (const stop of routeStops) {
      let removed;
      try {
        removed = window.HFV2Goods?.removeFromInventory?.(orders[0].fromCityId, stop.goodId, stop.amountKg);
      } catch (error) {
        releaseRouteReservations(reservation);
        rollbackVehicleReservation(state.nextShipmentId, orders[0].fromCityId, nowAbsMinute);
        for (const removedStop of removedStops) window.HFV2Goods?.addToInventory?.(orders[0].fromCityId, removedStop.goodId, removedStop.amountKg);
        return false;
      }
      if (!removed?.ok || Number(removed.removedKg) !== stop.amountKg) {
        releaseRouteReservations(reservation);
        rollbackVehicleReservation(state.nextShipmentId, orders[0].fromCityId, nowAbsMinute);
        for (const removedStop of removedStops) window.HFV2Goods?.addToInventory?.(orders[0].fromCityId, removedStop.goodId, removedStop.amountKg);
        if (Number(removed?.removedKg) > 0) window.HFV2Goods?.addToInventory?.(orders[0].fromCityId, stop.goodId, Number(removed.removedKg));
        return false;
      }
      removedStops.push(stop);
    }

    const shipment = {
      id: state.nextShipmentId++,
      orderId: orders[0].id,
      fromCityId: orders[0].fromCityId,
      toCityId: routeStops[routeStops.length - 1].toCityId,
      goodId: routeStops[0].goodId,
      amountKg,
      netKg: amountKg,
      tareKg: Math.max(0, bundledGrossKg - amountKg),
      grossKg: bundledGrossKg,
      carrierCount: dispatches.reduce((total, dispatch) => total + cargoMetrics(dispatch.order.goodId, dispatch.amountKg, dispatch.order.resolvedPackagingStrategy || dispatch.order.packagingStrategy).carrierCount, 0),
      vehicleType,
      vehicleIds: assigned.map(vehicle => vehicle.id),
      vehicleCount: assigned.length,
      stops: routeStops,
      routeStops,
      pathNodeIds: route.pathNodeIds,
      pathEdgeIds: route.pathEdgeIds,
      geometry: route.geometry,
      routeGeometry: route.geometry,
      departureAbsMinute: nowAbsMinute,
      arrivalAbsMinute: reservation.arrivalAbsMinute,
      reservationIds: reservation.reservationIds,
      status: 'active',
      shipmentSemantics: 'destination-fleet-v2',
      createdAtAbsMinute: nowAbsMinute,
      costs: tripCosts(route.distance, vehicleType, assigned.length),
    };
    state.shipments.push(shipment);
    bookTripCosts(shipment, 'logistics-shipment-cost', 'shipment');
    created.push(shipment);
    for (const {order, amountKg: dispatchedAmountKg} of dispatches) {
      order.lastDispatchedDay = Math.max(1, Math.trunc(Number(time.day) || 1));
      markOrderDispatchResult(order, dispatchedAmountKg < Number(order.amountKg) ? 'partial-delivery' : 'created');
    }
    return true;
  }


  function executePlannedTrip(trip, time, nowAbsMinute, created) {
    if (!trip?.stops?.length || !trip?.segments?.length || trip.status !== 'planned') return false;
    const orders = trip.stops.map(stop => state.orders.find(order => order.id === stop.orderId));
    if (orders.some(order => !order)) return false;
    const shipmentId = state.nextShipmentId;
    const assigned = reserveShipmentVehicles({
      shipmentId, cityId: trip.fromCityId, vehicleType: trip.vehicleType,
      vehicleIds: trip.vehicleIds, count: trip.vehicleIds.length,
      departureAbsMinute: trip.departureAbsMinute,
      finalAvailableAbsMinute: trip.disposition?.arrivalAbsMinute ?? trip.arrivalAbsMinute,
      toCityId: trip.disposition?.targetCityId ?? trip.stops.at(-1).toCityId,
    });
    if (assigned.length !== trip.vehicleIds.length) return false;

    const consumed = window.HFV2FleetDispatch?.consumeTrip?.(trip.orderIds[0], trip.departureAbsMinute, {transferReservations:true,vehicleIds:trip.vehicleIds});
    if (!consumed || consumed.id !== trip.id) {
      rollbackVehicleReservation(shipmentId, trip.fromCityId, trip.departureAbsMinute);
      window.HFV2FleetDispatch?.invalidate?.('planned-trip-missing', nowAbsMinute);
      return false;
    }
    const removed=[];
    for(const stop of trip.stops) {
      const result=window.HFV2Goods?.removeFromInventory?.(trip.fromCityId,stop.goodId,stop.amountKg);
      if(!result?.ok || Number(result.removedKg)!==Number(stop.amountKg)) {
        for(const item of removed) window.HFV2Goods?.addToInventory?.(trip.fromCityId,item.goodId,item.amountKg);
        if(Number(result?.removedKg)>0) window.HFV2Goods?.addToInventory?.(trip.fromCityId,stop.goodId,Number(result.removedKg));
        for(const id of [...(consumed.capacityReservationIds||[]),...(consumed.plannedReturn?.capacityReservationIds||[])]) window.HFNetwork?.releaseCapacityReservation?.(id);
        rollbackVehicleReservation(shipmentId,trip.fromCityId,trip.departureAbsMinute);
        window.HFV2FleetDispatch?.invalidate?.('planned-trip-stock-changed',nowAbsMinute);
        return false;
      }
      removed.push({goodId:stop.goodId,amountKg:stop.amountKg});
    }
    const geometry=[]; const pathNodeIds=[]; const pathEdgeIds=[];
    for(const segment of trip.segments) {
      const path=window.HFNetwork?.findPath?.(segment.fromCityId,segment.toCityId,{mode:'road'});
      appendPathDetails({geometry,pathNodeIds,pathEdgeIds},path||{});
    }
    const disposition=trip.disposition||{action:'stay',targetCityId:trip.stops.at(-1).toCityId,departureAbsMinute:trip.arrivalAbsMinute,arrivalAbsMinute:trip.arrivalAbsMinute};
    const shipment={id:state.nextShipmentId++,tripId:trip.id,orderId:trip.orderIds[0],fromCityId:trip.fromCityId,toCityId:trip.stops.at(-1).toCityId,
      goodId:trip.stops[0].goodId,amountKg:trip.loadKg,netKg:trip.loadKg,tareKg:trip.tareKg||0,grossKg:trip.grossKg||trip.loadKg,carrierCount:trip.carrierCount||0,vehicleType:trip.vehicleType,vehicleIds:[...trip.vehicleIds],vehicleCount:trip.vehicleIds.length,
      stops:trip.stops.map(stop=>({...stop})),routeStops:trip.stops.map(stop=>({...stop})),segments:trip.segments.map(segment=>({...segment})),edgeTimes:[...(trip.edgeTimes||[])],
      pathNodeIds,pathEdgeIds,geometry,routeGeometry:geometry,departureAbsMinute:trip.departureAbsMinute,arrivalAbsMinute:trip.arrivalAbsMinute,
      reservationIds:[...(consumed.capacityReservationIds||[])],plannedReturnReservationIds:[...(consumed.plannedReturn?.capacityReservationIds||[])],
      plannedReturnDepartureAbsMinute:consumed.plannedReturn?.departureAbsMinute??null,plannedReturnArrivalAbsMinute:consumed.plannedReturn?.arrivalAbsMinute??null,
      postDeliveryAction:disposition.action,postDeliveryTargetCityId:disposition.targetCityId,postDeliveryDepartureAbsMinute:disposition.departureAbsMinute,
      postDeliveryArrivalAbsMinute:disposition.arrivalAbsMinute,postDeliveryReservationIds:[...(disposition.capacityReservationIds||[])],
      status:'active',shipmentSemantics:'destination-fleet-v2',createdAtAbsMinute:nowAbsMinute,
      costs:tripCosts(trip.segments.reduce((sum,segment)=>sum+(Number(segment.distance)||0),0),trip.vehicleType,trip.vehicleIds.length)};
    state.shipments.push(shipment); bookTripCosts(shipment,'logistics-shipment-cost','shipment'); created.push(shipment);
    for(const order of orders) {order.lastDispatchedDay=Math.max(1,Math.trunc(Number(time.day)||1));markOrderDispatchResult(order,'created');}
    return true;
  }

  function tick() {
    configure();
    const time=currentTime(), nowAbsMinute=absoluteMinute(time);
    advanceAssignments(nowAbsMinute);
    const plan=window.HFV2FleetDispatch?.ensurePlan?.({state});
    window.HFNetwork?.cleanupCapacityReservations?.(nowAbsMinute-MINUTES_PER_DAY);
    const created=[];
    if (!window.HFV2FleetDispatch) {
      const due=state.orders.filter(order=>orderDueToday(order,time));
      const grouped=new Map();
      for(const order of due) {const key=`${order.fromCityId}|${order.vehicleType||DEFAULT_VEHICLE_TYPE}`;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(order);}
      for(const orders of grouped.values()) {
        if(orders.length>1 && createFallbackBundledShipment(orders,time,nowAbsMinute,created)) continue;
        for(const order of orders) createSingleShipment(order,time,nowAbsMinute,created);
      }
      if(created.length) window.HFV2Save?.dispatchStateChanged?.('logistics-shipments-created');
      return created;
    }
    const dueTrips=(plan?.trips||[]).filter(trip=>trip.status==='planned'&&trip.departureAbsMinute<=nowAbsMinute
      && trip.orderIds?.some(id=>state.orders.some(order=>order.id===id&&orderDueToday(order,time))));
    for(const trip of dueTrips) executePlannedTrip(trip,time,nowAbsMinute,created);

    // Explicit recovery only: invalidate first, then build and consume one new
    // internally consistent plan.  There is no ad-hoc grouping in tick.
    const uncovered=state.orders.filter(order=>orderDueToday(order,time)&&!dueTrips.some(trip=>trip.orderIds.includes(order.id)));
    if(uncovered.length) {
      window.HFV2FleetDispatch?.invalidate?.('due-order-not-in-plan',nowAbsMinute);
      const fallback=window.HFV2FleetDispatch?.buildPlan?.({state,fromAbsMinute:nowAbsMinute});
      for(const trip of fallback?.trips||[]) if(trip.status==='planned'&&trip.departureAbsMinute<=nowAbsMinute&&trip.orderIds.some(id=>uncovered.some(order=>order.id===id))) executePlannedTrip(trip,time,nowAbsMinute,created);
    }
    if(created.length) window.HFV2Save?.dispatchStateChanged?.('logistics-shipments-created');
    return created;
  }

  function createRepositioningAssignment(options = {}) {
    configure();
    const fromCityId = normalizeId(options.fromCityId);
    const toCityId = normalizeId(options.toCityId);
    const departureAbsMinute = Number.isFinite(Number(options.departureAbsMinute)) ? Number(options.departureAbsMinute) : absoluteMinute(currentTime());
    const requestedIds = Array.isArray(options.vehicleIds) ? [...new Set(options.vehicleIds.map(Number).filter(Number.isFinite))] : [];
    if (!fromCityId || !toCityId || fromCityId === toCityId || !requestedIds.length) return {ok: false, reason: 'invalid-repositioning'};
    const available = window.HFFleet?.getAvailableVehicles?.({cityId: fromCityId, atAbsMinute: departureAbsMinute}) || [];
    const selected = requestedIds.map(id => available.find(vehicle => vehicle.id === id)).filter(Boolean);
    if (selected.length !== requestedIds.length) return {ok: false, reason: 'vehicle-not-available'};
    const vehicleType = normalizeId(options.vehicleType) || selected[0]?.vehicleType;
    if (!vehicleType || selected.some(vehicle => vehicle.vehicleType !== vehicleType)) return {ok: false, reason: 'mixed-vehicle-types'};
    const path = window.HFNetwork?.findPath?.(fromCityId, toCityId, {mode: 'road'});
    if (!path?.reachable) return {ok: false, reason: 'no-route'};
    const durationMinutes = shipmentDurationMinutes(path, vehicleType);
    const arrivalAbsMinute = departureAbsMinute + durationMinutes;
    const id = `repositioning-${state.nextAssignmentId}`;
    const nowAbsMinute = absoluteMinute(currentTime());
    const isPlanned = departureAbsMinute > nowAbsMinute;
    const reservation = window.HFNetwork?.reservePathCapacity?.(path, {startAbsMinute: departureAbsMinute, endAbsMinute: arrivalAbsMinute, units: selected.length, reservationId: id, vehicleType, vehicleSpeed: vehicleSpec(vehicleType).speed, vehicleIds: selected.map(vehicle => vehicle.id), tripId: id});
    if (reservation?.ok === false) return {ok: false, reason: reservation.reason || 'route-overloaded'};
    const assigned = isPlanned ? selected : (window.HFFleet?.assignVehicles?.({cityId: fromCityId, vehicleType, vehicleIds: requestedIds, count: selected.length, assignmentId: id, departureAbsMinute, availableAbsMinute: arrivalAbsMinute, routeSegment: {fromCityId, toCityId}}) || []);
    if (assigned.length !== selected.length) {
      window.HFFleet?.releaseAssignment?.(id, fromCityId, departureAbsMinute);
      window.HFNetwork?.releaseCapacityReservation?.(reservation?.reservationId || id);
      return {ok: false, reason: 'vehicle-not-available'};
    }
    const spec = vehicleSpec(vehicleType) || {};
    const distanceKm = Math.max(0, Number(path.distance) || 0);
    const total = Math.round(distanceKm * Math.max(0, Number(spec.kmCost) || 0) * selected.length * 100) / 100;
    const assignment = {id, type: 'repositioning', reason: normalizeId(options.reason) || 'future-demand', fromCityId, toCityId, vehicleType, vehicleIds: assigned.map(vehicle => vehicle.id), departureAbsMinute, arrivalAbsMinute, route: {pathNodeIds: Array.isArray(path.nodes) ? path.nodes.map(normalizeId).filter(Boolean) : [], pathEdgeIds: Array.isArray(path.edges) ? path.edges.map(pathEdgeId).filter(Boolean) : [], geometry: pathRouteGeometry(path), distance: distanceKm, durationMinutes}, capacityReservationIds: [reservation?.reservationId || id], costs: {...tripCosts(distanceKm, vehicleType, selected.length), total}, status: isPlanned ? 'planned' : 'active', createdAtAbsMinute: nowAbsMinute};
    state.nextAssignmentId += 1;
    state.assignments.push(assignment);
    if (!isPlanned) bookTripCosts(assignment, 'logistics-repositioning-cost', 'repositioning');
    window.HFV2Save?.dispatchStateChanged?.('logistics-repositioning-created');
    return {ok: true, assignment};
  }

  function advanceAssignments(nowAbsMinute) {
    const completed = [];
    for (const assignment of state.assignments) {
      if (assignment.type === 'repositioning' && assignment.status === 'planned' && assignment.departureAbsMinute <= nowAbsMinute) {
        const assigned = window.HFFleet?.assignVehicles?.({
          cityId: assignment.fromCityId,
          vehicleType: assignment.vehicleType,
          vehicleIds: assignment.vehicleIds,
          count: assignment.vehicleIds.length,
          assignmentId: assignment.id,
          departureAbsMinute: assignment.departureAbsMinute,
          availableAbsMinute: assignment.arrivalAbsMinute,
          routeSegment: {fromCityId: assignment.fromCityId, toCityId: assignment.toCityId},
        }) || [];
        if (assigned.length !== assignment.vehicleIds.length) {
          assignment.status = 'cancelled';
          for (const id of assignment.capacityReservationIds || []) window.HFNetwork?.releaseCapacityReservation?.(id);
          window.HFV2FleetDispatch?.invalidate?.('repositioning-failed', nowAbsMinute);
          continue;
        }
        assignment.status = 'active';
        assignment.startedAbsMinute = Math.max(assignment.departureAbsMinute, nowAbsMinute);
        bookTripCosts(assignment, 'logistics-repositioning-cost', 'repositioning');
      }
      if (assignment.type !== 'repositioning' || assignment.status !== 'active' || assignment.arrivalAbsMinute > nowAbsMinute) continue;
      assignment.status = 'completed';
      assignment.completedAbsMinute = assignment.arrivalAbsMinute;
      window.HFFleet?.releaseAssignment?.(assignment.id, assignment.toCityId, assignment.arrivalAbsMinute);
      completed.push(assignment);
    }
    return completed;
  }

  function shipmentOrders(shipment) {
    const orderIds = Array.isArray(shipment.stops) && shipment.stops.length
      ? shipment.stops.map(stop => positiveInteger(stop.orderId, null)).filter(Boolean)
      : [positiveInteger(shipment.orderId, null)].filter(Boolean);
    return [...new Set(orderIds)].map(orderId => state.orders.find(order => order.id === orderId)).filter(Boolean);
  }

  function beginRequiredDailyReturn(shipment, destinationCityId, arrivalAbsMinute) {
    if (shipment.postDeliveryAction !== 'return') return false;
    const requiredCount = Math.max(1, Math.trunc(Number(shipment.vehicleCount) || shipment.vehicleIds?.length || 1));
    const targetCityId = shipment.postDeliveryTargetCityId;
    const returnDepartureAbsMinute = Number(shipment.postDeliveryDepartureAbsMinute);
    const returnArrivalAbsMinute = Number(shipment.postDeliveryArrivalAbsMinute);
    if (targetCityId == null || !Number.isFinite(returnDepartureAbsMinute) || !Number.isFinite(returnArrivalAbsMinute)) return false;
    const path = window.HFNetwork?.findPath?.(destinationCityId, targetCityId, {mode: 'road'});
    if (!path?.reachable) return false;
    const plannedIds = Array.isArray(shipment.postDeliveryReservationIds) ? shipment.postDeliveryReservationIds.filter(Boolean) : [];
    const canReusePlanned = plannedIds.length > 0;
    if (!canReusePlanned) releaseShipmentReservations(shipment, ['plannedReturnReservationIds']);
    const reservationId = `shipment-${shipment.id}-planned-return`;
    const reservation = canReusePlanned ? {ok: true, reservationId: plannedIds[0]} : window.HFNetwork?.reservePathCapacity?.(path, {
      startAbsMinute: returnDepartureAbsMinute,
      endAbsMinute: returnArrivalAbsMinute,
      units: requiredCount,
      reservationId,
      vehicleType: shipment.vehicleType,
      vehicleSpeed: vehicleSpec(shipment.vehicleType).speed,
      vehicleIds: shipment.vehicleIds,
      tripId: reservationId,
    });
    if (reservation?.ok === false) return false;

    shipment.returnDepartureAbsMinute = returnDepartureAbsMinute;
    shipment.returnArrivalAbsMinute = returnArrivalAbsMinute;
    shipment.returnFromCityId = destinationCityId;
    shipment.returnToCityId = targetCityId;
    shipment.returnGeometry = pathRouteGeometry(path);
    shipment.returnPathNodeIds = Array.isArray(path.nodes) ? path.nodes.map(normalizeId).filter(Boolean) : [];
    shipment.returnPathEdgeIds = Array.isArray(path.edges) ? path.edges.map(pathEdgeId).filter(Boolean) : [];
    shipment.returnReservationId = reservation?.reservationId || reservationId;
    shipment.returnReservationIds = canReusePlanned ? plannedIds : [shipment.returnReservationId];
    delete shipment.plannedReturnReservationIds;
    shipment.status = 'returning';
    window.HFFleet?.updateAssignment?.(shipment.id, {
      status: 'returning',
      currentCityId: destinationCityId,
      availableAbsMinute: returnArrivalAbsMinute,
      routeSegment: {fromCityId: destinationCityId, toCityId: targetCityId},
    });
    return true;
  }

  function completeShipmentAtDestination(shipment, destinationCityId, arrivalAbsMinute) {
    releaseShipmentReservations(shipment, ['reservationId']);
    if (beginRequiredDailyReturn(shipment, destinationCityId, arrivalAbsMinute)) return;
    releaseShipmentReservations(shipment, ['plannedReturnReservationIds']);
    shipment.status = shipment.undeliveredKg > 0 ? (shipment.deliveredKg > 0 ? 'partial' : 'failed') : 'delivered';
    window.HFFleet?.releaseAssignment?.(shipment.id, destinationCityId, arrivalAbsMinute);
  }

  function syncAssignedVehicles(shipment, nowAbsMinute) {
    if (!Array.isArray(shipment.vehicleIds) || !shipment.vehicleIds.length) return;
    if (shipment.status === 'returning') {
      const returnFromCityId = shipment.returnFromCityId || shipment.toCityId;
      window.HFFleet?.updateAssignment?.(shipment.id, {
        status: 'returning',
        currentCityId: returnFromCityId,
        availableAbsMinute: shipment.returnArrivalAbsMinute,
        routeSegment: {fromCityId: returnFromCityId, toCityId: shipment.returnToCityId || shipment.postDeliveryTargetCityId || shipment.fromCityId},
      });
      return;
    }
    if (shipment.status !== 'active') return;
    let currentCityId = shipment.fromCityId;
    let nextCityId = shipment.toCityId;
    if (Array.isArray(shipment.stops)) {
      for (const stop of shipment.stops) {
        if (Number(stop.arrivalAbsMinute) <= nowAbsMinute) currentCityId = stop.toCityId;
        else {
          nextCityId = stop.toCityId;
          break;
        }
      }
    }
    window.HFFleet?.updateAssignment?.(shipment.id, {
      status: 'assigned',
      currentCityId,
      routeSegment: {fromCityId: currentCityId, toCityId: nextCityId},
    });
  }

  function finishReturnIfDue(shipment, nowAbsMinute) {
    const returnArrivalAbsMinute = Number(shipment.returnArrivalAbsMinute);
    if (shipment.status !== 'returning' || !Number.isFinite(returnArrivalAbsMinute) || returnArrivalAbsMinute > nowAbsMinute) return false;
    shipment.status = 'returned';
    shipment.returnedAbsMinute = returnArrivalAbsMinute;
    releaseShipmentReservations(shipment, ['returnReservationId', 'returnReservationIds']);
    window.HFFleet?.releaseAssignment?.(shipment.id, shipment.returnToCityId || shipment.postDeliveryTargetCityId || shipment.fromCityId, returnArrivalAbsMinute);
    return true;
  }

  function markStopDelivered(stop, nowAbsMinute) {
    const amountKg = Math.max(0, Number(stop.amountKg) || 0);
    // Inventory and transport form one logical update. Suppress the goods event so
    // observers cannot inspect (or normalize) logistics halfway through it.
    const result = window.HFV2Goods?.addToInventory?.(stop.toCityId, stop.goodId, amountKg, {notify: false});
    const deliveredKg = Math.max(0, Math.min(amountKg, Number(result?.addedKg) || 0));
    const addedKg = Math.round(deliveredKg * 1000) / 1000;
    const undeliveredKg = Math.max(0, Math.round((amountKg - addedKg) * 1000) / 1000);
    const status = addedKg >= amountKg ? 'delivered' : (addedKg > 0 ? 'partial' : 'failed');
    return {addedKg, deliveredKg: addedKg, undeliveredKg, deliveredAbsMinute: nowAbsMinute, status};
  }

  function applyStopDelivery(stop, delivery, nowAbsMinute) {
    Object.assign(stop, delivery);
    if (delivery.status === 'failed') window.HFV2FleetDispatch?.invalidate?.('shipment-failed', nowAbsMinute);
  }

  function refreshShipmentDeliveryTotals(shipment) {
    const stops = Array.isArray(shipment.stops) && shipment.stops.length ? shipment.stops : [];
    const deliveredKg = stops.reduce((total, stop) => total + Math.max(0, Number(stop.deliveredKg) || 0), 0);
    shipment.deliveredKg = Math.round(deliveredKg * 1000) / 1000;
    shipment.undeliveredKg = Math.max(0, Math.round((Number(shipment.amountKg) - shipment.deliveredKg) * 1000) / 1000);
  }

  function advanceShipments() {
    configure();
    const nowAbsMinute = absoluteMinute(currentTime());
    const completed = advanceAssignments(nowAbsMinute);
    for (const shipment of state.shipments) {
      syncAssignedVehicles(shipment, nowAbsMinute);
      if (shipment.status === 'active') {
        if (Array.isArray(shipment.stops) && shipment.stops.length) {
          let processedStop = false;
          for (const stop of shipment.stops) {
            const stopStatus = ['delivered', 'failed', 'partial'].includes(stop.status) ? stop.status : 'pending';
            const arrivalAbsMinute = Number.isFinite(Number(stop.arrivalAbsMinute)) ? Number(stop.arrivalAbsMinute) : Number(shipment.arrivalAbsMinute);
            if (stopStatus === 'pending' && Number.isFinite(arrivalAbsMinute) && arrivalAbsMinute <= nowAbsMinute) {
              stop.status = 'processing';
              const stopIndex = shipment.stops.indexOf(stop);
              const delivery = markStopDelivered(stop, nowAbsMinute);
              const currentShipment = state.shipments.find(candidate => candidate.id === shipment.id);
              const currentStop = currentShipment?.stops?.[stopIndex];
              if (currentStop) applyStopDelivery(currentStop, delivery, nowAbsMinute);
              processedStop = true;
            }
          }
          if (processedStop) refreshShipmentDeliveryTotals(shipment);
          const finalStop = shipment.stops[shipment.stops.length - 1];
          const finalArrivalAbsMinute = Number.isFinite(Number(finalStop?.arrivalAbsMinute)) ? Number(finalStop.arrivalAbsMinute) : Number(shipment.arrivalAbsMinute);
          const allStopsProcessed = shipment.stops.every(stop => ['delivered', 'failed', 'partial'].includes(stop.status));
          if (allStopsProcessed && Number.isFinite(finalArrivalAbsMinute) && finalArrivalAbsMinute <= nowAbsMinute) {
            shipment.deliveredAbsMinute = nowAbsMinute;
            completeShipmentAtDestination(shipment, finalStop.toCityId, finalArrivalAbsMinute);
            completed.push(shipment);
          } else if (processedStop) {
            completed.push(shipment);
          }
          continue;
        }

        if (shipment.arrivalAbsMinute <= nowAbsMinute) {
          const stop = {toCityId: shipment.toCityId, goodId: shipment.goodId, amountKg: shipment.amountKg, orderId: shipment.orderId};
          shipment.status = 'delivering';
          const delivery = markStopDelivered(stop, nowAbsMinute);
          const currentShipment = state.shipments.find(candidate => candidate.id === shipment.id);
          if (!currentShipment) continue;
          currentShipment.addedKg = delivery.addedKg;
          currentShipment.deliveredKg = delivery.deliveredKg;
          currentShipment.undeliveredKg = delivery.undeliveredKg;
          currentShipment.deliveredAbsMinute = delivery.deliveredAbsMinute;
          if (delivery.status === 'failed') window.HFV2FleetDispatch?.invalidate?.('shipment-failed', nowAbsMinute);
          completeShipmentAtDestination(currentShipment, currentShipment.toCityId, Number(currentShipment.arrivalAbsMinute));
          completed.push(currentShipment);
          continue;
        }
      }

      if (finishReturnIfDue(shipment, nowAbsMinute)) {
        completed.push(shipment);
      }
    }
    if (completed.length) window.HFV2Save?.dispatchStateChanged?.('logistics-shipments-advanced');
    return completed;
  }

  window.HFV2Logistics = {createLogisticsState, configure, getState, createOrder, cancelOrder, setOrderEnabled, tick, advanceShipments, createRepositioningAssignment, absoluteMinute, orderDueToday, nextOrderDueAbsMinute, getOutgoingProductionDemandMap, vehicleCapacityKg, capacityCheck, requiredVehicleCount, splitIntoVehicleLoads, cargoMetrics, packagingAlternatives, selectPackagingStrategy, plannedOrderAmountKg, validateRoadShipment, findOrderSchedule, buildMultiStopRoute};
})();
