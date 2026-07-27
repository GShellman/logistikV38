(() => {
  'use strict';
  const DAY = 1440;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const time = value => { const minute = Math.max(0, Number(value) || 0) % DAY; return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(Math.floor(minute % 60)).padStart(2, '0')}`; };

  function position(startAbsMinute, endAbsMinute, dayStartAbsMinute) {
    const start = Number(startAbsMinute), end = Number(endAbsMinute), dayStart = Number(dayStartAbsMinute);
    if (![start, end, dayStart].every(Number.isFinite) || end <= start) return null;
    const visibleStart = Math.max(start, dayStart), visibleEnd = Math.min(end, dayStart + DAY);
    if (visibleEnd <= visibleStart) return null;
    return {topPercent: (visibleStart - dayStart) / DAY * 100, heightPercent: (visibleEnd - visibleStart) / DAY * 100,
      durationMinutes: end - start, continuesBefore: start < dayStart, continuesAfter: end > dayStart + DAY};
  }

  function layout(dayRows) {
    const rows = [...dayRows].sort((a,b) => a.visibleStartAbsMinute-b.visibleStartAbsMinute || b.visibleEndAbsMinute-a.visibleEndAbsMinute);
    let group = [], groupEnd = -Infinity; const result = [];
    const finish = () => { const ends=[]; for (const row of group) { let lane=ends.findIndex(end=>end<=row.visibleStartAbsMinute); if(lane<0) lane=ends.length; ends[lane]=row.visibleEndAbsMinute; row.lane=lane; } group.forEach(row=>row.laneCount=ends.length); result.push(...group); group=[]; };
    for (const row of rows) { if(group.length && row.visibleStartAbsMinute>=groupEnd) finish(); group.push(row); groupEnd=Math.max(groupEnd,row.visibleEndAbsMinute); } finish(); return result;
  }

  function idsOverlap(left = [], right = []) {
    if (!left.length || !right.length) return true;
    const ids = new Set(left.map(String));
    return right.some(id => ids.has(String(id)));
  }

  function shipmentOrderIds(shipment) {
    const ids = [shipment?.orderId, ...(shipment?.stops || []).map(stop => stop?.orderId)];
    return new Set(ids.filter(id => id != null).map(String));
  }

  function legWasTakenOver(leg, shipments, direction) {
    const departureKey = direction === 'return' ? 'returnDepartureAbsMinute' : 'departureAbsMinute';
    return shipments.some(shipment => {
      if (shipment?.[departureKey] == null) return false;
      const departure = Number(shipment?.[departureKey]);
      if (!Number.isFinite(departure) || Math.abs(departure - Number(leg.departureAbsMinute)) > 1) return false;
      if (!shipmentOrderIds(shipment).has(String(leg.orderId))) return false;
      return idsOverlap(leg.vehicleIds, shipment.vehicleIds || []);
    });
  }

  function rows(city, shipments = [], orders = [], plan = null, assignments = [], extraLegs = []) {
    const cityId=city?.id, orderById=new Map(orders.map(order=>[String(order.id),order]));
    const result=[];
    for(const shipment of shipments) {
      if(shipment?.fromCityId!==cityId && shipment?.toCityId!==cityId) continue;
      if(Number(shipment.arrivalAbsMinute)>Number(shipment.departureAbsMinute)) result.push({...shipment,id:`shipment-${shipment.id}`,kind:shipment.status==='active'?'active':'completed',status:shipment.status==='active'?'Aktiv':'Abgeschlossen',sortAbsMinute:Number(shipment.departureAbsMinute)});
      if(Number(shipment.returnArrivalAbsMinute)>Number(shipment.returnDepartureAbsMinute)) result.push({...shipment,id:`shipment-${shipment.id}-return`,kind:shipment.status==='returned'?'completed':'return',status:shipment.status==='returned'?'Abgeschlossen':'Rückfahrt',fromCityId:shipment.toCityId,toCityId:shipment.fromCityId,departureAbsMinute:Number(shipment.returnDepartureAbsMinute),arrivalAbsMinute:Number(shipment.returnArrivalAbsMinute),sortAbsMinute:Number(shipment.returnDepartureAbsMinute)});
    }
    const legs=[...(plan?.legs||[]),...(extraLegs||[])];
    for(const leg of legs) {
      if((leg?.fromCityId!==cityId&&leg?.toCityId!==cityId)||Number(leg.arrivalAbsMinute)<=Number(leg.departureAbsMinute)) continue;
      if(leg.type==='shipment'&&legWasTakenOver(leg,shipments,'outbound')) continue;
      if(leg.type==='return'&&legWasTakenOver(leg,shipments,'return')) continue;
      const order=orderById.get(String(leg.orderId))||{};
      const kind=leg.type==='return'?'return':leg.type==='repositioning'?'reposition':'planned';
      result.push({...leg,id:`plan-${leg.id}`,kind,status:kind==='return'?'Rückfahrt':kind==='reposition'?'Leerfahrt':'Geplant',goodId:kind==='planned'?(leg.goodId||order.goodId):null,amountKg:leg.amountKg??order.amountKg,vehicleCount:leg.vehicleIds?.length??leg.vehicleCount,sortAbsMinute:Number(leg.departureAbsMinute)});
    }
    const seenAssignments=new Set(legs.map(leg=>String(leg.id)));
    for(const item of assignments) if((item?.fromCityId===cityId||item?.toCityId===cityId)&&!seenAssignments.has(String(item.id))&&Number(item.arrivalAbsMinute)>Number(item.departureAbsMinute)) result.push({...item,id:`assignment-${item.id}`,kind:item.status==='completed'?'completed':'reposition',status:item.status==='completed'?'Abgeschlossen':'Leerfahrt',vehicleCount:item.vehicleIds?.length||0,sortAbsMinute:Number(item.departureAbsMinute)});
    return result.sort((a,b)=>a.sortAbsMinute-b.sortAbsMinute||String(a.id).localeCompare(String(b.id)));
  }

  function markup(city, options = {}) {
    const state=options.state||window.HFV2Logistics?.getState?.()||{};
    const data=rows(city,options.shipments||state.shipments||[],options.orders||state.orders||[],options.plan===undefined?state.dispatchPlan:options.plan,options.assignments||state.assignments||[],options.extraLegs||[]);
    const currentDay=Math.max(1,Math.trunc(Number(options.currentDay??window.HFV2Time?.getState?.().day??options.state?.time?.day)||1));
    const dayStartAbsMinute=(currentDay-1)*DAY;
    const cityName=options.cityName||((id)=>window.HFV2CitiesById?.[id]?.name||id); const vehicleName=options.vehicleLabel||((id)=>window.HFVehicleCatalog?.VEHICLE_CATALOG?.[id]?.name||id||'–');
    const legend=[['planned','Geplant'],['active','Aktiv'],['return','Rückfahrt'],['reposition','Leerfahrt'],['completed','Abgeschlossen']].map(([kind,label])=>`<span><i class="hf-v2-transport-calendar__swatch hf-v2-transport-calendar__swatch--${kind}"></i>${label}</span>`).join('');
    const hours=Array.from({length:24},(_,h)=>`<span style="top:${h*60}px">${String(h).padStart(2,'0')}:00</span>`).join('');
    const placed=layout(data.map(row=>{const p=position(row.departureAbsMinute,row.arrivalAbsMinute,dayStartAbsMinute); return p?{...row,...p,visibleStartAbsMinute:Math.max(row.departureAbsMinute,dayStartAbsMinute),visibleEndAbsMinute:Math.min(row.arrivalAbsMinute,dayStartAbsMinute+DAY)}:null}).filter(Boolean));
    const events=placed.map(row=>{const width=100/row.laneCount,style=`top:${row.topPercent}%;height:max(${row.heightPercent}%,32px);left:calc(${row.lane*width}% + 2px);width:calc(${width}% - 4px)`; const route=`${cityName(row.fromCityId)} → ${cityName(row.toCityId)}`; const empty=row.kind==='return'?'Rückfahrt':row.kind==='reposition'?'Leerfahrt':(row.goodId||'Ware'); return `<details class="hf-v2-transport-calendar__event hf-v2-transport-calendar__event--${row.kind}" style="${style}"><summary><b>${esc(route)}</b><span>${esc(empty)}</span><small>${esc(vehicleName(row.vehicleType))} · ${time(row.departureAbsMinute)}–${time(row.arrivalAbsMinute)}</small></summary><dl><div><dt>Status</dt><dd>${esc(row.status)}</dd></div></dl></details>`}).join('');
    const empty=placed.length?'':`<p class="hf-v2-muted">Keine Transporte an Tag ${currentDay}.</p>`;
    return `<div class="hf-v2-transport-calendar__legend" aria-label="Statuslegende">${legend}</div><div class="hf-v2-transport-calendar" role="region" aria-label="Transportkalender" tabindex="0"><div class="hf-v2-transport-calendar__canvas" style="--hf-calendar-days:1"><div class="hf-v2-transport-calendar__corner">Uhrzeit</div><h4 class="hf-v2-transport-calendar__day-title">Tag ${currentDay}</h4><div class="hf-v2-transport-calendar__times">${hours}</div><section class="hf-v2-transport-calendar__day" aria-label="Tag ${currentDay}">${events}${empty}</section></div></div>`;
  }
  window.HFV2ShipmentCalendar=Object.freeze({position,layout,rows,markup});
})();
