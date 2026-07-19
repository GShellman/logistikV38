(() => {
  'use strict';

  const KG_PER_TONNE = 1000;
  const SCHEDULE_HORIZON_DAYS = 14;
  const DEFAULT_DEPARTURE_MINUTE = 8 * 60;
  const STATUS = Object.freeze({PLANNED: 'planned', COMPLETED: 'completed', PARTIAL: 'partial', BLOCKED: 'blocked', FAILED: 'failed'});

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
    return (state.deliveries || []).filter(delivery => {
      if (delivery.status !== STATUS.PLANNED || delivery.vehicleType !== vehicleType) return false;
      const otherStart = absoluteMinute(delivery.scheduledDay ?? delivery.deliveryDay, delivery.scheduledMinute ?? delivery.deliveryMinute);
      const otherEnd = otherStart + Math.max(1, normalizeInteger(delivery.roundTripMinutes, delivery.durationMinutes, 1));
      return start < otherEnd && otherStart < end;
    }).length;
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
    }).filter(Boolean).filter(candidate => candidate.available > 0);
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
      scheduledDay: day,
      scheduledMinute: minute,
      deliveryDay: day,
      deliveryMinute: minute,
      vehicleType: '',
      tripIndex: 1,
      status: STATUS.PLANNED,
    };
    if (!sourceCityId) { getState().unresolved.push({orderId: order.id, day, goodId: order.goodId, amount: requestedQuantityKg, reason: 'Keine Lieferquelle gefunden.'}); return statusMessage(Object.assign(delivery, {status: STATUS.BLOCKED}), 'Keine Lieferquelle gefunden.'); }
    const sourceInventory = window.HFV2Goods?.getCityInventory?.(sourceCityId) || {};
    const availableKg = Math.max(0, Number(sourceInventory[order.goodId]) || 0);
    if (availableKg <= 0) { getState().unresolved.push({orderId: order.id, day, goodId: order.goodId, amount: requestedQuantityKg, reason: 'Keine Ware in der Quelle verfügbar.'}); return statusMessage(Object.assign(delivery, {status: STATUS.BLOCKED}), 'Keine Ware in der Quelle verfügbar.'); }
    if (quantityKg > availableKg) quantityKg = availableKg;
    delivery.quantityKg = quantityKg;
    const chosen = chooseVehicle(sourceCityId, order.destinationCityId, quantityKg, day, minute);
    if (!chosen) { getState().unresolved.push({orderId: order.id, day, goodId: order.goodId, amount: quantityKg, reason: 'Keine freie Fahrzeugkapazität oder kompatible Netzwerkroute gefunden.'}); return statusMessage(Object.assign(delivery, {status: STATUS.BLOCKED}), 'Keine freie Fahrzeugkapazität oder kompatible Netzwerkroute gefunden.'); }
    Object.assign(delivery, {
      vehicleType: chosen.vehicleType,
      vehicleCapacityKg: chosen.capacityKg,
      tripCount: chosen.trips,
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

  function generatePlannedDeliveries(fromTime, toTime, options = {}) {
    const state = ordersState();
    state.deliveries = Array.isArray(state.deliveries) ? state.deliveries : [];
    const fromAbs = timeAbsoluteMinute(fromTime);
    const toAbs = timeAbsoluteMinute(toTime) + SCHEDULE_HORIZON_DAYS * 1440;
    const includeBoundaryMinute = options?.includeBoundaryMinute === true;
    const fromDay = Math.max(1, Math.floor(fromAbs / 1440) + 1);
    const toDay = Math.max(fromDay, Math.floor(toAbs / 1440) + 1);
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
    if (created) dispatch('transport-scheduled');
    return created;
  }

  function completeDelivery(delivery) {
    if (!delivery.sourceCityId) return Object.assign(delivery, {status: STATUS.BLOCKED}, statusMessage(delivery, 'Keine Quelle hinterlegt.'));
    const plannedKg = normalizeNonNegative(delivery.quantityKg);
    const requestedKg = Math.max(plannedKg, normalizeNonNegative(delivery.requestedQuantityKg));
    const removal = window.HFV2Goods?.removeFromInventory?.(delivery.sourceCityId, delivery.goodId, plannedKg);
    const removedKg = normalizeNonNegative(removal?.removedKg ?? removal);
    if (removedKg <= 0) { bumpOpenQuantity(delivery, requestedKg); return Object.assign(delivery, {status: STATUS.BLOCKED}, statusMessage(delivery, 'Keine Ware in der Quelle verfügbar.')); }
    const addition = window.HFV2Goods?.addToInventory?.(delivery.destinationCityId, delivery.goodId, removedKg);
    const addedKg = normalizeNonNegative(addition?.addedKg ?? addition ?? removedKg);
    if (addedKg + 0.001 < removedKg) statusMessage(delivery, `Ziellager begrenzt: ${Math.round(addedKg)} von ${Math.round(removedKg)} kg eingelagert.`);
    const bookedCost = Math.round(normalizeNonNegative(delivery.transportCost) * (removedKg / Math.max(1, plannedKg)));
    if (bookedCost > 0) window.HFV2Save?.changeCash?.(-bookedCost, 'goods-delivery');
    delivery.deliveredKg = normalizeNonNegative(delivery.deliveredKg) + addedKg;
    delivery.bookedCost = normalizeNonNegative(delivery.bookedCost) + bookedCost;
    const remainderKg = Math.max(0, requestedKg - addedKg);
    if (remainderKg > 0.001) bumpOpenQuantity(delivery, remainderKg);
    delivery.status = addedKg + 0.001 < requestedKg ? STATUS.PARTIAL : STATUS.COMPLETED;
    return statusMessage(delivery, delivery.status === STATUS.PARTIAL ? `Teillieferung: ${Math.round(addedKg)} von ${Math.round(requestedKg)} kg geliefert.` : `Geliefert: ${Math.round(addedKg)} kg.`);
  }

  function bumpOpenQuantity(delivery, amountKg) {
    const order = (ordersState().orders || []).find(item => item.id === delivery.orderId);
    if (order) order.openQuantity = normalizeNonNegative(order.openQuantity) + normalizeNonNegative(amountKg);
  }

  function processDueDeliveries(timeBefore, timeAfter) {
    const state = ordersState();
    const existingDeliveryIds = new Set((state.deliveries || []).map(delivery => delivery?.id).filter(Boolean));
    generatePlannedDeliveries(timeBefore, timeAfter, {includeBoundaryMinute: true});
    const beforeAbs = timeAbsoluteMinute(timeBefore);
    const afterAbs = timeAbsoluteMinute(timeAfter);
    let processed = 0;
    for (const delivery of state.deliveries || []) {
      if (delivery.status !== STATUS.PLANNED) continue;
      const dueAbs = absoluteMinute(delivery.scheduledDay ?? delivery.deliveryDay, delivery.scheduledMinute ?? delivery.deliveryMinute);
      // Tick window semantics: deliveries generated during this tick use [beforeAbs, afterAbs],
      // while deliveries that already existed before generation use (beforeAbs, afterAbs].
      // This lets a just-created 08:00 delivery run in the 08:00→09:00 tick without
      // re-running an older delivery that was already considered at exactly 08:00.
      const wasGeneratedThisTick = delivery.id && !existingDeliveryIds.has(delivery.id);
      if (dueAbs > afterAbs || dueAbs < beforeAbs || (dueAbs === beforeAbs && !wasGeneratedThisTick)) continue;
      completeDelivery(delivery);
      processed += 1;
    }
    if (processed) dispatch('transport-processed');
    return {processed, deliveries: state.deliveries};
  }

  window.HFV2Transport = {STATUS, createTransportState, configure, getState, normalizeVehicleCapacityKg, generatePlannedDeliveries, processDueDeliveries, completeDelivery, chooseVehicle, scheduledDatesForOrder};
})();
