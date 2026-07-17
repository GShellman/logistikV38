(function(){'use strict';
function createMigrationApi({TRANSPORT_TYPES,VEHICLES,CITIES,CITY,GOODS,DEMAND_GOODS,makeDemands,normalizeInventory,createCityState}){
function migrateState(s){
  if(!s||![1,2,3,4,5,6,7,8].includes(s.version))return null;const oldVersion=s.version;
  if(oldVersion===1)s.connections=(s.connections||[]).map(e=>({...e,type:e.type==='road'?'mainroad':e.type,geometry:e.geometry||null}));
  s.connections=(s.connections||[]).map(e=>{const type=TRANSPORT_TYPES[e.type]?e.type:(e.type==='road'?'mainroad':'rail'),t=TRANSPORT_TYPES[type];return {...e,type,capacity:oldVersion<3?t.capacity:(e.capacity||t.capacity),maintenance:oldVersion<3?Math.round(e.distance*t.maintenanceKm):(e.maintenance||Math.round(e.distance*t.maintenanceKm)),geometry:e.geometry||null}});
  s.routes=(s.routes||[]).map(r=>{const v=VEHICLES[r.vehicleType]||VEHICLES.van,count=Math.max(1,Math.floor(r.vehicleCount||1)),amount=count*v.load;return {...r,vehicleCount:count,amountPerDay:amount,returnPolicy:r.returnPolicy||'empty',returnGood:r.returnGood||null,returnAmount:(r.returnPolicy&&r.returnPolicy!=='empty')?amount:0}});
  s.fleet=s.fleet||{van:2,lightTruck:0,heavyTruck:0,artic:0,freightTrain:0};Object.keys(VEHICLES).forEach(k=>s.fleet[k]=s.fleet[k]||0);
  s.usedCapacity={};
  s.shipments=(s.shipments||[]).map(sh=>{const remainingMinutes=sh.remainingMinutes??Math.max(0,Math.round((sh.remainingHours??sh.eta??1)*60)),totalMinutes=sh.totalMinutes??Math.max(1,Math.round((sh.totalHours??sh.eta??1)*60)),phase=sh.phase||'outbound',currentNode=sh.currentNode||(phase==='awaiting_return'?(sh.destination||sh.to):(sh.from||sh.home));const next={...sh,vehicleType:sh.vehicleType||'van',remainingMinutes,totalMinutes,edgeIds:sh.edgeIds||[],trips:sh.trips||1,home:sh.home||sh.from,destination:sh.destination||sh.to,phase,returnPolicy:sh.returnPolicy||'empty',returnGood:sh.returnGood||null,returnAmount:sh.returnAmount||0,waitingReason:sh.waitingReason||'',movementStatus:phase==='awaiting_return'?'waiting_return':(oldVersion>=8?(sh.movementStatus||'queued'):'queued'),currentEdgeIndex:oldVersion>=8?(sh.currentEdgeIndex||0):0,currentNode,edgeRemainingMinutes:oldVersion>=8?(sh.edgeRemainingMinutes||0):0,edgeTotalMinutes:oldVersion>=8?(sh.edgeTotalMinutes||0):0};delete next.eta;delete next.remainingHours;delete next.totalHours;return next});
  s.usedVehicles={};s.shipments.forEach(sh=>s.usedVehicles[sh.vehicleType]=(s.usedVehicles[sh.vehicleType]||0)+(sh.trips||1));
  s.cities=s.cities||{};CITIES.forEach(c=>{if(!s.cities[c.id]){s.cities[c.id]=createCityState(c);}else{s.cities[c.id].inventory=normalizeInventory(s.cities[c.id].inventory);s.cities[c.id].facilities=s.cities[c.id].facilities||[];s.cities[c.id].demands=s.cities[c.id].demands||makeDemands(c);s.cities[c.id].sales=s.cities[c.id].sales||0;}});
  if(!s.selected || !CITY[s.selected]) s.selected='zurich';
  s.hour=Number.isFinite(s.hour)?Math.floor(s.hour):8;s.minute=Number.isFinite(s.minute)?Math.floor(s.minute):0;
  s.version=8;return s;
}
return {migrateState};}
window.HF_MIGRATIONS={createMigrationApi};
})();
