(() => {
  'use strict';

  const KG_PER_TONNE = 1000;
  const SCHEDULE_HORIZON_DAYS = 14;
  const DEFAULT_DEPARTURE_MINUTE = 8 * 60;
  const STATUS = Object.freeze({PLANNED: 'planned', RUNNING: 'running', COMPLETED: 'completed', PARTIAL: 'partial', BLOCKED: 'blocked', FAILED: 'failed'});

  let transportState = null;

  function createTransportState(overrides = {}) {
    const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
    return {weekPlan: Array.isArray(source.weekPlan) ? source.weekPlan.filter(Boolean) : [], unresolved: Array.isArray(source.unresolved) ? source.unresolved.filter(Boolean) : [], sourceDepartures: source.sourceDepartures && typeof source.sourceDepartures === 'object' ? {...source.sourceDepartures} : {}, schemaVersion: Number.isFinite(Number(source.schemaVersion)) ? Number(source.schemaVersion) : 1};
  }

  function configure(options = {}) {
    transportState = createTransportState(options.state || transportState || {});
    return transportState;
  }

  function getState() {
    return configure();
  }

  function ordersState() {
    return window.HFV2Orders?.getState?.() || window.HFV2Save?.getState?.().orders || {orders: [], deliveries: [], nextDeliveryId: 1};
  }

  function normalizeInteger(value, fallback, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const integer = Math.trunc(numeric);
    return integer >= min && integer <= max ? integer : fallback;
  }

  function normalizeNonNegative(value) {
    return Math.max(0, Number(value) || 0);
  }

  function absoluteMinute(day, minute) {
    return (Math.max(1, normalizeInteger(day, 1, 1)) - 1) * 1440 + normalizeInteger(minute, 0, 0, 1439);
  }

  function timeAbsoluteMinute(time) {
    const current = time || window.HFV2Time?.getState?.() || window.HFV2Save?.getState?.().time || {day: 1, hour: 8, minute: 0};
    return absoluteMinute(current.day, (normalizeInteger(current.hour, 0, 0, 23) * 60) + normalizeInteger(current.minute, 0, 0, 59));
  }

  function minuteToDayMinute(absMinute) {
    const normalized = Math.max(0, normalizeInteger(absMinute, 0, 0));
    return {day: Math.floor(normalized / 1440) + 1, minute: normalized % 1440};
  }

  function createDeliveryId(state) {
    const next = Math.max(1, normalizeInteger(state.nextDeliveryId, 1, 1));
    state.nextDeliveryId = next + 1;
    return `delivery-${next}`;
  }

  function statusMessage(delivery, message) {
    delivery.message = message;
    delivery.statusMessage = message;
    delivery.updatedAtMinute = timeAbsoluteMinute();
    return delivery;
  }

  function unresolvedMatchesDelivery(entry, delivery) {
    if (!entry || !delivery) return false;
    const entryOrderId = String(entry.orderId || '').trim();
    const deliveryOrderId = String(delivery.orderId || '').trim();
    const entryDay = normalizeInteger(entry.day, 0, 0);
    const deliveryDay = normalizeInteger(delivery.scheduledDay ?? delivery.deliveryDay, 0, 0);
    const entryGoodId = String(entry.goodId || '').trim();
    const deliveryGoodId = String(delivery.goodId || '').trim();
    return (entry.deliveryId && entry.deliveryId === delivery.id) || (entryOrderId === deliveryOrderId && entryDay === deliveryDay && entryGoodId === deliveryGoodId);
  }

  function clearUnresolvedForDelivery(delivery) {
    const state = getState();
    state.unresolved = (state.unresolved || []).filter(entry => !unresolvedMatchesDelivery(entry, delivery));
  }

  function markUnresolved(delivery, reason, amountKg) {
    const state = getState();
    state.unresolved = Array.isArray(state.unresolved) ? state.unresolved : [];
    const entry = {
      deliveryId: delivery.id,
      orderId: delivery.orderId,
      day: delivery.scheduledDay ?? delivery.deliveryDay,
      goodId: delivery.goodId,
      amount: normalizeNonNegative(amountKg),
      reason,
      status: 'open',
      updatedAtMinute: timeAbsoluteMinute(),
    };
    const index = state.unresolved.findIndex(item => unresolvedMatchesDelivery(item, delivery));
    if (index >= 0) state.unresolved[index] = {...state.unresolved[index], ...entry};
    else state.unresolved.push(entry);
    return entry;
  }

  function dispatch(reason) {
    window.HFV2Save?.dispatchStateChanged?.(reason || 'transport-updated');
  }

  function vehicleCatalog() {
    return window.HFVehicleCatalog?.VEHICLE_CATALOG || window.HFFleet?.VEHICLES || {};
  }

  function normalizeVehicleCapacityKg(vehicle) {
    const rawLoad = Number(vehicle?.load);
    if (!Number.isFinite(rawLoad) || rawLoad <= 0) return 0;
    // Catalog policy: loads up to 100 are tonnes (e.g. van=2 => 2 t), larger loads are already kg (tipper=16000).
    return rawLoad <= 100 ? Math.round(rawLoad * KG_PER_TONNE) : Math.round(rawLoad);
  }

  function pathForVehicle(sourceCityId, destinationCityId, vehicleType) {
    const vehicle = vehicleCatalog()[vehicleType];
    const mode = vehicle?.mode || null;
    if (sourceCityId === destinationCityId) return {reachable: true, nodes: [sourceCityId], edges: [], distance: 0, duration: 0};
    return window.HFNetwork?.findPath?.(sourceCityId, destinationCityId, mode ? {mode} : {}) || null;
  }

  function routeMinutes(path, vehicle) {
    const distance = normalizeNonNegative(path?.distance);
    const networkHours = normalizeNonNegative(path?.duration);
    const byVehicleHours = distance > 0 ? distance / Math.max(1, Number(vehicle?.speed) || 1) : 0;
    return Math.max(1, Math.ceil(Math.max(networkHours, byVehicleHours) * 60));
  }

  function roundTripMinutes(path, vehicle) {
    return routeMinutes(path, vehicle) * 2;
  }

  function transportCost(path, vehicle, quantityKg) {
    const distance = normalizeNonNegative(path?.distance);
    const kmCost = Math.max(0, Number(vehicle?.kmCost) || 0);
    const handlingCost = Math.ceil(normalizeNonNegative(quantityKg) / 1000) * 2;
    return Math.round((distance * kmCost) + handlingCost);
  }

  function deliveryTripCount(delivery) {
    return Math.max(1, Math.ceil(normalizeNonNegative(delivery.quantityKg) / Math.max(1, normalizeNonNegative(delivery.vehicleCapacityKg))));
  }

  function vehicleBusyCount(vehicleType, scheduledAbsMinute, durationMinutes) {
    const state = ordersState();
    const start = scheduledAbsMinute;
    const end = start + Math.max(1, normalizeInteger(durationMinutes, 1, 1));
    return (state.deliveries || []).reduce((busyCount, delivery) => {
      if (![STATUS.PLANNED, STATUS.RUNNING].includes(delivery.status) || delivery.vehicleType !== vehicleType) return busyCount;
      const otherStart = absoluteMinute(delivery.departureDay ?? delivery.scheduledDay ?? delivery.deliveryDay, delivery.departureMinute ?? delivery.scheduledMinute ?? delivery.deliveryMinute);
      const fallbackEnd = otherStart + Math.max(1, normalizeInteger(delivery.roundTripMinutes, delivery.durationMinutes, 1));
      const otherEnd = delivery.vehicleFreeDay
        ? absoluteMinute(delivery.vehicleFreeDay, delivery.vehicleFreeMinute)
        : fallbackEnd;
      if (!(start < otherEnd && otherStart < end)) return busyCount;
      return busyCount + Math.max(1, Number(delivery.tripCount) || 1);
    }, 0);
  }

  function chooseVehicle(sourceCityId, destinationCityId, quantityKg, scheduledDay, scheduledMinute) {
    const fleet = window.HFFleet?.getCityFleet?.(sourceCityId) || {};
    const catalog = vehicleCatalog();
    const candidates = Object.keys(fleet).map(vehicleType => {
      const owned = Math.max(0, Math.floor(Number(fleet[vehicleType]) || 0));
      const vehicle = catalog[vehicleType];
      const capacityKg = normalizeVehicleCapacityKg(vehicle);
      const path = owned > 0 && capacityKg > 0 ? pathForVehicle(sourceCityId, destinationCityId, vehicleType) : null;
      if (!owned || !vehicle || !capacityKg || path?.reachable !== true) return null;
      const trips = Math.max(1, Math.ceil(normalizeNonNegative(quantityKg) / capacityKg));
      const duration = roundTripMinutes(path, vehicle);
      const busy = vehicleBusyCount(vehicleType, absoluteMinute(scheduledDay, scheduledMinute), duration);
      return {vehicleType, vehicle, owned, capacityKg, path, trips, duration, available: Math.max(0, owned - busy)};
    }).filter(Boolean).filter(candidate => candidate.available >= candidate.trips);
    candidates.sort((a, b) => a.trips - b.trips || b.capacityKg - a.capacityKg || transportCost(a.path, a.vehicle, quantityKg) - transportCost(b.path, b.vehicle, quantityKg));
    return candidates[0] || null;
  }

  function sourceCityIdForOrder(order) {
    const explicit = String(order.sourceCityId || (order.sourceType === 'city' ? order.sourceId : '') || '').trim();
    if (explicit) return explicit;
    const primary = order.primarySource?.type === 'city' ? String(order.primarySource.id || '').trim() : '';
    if (primary) return primary;
    return window.HFV2Orders?.sourceCandidates?.(order.destinationCityId, order.goodId)?.find(candidate => candidate.transportReady)?.sourceCityId || '';
  }

  function hasScheduledDelivery(orderId, scheduledDay, scheduledMinute) {
    const targetOrderId = String(orderId || '').trim();
    const targetDay = normalizeInteger(scheduledDay, 0, 0);
    const targetMinute = normalizeInteger(scheduledMinute, -1, 0, 1439);
    if (!targetOrderId || !targetDay || targetMinute < 0) return false;
    return (ordersState().deliveries || []).some(delivery => {
      const deliveryOrderId = String(delivery.orderId || '').trim();
      const deliveryDay = normalizeInteger(delivery.scheduledDay ?? delivery.deliveryDay, 0, 0);
      const deliveryMinute = normalizeInteger(delivery.scheduledMinute ?? delivery.deliveryMinute, -1, 0, 1439);
      return deliveryOrderId === targetOrderId && deliveryDay === targetDay && deliveryMinute === targetMinute && delivery.status !== 'cancelled';
    });
  }

  function deliveryQuantityForOrder(order) {
    const daily = normalizeNonNegative(order.dailyDemandKg || order.quantityKg);
    return order.frequency === 'weekly' ? daily * 7 : normalizeNonNegative(order.quantityKg || daily);
  }

  function scheduledDatesForOrder(order, fromDay, toDay) {
    const startDay = Math.max(1, normalizeInteger(order.deliveryDay, 1, 1));
    const minute = normalizeInteger(order.deliveryMinute ?? order.scheduledMinute, DEFAULT_DEPARTURE_MINUTE, 0, 1439);
    const out = [];
    if (order.frequency === 'once') {
      if (startDay >= fromDay && startDay <= toDay) out.push({day: startDay, minute});
      return out;
    }
    if (order.frequency === 'weekly') {
      const weekday = normalizeInteger(order.deliveryWeekday ?? order.weekday ?? ((startDay - 1) % 7), (startDay - 1) % 7, 0, 6);
      for (let day = Math.max(fromDay, startDay); day <= toDay; day += 1) if ((day - 1) % 7 === weekday) out.push({day, minute});
      return out;
    }
    for (let day = Math.max(fromDay, startDay); day <= toDay; day += 1) out.push({day, minute});
    return out;
  }

  function createPlannedDelivery(order, day, minute) {
    const state = ordersState();
    const sourceCityId = sourceCityIdForOrder(order);
    const requestedQuantityKg = window.HFV2Orders?.contractRequired?.(order, day, false) || deliveryQuantityForOrder(order);
    let quantityKg = requestedQuantityKg;
    const delivery = {
      id: createDeliveryId(state),
      orderId: order.id,
      sourceType: 'city',
      sourceId: sourceCityId,
      sourceCityId,
      destinationCityId: order.destinationCityId,
      goodId: order.goodId,
      requestedQuantityKg,
      quantityKg,
      plannedQuantityKg: quantityKg,
      // scheduledDay/scheduledMinute use departure semantics. deliveryDay/deliveryMinute
      // remain populated as legacy departure aliases for older saved games/UI consumers.
      scheduledDay: day,
      scheduledMinute: minute,
      deliveryDay: day,
      deliveryMinute: minute,
      departureDay: day,
      departureMinute: minute,
      vehicleType: '',
      tripIndex: 1,
      status: STATUS.PLANNED,
    };
    if (!sourceCityId) { markUnresolved(delivery, 'Keine Lieferquelle gefunden.', requestedQuantityKg); return statusMessage(Object.assign(delivery, {status: STATUS.BLOCKED}), 'Keine Lieferquelle gefunden.'); }
    const sourceInventory = window.HFV2Goods?.getCityInventory?.(sourceCityId) || {};
    const availableKg = Math.max(0, Number(sourceInventory[order.goodId]) || 0);
    if (availableKg <= 0) { markUnresolved(delivery, 'Keine Ware in der Quelle verfügbar.', requestedQuantityKg); return statusMessage(Object.assign(delivery, {status: STATUS.BLOCKED}), 'Keine Ware in der Quelle verfügbar.'); }
    if (quantityKg > availableKg) quantityKg = availableKg;
    delivery.quantityKg = quantityKg;
    delivery.plannedQuantityKg = quantityKg;
    const chosen = chooseVehicle(sourceCityId, order.destinationCityId, quantityKg, day, minute);
    if (!chosen) { markUnresolved(delivery, 'Keine freie Fahrzeugkapazität oder kompatible Netzwerkroute gefunden.', quantityKg); return statusMessage(Object.assign(delivery, {status: STATUS.BLOCKED}), 'Keine freie Fahrzeugkapazität oder kompatible Netzwerkroute gefunden.'); }
    Object.assign(delivery, {
      vehicleType: chosen.vehicleType,
      vehicleCapacityKg: chosen.capacityKg,
      tripCount: chosen.trips,
      routeMinutes: Math.max(1, Math.ceil(chosen.duration / 2)),
      roundTripMinutes: chosen.duration,
      distanceKm: chosen.path.distance,
      transportCost: transportCost(chosen.path, chosen.vehicle, quantityKg),
      status: STATUS.PLANNED,
    });
    if (quantityKg + 0.001 < requestedQuantityKg) return statusMessage(delivery, chosen.trips > 1 ? `Teillieferung wegen Exporteur-Lagerbestand geplant: ${Math.round(quantityKg)} von ${Math.round(requestedQuantityKg)} kg in ${chosen.trips} Fahrten.` : `Teillieferung wegen Exporteur-Lagerbestand geplant: ${Math.round(quantityKg)} von ${Math.round(requestedQuantityKg)} kg.`);
    return statusMessage(delivery, chosen.trips > 1 ? `In ${chosen.trips} Fahrten geplant.` : 'Lieferung geplant.');
  }

  function nextSchedulableSlot(order, slot, boundaryAbs, includeBoundary) {
    let day = normalizeInteger(slot?.day, 1, 1);
    let minute = normalizeInteger(slot?.minute, DEFAULT_DEPARTURE_MINUTE, 0, 1439);
    const slotAbs = absoluteMinute(day, minute);
    const isDue = includeBoundary ? slotAbs < boundaryAbs : slotAbs <= boundaryAbs;
    if (!isDue) return {day, minute};
    if (order?.frequency === 'weekly') return {day: day + (Math.floor((boundaryAbs - slotAbs) / (7 * 1440)) + 1) * 7, minute};
    if (order?.frequency && order.frequency !== 'once') return {day: day + (Math.floor((boundaryAbs - slotAbs) / 1440) + 1), minute};
    const nextAbs = boundaryAbs + 1;
    return {day: Math.floor(nextAbs / 1440) + 1, minute: nextAbs % 1440};
  }

  function retryBlockedDeliveries(currentTime, options = {}) {
    const state = ordersState();
    state.deliveries = Array.isArray(state.deliveries) ? state.deliveries : [];
    const activeOrders = new Map((state.orders || []).filter(order => order?.status === 'active').map(order => [order.id, order]));
    const currentAbs = timeAbsoluteMinute(currentTime);
    let redispatched = 0;
    for (const delivery of state.deliveries) {
      if (!delivery || delivery.status !== STATUS.BLOCKED) continue;
      const order = activeOrders.get(delivery.orderId);
      if (!order) continue;
      const requestedQuantityKg = window.HFV2Orders?.contractRequired?.(order, delivery.scheduledDay ?? delivery.deliveryDay, false) || normalizeNonNegative(delivery.requestedQuantityKg || delivery.quantityKg || deliveryQuantityForOrder(order));
      const sourceCityId = sourceCityIdForOrder(order);
      if (!sourceCityId) { markUnresolved(delivery, 'Keine Lieferquelle gefunden.', requestedQuantityKg); statusMessage(delivery, 'Weiterhin blockiert: Keine Lieferquelle gefunden.'); continue; }
      const sourceInventory = window.HFV2Goods?.getCityInventory?.(sourceCityId) || {};
      const availableKg = Math.max(0, Number(sourceInventory[order.goodId]) || 0);
      if (availableKg <= 0) { markUnresolved(delivery, 'Keine Ware in der Quelle verfügbar.', requestedQuantityKg); statusMessage(delivery, 'Weiterhin blockiert: Keine Ware in der Quelle verfügbar.'); continue; }
      const quantityKg = Math.min(requestedQuantityKg, availableKg);
      const originalScheduledAbs = absoluteMinute(delivery.scheduledDay ?? delivery.deliveryDay, delivery.scheduledMinute ?? delivery.deliveryMinute);
      const windowStartAbs = Number.isFinite(Number(options?.windowStartAbs)) ? Number(options.windowStartAbs) : null;
      const windowEndAbs = Number.isFinite(Number(options?.windowEndAbs)) ? Number(options.windowEndAbs) : null;
      const redispatchLowerBound = windowStartAbs !== null && windowEndAbs !== null && originalScheduledAbs <= windowEndAbs
        ? windowStartAbs
        : currentAbs;
      const scheduledAbs = Math.max(redispatchLowerBound, originalScheduledAbs);
      const slot = minuteToDayMinute(scheduledAbs);
      const chosen = chooseVehicle(sourceCityId, order.destinationCityId, quantityKg, slot.day, slot.minute);
      if (!chosen) { markUnresolved(delivery, 'Keine freie Fahrzeugkapazität oder kompatible Netzwerkroute gefunden.', quantityKg); statusMessage(delivery, 'Weiterhin blockiert: Keine freie Fahrzeugkapazität oder kompatible Netzwerkroute gefunden.'); continue; }
      Object.assign(delivery, {
        sourceType: 'city',
        sourceId: sourceCityId,
        sourceCityId,
        destinationCityId: order.destinationCityId,
        goodId: order.goodId,
        requestedQuantityKg,
        quantityKg,
        plannedQuantityKg: quantityKg,
        // scheduledDay/scheduledMinute use departure semantics. deliveryDay/deliveryMinute
        // remain populated as legacy departure aliases for older saved games/UI consumers.
        scheduledDay: slot.day,
        scheduledMinute: slot.minute,
        deliveryDay: slot.day,
        deliveryMinute: slot.minute,
        departureDay: slot.day,
        departureMinute: slot.minute,
        vehicleType: chosen.vehicleType,
        vehicleCapacityKg: chosen.capacityKg,
        tripCount: chosen.trips,
        routeMinutes: Math.max(1, Math.ceil(chosen.duration / 2)),
        roundTripMinutes: chosen.duration,
        distanceKm: chosen.path.distance,
        transportCost: transportCost(chosen.path, chosen.vehicle, quantityKg),
        status: STATUS.PLANNED,
      });
      delete delivery.departedKg;
      delete delivery.openQuantityBumpedKg;
      clearUnresolvedForDelivery(delivery);
      if (typeof options?.onRedispatched === 'function') options.onRedispatched(delivery);
      statusMessage(delivery, quantityKg + 0.001 < requestedQuantityKg ? `Redispatch als Teillieferung geplant: ${Math.round(quantityKg)} von ${Math.round(requestedQuantityKg)} kg.` : 'Redispatch geplant.');
      redispatched += 1;
    }
    return redispatched;
  }

  function generatePlannedDeliveries(fromTime, toTime, options = {}) {
    const state = ordersState();
    state.deliveries = Array.isArray(state.deliveries) ? state.deliveries : [];
    const fromAbs = timeAbsoluteMinute(fromTime);
    const toAbs = timeAbsoluteMinute(toTime) + SCHEDULE_HORIZON_DAYS * 1440;
    const includeBoundaryMinute = options?.includeBoundaryMinute === true;
    const fromDay = Math.max(1, Math.floor(fromAbs / 1440) + 1);
    const toDay = Math.max(fromDay, Math.floor(toAbs / 1440) + 1);
    const redispatched = options?.skipBlockedRetry === true ? 0 : retryBlockedDeliveries(fromTime);
    let created = 0;
    for (const order of state.orders || []) {
      if (!order || order.status !== 'active') continue;
      for (const rawSlot of scheduledDatesForOrder(order, fromDay, toDay)) {
        const slot = nextSchedulableSlot(order, rawSlot, fromAbs, includeBoundaryMinute);
        if (absoluteMinute(slot.day, slot.minute) > toAbs) continue;
        if (hasScheduledDelivery(order.id, slot.day, slot.minute)) continue;
        state.deliveries.push(createPlannedDelivery(order, slot.day, slot.minute));
        created += 1;
      }
    }
    getState().weekPlan = (state.deliveries || []).filter(delivery => delivery.status === STATUS.PLANNED && normalizeInteger(delivery.scheduledDay ?? delivery.deliveryDay, 0) >= fromDay && normalizeInteger(delivery.scheduledDay ?? delivery.deliveryDay, 0) <= toDay).map(delivery => ({id: delivery.id, orderId: delivery.orderId, sourceCityId: delivery.sourceCityId, destinationCityId: delivery.destinationCityId, goodId: delivery.goodId, quantityKg: delivery.quantityKg, day: delivery.scheduledDay ?? delivery.deliveryDay, minute: delivery.scheduledMinute ?? delivery.deliveryMinute, vehicleType: delivery.vehicleType, tripCount: delivery.tripCount || 1, status: delivery.status}));
    if (created || redispatched) dispatch(created ? 'transport-scheduled' : 'transport-redispatched');
    return created + redispatched;
  }

  function setDeliveryTiming(delivery, departureAbs) {
    const routeDuration = Math.max(1, normalizeInteger(delivery.routeMinutes, Math.ceil(normalizeInteger(delivery.roundTripMinutes, 2, 1) / 2), 1));
    const roundTripDuration = Math.max(routeDuration, normalizeInteger(delivery.roundTripMinutes, routeDuration * 2, routeDuration));
    const arrival = minuteToDayMinute(departureAbs + routeDuration);
    const vehicleFree = minuteToDayMinute(departureAbs + roundTripDuration);
    Object.assign(delivery, {
      routeMinutes: routeDuration,
      roundTripMinutes: roundTripDuration,
      departureDay: Math.floor(departureAbs / 1440) + 1,
      departureMinute: departureAbs % 1440,
      arrivalDay: arrival.day,
      arrivalMinute: arrival.minute,
      vehicleFreeDay: vehicleFree.day,
      vehicleFreeMinute: vehicleFree.minute,
      vehicleFreeAtMinute: departureAbs + roundTripDuration,
    });
  }

  function departDelivery(delivery) {
    if (!delivery.sourceCityId) return Object.assign(delivery, {status: STATUS.BLOCKED}, statusMessage(delivery, 'Keine Quelle hinterlegt.'));
    const plannedKg = normalizeNonNegative(delivery.quantityKg);
    const requestedKg = Math.max(plannedKg, normalizeNonNegative(delivery.requestedQuantityKg));
    const removal = window.HFV2Goods?.removeFromInventory?.(delivery.sourceCityId, delivery.goodId, plannedKg);
    const removedKg = normalizeNonNegative(removal?.removedKg ?? removal);
    if (removedKg <= 0) { bumpOpenQuantity(delivery, requestedKg); return Object.assign(delivery, {status: STATUS.BLOCKED}, statusMessage(delivery, 'Keine Ware in der Quelle verfügbar.')); }
    if (removedKg + 0.001 < plannedKg) {
      delivery.openQuantityBumpedKg = Math.max(0, requestedKg - removedKg);
      bumpOpenQuantity(delivery, delivery.openQuantityBumpedKg);
    }
    delivery.quantityKg = removedKg;
    delivery.departedKg = removedKg;
    const departureAbs = absoluteMinute(delivery.scheduledDay ?? delivery.deliveryDay, delivery.scheduledMinute ?? delivery.deliveryMinute);
    setDeliveryTiming(delivery, departureAbs);
    delivery.status = STATUS.RUNNING;
    return statusMessage(delivery, `Abgefahren: ${Math.round(removedKg)} kg, Ankunft Tag ${delivery.arrivalDay} um ${String(Math.floor(delivery.arrivalMinute / 60)).padStart(2, '0')}:${String(delivery.arrivalMinute % 60).padStart(2, '0')}.`);
  }

  function completeDelivery(delivery) {
    const transportedKg = normalizeNonNegative(delivery.departedKg || delivery.quantityKg);
    const requestedKg = Math.max(transportedKg, normalizeNonNegative(delivery.requestedQuantityKg));
    if (transportedKg <= 0) return Object.assign(delivery, {status: STATUS.BLOCKED}, statusMessage(delivery, 'Keine Ware im Transport.'));
    const addition = window.HFV2Goods?.addToInventory?.(delivery.destinationCityId, delivery.goodId, transportedKg);
    const addedKg = normalizeNonNegative(addition?.addedKg ?? addition ?? transportedKg);
    if (addedKg + 0.001 < transportedKg) statusMessage(delivery, `Ziellager begrenzt: ${Math.round(addedKg)} von ${Math.round(transportedKg)} kg eingelagert.`);
    const plannedKg = Math.max(1, normalizeNonNegative(delivery.plannedQuantityKg || delivery.requestedQuantityKg || transportedKg));
    const bookedCost = Math.round(normalizeNonNegative(delivery.transportCost) * (transportedKg / plannedKg));
    if (bookedCost > 0 && !delivery.costBooked) window.HFV2Save?.changeCash?.(-bookedCost, 'goods-delivery');
    delivery.costBooked = true;
    delivery.deliveredKg = normalizeNonNegative(delivery.deliveredKg) + addedKg;
    delivery.bookedCost = normalizeNonNegative(delivery.bookedCost) + bookedCost;
    const remainderKg = Math.max(0, requestedKg - addedKg);
    const unbumpedRemainderKg = Math.max(0, remainderKg - normalizeNonNegative(delivery.openQuantityBumpedKg));
    if (unbumpedRemainderKg > 0.001) bumpOpenQuantity(delivery, unbumpedRemainderKg);
    delivery.status = addedKg + 0.001 < requestedKg ? STATUS.PARTIAL : STATUS.COMPLETED;
    return statusMessage(delivery, delivery.status === STATUS.PARTIAL ? `Angekommen als Teillieferung: ${Math.round(addedKg)} von ${Math.round(requestedKg)} kg geliefert.` : `Angekommen: ${Math.round(addedKg)} kg geliefert.`);
  }

  function bumpOpenQuantity(delivery, amountKg) {
    const order = (ordersState().orders || []).find(item => item.id === delivery.orderId);
    if (order) order.openQuantity = normalizeNonNegative(order.openQuantity) + normalizeNonNegative(amountKg);
  }

  function isDueInWindow(dueAbs, beforeAbs, afterAbs, includeBefore) {
    return dueAbs <= afterAbs && (includeBefore ? dueAbs >= beforeAbs : dueAbs > beforeAbs);
  }

  function deliveryDepartureAbs(delivery) {
    return absoluteMinute(delivery.scheduledDay ?? delivery.deliveryDay, delivery.scheduledMinute ?? delivery.deliveryMinute);
  }

  function deliveryArrivalAbs(delivery) {
    return delivery.arrivalDay
      ? absoluteMinute(delivery.arrivalDay, delivery.arrivalMinute)
      : deliveryDepartureAbs(delivery) + Math.max(1, normalizeInteger(delivery.routeMinutes, Math.ceil(normalizeInteger(delivery.roundTripMinutes, 2, 1) / 2), 1));
  }

  function processDueDeliveries(timeBefore, timeAfter) {
    const state = ordersState();
    state.deliveries = Array.isArray(state.deliveries) ? state.deliveries : [];
    const beforeAbs = timeAbsoluteMinute(timeBefore);
    const afterAbs = timeAbsoluteMinute(timeAfter);
    const existingDeliveryIds = new Set(state.deliveries.map(delivery => delivery?.id).filter(Boolean));
    const redispatchedDeliveryIds = new Set();
    generatePlannedDeliveries(timeBefore, timeAfter, {includeBoundaryMinute: true, skipBlockedRetry: true});
    retryBlockedDeliveries(timeAfter, {
      windowStartAbs: beforeAbs,
      windowEndAbs: afterAbs,
      onRedispatched: delivery => { if (delivery?.id) redispatchedDeliveryIds.add(delivery.id); },
    });
    let deliveries = state.deliveries || [];
    let processed = 0;
    while (true) {
      const event = deliveries.map(delivery => {
        if (!delivery) return null;
        if (delivery.status === STATUS.RUNNING) {
          const dueAbs = deliveryArrivalAbs(delivery);
          return isDueInWindow(dueAbs, beforeAbs, afterAbs, false) ? {delivery, dueAbs, type: 'arrival'} : null;
        }
        if (delivery.status === STATUS.PLANNED) {
          const dueAbs = deliveryDepartureAbs(delivery);
          // Tick window semantics: deliveries generated or redispatched during this tick use
          // [beforeAbs, afterAbs], while deliveries that already existed use (beforeAbs, afterAbs].
          const includeBefore = (delivery.id && !existingDeliveryIds.has(delivery.id)) || redispatchedDeliveryIds.has(delivery.id);
          return isDueInWindow(dueAbs, beforeAbs, afterAbs, includeBefore) ? {delivery, dueAbs, type: 'departure'} : null;
        }
        return null;
      }).filter(Boolean).sort((a, b) => a.dueAbs - b.dueAbs || (a.type === b.type ? 0 : (a.type === 'arrival' ? -1 : 1)) || String(a.delivery.id || '').localeCompare(String(b.delivery.id || '')))[0];
      if (!event) break;
      if (event.type === 'arrival') completeDelivery(event.delivery);
      else departDelivery(event.delivery);
      processed += 1;
      deliveries = state.deliveries || [];
    }
    if (processed) dispatch('transport-processed');
    return {processed, deliveries: state.deliveries};
  }

  window.addEventListener?.('hf:v2:state-changed', event => {
    const reason = String(event?.detail?.reason || '');
    if (['network-build', 'network', 'fleet-buy', 'goods-production', 'goods-daily-production', 'goods-inventory-added'].includes(reason)) {
      const redispatched = retryBlockedDeliveries();
      if (redispatched) dispatch('transport-redispatched');
    }
  });

  window.HFV2Transport = {STATUS, createTransportState, configure, getState, normalizeVehicleCapacityKg, generatePlannedDeliveries, retryBlockedDeliveries, processDueDeliveries, completeDelivery, chooseVehicle, scheduledDatesForOrder};
})();
