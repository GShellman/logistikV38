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
    const status = ['active', 'delivered', 'failed', 'partial'].includes(shipment.status) ? shipment.status : 'active';
    const createdAtAbsMinute = Number.isFinite(Number(shipment.createdAtAbsMinute)) ? Number(shipment.createdAtAbsMinute) : departureAbsMinute;
    const pathNodeIds = Array.isArray(shipment.pathNodeIds) ? shipment.pathNodeIds.map(normalizeId).filter(Boolean) : [];
    const pathEdgeIds = Array.isArray(shipment.pathEdgeIds) ? shipment.pathEdgeIds.map(normalizeId).filter(Boolean) : [];
    const geometry = Array.isArray(shipment.geometry) ? shipment.geometry : (Array.isArray(shipment.routeGeometry) ? shipment.routeGeometry : []);
    return {...shipment, id, orderId, fromCityId, toCityId, goodId, amountKg, vehicleCount, pathNodeIds, pathEdgeIds, geometry, routeGeometry: geometry, departureAbsMinute, arrivalAbsMinute, status, createdAtAbsMinute};
  }

  function configure(options = {}) {
    state = options.state || state || createLogisticsState();
    state.orders = Array.isArray(state.orders) ? state.orders.map(normalizeOrder).filter(Boolean) : [];
    state.shipments = Array.isArray(state.shipments) ? state.shipments.map(normalizeShipment).filter(Boolean) : [];
    state.nextOrderId = Math.max(positiveInteger(state.nextOrderId), ...state.orders.map(order => order.id + 1), 1);
    state.nextShipmentId = Math.max(positiveInteger(state.nextShipmentId), ...state.shipments.map(shipment => shipment.id + 1), 1);
    state.schemaVersion = positiveInteger(state.schemaVersion, 1);
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

  function tick() {
    configure();
    const time = currentTime();
    const nowAbsMinute = absoluteMinute(time);
    window.HFNetwork?.cleanupCapacityReservations?.(nowAbsMinute - MINUTES_PER_DAY);
    const created = [];
    for (const order of state.orders) {
      if (!orderDueToday(order, time)) continue;
      const vehicleType = order.vehicleType || DEFAULT_VEHICLE_TYPE;
      const departureAbsMinute = nowAbsMinute;
      const validation = validateRoadShipment({fromCityId: order.fromCityId, toCityId: order.toCityId, vehicleType, amountKg: order.amountKg, departureAbsMinute});
      if (!validation.ok) {
        markOrderDispatchResult(order, validation.reason);
        continue;
      }

      const availableKg = sourceStockKg(order.fromCityId, order.goodId);
      if (availableKg < order.amountKg) {
        markOrderDispatchResult(order, 'stock-limited');
        continue;
      }

      const {path, vehicleCount, arrivalAbsMinute} = validation;
      const reservationId = `shipment-${state.nextShipmentId}`;
      const reservation = window.HFNetwork?.reservePathCapacity?.(path, {startAbsMinute: departureAbsMinute, endAbsMinute: arrivalAbsMinute, units: vehicleCount, reservationId});
      if (reservation && reservation.ok === false) {
        markOrderDispatchResult(order, reservation.reason || 'route-overloaded');
        continue;
      }

      const removed = window.HFV2Goods?.removeFromInventory?.(order.fromCityId, order.goodId, order.amountKg);
      if (!removed?.ok || Number(removed.removedKg) !== order.amountKg) {
        if (reservationId) window.HFNetwork?.releaseCapacityReservation?.(reservationId);
        markOrderDispatchResult(order, removed?.reason || 'stock-limited');
        continue;
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
    }
    if (created.length) window.HFV2Save?.dispatchStateChanged?.('logistics-shipments-created');
    return created;
  }

  function advanceShipments() {
    configure();
    const nowAbsMinute = absoluteMinute(currentTime());
    const delivered = [];
    for (const shipment of state.shipments) {
      if (shipment.status !== 'active' || shipment.arrivalAbsMinute > nowAbsMinute) continue;
      const result = window.HFV2Goods?.addToInventory?.(shipment.toCityId, shipment.goodId, shipment.amountKg);
      shipment.deliveredKg = Math.max(0, Number(result?.addedKg) || 0);
      shipment.undeliveredKg = Math.max(0, shipment.amountKg - shipment.deliveredKg);
      shipment.status = 'delivered';
      shipment.deliveredAbsMinute = nowAbsMinute;
      delivered.push(shipment);
    }
    if (delivered.length) window.HFV2Save?.dispatchStateChanged?.('logistics-shipments-delivered');
    return delivered;
  }

  window.HFV2Logistics = {createLogisticsState, configure, getState, createOrder, cancelOrder, setOrderEnabled, tick, advanceShipments, absoluteMinute, orderDueToday, vehicleCapacityKg, splitIntoVehicleLoads, plannedOrderAmountKg, validateRoadShipment};
})();
