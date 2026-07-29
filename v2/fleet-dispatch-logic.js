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

  function postDeliveryDecision(originCityId, destinationCityId) {
    return window.HFV2PostDeliveryPlanning?.decide?.({originCityId, destinationCityId})
      || (originCityId !== destinationCityId ? 'return' : 'stay');
  }

  function reserve(path, start, end, units, id, commit = true, details = {}) {
    const capacityOptions = {startAbsMinute: start, endAbsMinute: end, units, reservationId: id, vehicleSpeed: vehicleSpec(details.vehicleType).speed, ...details};
    const status = window.HFNetwork?.pathCapacityStatus?.(path, capacityOptions);
    if (status?.ok === false) return false;
    if (!commit) return true;
    const result = window.HFNetwork?.reservePathCapacity?.(path, capacityOptions);
    return result?.ok !== false;
  }

  function releaseLeg(leg) {
    for (const id of leg?.capacityReservationIds || []) window.HFNetwork?.releaseCapacityReservation?.(id);
  }

  function edgeId(edge) { return String(edge?.id || `${edge?.a || ''}-${edge?.b || ''}-${edge?.type || ''}`); }

  // Turn the provisional, per-order schedule into the canonical tours used by
  // both execution and the calendar.  Keeping this here is important: capacity
  // is checked and reserved for every stop (and the final disposition) before a
  // tour becomes visible to consumers.
  function canonicalTrips(legs, commitReservations) {
    const shipments = legs.filter(leg => leg.type === 'shipment' && leg.status === 'planned');
    const used = new Set(), trips = [];
    for (const first of shipments) {
      if (used.has(first.id)) continue;
      const cap = capacityKg(first.vehicleType);
      const candidates = shipments.filter(leg => !used.has(leg.id)
        && leg.fromCityId === first.fromCityId && leg.vehicleType === first.vehicleType
        && Math.abs(leg.requestedDepartureAbsMinute - first.requestedDepartureAbsMinute) <= Math.max(0, Number(logisticsState?.bundleWindowMinutes) || 60));
      const group = []; let load = 0;
      for (const leg of candidates.sort((a,b) => a.orderId-b.orderId)) if (!group.length || load + leg.amountKg <= cap) { group.push(leg); load += leg.amountKg; }
      for (const leg of group) used.add(leg.id);
      const day = Math.floor(first.requestedDepartureAbsMinute / MINUTES_PER_DAY) + 1;
      const tripId = `trip-${day}-${group.map(leg => leg.orderId).sort((a,b)=>a-b).join('-')}`;
      const vehicleIds = [...(group[0].vehicleIds || [])];

      // The provisional reservations must not block the replacement route.
      const old = legs.filter(leg => group.some(item => item.tripId === leg.tripId));
      if (commitReservations) for (const leg of old) releaseLeg(leg);
      const pending = group.map(leg => ({leg, cityId: leg.toCityId}));
      const stops = [], segments = []; let cityId = first.fromCityId;
      let cursor = Math.max(...group.map(leg => leg.requestedDepartureAbsMinute)); let failed = false;
      while (pending.length) {
        let bestIndex = -1, bestPath = null;
        for (let i=0;i<pending.length;i++) { const path=route(cityId,pending[i].cityId); if(path?.reachable && (!bestPath || Number(path.distance)<Number(bestPath.distance))) {bestIndex=i;bestPath=path;} }
        if (bestIndex < 0) { failed=true; break; }
        const [{leg}] = pending.splice(bestIndex,1);
        const slot = slotFor(bestPath,cursor,Infinity,vehicleIds.length,first.vehicleType,{tripId});
        if (!slot.ok) { failed=true; break; }
        const reservation = `${tripId}-segment-${segments.length+1}`;
        if (commitReservations && !reserve(bestPath,slot.departureAbsMinute,slot.arrivalAbsMinute,vehicleIds.length,reservation,true,{vehicleType:first.vehicleType,vehicleIds,tripId,edgeTimes:slot.edgeTimes})) {failed=true;break;}
        segments.push({kind:'delivery',fromCityId:cityId,toCityId:leg.toCityId,departureAbsMinute:slot.departureAbsMinute,arrivalAbsMinute:slot.arrivalAbsMinute,edgeTimes:slot.edgeTimes||[],pathNodeIds:bestPath.nodes||[],pathEdgeIds:(bestPath.edges||[]).map(edgeId),geometry:bestPath.geometry||[],distance:Number(bestPath.distance)||0,capacityReservationIds:commitReservations?[reservation]:[]});
        stops.push({orderId:leg.orderId,toCityId:leg.toCityId,goodId:(logisticsState.orders||[]).find(o=>o.id===leg.orderId)?.goodId,amountKg:leg.amountKg,arrivalAbsMinute:slot.arrivalAbsMinute,status:'pending',deliveredKg:0,undeliveredKg:leg.amountKg});
        cursor=slot.arrivalAbsMinute; cityId=leg.toCityId;
      }
      const action=postDeliveryDecision(first.fromCityId,cityId); let disposition={action,targetCityId:cityId,departureAbsMinute:cursor,arrivalAbsMinute:cursor,edgeTimes:[],capacityReservationIds:[]};
      if (!failed && action==='return') {
        const path=route(cityId,first.fromCityId), slot=path?.reachable?slotFor(path,cursor,Infinity,vehicleIds.length,first.vehicleType,{tripId}):{ok:false};
        const reservation=`${tripId}-return`;
        if(!slot.ok || (commitReservations&&!reserve(path,slot.departureAbsMinute,slot.arrivalAbsMinute,vehicleIds.length,reservation,true,{vehicleType:first.vehicleType,vehicleIds,tripId,edgeTimes:slot.edgeTimes}))) failed=true;
        else disposition={action:'return',targetCityId:first.fromCityId,fromCityId:cityId,toCityId:first.fromCityId,departureAbsMinute:slot.departureAbsMinute,arrivalAbsMinute:slot.arrivalAbsMinute,edgeTimes:slot.edgeTimes||[],pathNodeIds:path.nodes||[],pathEdgeIds:(path.edges||[]).map(edgeId),geometry:path.geometry||[],distance:Number(path.distance)||0,capacityReservationIds:commitReservations?[reservation]:[]};
      }
      if (failed) { if(commitReservations) for(const segment of segments) for(const id of segment.capacityReservationIds) window.HFNetwork?.releaseCapacityReservation?.(id); continue; }
      trips.push({id:tripId,status:'planned',vehicleType:first.vehicleType,vehicleIds,fromCityId:first.fromCityId,departureAbsMinute:segments[0].departureAbsMinute,arrivalAbsMinute:cursor,loadKg:load,load:stops.map(({orderId,goodId,amountKg,toCityId})=>({orderId,goodId,amountKg,toCityId})),orderIds:stops.map(stop=>stop.orderId),stops,segments,edgeTimes:segments.flatMap(segment=>segment.edgeTimes),disposition});
    }
    return trips;
  }

  function slotFor(path, earliest, latest, units, type, extra = {}) {
    const finder = window.HFNetwork?.findEarliestPathSlot;
    if (finder) return finder(path, earliest, {latestArrivalAbsMinute: latest, units, vehicleSpeed: vehicleSpec(type).speed, ...extra});
    const duration = durationMinutes(path, type);
    const status = window.HFNetwork?.pathCapacityStatus?.(path, {startAbsMinute: earliest, endAbsMinute: earliest + duration, units, vehicleSpeed: vehicleSpec(type).speed, ...extra});
    return status?.ok === false || earliest + duration > latest ? {ok: false, reason: 'no-feasible-slot', nextPossibleAbsMinute: earliest}
      : {ok: true, departureAbsMinute: earliest, scheduledDepartureAbsMinute: earliest, arrivalAbsMinute: earliest + duration, waitingMinutes: 0, edgeTimes: status?.occupations || []};
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
    state.assignments = (state.assignments || []).filter(item => item.status !== 'planned' || item.departureAbsMinute < start);
    const vehicles = window.HFFleet?.getState?.().vehicles || [];
    const timelines = new Map(vehicles.map(vehicle => [vehicle.id, {cityId: vehicle.activeAssignmentId ? (vehicle.routeSegment?.toCityId || vehicle.currentCityId) : vehicle.currentCityId, availableAbsMinute: Math.max(start, Number(vehicle.availableAbsMinute) || 0)}]));
    const due = occurrences(state.orders || [], start, end), legs = [...preservedLegs], unplanned = [], plannedStock = new Map();
    for (const occurrence of due) {
      const order = occurrence.order, type = order.vehicleType || DEFAULT_VEHICLE_TYPE, stockKey = `${order.fromCityId}|${order.goodId}`;
      if (!plannedStock.has(stockKey)) plannedStock.set(stockKey, Math.max(0, Number(window.HFV2Goods?.getExportableStockKg?.(order.fromCityId, order.goodId)) || 0));
      const amountKg = Math.min(Math.max(0, Number(order.amountKg) || 0), plannedStock.get(stockKey));
      if (!amountKg) { unplanned.push({orderId: order.id, departureAbsMinute: occurrence.departureAbsMinute, reason: 'stock-limited'}); continue; }
      const outboundPath = route(order.fromCityId, order.toCityId), postDeliveryAction = postDeliveryDecision(order.fromCityId, order.toCityId), returnPath = postDeliveryAction === 'return' ? route(order.toCityId, order.fromCityId) : null, count = Math.ceil(amountKg / capacityKg(type));
      if (!outboundPath?.reachable || (postDeliveryAction === 'return' && !returnPath?.reachable) || !Number.isFinite(count) || count <= 0) { unplanned.push({orderId: order.id, departureAbsMinute: occurrence.departureAbsMinute, reason: !outboundPath?.reachable || (postDeliveryAction === 'return' && !returnPath?.reachable) ? 'incomplete-round-trip-route' : 'capacity-invalid'}); continue; }
      const selected = vehicles.filter(v => v.vehicleType === type).map(vehicle => {
        const timeline = timelines.get(vehicle.id), path = timeline.cityId === order.fromCityId ? null : route(timeline.cityId, order.fromCityId);
        return timeline && (!path || path.reachable) ? {vehicle, timeline, deadheadPath: path} : null;
      }).filter(Boolean).sort((x,y) => x.timeline.availableAbsMinute-y.timeline.availableAbsMinute || x.vehicle.id-y.vehicle.id).slice(0,count);
      if (selected.length < count) { unplanned.push({orderId: order.id, departureAbsMinute: occurrence.departureAbsMinute, reason: 'no-vehicle-chain'}); continue; }
      const dayEnd = (Math.floor(occurrence.departureAbsMinute / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY;
      const latest = Math.min(end, Number.isFinite(Number(options.maxDelayMinutes)) ? occurrence.departureAbsMinute + Number(options.maxDelayMinutes) : dayEnd);
      const hardDeparture = order.departureConstraint === 'hard' || order.departureTimeMode === 'hard';
      const chain = [], tempIds = []; let ready = occurrence.departureAbsMinute, failure = null;
      for (const item of selected) {
        if (!item.deadheadPath) continue;
        const slot = slotFor(item.deadheadPath, item.timeline.availableAbsMinute, latest, 1, type);
        if (!slot.ok) { failure = {...slot, reason: 'repositioning-no-slot'}; break; }
        chain.push({kind:'repositioning', item, path:item.deadheadPath, slot}); ready=Math.max(ready,slot.arrivalAbsMinute);
      }
      let outboundSlot = failure ? null : slotFor(outboundPath, hardDeparture ? occurrence.departureAbsMinute : ready, latest, count, type);
      if (outboundSlot?.ok && hardDeparture && Math.abs(outboundSlot.departureAbsMinute-occurrence.departureAbsMinute)>1e-7) failure={...outboundSlot,reason:'hard-departure-unavailable'};
      if (!failure && !outboundSlot?.ok) failure={...outboundSlot,reason:'outbound-no-slot'};
      let returnSlot=null;
      if (!failure && postDeliveryAction === 'return') { returnSlot=slotFor(returnPath,outboundSlot.arrivalAbsMinute,latest,count,type); if(!returnSlot.ok) failure={...returnSlot,reason:'return-no-slot'}; }
      const allMoves = failure ? [] : [...chain, {kind:'shipment', path:outboundPath, slot:outboundSlot, units:count}, ...(returnSlot ? [{kind:'return',path:returnPath,slot:returnSlot,units:count}] : [])];
      if (!failure && commitReservations) for (let i=0;i<allMoves.length;i++) { const move=allMoves[i], id=reservationId(move.kind,order.id,occurrence.day,move.item?.vehicle.id||0); const ok=reserve(move.path,move.slot.departureAbsMinute,move.slot.arrivalAbsMinute,move.units||1,id,true,{vehicleType:type,edgeTimes:move.slot.edgeTimes}); if(!ok){failure={reason:`${move.kind}-reservation-race`,nextPossibleAbsMinute:move.slot.departureAbsMinute};break;} move.id=id;tempIds.push(id); }
      if (failure) { for(const id of tempIds) window.HFNetwork?.releaseCapacityReservation?.(id); unplanned.push({orderId:order.id,departureAbsMinute:occurrence.departureAbsMinute,reason:failure.reason,nextPossibleAbsMinute:failure.nextPossibleAbsMinute??failure.departureAbsMinute??null,latestArrivalAbsMinute:latest}); continue; }
      const tripId=`trip-${order.id}-${occurrence.day}`, shipmentId=`planned-shipment-${order.id}-${occurrence.day}`;
      for(const move of chain){const id=move.id; const leg={id:`planned-repositioning-${order.id}-${occurrence.day}-${move.item.vehicle.id}`,type:'repositioning',status:'planned',orderId:order.id,fromCityId:move.item.timeline.cityId,toCityId:order.fromCityId,vehicleType:type,vehicleIds:[move.item.vehicle.id],departureAbsMinute:move.slot.departureAbsMinute,scheduledDepartureAbsMinute:move.slot.scheduledDepartureAbsMinute,arrivalAbsMinute:move.slot.arrivalAbsMinute,waitingMinutes:move.slot.waitingMinutes,edgeTimes:move.slot.edgeTimes,capacityReservationIds:id?[id]:[]}; legs.push(leg); state.assignments.push(leg);}
      const shipmentMove=allMoves.find(x=>x.kind==='shipment'), returnMove=allMoves.find(x=>x.kind==='return');
      const postDelivery = {action:postDeliveryAction,targetCityId:postDeliveryAction==='return'?order.fromCityId:order.toCityId,departureAbsMinute:returnMove?.slot.departureAbsMinute??outboundSlot.arrivalAbsMinute,arrivalAbsMinute:returnMove?.slot.arrivalAbsMinute??outboundSlot.arrivalAbsMinute,capacityReservationIds:returnMove?.id?[returnMove.id]:[]};
      legs.push({id:shipmentId,type:'shipment',status:'planned',orderId:order.id,tripId,fromCityId:order.fromCityId,toCityId:order.toCityId,vehicleType:type,vehicleIds:selected.map(x=>x.vehicle.id),amountKg,requestedDepartureAbsMinute:occurrence.departureAbsMinute,departureConstraint:hardDeparture?'hard':'earliest',departureAbsMinute:outboundSlot.departureAbsMinute,scheduledDepartureAbsMinute:outboundSlot.scheduledDepartureAbsMinute,arrivalAbsMinute:outboundSlot.arrivalAbsMinute,waitingMinutes:outboundSlot.departureAbsMinute-occurrence.departureAbsMinute+outboundSlot.waitingMinutes,edgeTimes:outboundSlot.edgeTimes,capacityReservationIds:shipmentMove.id?[shipmentMove.id]:[],postDeliveryAction,postDeliveryTargetCityId:postDelivery.targetCityId,postDeliveryDepartureAbsMinute:postDelivery.departureAbsMinute,postDeliveryArrivalAbsMinute:postDelivery.arrivalAbsMinute,postDeliveryReservationIds:postDelivery.capacityReservationIds,priority:occurrence.priority});
      if(returnMove) legs.push({id:`planned-return-${order.id}-${occurrence.day}`,type:'return',legKind:'return',status:'planned',orderId:order.id,tripId,outboundLegId:shipmentId,fromCityId:order.toCityId,toCityId:order.fromCityId,vehicleType:type,vehicleIds:selected.map(x=>x.vehicle.id),departureAbsMinute:returnMove.slot.departureAbsMinute,scheduledDepartureAbsMinute:returnMove.slot.scheduledDepartureAbsMinute,arrivalAbsMinute:returnMove.slot.arrivalAbsMinute,waitingMinutes:returnMove.slot.waitingMinutes,edgeTimes:returnMove.slot.edgeTimes,capacityReservationIds:returnMove.id?[returnMove.id]:[]});
      for(const item of selected) timelines.set(item.vehicle.id,{cityId:postDelivery.targetCityId,availableAbsMinute:postDelivery.arrivalAbsMinute});
      plannedStock.set(stockKey,plannedStock.get(stockKey)-amountKg);
    }
    const trips=canonicalTrips(legs,commitReservations);
    state.dispatchPlan={version:3,generatedAtAbsMinute:start,horizonDays,horizonEndAbsMinute:end,reason:dirtyReason,trips,legs,unplanned}; delete state.planInvalidatedFromAbsMinute; dirtyReason=''; return state.dispatchPlan;
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
    return plan?.trips?.find(trip => trip.status === 'planned' && trip.orderIds?.includes(Number(orderId)) && Math.abs(trip.departureAbsMinute - Number(departureAbsMinute)) <= 1)
      || plan?.legs?.find(leg => leg.type === 'shipment' && leg.orderId === Number(orderId) && leg.status === 'planned' && Math.abs(leg.departureAbsMinute - Number(departureAbsMinute)) <= 1) || null;
  }

  function consumeTrip(orderId, departureAbsMinute, options = {}) {
    const leg = plannedTrip(orderId, departureAbsMinute);
    if (!leg) return null;
    if (leg.stops && leg.segments) {
      leg.status='started';
      const capacityReservationIds=leg.segments.flatMap(segment=>segment.capacityReservationIds||[]);
      const plannedReturn=leg.disposition?.action==='return'?{...leg.disposition}:null;
      if(options.transferReservations!==true) for(const id of [...capacityReservationIds,...(plannedReturn?.capacityReservationIds||[])]) window.HFNetwork?.releaseCapacityReservation?.(id);
      return {...leg,capacityReservationIds,plannedReturn,postDelivery:leg.disposition};
    }
    const capacityReservationIds = [...(leg.capacityReservationIds || [])];
    leg.capacityReservationIds = [];
    leg.status = 'started';
    const vehicleIds = new Set((options.vehicleIds || leg.vehicleIds || []).map(Number));
    const returnLegs = (logisticsState?.dispatchPlan?.legs || []).filter(candidate => candidate.type === 'return'
      && candidate.status === 'planned'
      && (candidate.tripId === leg.tripId || candidate.outboundLegId === leg.id)
      && (!vehicleIds.size || candidate.vehicleIds?.some(id => vehicleIds.has(Number(id)))));
    const postDelivery = {
      action: leg.postDeliveryAction || (returnLegs.length ? 'return' : 'stay'),
      targetCityId: leg.postDeliveryTargetCityId ?? (returnLegs[0]?.toCityId || leg.toCityId),
      departureAbsMinute: leg.postDeliveryDepartureAbsMinute ?? (returnLegs[0]?.departureAbsMinute || leg.arrivalAbsMinute),
      arrivalAbsMinute: leg.postDeliveryArrivalAbsMinute ?? (returnLegs[0]?.arrivalAbsMinute || leg.arrivalAbsMinute),
      capacityReservationIds: returnLegs.flatMap(candidate => candidate.capacityReservationIds || []),
    };
    const plannedReturn = postDelivery.action === 'return' ? {
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
    return {...leg, capacityReservationIds, postDelivery, plannedReturn};
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
