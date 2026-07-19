(() => {
  'use strict';

  const FREQUENCIES = new Set(['daily', 'weekly']);
  const DEFAULT_VEHICLE_TYPE = 'van';

  const MINUTES_PER_DAY = 1440;

  let state = null;
  let cities = [];
  let citiesById = {};

  function createLogisticsState(overrides = {}) {
    return {
      orders: [],
      shipments: [],
      nextOrderId: 1,
      nextShipmentId: 1,
      schemaVersion: 1,
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

  function normalizeOrder(order) {
    if (!order || typeof order !== 'object') return null;
    const id = positiveInteger(order.id, null);
    const fromCityId = normalizeId(order.fromCityId);
    const toCityId = normalizeId(order.toCityId);
    const goodId = normalizeId(order.goodId);
    const frequency = String(order.frequency || '').trim();
    const departureHour = normalizeHour(order.departureHour);
    const departureMinute = normalizeMinute(order.departureMinute);
    const amountKg = Math.max(0, Number(order.amountKg) || 0);
    if (!id || !fromCityId || !toCityId || !goodId || !FREQUENCIES.has(frequency) || departureHour === null || departureMinute === null || amountKg <= 0) return null;
    return {
      ...order,
      id,
      fromCityId,
      toCityId,
      goodId,
      frequency,
      departureHour,
      departureMinute,
      vehicleType: normalizeId(order.vehicleType) || null,
      amountKg,
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
    const vehicleCount = positiveInteger(shipment.vehicleCount, 1);
    const status = ['active', 'returning', 'returned', 'delivered', 'failed', 'partial'].includes(shipment.status) ? shipment.status : 'active';
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
      const status = ['pending', 'delivered', 'failed', 'partial'].includes(stop?.status) ? stop.status : (deliveredKg > 0 ? (deliveredKg >= amountKg ? 'delivered' : 'partial') : 'pending');
      const stopArrivalAbsMinute = Number(stop?.arrivalAbsMinute);
      return {
        ...stop,
        toCityId: normalizeId(stop?.toCityId),
        goodId: normalizeId(stop?.goodId),
        amountKg,
        orderId: positiveInteger(stop?.orderId, null),
        arrivalAbsMinute: Number.isFinite(stopArrivalAbsMinute) ? stopArrivalAbsMinute : null,
        status,
        deliveredKg,
        undeliveredKg,
      };
    }).filter(stop => stop.toCityId && stop.goodId && stop.amountKg > 0 && stop.orderId) : null;
    return {...shipment, id, orderId, fromCityId, toCityId, goodId, amountKg, vehicleCount, pathNodeIds, pathEdgeIds, geometry, routeGeometry: geometry, returnGeometry, departureAbsMinute, arrivalAbsMinute, returnDepartureAbsMinute, returnArrivalAbsMinute, status, createdAtAbsMinute, ...(stops ? {stops} : {})};
  }

  function configure(options = {}) {
    state = options.state || state || createLogisticsState();
    state.orders = Array.isArray(state.orders) ? state.orders.map(normalizeOrder).filter(Boolean) : [];
    state.shipments = Array.isArray(state.shipments) ? state.shipments.map(normalizeShipment).filter(Boolean) : [];
    state.nextOrderId = Math.max(positiveInteger(state.nextOrderId), ...state.orders.map(order => order.id + 1), 1);
    state.nextShipmentId = Math.max(positiveInteger(state.nextShipmentId), ...state.shipments.map(shipment => shipment.id + 1), 1);
    state.schemaVersion = positiveInteger(state.schemaVersion, 1);
    state.bundleWindowMinutes = Math.max(0, Math.trunc(Number(state.bundleWindowMinutes) || 60));
    cities = Array.isArray(options.cities) ? options.cities : cities;
    citiesById = options.citiesById && typeof options.citiesById === 'object' ? options.citiesById : Object.fromEntries(cities.map(city => [String(city.id), city]));
    return state;
  }

  function getState() {
    return configure();
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
    if (order.frequency === 'weekly' && ((currentDay - 1) % 7) !== 0) return false;
    const currentDayMinute = Math.max(0, Math.trunc(Number(time?.hour) || 0) * 60 + Math.trunc(Number(time?.minute) || 0));
    return currentDayMinute >= order.departureHour * 60 + order.departureMinute;
  }

  function vehicleSpec(vehicleType) {
    return window.HFFleet?.VEHICLES?.[vehicleType] || window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicleType] || null;
  }

  function vehicleCapacityKg(vehicleType) {
    const load = Number(vehicleSpec(vehicleType)?.load);
    if (!Number.isFinite(load) || load <= 0) return 0;
    return load < 100 ? load * 1000 : load;
  }

  function splitIntoVehicleLoads(amountKg, capacityKg) {
    const amount = Math.max(0, Number(amountKg) || 0);
    const capacity = Math.max(0, Number(capacityKg) || 0);
    if (amount <= 0 || capacity <= 0) return [];
    const loads = [];
    let remaining = amount;
    while (remaining > 0) {
      const loadKg = Math.min(capacity, remaining);
      loads.push(Math.round(loadKg * 1000) / 1000);
      remaining = Math.round((remaining - loadKg) * 1000) / 1000;
    }
    return loads;
  }


  function nextOrderDueAbsMinute(order, time = currentTime()) {
    if (!order?.enabled) return null;
    const currentDay = Math.max(1, Math.trunc(Number(time?.day) || 1));
    const departureDayMinute = order.departureHour * 60 + order.departureMinute;
    const currentDayMinute = Math.max(0, Math.trunc(Number(time?.hour) || 0) * 60 + Math.trunc(Number(time?.minute) || 0));

    if (order.frequency === 'daily') {
      let dueDay = currentDay;
      if (order.lastDispatchedDay === currentDay || currentDayMinute >= departureDayMinute) dueDay += 1;
      return (dueDay - 1) * MINUTES_PER_DAY + departureDayMinute;
    }

    if (order.frequency === 'weekly') {
      let dueDay = currentDay + ((7 - ((currentDay - 1) % 7)) % 7);
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
    const fleet = window.HFFleet?.getCityFleet?.(cityId) || {};
    const vehicle = window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicleType] || null;
    if (!vehicle || vehicle.mode !== 'road' || (Number(fleet[vehicleType]) || 0) <= 0) throw new Error('Selected road vehicle type is not available in the source city fleet');
  }

  function validateRoadShipment({fromCityId, toCityId, vehicleType, amountKg, departureAbsMinute}) {
    const path = window.HFNetwork?.findPath?.(fromCityId, toCityId, {mode: 'road'});
    if (!path?.reachable) return {ok: false, reason: 'no-route'};

    const fleet = window.HFFleet?.getCityFleet?.(fromCityId) || {};
    const vehicle = window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicleType] || null;
    if (!vehicle || vehicle.mode !== 'road' || (Number(fleet[vehicleType]) || 0) <= 0) return {ok: false, reason: 'no-vehicle'};

    const load = Number(vehicle.load);
    const capacityKg = Number.isFinite(load) && load > 0 ? (load >= 100 ? load : load * 1000) : 0;
    if (capacityKg <= 0) return {ok: false, reason: 'capacity-invalid'};

    const vehicleCount = Math.ceil(Math.max(0, Number(amountKg) || 0) / capacityKg);
    if (vehicleCount <= 0) return {ok: false, reason: 'capacity-invalid'};
    if (vehicleCount > (Number(fleet[vehicleType]) || 0)) return {ok: false, reason: 'not-enough-vehicles', path, capacityKg, vehicleCount};

    const startAbsMinute = Number(departureAbsMinute);
    const endAbsMinute = startAbsMinute + Math.ceil((Number(path.duration) || 0) * 60);
    const capacityStatus = window.HFNetwork?.pathCapacityStatus?.(path, {startAbsMinute, endAbsMinute, units: vehicleCount});
    if (capacityStatus && capacityStatus.ok === false) return {ok: false, reason: capacityStatus.reason || 'route-overloaded', path, capacityKg, vehicleCount, arrivalAbsMinute: endAbsMinute, capacityStatus};

    return {ok: true, path, capacityKg, vehicleCount, departureAbsMinute: startAbsMinute, arrivalAbsMinute: endAbsMinute};
  }

  function createOrder(options = {}) {
    configure();
    const fromCityId = normalizeId(options.fromCityId);
    const toCityId = normalizeId(options.toCityId);
    const goodId = normalizeId(options.goodId);
    const frequency = String(options.frequency || '').trim();
    const departureHour = normalizeHour(options.departureHour);
    const departureMinute = normalizeMinute(options.departureMinute);
    const vehicleType = normalizeId(options.vehicleType) || null;
    if (!fromCityId || !toCityId || !goodId || departureHour === null || departureMinute === null) throw new Error('Missing or invalid order fields');
    if (fromCityId === toCityId) throw new Error('Source and target city must be different');
    if (citiesById[fromCityId] === undefined && window.HFV2CitiesById?.[fromCityId] === undefined) throw new Error('Unknown source city');
    if (citiesById[toCityId] === undefined && window.HFV2CitiesById?.[toCityId] === undefined) throw new Error('Unknown target city');
    const amountKg = plannedOrderAmountKg(toCityId, goodId, frequency);
    if (amountKg <= 0) {
      const error = new Error('no-demand');
      error.reason = 'no-demand';
      throw error;
    }
    validateRoute(fromCityId, toCityId);
    assertFleetVehicle(fromCityId, vehicleType);
    const order = {id: state.nextOrderId++, fromCityId, toCityId, goodId, frequency, departureHour, departureMinute, vehicleType, amountKg, enabled: true, lastDispatchedDay: null};
    state.orders.push(order);
    window.HFV2Save?.dispatchStateChanged?.('logistics-order-created');
    return order;
  }

  function cancelOrder(orderId) {
    configure();
    const id = positiveInteger(orderId, null);
    const before = state.orders.length;
    state.orders = state.orders.filter(order => order.id !== id);
    const removed = before !== state.orders.length;
    if (removed) window.HFV2Save?.dispatchStateChanged?.('logistics-order-cancelled');
    return removed;
  }

  function setOrderEnabled(orderId, enabled) {
    configure();
    const order = state.orders.find(entry => entry.id === positiveInteger(orderId, null));
    if (!order) return null;
    order.enabled = enabled === true;
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
    for (let index = 0; index < route.segments.length; index += 1) {
      const segment = route.segments[index];
      const endAbsMinute = cursorAbsMinute + segment.durationMinutes;
      const reservationId = `${options.reservationId}-segment-${index + 1}`;
      const capacityStatus = window.HFNetwork?.pathCapacityStatus?.(segment.path, {startAbsMinute: cursorAbsMinute, endAbsMinute, units: options.units});
      if (capacityStatus && capacityStatus.ok === false) {
        for (const id of reservationIds) window.HFNetwork?.releaseCapacityReservation?.(id);
        return {ok: false, reason: capacityStatus.reason || 'route-overloaded'};
      }
      const reservation = window.HFNetwork?.reservePathCapacity?.(segment.path, {startAbsMinute: cursorAbsMinute, endAbsMinute, units: options.units, reservationId});
      if (reservation && reservation.ok === false) {
        for (const id of reservationIds) window.HFNetwork?.releaseCapacityReservation?.(id);
        return {ok: false, reason: reservation.reason || 'route-overloaded'};
      }
      reservationIds.push(reservation?.reservationId || reservationId);
      cursorAbsMinute = endAbsMinute;
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

  function createSingleShipment(order, time, nowAbsMinute, created) {
    const vehicleType = order.vehicleType || DEFAULT_VEHICLE_TYPE;
    const departureAbsMinute = nowAbsMinute;
    const validation = validateRoadShipment({fromCityId: order.fromCityId, toCityId: order.toCityId, vehicleType, amountKg: order.amountKg, departureAbsMinute});
    if (!validation.ok) {
      markOrderDispatchResult(order, validation.reason);
      return null;
    }

    const availableKg = sourceStockKg(order.fromCityId, order.goodId);
    if (availableKg < order.amountKg) {
      markOrderDispatchResult(order, 'stock-limited');
      return null;
    }

    const {path, vehicleCount, arrivalAbsMinute} = validation;
    const reservationId = `shipment-${state.nextShipmentId}`;
    const reservation = window.HFNetwork?.reservePathCapacity?.(path, {startAbsMinute: departureAbsMinute, endAbsMinute: arrivalAbsMinute, units: vehicleCount, reservationId});
    if (reservation && reservation.ok === false) {
      markOrderDispatchResult(order, reservation.reason || 'route-overloaded');
      return null;
    }

    const removed = window.HFV2Goods?.removeFromInventory?.(order.fromCityId, order.goodId, order.amountKg);
    if (!removed?.ok || Number(removed.removedKg) !== order.amountKg) {
      releaseRouteReservations({reservationId});
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
      amountKg: order.amountKg,
      vehicleType,
      vehicleCount,
      pathNodeIds: Array.isArray(path.nodes) ? path.nodes.map(normalizeId).filter(Boolean) : [],
      pathEdgeIds: Array.isArray(path.edges) ? path.edges.map(pathEdgeId).filter(Boolean) : [],
      geometry,
      routeGeometry: geometry,
      departureAbsMinute,
      arrivalAbsMinute,
      reservationId: reservation?.reservationId || reservationId,
      status: 'active',
      createdAtAbsMinute: nowAbsMinute,
    };
    state.shipments.push(shipment);
    created.push(shipment);
    order.lastDispatchedDay = Math.max(1, Math.trunc(Number(time.day) || 1));
    markOrderDispatchResult(order, 'created');
    return shipment;
  }

  function createBundledShipment(orders, time, nowAbsMinute, created) {
    if (orders.length < 2) return false;
    const vehicleType = orders[0].vehicleType || DEFAULT_VEHICLE_TYPE;
    const capacityKg = vehicleCapacityKg(vehicleType);
    const amountKg = Math.round(orders.reduce((total, order) => total + order.amountKg, 0) * 1000) / 1000;
    if (capacityKg <= 0 || amountKg > capacityKg) return false;
    const fleet = window.HFFleet?.getCityFleet?.(orders[0].fromCityId) || {};
    const vehicle = window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicleType] || null;
    if (!vehicle || vehicle.mode !== 'road' || (Number(fleet[vehicleType]) || 0) <= 0) return false;

    const requiredByGood = {};
    for (const order of orders) requiredByGood[order.goodId] = (requiredByGood[order.goodId] || 0) + order.amountKg;
    for (const [goodId, requiredKg] of Object.entries(requiredByGood)) {
      if (sourceStockKg(orders[0].fromCityId, goodId) < requiredKg) return false;
    }

    const stops = orders.map(order => ({toCityId: order.toCityId, goodId: order.goodId, amountKg: order.amountKg, orderId: order.id}));
    const route = combinedRoute(orders[0].fromCityId, stops, vehicleType, {departureAbsMinute: nowAbsMinute});
    if (!route) return false;
    const routeStops = route.stops;
    const reservationId = `shipment-${state.nextShipmentId}`;
    const reservation = reserveRouteCapacity(route, {startAbsMinute: nowAbsMinute, units: 1, reservationId});
    if (!reservation.ok) return false;

    const removedStops = [];
    for (const stop of routeStops) {
      const removed = window.HFV2Goods?.removeFromInventory?.(orders[0].fromCityId, stop.goodId, stop.amountKg);
      if (!removed?.ok || Number(removed.removedKg) !== stop.amountKg) {
        releaseRouteReservations(reservation);
        for (const removedStop of removedStops) window.HFV2Goods?.addToInventory?.(orders[0].fromCityId, removedStop.goodId, removedStop.amountKg);
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
      vehicleType,
      vehicleCount: 1,
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
      createdAtAbsMinute: nowAbsMinute,
    };
    state.shipments.push(shipment);
    created.push(shipment);
    for (const order of orders) {
      order.lastDispatchedDay = Math.max(1, Math.trunc(Number(time.day) || 1));
      markOrderDispatchResult(order, 'created');
    }
    return true;
  }

  function tick() {
    configure();
    const time = currentTime();
    const nowAbsMinute = absoluteMinute(time);
    window.HFNetwork?.cleanupCapacityReservations?.(nowAbsMinute - MINUTES_PER_DAY);
    const created = [];
    const dueOrders = state.orders.filter(order => orderDueToday(order, time));
    const groups = new Map();
    const windowMinutes = bundleWindowMinutes();
    for (const order of dueOrders) {
      const vehicleType = order.vehicleType || DEFAULT_VEHICLE_TYPE;
      const scheduledMinute = order.departureHour * 60 + order.departureMinute;
      const bucket = windowMinutes > 0 ? Math.floor(scheduledMinute / windowMinutes) * windowMinutes : scheduledMinute;
      const key = [order.fromCityId, vehicleType, bucket].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(order);
    }

    const fallbackOrders = [];
    for (const groupOrders of groups.values()) {
      const vehicleType = groupOrders[0].vehicleType || DEFAULT_VEHICLE_TYPE;
      const capacityKg = vehicleCapacityKg(vehicleType);
      const candidates = [];
      for (const order of groupOrders) {
        if (capacityKg > 0 && order.amountKg <= capacityKg) candidates.push(order);
        else fallbackOrders.push(order);
      }
      let bundle = [];
      let bundleKg = 0;
      for (const order of candidates) {
        if (bundle.length && bundleKg + order.amountKg > capacityKg) {
          if (!createBundledShipment(bundle, time, nowAbsMinute, created)) fallbackOrders.push(...bundle);
          bundle = [];
          bundleKg = 0;
        }
        bundle.push(order);
        bundleKg = Math.round((bundleKg + order.amountKg) * 1000) / 1000;
      }
      if (bundle.length >= 2) {
        if (!createBundledShipment(bundle, time, nowAbsMinute, created)) fallbackOrders.push(...bundle);
      } else {
        fallbackOrders.push(...bundle);
      }
    }

    for (const order of fallbackOrders) {
      if (order.lastDispatchedDay === Math.max(1, Math.trunc(Number(time.day) || 1))) continue;
      createSingleShipment(order, time, nowAbsMinute, created);
    }
    if (created.length) window.HFV2Save?.dispatchStateChanged?.('logistics-shipments-created');
    return created;
  }

  function beginReturnTrip(shipment, nowAbsMinute) {
    const outboundDuration = Math.max(1, Math.ceil(Number(shipment.arrivalAbsMinute) - Number(shipment.departureAbsMinute)));
    shipment.returnDepartureAbsMinute = nowAbsMinute;
    shipment.returnArrivalAbsMinute = nowAbsMinute + outboundDuration;
    shipment.returnGeometry = Array.isArray(shipment.routeGeometry) ? [...shipment.routeGeometry].reverse() : [];
    shipment.status = 'returning';
  }

  function markStopDelivered(stop, nowAbsMinute) {
    const amountKg = Math.max(0, Number(stop.amountKg) || 0);
    const result = window.HFV2Goods?.addToInventory?.(stop.toCityId, stop.goodId, amountKg);
    const deliveredKg = Math.max(0, Math.min(amountKg, Number(result?.addedKg) || 0));
    stop.deliveredKg = Math.round(deliveredKg * 1000) / 1000;
    stop.undeliveredKg = Math.max(0, Math.round((amountKg - stop.deliveredKg) * 1000) / 1000);
    stop.deliveredAbsMinute = nowAbsMinute;
    stop.status = stop.deliveredKg >= amountKg ? 'delivered' : (stop.deliveredKg > 0 ? 'partial' : 'failed');
    return stop.deliveredKg;
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
    const completed = [];
    for (const shipment of state.shipments) {
      if (shipment.status === 'active') {
        if (Array.isArray(shipment.stops) && shipment.stops.length) {
          let processedStop = false;
          for (const stop of shipment.stops) {
            const stopStatus = ['delivered', 'failed', 'partial'].includes(stop.status) ? stop.status : 'pending';
            const arrivalAbsMinute = Number.isFinite(Number(stop.arrivalAbsMinute)) ? Number(stop.arrivalAbsMinute) : Number(shipment.arrivalAbsMinute);
            if (stopStatus === 'pending' && Number.isFinite(arrivalAbsMinute) && arrivalAbsMinute <= nowAbsMinute) {
              markStopDelivered(stop, nowAbsMinute);
              processedStop = true;
            }
          }
          if (processedStop) refreshShipmentDeliveryTotals(shipment);
          const finalStop = shipment.stops[shipment.stops.length - 1];
          const finalArrivalAbsMinute = Number.isFinite(Number(finalStop?.arrivalAbsMinute)) ? Number(finalStop.arrivalAbsMinute) : Number(shipment.arrivalAbsMinute);
          const allStopsProcessed = shipment.stops.every(stop => ['delivered', 'failed', 'partial'].includes(stop.status));
          if (allStopsProcessed && Number.isFinite(finalArrivalAbsMinute) && finalArrivalAbsMinute <= nowAbsMinute) {
            shipment.deliveredAbsMinute = nowAbsMinute;
            beginReturnTrip(shipment, nowAbsMinute);
            completed.push(shipment);
          } else if (processedStop) {
            completed.push(shipment);
          }
          continue;
        }

        if (shipment.arrivalAbsMinute <= nowAbsMinute) {
          const stop = {toCityId: shipment.toCityId, goodId: shipment.goodId, amountKg: shipment.amountKg, orderId: shipment.orderId};
          markStopDelivered(stop, nowAbsMinute);
          shipment.deliveredKg = stop.deliveredKg;
          shipment.undeliveredKg = stop.undeliveredKg;
          shipment.deliveredAbsMinute = nowAbsMinute;
          beginReturnTrip(shipment, nowAbsMinute);
          completed.push(shipment);
          continue;
        }
      }

      const returnArrivalAbsMinute = Number(shipment.returnArrivalAbsMinute);
      if (shipment.status === 'returning' && Number.isFinite(returnArrivalAbsMinute) && returnArrivalAbsMinute <= nowAbsMinute) {
        shipment.status = 'returned';
        shipment.returnedAbsMinute = nowAbsMinute;
        completed.push(shipment);
      }
    }
    if (completed.length) window.HFV2Save?.dispatchStateChanged?.('logistics-shipments-advanced');
    return completed;
  }

  window.HFV2Logistics = {createLogisticsState, configure, getState, createOrder, cancelOrder, setOrderEnabled, tick, advanceShipments, absoluteMinute, orderDueToday, nextOrderDueAbsMinute, getOutgoingProductionDemandMap, vehicleCapacityKg, splitIntoVehicleLoads, plannedOrderAmountKg, validateRoadShipment, buildMultiStopRoute};
})();
