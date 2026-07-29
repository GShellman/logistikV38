(() => {
  'use strict';

  const MINUTES_PER_DAY = 1440;
  const DEFAULT_HORIZON_DAYS = 7;
  const DEFAULT_VEHICLE_TYPE = 'fluto-gianco';

  let logisticsState = null;
  let dirtyReason = 'initial-plan';

  function absMinute(time) {
    return (Math.max(1, Math.trunc(Number(time?.day) || 1)) - 1) * MINUTES_PER_DAY
      + Math.max(0, Math.min(23, Math.trunc(Number(time?.hour) || 0))) * 60
      + Math.max(0, Math.min(59, Math.trunc(Number(time?.minute) || 0)));
  }

  function nowAbsMinute() {
    return absMinute(window.HFV2Time?.getState?.() || window.HFV2Save?.getState?.().time);
  }

  function configure(options = {}) {
    logisticsState = options.state || logisticsState || window.HFV2Logistics?.getState?.();
    if (!logisticsState) return null;
    if (!logisticsState.dispatchPlan || typeof logisticsState.dispatchPlan !== 'object') logisticsState.dispatchPlan = null;
    return logisticsState;
  }

  function invalidate(reason = 'inputs-changed', fromAbsMinute = nowAbsMinute()) {
    configure();
    dirtyReason = String(reason || 'inputs-changed');
    if (logisticsState) logisticsState.planInvalidatedFromAbsMinute = Math.max(0, Number(fromAbsMinute) || 0);
    return true;
  }

  function vehicleSpec(type) {
    return window.HFVehicleCatalog?.VEHICLE_CATALOG?.[type] || window.HFFleet?.VEHICLES?.[type] || {};
  }

  function capacityKg(type) {
    const load = Number(vehicleSpec(type).load);
    return load > 0 ? (load < 100 ? load * 1000 : load) : 0;
  }

  function durationMinutes(path, type) {
    const speed = Math.max(1, Number(vehicleSpec(type).speed) || 1);
    return Math.max(1, Math.ceil((Number(path?.distance) || 0) / speed * 60));
  }

  function occurrences(orders, start, end) {
    const result = [];
    const firstDay = Math.floor(start / MINUTES_PER_DAY) + 1;
    const lastDay = Math.floor(end / MINUTES_PER_DAY) + 1;
    for (const order of orders) {
      if (!order?.enabled) continue;
      for (let day = firstDay; day <= lastDay; day += 1) {
        const weekday = Number.isFinite(Number(order.weekday)) ? Math.max(0, Math.min(6, Math.trunc(Number(order.weekday)))) : 0;
        if (order.frequency === 'weekly' && (day - 1) % 7 !== weekday) continue;
        if (order.lastDispatchedDay === day) continue;
        const minuteOfDay = Number.isFinite(Number(order.plannedDepartureAbsMinute))
          ? Math.trunc(Number(order.plannedDepartureAbsMinute)) % MINUTES_PER_DAY
          : Number(order.departureHour) * 60 + Number(order.departureMinute);
        const departureAbsMinute = (day - 1) * MINUTES_PER_DAY + minuteOfDay;
        if (departureAbsMinute < start || departureAbsMinute > end) continue;
        result.push({order, day, departureAbsMinute, priority: departureAbsMinute});
      }
    }
    return result.sort((a, b) => a.priority - b.priority || a.order.id - b.order.id);
  }

  function route(fromCityId, toCityId) {
    return window.HFNetwork?.findPath?.(fromCityId, toCityId, {mode: 'road'}) || null;
  }

  function reservationId(kind, orderId, day, vehicleId) {
    return `fleet-plan-${kind}-${orderId}-${day}-${vehicleId}`;
  }

  function reserve(path, start, end, units, id, commit = true) {
    const status = window.HFNetwork?.pathCapacityStatus?.(path, {startAbsMinute: start, endAbsMinute: end, units, reservationId: id});
    if (status?.ok === false) return false;
    if (!commit) return true;
    const result = window.HFNetwork?.reservePathCapacity?.(path, {startAbsMinute: start, endAbsMinute: end, units, reservationId: id});
    return result?.ok !== false;
  }

  function releaseLeg(leg) {
    for (const id of leg?.capacityReservationIds || []) window.HFNetwork?.releaseCapacityReservation?.(id);
  }

  function candidateFor(vehicle, occurrence, timelines, futureOccurrences) {
    const order = occurrence.order;
    const timeline = timelines.get(vehicle.id);
    if (!timeline || timeline.availableAbsMinute > occurrence.departureAbsMinute) return null;
    let deadheadPath = null;
    let deadheadDuration = 0;
    if (timeline.cityId !== order.fromCityId) {
      deadheadPath = route(timeline.cityId, order.fromCityId);
      if (!deadheadPath?.reachable) return null;
      deadheadDuration = durationMinutes(deadheadPath, vehicle.vehicleType);
      if (timeline.availableAbsMinute + deadheadDuration > occurrence.departureAbsMinute) return null;
    }
    const distance = Math.max(0, Number(deadheadPath?.distance) || 0);
    const kmCost = Math.max(0, Number(vehicleSpec(vehicle.vehicleType).kmCost) || 0);
    const connectionBonus = futureOccurrences.some(next => next.order.fromCityId === order.toCityId && next.order.vehicleType === vehicle.vehicleType) ? 100 : 0;
    return {vehicle, timeline, deadheadPath, deadheadDuration, score: distance * 10 + distance * kmCost - connectionBonus};
  }

  function buildPlan(options = {}) {
    const state = configure(options);
    if (!state) return null;
    const start = Math.max(nowAbsMinute(), Number(options.fromAbsMinute) || 0);
    const horizonDays = Math.max(3, Math.trunc(Number(options.horizonDays) || DEFAULT_HORIZON_DAYS));
    const end = start + horizonDays * MINUTES_PER_DAY;

    const commitReservations = options.reserveCapacity !== false;
    const preservedLegs = (state.dispatchPlan?.legs || []).filter(leg => leg.departureAbsMinute < start || leg.status === 'active' || leg.status === 'completed');
    if (commitReservations) for (const leg of state.dispatchPlan?.legs || []) if (!preservedLegs.includes(leg)) releaseLeg(leg);
    state.assignments = (state.assignments || []).filter(assignment => assignment.status !== 'planned' || assignment.departureAbsMinute < start);

    const vehicles = window.HFFleet?.getState?.().vehicles || [];
    const timelines = new Map(vehicles.map(vehicle => [vehicle.id, {
      cityId: vehicle.activeAssignmentId ? (vehicle.routeSegment?.toCityId || vehicle.currentCityId) : vehicle.currentCityId,
      availableAbsMinute: Math.max(start, Number(vehicle.availableAbsMinute) || 0),
    }]));
    const due = occurrences(state.orders || [], start, end);
    const legs = [...preservedLegs];
    const unplanned = [];
    const plannedStock = new Map();

    for (let occurrenceIndex = 0; occurrenceIndex < due.length; occurrenceIndex += 1) {
      const occurrence = due[occurrenceIndex];
      const order = occurrence.order;
      const type = order.vehicleType || DEFAULT_VEHICLE_TYPE;
      const stockKey = `${order.fromCityId}|${order.goodId}`;
      if (!plannedStock.has(stockKey)) {
        const exportableKg = window.HFV2Goods?.getExportableStockKg?.(order.fromCityId, order.goodId);
        const stockKg = Math.max(0, Number(window.HFV2Goods?.getCityInventory?.(order.fromCityId)?.[order.goodId]) || 0);
        const reserveKg = Math.max(0, Number(window.HFV2Goods?.getCityDailyDemandMap?.(order.fromCityId)?.[order.goodId]) || 0);
        plannedStock.set(stockKey, Number.isFinite(Number(exportableKg)) ? Math.max(0, Number(exportableKg)) : Math.max(0, stockKg - reserveKg));
      }
      const amountKg = Math.min(Math.max(0, Number(order.amountKg) || 0), plannedStock.get(stockKey));
      if (amountKg <= 0) {
        unplanned.push({orderId: order.id, departureAbsMinute: occurrence.departureAbsMinute, reason: 'stock-limited'});
        continue;
      }
      const loadedPath = route(order.fromCityId, order.toCityId);
      const count = Math.ceil(amountKg / capacityKg(type));
      if (!loadedPath?.reachable || !Number.isFinite(count) || count <= 0) {
        unplanned.push({orderId: order.id, departureAbsMinute: occurrence.departureAbsMinute, reason: loadedPath?.reachable ? 'capacity-invalid' : 'no-route'});
        continue;
      }
      const future = due.slice(occurrenceIndex + 1);
      const candidates = vehicles
        .filter(vehicle => vehicle.vehicleType === type)
        .map(vehicle => candidateFor(vehicle, occurrence, timelines, future))
        .filter(Boolean)
        .sort((a, b) => a.score - b.score || a.vehicle.id - b.vehicle.id);
      if (candidates.length < count) {
        unplanned.push({orderId: order.id, departureAbsMinute: occurrence.departureAbsMinute, reason: 'no-on-time-vehicle'});
        continue;
      }

      const selected = candidates.slice(0, count);
      const loadedDuration = durationMinutes(loadedPath, type);
      const loadedEnd = occurrence.departureAbsMinute + loadedDuration;
      const loadedReservation = reservationId('loaded', order.id, occurrence.day, 0);
      if (!reserve(loadedPath, occurrence.departureAbsMinute, loadedEnd, count, loadedReservation, commitReservations)) {
        unplanned.push({orderId: order.id, departureAbsMinute: occurrence.departureAbsMinute, reason: 'route-overloaded'});
        continue;
      }
      const createdDeadheads = [];
      let valid = true;
      for (const candidate of selected) {
        if (!candidate.deadheadPath) continue;
        const departure = occurrence.departureAbsMinute - candidate.deadheadDuration;
        const id = reservationId('empty', order.id, occurrence.day, candidate.vehicle.id);
        if (!reserve(candidate.deadheadPath, departure, occurrence.departureAbsMinute, 1, id, commitReservations)) { valid = false; break; }
        createdDeadheads.push({candidate, departure, id});
      }
      if (!valid) {
        if (commitReservations) window.HFNetwork?.releaseCapacityReservation?.(loadedReservation);
        if (commitReservations) for (const entry of createdDeadheads) window.HFNetwork?.releaseCapacityReservation?.(entry.id);
        unplanned.push({orderId: order.id, departureAbsMinute: occurrence.departureAbsMinute, reason: 'repositioning-overloaded'});
        continue;
      }

      for (const entry of createdDeadheads) {
        const assignmentId = `planned-repositioning-${order.id}-${occurrence.day}-${entry.candidate.vehicle.id}`;
        const assignment = {
          id: assignmentId, type: 'repositioning', reason: 'dispatch-plan', status: 'planned',
          fromCityId: entry.candidate.timeline.cityId, toCityId: order.fromCityId, vehicleType: type,
          vehicleIds: [entry.candidate.vehicle.id], departureAbsMinute: entry.departure,
          arrivalAbsMinute: occurrence.departureAbsMinute, capacityReservationIds: [entry.id],
          route: {pathNodeIds: entry.candidate.deadheadPath.nodes || [], pathEdgeIds: (entry.candidate.deadheadPath.edges || []).map(edge => String(edge.id || '')), distance: Number(entry.candidate.deadheadPath.distance) || 0},
          costs: {distanceKm: Number(entry.candidate.deadheadPath.distance) || 0, perVehicleKm: Number(vehicleSpec(type).kmCost) || 0, vehicleCount: 1, total: Math.round((Number(entry.candidate.deadheadPath.distance) || 0) * (Number(vehicleSpec(type).kmCost) || 0) * 100) / 100, booked: false},
        };
        state.assignments.push(assignment);
        legs.push({...assignment, orderId: order.id});
      }
      const vehicleIds = selected.map(candidate => candidate.vehicle.id);
      const tripId = `trip-${order.id}-${occurrence.day}`;
      legs.push({
        id: `planned-shipment-${order.id}-${occurrence.day}`, type: 'shipment', status: 'planned', orderId: order.id,
        tripId,
        fromCityId: order.fromCityId, toCityId: order.toCityId, vehicleType: type, vehicleIds,
        amountKg,
        departureAbsMinute: occurrence.departureAbsMinute, arrivalAbsMinute: loadedEnd,
        capacityReservationIds: [loadedReservation], priority: occurrence.priority,
      });
      plannedStock.set(stockKey, Math.max(0, plannedStock.get(stockKey) - amountKg));
      // A delivery is not the end of a vehicle movement. Return every vehicle to
      // the dispatching location, so today's plan is a complete, capacity-backed
      // timeline rather than an optimistic list of outbound loads.
      const returnPath = route(order.toCityId, order.fromCityId);
      const returnDuration = returnPath?.reachable ? durationMinutes(returnPath, type) : 0;
      for (const candidate of selected) {
        if (!returnPath?.reachable) {
          timelines.set(candidate.vehicle.id, {cityId: order.toCityId, availableAbsMinute: loadedEnd});
          continue;
        }
        const returnEnd = loadedEnd + returnDuration;
        const returnId = reservationId('return', order.id, occurrence.day, candidate.vehicle.id);
        if (!reserve(returnPath, loadedEnd, returnEnd, 1, returnId, commitReservations)) {
          unplanned.push({orderId: order.id, vehicleId: candidate.vehicle.id, departureAbsMinute: loadedEnd, reason: 'return-overloaded'});
          timelines.set(candidate.vehicle.id, {cityId: order.toCityId, availableAbsMinute: loadedEnd});
          continue;
        }
        legs.push({
          id: `planned-return-${order.id}-${occurrence.day}-${candidate.vehicle.id}`,
          type: 'return', legKind: 'return', status: 'planned', orderId: order.id,
          tripId, outboundLegId: `planned-shipment-${order.id}-${occurrence.day}`,
          fromCityId: order.toCityId, toCityId: order.fromCityId, vehicleType: type,
          vehicleIds: [candidate.vehicle.id], departureAbsMinute: loadedEnd, arrivalAbsMinute: returnEnd,
          capacityReservationIds: commitReservations ? [returnId] : [],
        });
        timelines.set(candidate.vehicle.id, {cityId: order.fromCityId, availableAbsMinute: returnEnd});
      }
    }

    state.dispatchPlan = {version: 1, generatedAtAbsMinute: start, horizonDays, horizonEndAbsMinute: end, reason: dirtyReason, legs, unplanned};
    delete state.planInvalidatedFromAbsMinute;
    dirtyReason = '';
    return state.dispatchPlan;
  }

  function previewOrder(order, options = {}) {
    const live = configure(options);
    if (!live || !order) return null;
    const previewState = {
      ...live,
      orders: [...(live.orders || []), {...order, id: order.id ?? 'preview-order', enabled: true}],
      assignments: [...(live.assignments || [])],
      dispatchPlan: null,
    };
    const plan = buildPlan({...options, state: previewState, reserveCapacity: false});
    configure({state: live});
    return plan;
  }

  function ensurePlan(options = {}) {
    const state = configure(options);
    const now = nowAbsMinute();
    if (!state?.dispatchPlan || state.planInvalidatedFromAbsMinute != null || state.dispatchPlan.horizonEndAbsMinute < now + 3 * MINUTES_PER_DAY) return buildPlan({...options, fromAbsMinute: now});
    return state.dispatchPlan;
  }

  function plannedTrip(orderId, departureAbsMinute) {
    const plan = ensurePlan();
    return plan?.legs?.find(leg => leg.type === 'shipment' && leg.orderId === Number(orderId) && leg.status === 'planned' && Math.abs(leg.departureAbsMinute - Number(departureAbsMinute)) <= 1) || null;
  }

  function consumeTrip(orderId, departureAbsMinute, options = {}) {
    const leg = plannedTrip(orderId, departureAbsMinute);
    if (!leg) return null;
    const capacityReservationIds = [...(leg.capacityReservationIds || [])];
    leg.capacityReservationIds = [];
    leg.status = 'started';
    const vehicleIds = new Set((options.vehicleIds || leg.vehicleIds || []).map(Number));
    const returnLegs = (logisticsState?.dispatchPlan?.legs || []).filter(candidate => candidate.type === 'return'
      && candidate.status === 'planned'
      && (candidate.tripId === leg.tripId || candidate.outboundLegId === leg.id)
      && (!vehicleIds.size || candidate.vehicleIds?.some(id => vehicleIds.has(Number(id)))));
    const plannedReturn = returnLegs.length ? {
      departureAbsMinute: returnLegs[0].departureAbsMinute,
      arrivalAbsMinute: returnLegs[0].arrivalAbsMinute,
      fromCityId: returnLegs[0].fromCityId,
      toCityId: returnLegs[0].toCityId,
      capacityReservationIds: returnLegs.flatMap(candidate => candidate.capacityReservationIds || []),
    } : null;
    for (const returnLeg of returnLegs) {
      returnLeg.capacityReservationIds = [];
      returnLeg.status = 'consumed';
    }
    if (options.transferReservations !== true) {
      for (const id of [...capacityReservationIds, ...(plannedReturn?.capacityReservationIds || [])]) window.HFNetwork?.releaseCapacityReservation?.(id);
      return leg;
    }
    return {...leg, capacityReservationIds, plannedReturn};
  }

  function canBundleOrders(orders, routeArrivalAbsMinute) {
    const ids = new Set((orders || []).map(order => order.id));
    const vehicleIds = new Set();
    for (const order of orders || []) for (const id of plannedTrip(order.id, routeArrivalAbsMinute)?.vehicleIds || []) vehicleIds.add(id);
    return !(logisticsState?.dispatchPlan?.legs || []).some(leg => leg.type === 'shipment' && leg.status === 'planned' && !ids.has(leg.orderId)
      && leg.departureAbsMinute < Number(routeArrivalAbsMinute) && leg.vehicleIds?.some(id => vehicleIds.has(id)));
  }

  window.HFV2FleetDispatch = {DEFAULT_HORIZON_DAYS, configure, invalidate, ensurePlan, buildPlan, previewOrder, plannedTrip, consumeTrip, canBundleOrders};
})();
