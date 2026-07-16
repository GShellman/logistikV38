// Depot feature extensions extracted from the clean app HTML.
// Evaluated from inside the main game closure so these legacy extension blocks
// can continue patching closure-local HF functions safely.

// --- v1.0.33: fixed road depots, depot fleets and automatic daily distribution ---
(function(){
  const HF_DEPOT_BUILD_COST=35000;
  const HF_DEPOT_DAILY_COST=120;
  const HF_DEPOT_CAPACITY=100000;
  // --- v1.1.2: canonical daily consumption, initialized before depot rendering ---
  const HF_DAILY_CONSUMPTION_SCHEMA=112;
  const HF_FULL_DAILY_CONSUMPTION_GOODS=new Set(['zucchini','apples','pears','potatoes','tomatoes','corn','fish']);
  function hfDefaultDailyConsumptionRate(good){return HF_FULL_DAILY_CONSUMPTION_GOODS.has(good)?1:.22}
  function hfActualDailyConsumption(cityId,good){
    const demand=state.cities?.[cityId]?.demands?.[good];
    if(!demand)return 0;
    const max=Math.max(0,Number(demand.max)||0),stored=Number(demand.dailyRate);
    const rate=Number.isFinite(stored)&&stored>=0?stored:hfDefaultDailyConsumptionRate(good);
    return roundCargo(rate>=1?max:Math.max(max>0?1:0,max*rate));
  }
  function hfInstallCanonicalDailyConsumption(){
    for(const c of CITIES){
      const demands=state.cities?.[c.id]?.demands||{};
      for(const [good,demand] of Object.entries(demands)){
        if(!demand||typeof demand!=='object')continue;
        const desired=hfDefaultDailyConsumptionRate(good);
        if(!Number.isFinite(Number(demand.dailyRate))||HF_FULL_DAILY_CONSUMPTION_GOODS.has(good))demand.dailyRate=desired;
        else demand.dailyRate=Math.max(0,Number(demand.dailyRate));
      }
    }
    state.dailyConsumptionSchema=HF_DAILY_CONSUMPTION_SCHEMA;
  }
  hfInstallCanonicalDailyConsumption();
  replenishDemand=function(){
    for(const c of CITIES){
      const demands=state.cities?.[c.id]?.demands||{};
      for(const [good,demand] of Object.entries(demands)){
        const daily=hfActualDailyConsumption(c.id,good);
        demand.need=roundCargo(clamp((Number(demand.need)||0)+daily,0,Number(demand.max)||0));
      }
    }
  };

  const HF_DEPOT_VERSION=1;
  const hfDepotMarkers={};

  function hfDepotId(){return 'depot_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)}
  function hfDepotName(index){return `Verteildepot ${index+1}`}
  function hfRoadEdges(){return (state.connections||[]).filter(e=>transportSpec(e)?.mode==='road')}
  function hfNodeName(id){return CITY[id]?.name||'Knoten'}
  function hfRound(n){return roundCargo?roundCargo(n):Math.round((Number(n)||0)*1000)/1000}
  function hfDepotInventory(d){state.cities[d.id]=state.cities[d.id]||{unlocked:false,isDepot:true,inventory:{},demands:{},facilities:[],sales:0};state.cities[d.id].inventory=state.cities[d.id].inventory||{};return state.cities[d.id].inventory}
  function hfDepotRoadVehicles(){return vehicleShopOrder().filter(id=>VEHICLES[id]?.mode==='road')}
  function hfDepotUsed(d,type){d.usedVehicles=d.usedVehicles||{};return Number(d.usedVehicles[type])||0}
  function hfDepotFree(d,type){return Math.max(0,(Number(d.fleet?.[type])||0)-hfDepotUsed(d,type))}
  function hfDepotFleetCount(d){return Object.values(d.fleet||{}).reduce((n,x)=>n+(Number(x)||0),0)}
  function hfDepotFleetCapacity(d){return Object.entries(d.fleet||{}).reduce((n,[id,q])=>n+(VEHICLES[id]?.load||0)*(Number(q)||0),0)}
  function hfDepotFleetMaintenance(d){return Object.entries(d.fleet||{}).reduce((n,[id,q])=>n+(VEHICLES[id]?.daily||0)*(Number(q)||0),0)}
  function hfDepotMaintenanceTotal(){return (state.depots||[]).reduce((n,d)=>n+HF_DEPOT_DAILY_COST+hfDepotFleetMaintenance(d),0)}
  function hfDailyDemand(cityId,good){return hfDepotDailyNeed(cityId,good)}
  function hfCurrentShortfall(cityId,good){const city=state.cities[cityId],d=city?.demands?.[good];if(!d)return 0;return Math.max(0,hfRound((Number(d.need)||0)-(Number(city.inventory?.[good])||0)))}
  function hfDepotSelectedDemand(d){const rows=[];for(const good of d.goods||[]){let daily=0,current=0;for(const cityId of d.cities||[]){daily+=hfDailyDemand(cityId,good);current+=hfCurrentShortfall(cityId,good)}rows.push({good,daily:hfRound(daily),current:hfRound(current)})}return rows}
  function hfDepotDemandTotal(d){return hfDepotSelectedDemand(d).reduce((n,x)=>n+x.daily,0)}
  function hfDepotInventoryTotal(d){return Object.values(hfDepotInventory(d)).reduce((n,x)=>n+(Number(x)||0),0)}
  function hfDepotCoverage(d){const demand=hfDepotDemandTotal(d);return demand?Math.min(999,Math.round(hfDepotInventoryTotal(d)/demand*100)):0}

  function hfPolylineSplit(coords){
    const pts=(Array.isArray(coords)&&coords.length>1?coords:[]).map(p=>[Number(p[0]),Number(p[1])]);
    if(pts.length<2)return null;
    const seg=[];let total=0;
    for(let i=1;i<pts.length;i++){const a={lat:pts[i-1][0],lng:pts[i-1][1]},b={lat:pts[i][0],lng:pts[i][1]},len=Math.max(.0001,dist(a,b));seg.push(len);total+=len}
    const target=total/2;let walked=0;
    for(let i=0;i<seg.length;i++){
      if(walked+seg[i]>=target){const t=(target-walked)/seg[i],a=pts[i],b=pts[i+1],point=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],left=pts.slice(0,i+1),right=pts.slice(i+1);left.push(point);right.unshift(point);return {point,left,right,ratio:target/total}}
      walked+=seg[i];
    }
    const mid=pts[Math.floor(pts.length/2)];return {point:mid,left:pts.slice(0,Math.floor(pts.length/2)+1),right:pts.slice(Math.floor(pts.length/2)),ratio:.5};
  }
  function hfEdgeGeometry(edge){const a=CITY[edge.a],b=CITY[edge.b];return edge.geometry?.length>1?edge.geometry:[[a.lat,a.lng],[b.lat,b.lng]]}
  function hfRegisterDepotNode(d){
    const node={id:d.id,name:d.name||'Verteildepot',lat:Number(d.lat),lng:Number(d.lng),tier:0,slots:0,isDepot:true};
    CITY[d.id]=node;
    const existing=CITIES.find(c=>c.id===d.id);if(existing)Object.assign(existing,node);else CITIES.push(node);
    const s=state.cities[d.id]||{};state.cities[d.id]={...s,unlocked:false,isDepot:true,inventory:s.inventory||{},demands:{},facilities:[],sales:Number(s.sales)||0};
  }
  function hfNormalizeDepot(d,index){
    d.name=d.name||hfDepotName(index);d.goods=Array.isArray(d.goods)?d.goods.filter(g=>GOODS[g]):[];d.cities=Array.isArray(d.cities)?d.cities.filter(id=>CITY[id]&&!CITY[id].isDepot):[];d.fleet=d.fleet||{};d.usedVehicles=d.usedVehicles||{};d.active=d.active!==false;d.lastStatus=d.lastStatus||'Bereit';d.version=HF_DEPOT_VERSION;hfDepotRoadVehicles().forEach(id=>{d.fleet[id]=Number(d.fleet[id])||0;d.usedVehicles[id]=Number(d.usedVehicles[id])||0});hfRegisterDepotNode(d);return d
  }
  function hfEnsureDepots(){state.depots=Array.isArray(state.depots)?state.depots:[];state.depots.forEach(hfNormalizeDepot)}
  hfEnsureDepots();

  const hfBaseFreshState=freshState;
  freshState=function(){const s=hfBaseFreshState();s.depots=[];return s};

  function hfBuildDepot(edgeId){
    hfEnsureDepots();const edge=state.connections.find(e=>e.id===edgeId);if(!edge||transportSpec(edge)?.mode!=='road')return toast('Bitte eine bestehende Straße auswählen.','bad');
    if((state.usedCapacity[edge.id]||0)>0||state.shipments.some(sh=>sh.edgeIds?.includes(edge.id)))return toast('Auf diesem Straßenabschnitt sind Fahrzeuge unterwegs. Baue das Depot, sobald die Straße frei ist.','bad');
    if(state.cash<HF_DEPOT_BUILD_COST)return toast('Zu wenig Kapital für das Depot.','bad');
    const split=hfPolylineSplit(hfEdgeGeometry(edge));if(!split)return toast('Die Straßenlage konnte nicht bestimmt werden.','bad');
    const id=hfDepotId(),d={id,name:hfDepotName(state.depots.length),lat:split.point[0],lng:split.point[1],sourceEdgeId:edge.id,goods:[],cities:[],fleet:{},usedVehicles:{},active:true,lastStatus:'Depot gebaut · Versorgung konfigurieren',version:HF_DEPOT_VERSION};hfNormalizeDepot(d,state.depots.length);
    const oldDistance=Number(edge.distance)||dist(CITY[edge.a],CITY[edge.b]),leftDistance=Math.max(.01,oldDistance*split.ratio),rightDistance=Math.max(.01,oldDistance-leftDistance),oldMaint=Number(edge.maintenance)||0;
    const common={...edge};delete common.id;
    const left={...common,id:'e'+Date.now().toString(36)+'a',a:edge.a,b:id,distance:leftDistance,maintenance:Math.round(oldMaint*split.ratio),geometry:split.left};
    const right={...common,id:'e'+Date.now().toString(36)+'b',a:id,b:edge.b,distance:rightDistance,maintenance:Math.max(0,oldMaint-Math.round(oldMaint*split.ratio)),geometry:split.right};
    state.connections=state.connections.filter(e=>e.id!==edge.id);state.connections.push(left,right);state.depots.push(d);state.cash-=HF_DEPOT_BUILD_COST;save(false);closeModal();renderAll();toast(`${d.name} an der Straße ${hfNodeName(edge.a)}–${hfNodeName(edge.b)} gebaut.`,'good');setTimeout(()=>window.HF.hfOpenDepot(d.id),80)
  }

  function hfOpenDepotBuild(){
    hfEnsureDepots();const edges=hfRoadEdges();if(!edges.length)return toast('Baue zuerst mindestens eine Straße.','bad');
    const modal=document.getElementById('modal'),back=document.getElementById('modalBack');
    modal.innerHTML=window.HF_MODAL_MARKUP.depotBuildModalMarkup(edges);back.classList.add('show');requestAnimationFrame(()=>modal.scrollTop=0)
  }

  function hfGoodsForDepotChoice(){
    const demanded=new Set();CITIES.forEach(c=>{if(state.cities[c.id]?.unlocked)Object.keys(state.cities[c.id]?.demands||{}).forEach(g=>demanded.add(g))});return [...demanded].sort((a,b)=>(GOODS[a]?.name||a).localeCompare(GOODS[b]?.name||b,'de'))
  }
  function hfReachableCities(d){return CITIES.filter(c=>state.cities[c.id]?.unlocked&&findPath(d.id,c.id,'van')).sort((a,b)=>a.name.localeCompare(b.name,'de'))}
  function hfDepotSummaryMarkup(d){
    const rows=hfDepotSelectedDemand(d),inventory=hfDepotInventory(d),total=hfDepotDemandTotal(d),cap=hfDepotFleetCapacity(d),coverage=hfDepotCoverage(d);
    return `<div class="hf-depot-summary-grid"><div><span>Tagesbedarf</span><b>${formatWeight(total)}</b></div><div><span>Fahrzeugkapazität</span><b>${formatWeight(cap)}/Tag</b></div><div><span>Lagerbestand</span><b>${formatWeight(hfDepotInventoryTotal(d))}</b></div><div><span>Lagerdeckung</span><b>${coverage}%</b></div></div>${rows.length?`<div class="hf-depot-demand-list">${rows.map(x=>`<div><span>${goodImg(x.good,'asset-img asset-xs')} ${GOODS[x.good].name}</span><b>${formatWeight(x.daily)}/Tag</b><small>aktuell offen ${formatWeight(x.current)} · Lager ${formatWeight(inventory[x.good]||0)}</small></div>`).join('')}</div>`:'<div class="empty">Noch keine Waren ausgewählt.</div>'}`
  }
  function hfOpenDepot(id){
    hfEnsureDepots();const d=state.depots.find(x=>x.id===id);if(!d)return;const modal=document.getElementById('modal'),back=document.getElementById('modalBack'),cities=hfReachableCities(d),goods=hfGoodsForDepotChoice();
    modal.innerHTML=window.HF_MODAL_MARKUP.depotModalMarkup(d,{cities,goods,summaryMarkup:hfDepotSummaryMarkup,roadVehicles:hfDepotRoadVehicles,fleetCount:hfDepotFleetCount,used:hfDepotUsed});
    back.classList.add('show');
    const update=()=>{const clone={...d,cities:[...modal.querySelectorAll('#hfDepotCities input:checked')].map(x=>x.value),goods:[...modal.querySelectorAll('#hfDepotGoods input:checked')].map(x=>x.value)};document.getElementById('hfDepotLiveSummary').innerHTML=hfDepotSummaryMarkup(clone)};modal.querySelectorAll('#hfDepotCities input,#hfDepotGoods input').forEach(x=>x.addEventListener('change',update));requestAnimationFrame(()=>modal.scrollTop=0)
  }
  function hfSaveDepotConfig(id){const d=state.depots.find(x=>x.id===id),modal=document.getElementById('modal');if(!d)return;d.cities=[...modal.querySelectorAll('#hfDepotCities input:checked')].map(x=>x.value);d.goods=[...modal.querySelectorAll('#hfDepotGoods input:checked')].map(x=>x.value);d.lastStatus=d.cities.length&&d.goods.length?'Bereit für die nächste Tagesdisposition':'Versorgungsgebiet noch unvollständig';save(false);renderAll();toast('Depotkonfiguration gespeichert.','good');window.HF.hfOpenDepot(id)}
  function hfDepotBuyVehicle(id,type){const d=state.depots.find(x=>x.id===id),v=VEHICLES[type];if(!d||!v||v.mode!=='road')return;if(state.cash<v.cost)return toast('Zu wenig Kapital.','bad');state.cash-=v.cost;d.fleet[type]=(d.fleet[type]||0)+1;save(false);renderAll();toast(`${v.name} dem ${d.name} zugewiesen.`,'good');window.HF.hfOpenDepot(id)}
  function hfDepotSellVehicle(id,type){const d=state.depots.find(x=>x.id===id),v=VEHICLES[type];if(!d||!v)return;const owned=d.fleet[type]||0,used=hfDepotUsed(d,type);if(owned<=used)return toast('Alle Fahrzeuge dieses Typs sind unterwegs.','bad');d.fleet[type]--;const refund=Math.round(v.cost*.6);state.cash+=refund;save(false);renderAll();toast(`${v.name} für ${money(refund)} verkauft.`);window.HF.hfOpenDepot(id)}

  function hfSupplyOptions(d){return CITIES.filter(c=>state.cities[c.id]?.unlocked&&findPath(c.id,d.id,'van')).sort((a,b)=>a.name.localeCompare(b.name,'de'))}
  function hfOpenDepotSupply(id){
    const d=state.depots.find(x=>x.id===id);if(!d)return;const sources=hfSupplyOptions(d),modal=document.getElementById('modal');if(!sources.length)return toast('Kein erschlossener Ort kann dieses Depot erreichen.','bad');
    modal.innerHTML=window.HF_MODAL_MARKUP.depotSupplyModalMarkup(d,{sources,roadVehicles:hfDepotRoadVehicles});document.getElementById('modalBack').classList.add('show');
    const from=modal.querySelector('#hfSupplyFrom'),vehicle=modal.querySelector('#hfSupplyVehicle'),good=modal.querySelector('#hfSupplyGood'),amount=modal.querySelector('#hfSupplyAmount'),send=modal.querySelector('#hfSupplySend');
    function refreshGoods(){const inv=state.cities[from.value]?.inventory||{},vid=vehicle.value,list=Object.keys(inv).filter(g=>(inv[g]||0)>.001&&vehicleCanCarryGood(vid,g));good.innerHTML=list.map(g=>`<option value="${g}">${GOODS[g].name} · ${formatGoodAmount(g,inv[g])}</option>`).join('')||'<option value="">Keine passende Ware</option>';refreshAmount()}
    function refreshAmount(){const g=good.value,v=VEHICLES[vehicle.value],stock=state.cities[from.value]?.inventory?.[g]||0,maxKg=Math.min(stock,v?.load||0,Math.max(0,HF_DEPOT_CAPACITY-hfDepotInventoryTotal(d))),max=Math.max(0,inputMaxFor(g,maxKg));amount.max=String(max);amount.step=String(measureFor(g).unit==='t'?.1:1);if(Number(amount.value)>max||Number(amount.value)<=0)amount.value=String(max);const kg=fromDisplayAmount(g,Number(amount.value)||0),route=findPath(from.value,d.id,vehicle.value),cost=route?transportCost(route,vehicle.value,1):0;modal.querySelector('#hfSupplyStock').textContent=g?`Lager ${formatGoodAmount(g,stock)}`:'';modal.querySelector('#hfSupplyValue').textContent=g?formatGoodAmount(g,kg):'';modal.querySelector('#hfSupplyPreview').textContent=route?`${CITY[from.value].name} → ${d.name} · ${formatHours(route.timeHours)} · Hinfahrt ${money(cost)}`:'Keine kompatible Straßenverbindung';send.disabled=!g||kg<=.001||!route||manualVehicleAvailable(vehicle.value)<1||state.cash<cost}
    from.addEventListener('change',refreshGoods);vehicle.addEventListener('change',refreshGoods);good.addEventListener('change',refreshAmount);amount.addEventListener('input',refreshAmount);send.addEventListener('click',()=>hfDispatchSupply(d.id,from.value,good.value,vehicle.value,fromDisplayAmount(good.value,Number(amount.value)||0)));refreshGoods();requestAnimationFrame(()=>modal.scrollTop=0)
  }
  function hfDispatchSupply(depotId,from,good,vehicleType,amount){
    const d=state.depots.find(x=>x.id===depotId),route=findPath(from,depotId,vehicleType),v=VEHICLES[vehicleType],inv=state.cities[from]?.inventory||{};amount=Math.min(Number(amount)||0,v?.load||0,hfV117AvailableForExport(from,good));if(!d||!route||!v||amount<=.001)return toast('Lieferung konnte nicht geplant werden.','bad');if(manualVehicleAvailable(vehicleType)<1)return toast('Kein freies Fahrzeug.','bad');const cost=transportCost(route,vehicleType,1);if(state.cash<cost)return toast('Zu wenig Kapital für die Hinfahrt.','bad');inv[good]=hfRound((inv[good]||0)-amount);state.cash-=cost;state.usedVehicles[vehicleType]=(state.usedVehicles[vehicleType]||0)+1;const mins=Math.max(1,Math.round(route.timeHours*60));state.shipments.push({id:'s'+Date.now()+Math.random().toString(16).slice(2),home:from,destination:depotId,from,to:depotId,good,amount,remainingMinutes:mins,totalMinutes:mins,path:route.path,edgeIds:route.edges.map(e=>e.id),vehicleType,trips:1,phase:'outbound',returnPolicy:'empty',returnGood:null,returnAmount:0,waitingReason:'Wartet auf freie Einfahrt',movementStatus:'queued',currentEdgeIndex:0,currentNode:from,edgeRemainingMinutes:0,edgeTotalMinutes:0,isDepotSupply:true});save(false);closeModal();renderAll();toast(`${formatGoodAmount(good,amount)} ${GOODS[good].name} zum ${d.name} unterwegs.`,'good')
  }

  function hfCreateDepotDelivery(d,cityId,good,amount,vehicleType){
    const v=VEHICLES[vehicleType],route=findPath(d.id,cityId,vehicleType),inv=hfDepotInventory(d);amount=Math.min(Number(amount)||0,v?.load||0,inv[good]||0);if(!route||!v||amount<=.001)return {ok:false,reason:'Keine passende Route oder Ware'};const cost=transportCost(route,vehicleType,1);if(state.cash<cost)return {ok:false,reason:'Zu wenig Kapital für Fahrtkosten'};inv[good]=hfRound((inv[good]||0)-amount);state.cash-=cost;d.usedVehicles[vehicleType]=(d.usedVehicles[vehicleType]||0)+1;const mins=Math.max(1,Math.round(route.timeHours*60));state.shipments.push({id:'ds'+Date.now()+Math.random().toString(16).slice(2),home:d.id,destination:cityId,from:d.id,to:cityId,good,amount,remainingMinutes:mins,totalMinutes:mins,path:route.path,edgeIds:route.edges.map(e=>e.id),vehicleType,trips:1,phase:'outbound',returnPolicy:'empty',returnGood:null,returnAmount:0,waitingReason:'Depotfahrt wartet auf freie Einfahrt',movementStatus:'queued',currentEdgeIndex:0,currentNode:d.id,edgeRemainingMinutes:0,edgeTotalMinutes:0,isDepotDelivery:true,depotId:d.id});return {ok:true,amount,cost}
  }
  function hfRunDepot(d,force=false){
    hfNormalizeDepot(d,state.depots.indexOf(d));if(!d.active)return {sent:0,blocked:0};if(!force&&d.lastRunDay===state.day)return {sent:0,blocked:0};d.lastRunDay=state.day;
    if(!d.cities.length||!d.goods.length){d.lastStatus='Keine Städte oder Waren konfiguriert';return {sent:0,blocked:1}}
    const tasks=[];for(const cityId of d.cities){for(const good of d.goods){const need=hfCurrentShortfall(cityId,good),dem=state.cities[cityId]?.demands?.[good];if(need>.001&&dem)tasks.push({cityId,good,need,urgency:(dem.need||0)/Math.max(1,dem.max||1)})}}
    tasks.sort((a,b)=>b.urgency-a.urgency||b.need-a.need);
    const slots=[];for(const type of hfDepotRoadVehicles())for(let i=0;i<hfDepotFree(d,type);i++)slots.push(type);slots.sort((a,b)=>(VEHICLES[a]?.load||0)-(VEHICLES[b]?.load||0));let sent=0,blocked=0,trips=0;
    for(const type of slots){const v=VEHICLES[type];let best=null;for(const task of tasks){if(task.need<=.001||!vehicleCanCarryGood(type,task.good)||(hfDepotInventory(d)[task.good]||0)<=.001)continue;const route=findPath(d.id,task.cityId,type);if(!route)continue;const score=task.urgency*100000+Math.min(task.need,v.load)-route.timeHours*10;if(!best||score>best.score)best={task,score}}
      if(!best)continue;const amount=Math.min(v.load,best.task.need,hfDepotInventory(d)[best.task.good]||0),result=hfCreateDepotDelivery(d,best.task.cityId,best.task.good,amount,type);if(result.ok){best.task.need=hfRound(best.task.need-result.amount);sent+=result.amount;trips++}else blocked++
    }
    const unmet=tasks.reduce((n,t)=>n+Math.max(0,t.need),0);if(!trips){const noStock=tasks.some(t=>(hfDepotInventory(d)[t.good]||0)<=.001);d.lastStatus=noStock?'Keine passenden Waren im Depotlager':'Keine freie passende Fahrzeugkapazität'}else d.lastStatus=`${trips} Fahrt${trips===1?'':'en'} disponiert · ${formatWeight(sent)} · ${unmet>.001?formatWeight(unmet)+' noch offen':'Bedarf gedeckt'}`;return {sent,blocked:blocked+(unmet>.001?1:0)}
  }
  function hfRunAllDepots(force=false){let sent=0,blocked=0;hfEnsureDepots();for(const d of state.depots){const r=hfRunDepot(d,force);sent+=r.sent;blocked+=r.blocked}return {sent,blocked}}
  function hfRunDepotNow(id){const d=state.depots.find(x=>x.id===id);if(!d)return;const r=hfRunDepot(d,true);save(false);renderAll();toast(r.sent?`${formatWeight(r.sent)} automatisch disponiert.`:d.lastStatus,r.sent?'good':'bad');window.HF.hfOpenDepot(id)}

  const hfBaseTryStartReturn=tryStartReturn;
  tryStartReturn=function(sh){
    if(!sh?.isDepotDelivery)return hfBaseTryStartReturn(sh);const d=state.depots.find(x=>x.id===sh.depotId),route=findPath(sh.destination,sh.home,sh.vehicleType);if(!d||!route){sh.waitingReason='Keine Rückverbindung zum Depot';return false}const cost=transportCost(route,sh.vehicleType,1);if(state.cash<cost){sh.waitingReason='Wartet auf Kapital für Rückfahrt';return false}state.cash-=cost;sh.from=sh.destination;sh.to=sh.home;sh.good=null;sh.amount=0;sh.remainingMinutes=Math.max(1,Math.round(route.timeHours*60));sh.totalMinutes=sh.remainingMinutes;sh.path=route.path;sh.edgeIds=route.edges.map(e=>e.id);sh.phase='return';sh.movementStatus='queued';sh.currentEdgeIndex=0;sh.currentNode=sh.destination;sh.edgeRemainingMinutes=0;sh.edgeTotalMinutes=0;sh.waitingReason='Rückfahrt zum Depot wartet auf freie Einfahrt';return true
  };
  const hfBaseCompleteShipmentLeg=completeShipmentLeg;
  completeShipmentLeg=function(sh){
    if(!sh?.isDepotDelivery)return hfBaseCompleteShipmentLeg(sh);const d=state.depots.find(x=>x.id===sh.depotId);if(sh.phase==='outbound'){state.cities[sh.destination].inventory[sh.good]=hfRound((state.cities[sh.destination].inventory[sh.good]||0)+sh.amount);sh.from=sh.destination;sh.to=sh.home;sh.phase='awaiting_return';sh.movementStatus='waiting_return';sh.currentNode=sh.destination;sh.remainingMinutes=0;sh.totalMinutes=0;sh.path=[sh.destination];sh.edgeIds=[];sh.currentEdgeIndex=0;sh.waitingReason='Rückfahrt zum Depot wird vorbereitet';tryStartReturn(sh);return false}if(d)d.usedVehicles[sh.vehicleType]=Math.max(0,(d.usedVehicles[sh.vehicleType]||0)-1);sh.completed=true;return true
  };

  const hfBaseFinishDay=finishDay;
  finishDay=function(){const result=hfBaseFinishDay(),depotMaint=hfDepotMaintenanceTotal();state.cash-=depotMaint;result.maintenance=(Number(result.maintenance)||0)+depotMaint;const auto=hfRunAllDepots(false);result.auto=result.auto||{sent:0,blocked:0};result.auto.sent=(Number(result.auto.sent)||0)+auto.sent;result.auto.blocked=(Number(result.auto.blocked)||0)+auto.blocked;if(state.history?.length)state.history[state.history.length-1].maintenance=result.maintenance;return result};

  function hfDepotCardsMarkup(){
    hfEnsureDepots();if(!state.depots.length)return `<div class="empty"><div class="big">🏬</div>Noch kein Depot gebaut. Depots automatisieren die letzte Meile, benötigen aber regelmäßige Warenzufuhr.</div>`;
    return `<div class="list">${state.depots.map(d=>{const demand=hfDepotDemandTotal(d),stock=hfDepotInventoryTotal(d),coverage=hfDepotCoverage(d),pct=demand?clamp(stock/demand*100,0,100):0;return `<div class="list-item hf-depot-card"><div class="hf-depot-icon">🏬</div><div><div class="row"><div><b>${d.name}</b><div class="sub">${d.cities.length} Städte · ${d.goods.length} Waren · ${hfDepotFleetCount(d)} Fahrzeuge</div></div><span class="pill ${d.active?'live':'locked'}">${d.active?'AUTO':'PAUSE'}</span></div><div class="hf-depot-card-grid"><span>Tagesbedarf <b>${formatWeight(demand)}</b></span><span>Lager <b>${formatWeight(stock)}</b></span><span>Deckung <b>${coverage}%</b></span><span>Kapazität <b>${formatWeight(hfDepotFleetCapacity(d))}</b></span></div><div class="bar"><i style="width:${pct}%"></i></div><div class="sub" style="margin-top:6px">${d.lastStatus}</div><div class="fleet-actions"><button class="btn sm primary" onclick="window.HF.hfOpenDepot('${d.id}')">Verwalten</button><button class="btn sm secondary" onclick="window.HF.hfOpenDepotSupply('${d.id}')">Beliefern</button></div></div></div>`}).join('')}</div>`
  }
  function hfDepotLogisticsSectionMarkup(){
    return `<section class="card" data-hf-depot-menu="1"><div class="row"><div><h2 style="margin:0">Depots & Nahverteilung</h2><div class="sub">Depots versorgen ausgewählte Städte automatisch mit deren Tagesbedarf.</div></div><button class="btn sm primary" onclick="window.HF.hfOpenDepotBuild()">+ Depot</button></div><div class="compact-note" style="margin:10px 0">Deine Aufgabe verschiebt sich zur Warenversorgung der Depots. Depotfahrzeuge disponieren die letzte Meile selbstständig.</div>${hfDepotCardsMarkup()}</section>`
  }
  function hfRenderDepotLogisticsSection(root){
    if(!root||root.querySelector('[data-hf-depot-menu]'))return false;
    root.insertAdjacentHTML('beforeend',hfDepotLogisticsSectionMarkup());
    return true
  }
  const hfBaseRenderDepot=typeof renderDepot==='function'?renderDepot:null;
  renderDepot=function(root){const result=hfBaseRenderDepot?hfBaseRenderDepot(root):undefined;hfRenderDepotLogisticsSection(root);return result};
  const hfBaseRenderCompany=renderCompany;
  renderCompany=function(root){hfBaseRenderCompany(root);const fixed=(state.depots||[]).length*HF_DEPOT_DAILY_COST,fleet=(state.depots||[]).reduce((n,d)=>n+hfDepotFleetMaintenance(d),0);root.innerHTML+=`<section class="card"><div class="compact-head"><h3>Depotkosten</h3><span class="pill">${state.depots?.length||0} Depots</span></div><div class="finance-grid"><div class="finance-tile"><span>Gebäude</span><b>${money(fixed)}/Tag</b></div><div class="finance-tile"><span>Depot-Fuhrpark</span><b>${money(fleet)}/Tag</b></div><div class="finance-tile"><span>Gesamt</span><b>${money(fixed+fleet)}/Tag</b></div></div></section>`};

  function hfRenderDepotMarkers(){
    if(!map||!window.L)return;hfEnsureDepots();const active=new Set(state.depots.map(d=>d.id));for(const [id,m] of Object.entries(hfDepotMarkers)){if(!active.has(id)){map.removeLayer(m);delete hfDepotMarkers[id]}}
    for(const d of state.depots){let marker=hfDepotMarkers[d.id],warning=!!d.scheduleIncomplete;const icon=L.divIcon({className:'hf-depot-marker-wrap',html:`<div class="hf-depot-marker ${warning?'hf-depot-warning':''}">🏬${warning?'<span class="hf-depot-alert">!</span>':''}</div>`,iconSize:[38,42],iconAnchor:[19,28]});if(!marker){marker=L.marker([d.lat,d.lng],{icon,zIndexOffset:warning?900:650}).addTo(map).on('click',()=>window.HF.hfOpenDepot(d.id));hfDepotMarkers[d.id]=marker}else{marker.setLatLng([d.lat,d.lng]);marker.setIcon(icon);marker.setZIndexOffset(warning?900:650)}marker.unbindTooltip();marker.bindTooltip(`${d.name}<br>${d.cities.length} Städte · ${hfDepotFleetCount(d)} Fahrzeuge<br>${warning?`⚠ ${formatWeight(d.scheduleUnmet||0)} laut Fahrplan bis 23:59 offen<br>`:''}${d.lastStatus}`,{direction:'top',offset:[0,-18]})}
  }
  const hfBaseRenderMap=renderMap;
  renderMap=function(){hfEnsureDepots();hfBaseRenderMap();hfRenderDepotMarkers()};

  if(!document.getElementById('hf-depot-style')){const style=document.createElement('style');style.id='hf-depot-style';style.textContent=`
    .hf-depot-panel{margin-top:12px;padding:11px;border:1px solid #d7ded8;border-radius:15px;background:#f8faf7}.hf-depot-panel h3{margin:0 0 4px}.hf-depot-check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:9px;max-height:210px;overflow:auto}.hf-depot-check-grid label,.hf-depot-good-grid label{display:flex;align-items:center;gap:7px;padding:8px;border:1px solid #d7ded8;border-radius:10px;background:white;font-size:10px;font-weight:800}.hf-depot-check-grid input,.hf-depot-good-grid input{width:17px;height:17px;accent-color:#197457}.hf-depot-good-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:9px;max-height:210px;overflow:auto}.hf-depot-good-grid img{width:25px;height:25px}.hf-depot-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px}.hf-depot-summary-grid>div{padding:9px;border-radius:11px;background:white;border:1px solid #e1e6e2}.hf-depot-summary-grid span{display:block;font-size:8px;color:#728079;text-transform:uppercase;font-weight:800}.hf-depot-summary-grid b{display:block;font-size:13px;margin-top:3px}.hf-depot-demand-list{display:grid;gap:6px;margin-top:8px}.hf-depot-demand-list>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 8px;align-items:center;padding:8px;border-radius:10px;background:white}.hf-depot-demand-list span{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:800}.hf-depot-demand-list small{grid-column:1/-1;color:#6b7771}.hf-depot-vehicle{grid-template-columns:74px minmax(0,1fr)}.depot-actions{display:grid;grid-template-columns:1fr 1fr}.depot-actions .btn:last-child{grid-column:1/-1}.hf-depot-card{grid-template-columns:44px minmax(0,1fr)}.hf-depot-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#e4f0e9;font-size:23px}.hf-depot-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 8px;margin:7px 0}.hf-depot-card-grid span{font-size:9px;color:#66746d}.hf-depot-card-grid b{color:#263a31}.hf-depot-marker{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:#f2fff8;border:3px solid #197457;box-shadow:0 3px 10px #173f3255;font-size:17px}.hf-depot-marker-wrap{background:transparent;border:0}.hf-depot-marker-wrap .leaflet-marker-icon{background:transparent}@media(max-width:380px){.hf-depot-check-grid,.hf-depot-good-grid{grid-template-columns:1fr}.depot-actions{grid-template-columns:1fr}.depot-actions .btn:last-child{grid-column:auto}}
  `;document.head.appendChild(style)}

  window.HF={...window.HF,hfOpenDepotBuild,hfBuildDepot,hfOpenDepot,hfSaveDepotConfig,hfDepotBuyVehicle,hfDepotSellVehicle,hfOpenDepotSupply,hfDispatchSupply,hfRunDepotNow,hfRenderDepotLogisticsSection};
  document.body.dataset.hfBuild='1.0.35';
  document.body.dataset.hfDepots='1';
  save(false);renderAll();
})();


// --- v1.0.35: depot targets and automatic daily multi-stop dispatch ---
document.body.dataset.hfDepotTargets='1';
document.body.dataset.hfDailyMultiStop='1';
document.body.dataset.hfBuild='1.0.35';
save(false);

// v1.0.30: automatic road junctions reuse existing road sections when connecting new cities.




// --- v1.0.36: forced new start and automatic daily depot procurement ---
(function(){
  const HF_V136_BUILD = '1.0.37';
  const HF_V136_RESET_KEY = 'helveticFreightForcedStart_1_0_36';

  function hfV136Round(value){
    return typeof roundCargo === 'function' ? roundCargo(Number(value)||0) : Math.round((Number(value)||0)*1000)/1000;
  }
  function hfV136Depot(id){
    return (state.depots||[]).find(d=>d.id===id);
  }
  function hfV136EnsureAutoOrder(d){
    if(!d) return null;
    const cfg = d.autoOrder && typeof d.autoOrder === 'object' ? d.autoOrder : {};
    cfg.active = cfg.active === true;
    cfg.departureMinute = Math.max(0,Math.min(1439,Number.isFinite(+cfg.departureMinute)?Math.round(+cfg.departureMinute):5*60));
    cfg.targetDays = Math.max(1,Math.min(7,Number.isFinite(+cfg.targetDays)?Math.round(+cfg.targetDays):2));
    cfg.maxTrips = Math.max(1,Math.min(20,Number.isFinite(+cfg.maxTrips)?Math.round(+cfg.maxTrips):4));
    cfg.lastRunKey = String(cfg.lastRunKey||'');
    cfg.lastStatus = String(cfg.lastStatus||'Automatische Bestellung nicht aktiviert');
    d.autoOrder = cfg;
    return cfg;
  }
  function hfV136EnsureAll(){
    state.depots = Array.isArray(state.depots) ? state.depots : [];
    state.depots.forEach(hfV136EnsureAutoOrder);
    state.autoFacilityOrderVersion = 1;
  }
  hfV136EnsureAll();

  function hfV136DepotInventory(d){
    state.cities[d.id] = state.cities[d.id] || {unlocked:false,isDepot:true,inventory:{},demands:{},facilities:[],sales:0};
    state.cities[d.id].inventory = state.cities[d.id].inventory || {};
    return state.cities[d.id].inventory;
  }
  function hfV136DailyDemand(d,good){
    return hfV136Round((d.cities||[]).reduce((total,cityId)=>total+hfDepotDailyNeed(cityId,good),0));
  }
  function hfV136Incoming(d,good){
    let total=0;
    for(const sh of state.shipments||[]){
      if(sh.completed || sh.destination!==d.id || ['return','tour_return'].includes(sh.phase)) continue;
      const cargo=Array.isArray(sh.cargo)&&sh.cargo.length?sh.cargo:(sh.good?[{good:sh.good,amount:sh.amount||0}]:[]);
      for(const item of cargo) if(item.good===good) total+=Number(item.amount)||0;
    }
    return hfV136Round(total);
  }
  function hfV136FacilityProduces(cityId,good){
    const s=state.cities[cityId];
    if(!s?.unlocked || s.isDepot) return false;
    return (s.facilities||[]).some(fid=>{
      const f=FACILITIES[fid];
      if(!f) return false;
      if((Number(f.output?.[good])||0)>0) return true;
      if(fid==='foodfactory' && ['ravioli_meat','ravioli_veg','tomato_cans','food'].includes(good)) return true;
      return false;
    });
  }
  function hfV136Producers(d,good){
    return CITIES.filter(c=>!c.isDepot && hfV136FacilityProduces(c.id,good) && (Number(state.cities[c.id]?.inventory?.[good])||0)>0.001);
  }
  function hfV136RoadVehicles(){
    return Object.keys(VEHICLES).filter(id=>VEHICLES[id]?.mode==='road' && (Number(state.fleet?.[id])||0)>0);
  }
  function hfV136FreeVehicles(type){
    if(typeof manualVehicleAvailable==='function') return Math.max(0,manualVehicleAvailable(type));
    return Math.max(0,(Number(state.fleet?.[type])||0)-(Number(state.usedVehicles?.[type])||0));
  }
  function hfV136Candidate(d,good,need){
    let best=null;
    for(const source of hfV136Producers(d,good)){
      const stock=Number(state.cities[source.id]?.inventory?.[good])||0;
      if(stock<=0.001) continue;
      for(const type of hfV136RoadVehicles()){
        const v=VEHICLES[type];
        if(hfV136FreeVehicles(type)<1 || !vehicleCanCarryGood(type,good)) continue;
        const route=findPath(source.id,d.id,type);
        if(!route) continue;
        const amount=Math.min(Number(v.load)||0,stock,need);
        if(amount<=0.001) continue;
        const cost=transportCost(route,type,1);
        const score=(cost/Math.max(amount,0.001)) + (route.timeHours||0)*0.05 + Math.max(0,(v.load-amount)/Math.max(1,v.load));
        if(!best||score<best.score) best={source:source.id,type,route,amount,cost,score};
      }
    }
    return best;
  }
  function hfV136CreateSupply(d,good,candidate){
    const {source,type,route,cost}=candidate;
    const v=VEHICLES[type],inv=state.cities[source]?.inventory||{};
    const amount=hfV136Round(Math.min(candidate.amount,Number(v?.load)||0,Number(inv[good])||0));
    if(!v||amount<=0.001||hfV136FreeVehicles(type)<1||state.cash<cost) return false;
    inv[good]=hfV136Round((Number(inv[good])||0)-amount);
    state.cash-=cost;
    state.usedVehicles=state.usedVehicles||{};
    state.usedVehicles[type]=(Number(state.usedVehicles[type])||0)+1;
    const mins=Math.max(1,Math.round((route.timeHours||0)*60));
    state.shipments.push({
      id:'ao'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),
      home:source,destination:d.id,from:source,to:d.id,
      good,amount,cargo:[{good,amount}],
      remainingMinutes:mins,totalMinutes:mins,path:route.path,edgeIds:route.edges.map(e=>e.id),
      vehicleType:type,trips:1,phase:'outbound',returnPolicy:'empty',returnCargo:[],returnGood:null,returnAmount:0,
      waitingReason:'Automatische Depotbestellung wartet auf freie Einfahrt',movementStatus:'queued',
      currentEdgeIndex:0,currentNode:source,edgeRemainingMinutes:0,edgeTotalMinutes:0,
      isDepotSupply:true,isAutoFacilityOrder:true,depotId:d.id
    });
    return amount;
  }
  function hfV136OrderTasks(d){
    const cfg=hfV136EnsureAutoOrder(d),inv=hfV136DepotInventory(d),tasks=[];
    for(const good of d.goods||[]){
      if(!GOODS[good]) continue;
      const daily=hfV136DailyDemand(d,good),target=hfV136Round(daily*cfg.targetDays),stock=Number(inv[good])||0,incoming=hfV136Incoming(d,good),missing=hfV136Round(Math.max(0,target-stock-incoming));
      if(target>0.001&&missing>0.001) tasks.push({good,daily,target,stock,incoming,missing,coverage:(stock+incoming)/target});
    }
    tasks.sort((a,b)=>a.coverage-b.coverage||b.missing-a.missing);
    return tasks;
  }
  function hfV136RunDepotOrder(d,force=false){
    const cfg=hfV136EnsureAutoOrder(d),key=`${state.day}:${cfg.departureMinute}`;
    if(!force){
      if(!cfg.active) return {sent:0,blocked:0,trips:0};
      if(cfg.lastRunKey===key) return {sent:0,blocked:0,trips:0};
      cfg.lastRunKey=key;
    }
    const tasks=hfV136OrderTasks(d);
    if(!tasks.length){cfg.lastStatus='Zielbestand bereits erreicht';return {sent:0,blocked:0,trips:0};}
    let sent=0,trips=0,blocked=0;
    while(trips<cfg.maxTrips){
      tasks.sort((a,b)=>a.coverage-b.coverage||b.missing-a.missing);
      const task=tasks.find(t=>t.missing>0.001);
      if(!task) break;
      const candidate=hfV136Candidate(d,task.good,task.missing);
      if(!candidate){task.missing=0;blocked++;continue;}
      if(state.cash<candidate.cost){blocked++;break;}
      const amount=hfV136CreateSupply(d,task.good,candidate);
      if(!amount){blocked++;break;}
      sent=hfV136Round(sent+amount);trips++;
      task.missing=hfV136Round(Math.max(0,task.missing-amount));
      task.incoming=hfV136Round(task.incoming+amount);
      task.coverage=(task.stock+task.incoming)/Math.max(0.001,task.target);
    }
    const remaining=tasks.reduce((n,t)=>n+Math.max(0,t.missing),0);
    if(trips){
      cfg.lastStatus=`${trips} Abholfahrt${trips===1?'':'en'} · ${formatWeight(sent)} aus Produktionsstätten bestellt${remaining>0.001?' · '+formatWeight(remaining)+' offen':''}`;
    }else if(blocked){
      cfg.lastStatus='Bestellung blockiert: keine passende Ware, Route, freie Fahrzeuge oder zu wenig Kapital';
    }else cfg.lastStatus='Keine Bestellung erforderlich';
    return {sent,blocked:blocked+(remaining>0.001?1:0),trips};
  }
  function hfV136RunAtCurrentTime(){
    hfV136EnsureAll();
    const now=minuteOfDay(),keyDay=state.day;
    let sent=0,blocked=0,trips=0;
    for(const d of state.depots){
      const cfg=hfV136EnsureAutoOrder(d);
      if(!cfg.active||cfg.departureMinute!==now||cfg.lastRunKey===`${keyDay}:${now}`) continue;
      const r=hfV136RunDepotOrder(d,false);sent+=r.sent;blocked+=r.blocked;trips+=r.trips;
    }
    return {sent:hfV136Round(sent),blocked,trips};
  }

  const hfV136BaseScheduled = runScheduledRoutesAtCurrentTime;
  runScheduledRoutesAtCurrentTime=function(){
    const base=hfV136BaseScheduled(),orders=hfV136RunAtCurrentTime();
    if(orders.trips) save(false);
    return {sent:hfV136Round((Number(base?.sent)||0)+orders.sent),blocked:(Number(base?.blocked)||0)+orders.blocked};
  };

  function hfV136Clock(minute){
    return typeof clockFromMinutes==='function'?clockFromMinutes(minute):`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
  }
  function hfV136ReadModal(id){
    const d=hfV136Depot(id),modal=document.getElementById('modal');if(!d||!modal)return;
    const cfg=hfV136EnsureAutoOrder(d),active=modal.querySelector('#hfV136AutoOrderActive'),time=modal.querySelector('#hfV136AutoOrderTime'),days=modal.querySelector('#hfV136TargetDays'),trips=modal.querySelector('#hfV136MaxTrips');
    if(active)cfg.active=active.checked;
    if(time)cfg.departureMinute=parseClockMinutes(time.value);
    if(days)cfg.targetDays=Math.max(1,Math.min(7,Number(days.value)||2));
    if(trips)cfg.maxTrips=Math.max(1,Math.min(20,Number(trips.value)||4));
  }
  function hfV136PreviewMarkup(d){
    const cfg=hfV136EnsureAutoOrder(d),inv=hfV136DepotInventory(d),rows=(d.goods||[]).map(g=>{
      const daily=hfV136DailyDemand(d,g),target=hfV136Round(daily*cfg.targetDays),stock=Number(inv[g])||0,incoming=hfV136Incoming(d,g),producers=CITIES.filter(c=>hfV136FacilityProduces(c.id,g)).length;
      return `<div><span>${goodImg(g,'asset-img asset-xs')}<b>${GOODS[g]?.name||g}</b></span><small>${formatGoodAmount(g,daily)} täglich · Ziel ${formatGoodAmount(g,target)} · Lager + unterwegs ${formatGoodAmount(g,stock+incoming)} · ${producers} Produktionsort${producers===1?'':'e'}</small></div>`;
    }).join('');
    return rows?`<div class="hf-v136-order-preview">${rows}</div>`:'<div class="empty">Wähle zuerst Waren für dieses Depot aus.</div>';
  }
  function hfV136InjectDepotUI(id){
    const d=hfV136Depot(id),modal=document.getElementById('modal');if(!d||!modal||modal.querySelector('#hfV136AutoOrderPanel'))return;
    const actions=modal.querySelector('.modal-actions.depot-actions');if(!actions)return;
    const cfg=hfV136EnsureAutoOrder(d);
    actions.insertAdjacentHTML('beforebegin',`<section class="hf-depot-panel" id="hfV136AutoOrderPanel"><div class="row"><div><h3 style="margin:0">Automatische Warenbestellung</h3><div class="sub">Bestellt ausgewählte Waren täglich aus deinen eigenen Produktionsstätten und transportiert sie mit dem normalen Firmenfuhrpark ins Depot.</div></div><label class="hf-v136-switch"><input type="checkbox" id="hfV136AutoOrderActive" ${cfg.active?'checked':''}><span>AUTO</span></label></div><div class="hf-v136-order-grid"><div class="field"><label>Bestellzeit</label><input type="time" id="hfV136AutoOrderTime" value="${hfV136Clock(cfg.departureMinute)}"></div><div class="field"><label>Zielbestand</label><select id="hfV136TargetDays">${[1,2,3,4,5,6,7].map(n=>`<option value="${n}" ${n===cfg.targetDays?'selected':''}>${n} Tagesbedarf${n===1?'':'e'}</option>`).join('')}</select></div><div class="field"><label>Max. Abholfahrten pro Tag</label><input type="number" min="1" max="20" id="hfV136MaxTrips" value="${cfg.maxTrips}"></div></div><div class="compact-note">Es werden nur Lagerbestände aus Städten mit einer passenden gebauten Produktionsstätte bestellt. Fehlende Rohstoffe und Produktionsengpässe bleiben damit deine Aufgabe.</div><div id="hfV136OrderPreview">${hfV136PreviewMarkup(d)}</div><div class="row" style="margin-top:9px"><small>${cfg.lastStatus}</small><button class="btn sm orange" onclick="window.HF.hfV136OrderNow('${d.id}')">Jetzt bestellen</button></div></section>`);
    const refresh=()=>{hfV136ReadModal(id);const el=modal.querySelector('#hfV136OrderPreview');if(el)el.innerHTML=hfV136PreviewMarkup(d)};
    modal.querySelectorAll('#hfV136AutoOrderActive,#hfV136AutoOrderTime,#hfV136TargetDays,#hfV136MaxTrips').forEach(el=>el.addEventListener('change',refresh));
  }

  const hfV136BaseOpenDepot=window.HF?.hfOpenDepot;
  if(hfV136BaseOpenDepot){
    window.HF.hfOpenDepot=function(id){const result=hfV136BaseOpenDepot(id);hfV136InjectDepotUI(id);return result};
  }
  const hfV136BaseSaveDepot=window.HF?.hfSaveDepotConfig;
  if(hfV136BaseSaveDepot){
    window.HF.hfSaveDepotConfig=function(id){hfV136ReadModal(id);const result=hfV136BaseSaveDepot(id);setTimeout(()=>hfV136InjectDepotUI(id),0);return result};
  }
  for(const name of ['hfDepotBuyVehicle','hfDepotSellVehicle','hfRunDepotNow']){
    const base=window.HF?.[name];
    if(!base)continue;
    window.HF[name]=function(id,...args){hfV136ReadModal(id);const result=base(id,...args);setTimeout(()=>hfV136InjectDepotUI(id),0);return result};
  }
  window.HF.hfV136OrderNow=function(id){
    const d=hfV136Depot(id);if(!d)return;
    hfV136ReadModal(id);const r=hfV136RunDepotOrder(d,true);save(false);renderAll();toast(r.trips?`${r.trips} Abholfahrt${r.trips===1?'':'en'} mit ${formatWeight(r.sent)} gestartet.`:d.autoOrder.lastStatus,r.trips?'good':'bad');if(window.HF.hfOpenDepot)window.HF.hfOpenDepot(id);
  };

  if(!document.getElementById('hf-v136-style')){
    const style=document.createElement('style');style.id='hf-v136-style';style.textContent=`
      .hf-v136-order-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:10px}.hf-v136-order-grid .field{margin:0}.hf-v136-switch{display:flex;align-items:center;gap:5px;font-size:9px;font-weight:900;color:#197457}.hf-v136-switch input{width:19px;height:19px;accent-color:#197457}.hf-v136-order-preview{display:grid;gap:6px;margin-top:9px}.hf-v136-order-preview>div{padding:8px;border:1px solid #e0e6e1;border-radius:10px;background:#fff}.hf-v136-order-preview span{display:flex;align-items:center;gap:6px;font-size:10px}.hf-v136-order-preview small{display:block;margin-top:3px;color:#68766f}@media(max-width:430px){.hf-v136-order-grid{grid-template-columns:1fr 1fr}.hf-v136-order-grid .field:last-child{grid-column:1/-1}}
    `;document.head.appendChild(style);
  }

  const hfV136BaseReset=performReset;
  performReset=function(){const result=hfV136BaseReset();hfV136EnsureAll();save(false);return result};
  window.HF.performReset=performReset;

  document.body.dataset.hfBuild=HF_V136_BUILD;
  document.body.dataset.hfAutoFacilityOrders='1';
  hfV136EnsureAll();

  try{
    if(HF_STORAGE.getItem(HF_V136_RESET_KEY)!=='done'){
      performReset();
      HF_STORAGE.setItem(HF_V136_RESET_KEY,'done');
      state.forcedStartVersion=HF_V136_BUILD;
      save(false);
      setTimeout(()=>toast('Update 1.0.36: Für die neue Depot- und Bestelllogik wurde ein neuer Spielstand gestartet.','good'),120);
    }else save(false);
  }catch(err){console.warn('v1.0.36 reset marker failed',err);save(false)}
})();


// --- v1.0.37: clean browser boot and isolated save namespace ---
(function(){
  document.body.dataset.hfBuild='1.0.37';
  document.body.dataset.hfCleanBrowserBoot='1';
  if(window.__HF_STORAGE_UNAVAILABLE__){
    setTimeout(()=>toast('Der Browser blockiert lokalen Speicher. Der Spielstand bleibt nur bis zum Schließen dieser Seite erhalten.','bad'),300);
  }
})();

// --- v1.0.38: intelligent depot tours and visible daily vehicle timetable ---
(function(){
  const HF_V138_BUILD='1.0.38';
  const HF_V138_MAX_STOPS=6;
  const HF_V138_STAGGER=15;

  function hfV138Round(n){
    return typeof roundCargo==='function'?roundCargo(Number(n)||0):Math.round((Number(n)||0)*1000)/1000;
  }
  function hfV138Clock(minute){
    minute=((Number(minute)||0)%1440+1440)%1440;
    return typeof clockFromMinutes==='function'?clockFromMinutes(minute):`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
  }
  function hfV138ParseClock(value){
    if(typeof parseClockMinutes==='function')return parseClockMinutes(value);
    const m=String(value||'08:00').match(/^(\d{1,2}):(\d{2})$/);
    return m?Math.max(0,Math.min(1439,(+m[1])*60+(+m[2]))):480;
  }
  function hfV138Depot(id){return (state.depots||[]).find(d=>d.id===id)}
  function hfV138Ensure(d){
    if(!d)return null;
    d.fleet=d.fleet||{};d.usedVehicles=d.usedVehicles||{};
    d.smartDispatchMinute=Math.max(0,Math.min(1439,Number.isFinite(+d.smartDispatchMinute)?Math.round(+d.smartDispatchMinute):480));
    d.smartLastRunDay=Number.isFinite(+d.smartLastRunDay)?+d.smartLastRunDay:-1;
    d.smartScheduleDay=Number.isFinite(+d.smartScheduleDay)?+d.smartScheduleDay:-1;
    d.smartSchedule=Array.isArray(d.smartSchedule)?d.smartSchedule:[];
    return d;
  }
  function hfV138Inventory(d){
    state.cities[d.id]=state.cities[d.id]||{unlocked:false,isDepot:true,inventory:{},demands:{},facilities:[],sales:0};
    state.cities[d.id].inventory=state.cities[d.id].inventory||{};
    return state.cities[d.id].inventory;
  }
  function hfV138Name(id){return CITY[id]?.name||state.depots?.find(d=>d.id===id)?.name||id}
  function hfV138Need(cityId,good){
    const city=state.cities[cityId],dem=city?.demands?.[good];
    if(!dem)return 0;
    return hfV138Round(Math.max(0,(Number(dem.need)||0)-(Number(city.inventory?.[good])||0)));
  }
  function hfV138Urgency(cityId,good){
    const city=state.cities[cityId],dem=city?.demands?.[good];
    if(!dem)return 0;
    const need=hfV138Need(cityId,good),daily=Math.max(.001,Number(dem.need)||Number(dem.max)||1);
    return Math.min(3,need/daily);
  }
  function hfV138RoadVehicleTypes(){
    return Object.keys(VEHICLES).filter(id=>VEHICLES[id]?.mode==='road');
  }
  function hfV138FreeSlots(d){
    const slots=[];
    for(const type of hfV138RoadVehicleTypes()){
      const count=Math.max(0,(Number(d.fleet[type])||0)-(Number(d.usedVehicles[type])||0));
      for(let i=0;i<count;i++)slots.push({type,index:i});
    }
    return slots.sort((a,b)=>(VEHICLES[b.type]?.load||0)-(VEHICLES[a.type]?.load||0));
  }
  function hfV138Route(from,to,type){
    try{return findPath(from,to,type)}catch(_){return null}
  }
  function hfV138RouteTime(from,to,type){return Number(hfV138Route(from,to,type)?.timeHours)||Infinity}
  function hfV138Metrics(d,stops,type){
    const nodes=[d.id,...stops.map(s=>s.cityId),d.id],legs=[];
    let timeHours=0,cost=0;
    for(let i=0;i<nodes.length-1;i++){
      const route=hfV138Route(nodes[i],nodes[i+1],type);
      if(!route)return null;
      timeHours+=Number(route.timeHours)||0;
      cost+=Number(transportCost(route,type,1))||0;
      legs.push(route);
    }
    return {timeHours,cost,legs};
  }
  function hfV138CargoTotal(cargo){return hfV138Round((cargo||[]).reduce((n,x)=>n+(Number(x.amount)||0),0))}
  function hfV138CargoSummary(cargo,max=3){
    const items=(cargo||[]).filter(x=>(Number(x.amount)||0)>.001);
    if(!items.length)return 'keine Ladung';
    const shown=items.slice(0,max).map(x=>`${GOODS[x.good]?.name||x.good} ${formatGoodAmount(x.good,x.amount)}`);
    return shown.join(' · ')+(items.length>max?` · +${items.length-max}`:'');
  }
  function hfV138StopSummary(stops){return (stops||[]).map(s=>hfV138Name(s.cityId)).join(' → ')}
  function hfV138BuildPlans(d){
    hfV138Ensure(d);
    const inv=hfV138Inventory(d),stock={};
    for(const g of d.goods||[])stock[g]=Number(inv[g])||0;
    const tasks=[];
    for(const cityId of d.cities||[]){
      for(const good of d.goods||[]){
        const remaining=hfV138Need(cityId,good);
        if(remaining>.001)tasks.push({cityId,good,remaining,urgency:hfV138Urgency(cityId,good)});
      }
    }
    const plans=[];
    const slots=hfV138FreeSlots(d);
    let slotNo=0;
    for(const slot of slots){
      const type=slot.type,v=VEHICLES[type];
      if(!v)continue;
      let capacity=Number(v.load)||0;
      const compatible=()=>tasks.filter(t=>t.remaining>.001&&(stock[t.good]||0)>.001&&vehicleCanCarryGood(type,t.good)&&hfV138Route(d.id,t.cityId,type)&&hfV138Route(t.cityId,d.id,type));
      const available=compatible();
      if(!available.length)continue;
      const seed=available.slice().sort((a,b)=>{
        const sa=a.urgency*1000+Math.min(a.remaining,capacity)/Math.max(1,capacity)*120-hfV138RouteTime(d.id,a.cityId,type)*8;
        const sb=b.urgency*1000+Math.min(b.remaining,capacity)/Math.max(1,capacity)*120-hfV138RouteTime(d.id,b.cityId,type)*8;
        return sb-sa;
      })[0];
      if(!seed)continue;
      const stops=[],cargoMap=new Map();
      let current=d.id,forcedCity=seed.cityId;
      while(capacity>.001&&stops.length<HF_V138_MAX_STOPS){
        const cityCandidates=[...new Set(compatible().map(t=>t.cityId))].filter(id=>!stops.some(s=>s.cityId===id));
        if(!cityCandidates.length)break;
        let nextCity=null,bestScore=-Infinity;
        for(const cityId of cityCandidates){
          if(forcedCity&&cityId!==forcedCity)continue;
          const leg=hfV138Route(current,cityId,type),back=hfV138Route(cityId,d.id,type);
          if(!leg||!back)continue;
          const cityTasks=tasks.filter(t=>t.cityId===cityId&&t.remaining>.001&&(stock[t.good]||0)>.001&&vehicleCanCarryGood(type,t.good));
          const benefit=cityTasks.reduce((n,t)=>n+Math.min(t.remaining,stock[t.good]||0,capacity),0);
          const urgency=Math.max(0,...cityTasks.map(t=>t.urgency));
          const directBack=hfV138Route(current,d.id,type);
          const detour=(Number(leg.timeHours)||0)+(Number(back.timeHours)||0)-(Number(directBack?.timeHours)||0);
          if(stops.length&&detour>2.75)continue;
          const score=urgency*700+Math.min(1,benefit/Math.max(1,capacity))*180-detour*35-(Number(leg.timeHours)||0)*4;
          if(score>bestScore){bestScore=score;nextCity=cityId}
        }
        forcedCity=null;
        if(!nextCity)break;
        const unloads=[];
        const cityTasks=tasks.filter(t=>t.cityId===nextCity&&t.remaining>.001&&(stock[t.good]||0)>.001&&vehicleCanCarryGood(type,t.good)).sort((a,b)=>b.urgency-a.urgency||b.remaining-a.remaining);
        for(const task of cityTasks){
          if(capacity<=.001)break;
          const amount=hfV138Round(Math.min(capacity,task.remaining,stock[task.good]||0));
          if(amount<=.001)continue;
          unloads.push({good:task.good,amount});
          cargoMap.set(task.good,hfV138Round((cargoMap.get(task.good)||0)+amount));
          task.remaining=hfV138Round(task.remaining-amount);
          stock[task.good]=hfV138Round((stock[task.good]||0)-amount);
          capacity=hfV138Round(capacity-amount);
        }
        if(!unloads.length)break;
        stops.push({cityId:nextCity,dailyDemand:false,unloads});
        current=nextCity;
      }
      if(!stops.length)continue;
      const cargo=[...cargoMap].map(([good,amount])=>({good,amount})),metrics=hfV138Metrics(d,stops,type);
      if(!metrics)continue;
      const startMinute=(d.smartDispatchMinute+slotNo*HF_V138_STAGGER)%1440;
      const endMinute=(startMinute+Math.ceil(metrics.timeHours*60))%1440;
      plans.push({
        id:`dp_${state.day}_${Date.now().toString(36)}_${slotNo}_${Math.random().toString(36).slice(2,6)}`,
        day:state.day,vehicleType:type,vehicleNo:slot.index+1,startMinute,endMinute,
        stops,cargo,cost:Math.round(metrics.cost),timeHours:metrics.timeHours,status:'Geplant',shipmentId:null
      });
      slotNo++;
    }
    return plans;
  }
  function hfV138SetLeg(sh,from,to,phase){
    const route=hfV138Route(from,to,sh.vehicleType);
    if(!route){sh.movementStatus='waiting_return';sh.waitingReason=`Keine Verbindung ${hfV138Name(from)}–${hfV138Name(to)}`;return false}
    sh.from=from;sh.to=to;sh.destination=to;sh.phase=phase;
    sh.remainingMinutes=Math.max(1,Math.round((Number(route.timeHours)||0)*60));sh.totalMinutes=sh.remainingMinutes;
    sh.path=route.path;sh.edgeIds=(route.edges||[]).map(e=>e.id);sh.movementStatus='queued';sh.currentEdgeIndex=0;sh.currentNode=from;sh.edgeRemainingMinutes=0;sh.edgeTotalMinutes=0;sh.waitingReason='Wartet auf freie Einfahrt';
    return true;
  }
  function hfV138DispatchPlan(d,plan){
    const v=VEHICLES[plan.vehicleType],inv=hfV138Inventory(d);
    if(!v)return {ok:false,reason:'Fahrzeugtyp fehlt'};
    if((d.usedVehicles[plan.vehicleType]||0)>=(d.fleet[plan.vehicleType]||0))return {ok:false,reason:'Fahrzeug nicht frei'};
    for(const item of plan.cargo)if((inv[item.good]||0)+.001<item.amount)return {ok:false,reason:`${GOODS[item.good]?.name||item.good} nicht ausreichend im Depot`};
    const metrics=hfV138Metrics(d,plan.stops,plan.vehicleType);
    if(!metrics)return {ok:false,reason:'Route nicht vollständig erreichbar'};
    if(state.cash<metrics.cost)return {ok:false,reason:'Zu wenig Kapital für Rundfahrt'};
    for(const item of plan.cargo)inv[item.good]=hfV138Round((inv[item.good]||0)-item.amount);
    state.cash-=metrics.cost;d.usedVehicles[plan.vehicleType]=(d.usedVehicles[plan.vehicleType]||0)+1;
    const sh={
      id:'dsmart_'+Date.now()+Math.random().toString(16).slice(2),isMultiStop:true,isDepotSmartTour:true,depotId:d.id,smartPlanId:plan.id,
      home:d.id,from:d.id,to:plan.stops[0].cityId,destination:plan.stops[0].cityId,
      cargo:plan.cargo.map(x=>({...x})),initialCargo:plan.cargo.map(x=>({...x})),returnCargoPlan:[],
      tourStops:plan.stops.map(s=>({cityId:s.cityId,dailyDemand:false,unloads:s.unloads.map(x=>({...x}))})),tourStopIndex:0,
      vehicleType:plan.vehicleType,routeId:null,trips:1,returnPolicy:'empty',returnGood:null,returnAmount:0,
      good:plan.cargo[0]?.good||null,amount:hfV138CargoTotal(plan.cargo),phase:'tour_outbound',movementStatus:'queued',currentEdgeIndex:0,currentNode:d.id,edgeRemainingMinutes:0,edgeTotalMinutes:0,waitingReason:'Wartet auf freie Einfahrt'
    };
    if(!hfV138SetLeg(sh,d.id,plan.stops[0].cityId,'tour_outbound')){
      state.cash+=metrics.cost;d.usedVehicles[plan.vehicleType]=Math.max(0,(d.usedVehicles[plan.vehicleType]||0)-1);
      for(const item of plan.cargo)inv[item.good]=hfV138Round((inv[item.good]||0)+item.amount);
      return {ok:false,reason:sh.waitingReason};
    }
    state.shipments.push(sh);plan.shipmentId=sh.id;plan.status='Unterwegs';plan.cost=Math.round(metrics.cost);plan.timeHours=metrics.timeHours;
    return {ok:true,shipment:sh,amount:hfV138CargoTotal(plan.cargo),cost:metrics.cost};
  }
  function hfV138RunDepot(d,force=false){
    hfV138Ensure(d);
    if(!d.active&&!force)return {sent:0,trips:0,blocked:0};
    if(!force&&d.smartLastRunDay===state.day)return {sent:0,trips:0,blocked:0};
    if(!d.cities?.length||!d.goods?.length){d.lastStatus='Keine Städte oder Waren für die Nahverteilung ausgewählt';return {sent:0,trips:0,blocked:1}}
    const plans=hfV138BuildPlans(d);d.smartScheduleDay=state.day;d.smartSchedule=plans;d.smartLastRunDay=state.day;
    let sent=0,trips=0,blocked=0;
    for(const plan of plans){
      const result=hfV138DispatchPlan(d,plan);
      if(result.ok){sent=hfV138Round(sent+result.amount);trips++}
      else{plan.status='Blockiert';plan.reason=result.reason;blocked++}
    }
    if(trips)d.lastStatus=`${trips} intelligente Rundfahrt${trips===1?'':'en'} · ${formatWeight(sent)} · ${plans.reduce((n,p)=>n+p.stops.length,0)} Stopps`;
    else if(plans.length)d.lastStatus='Tagesfahrplan blockiert: Fahrzeug, Bestand, Route oder Kapital prüfen';
    else d.lastStatus='Kein offener Bedarf oder keine passende Ware im Depotlager';
    return {sent,trips,blocked};
  }
  function hfV138RunAtCurrentTime(){
    const now=typeof minuteOfDay==='function'?minuteOfDay():0;
    let sent=0,trips=0,blocked=0;
    for(const d of state.depots||[]){
      hfV138Ensure(d);
      if(!d.active||d.smartDispatchMinute!==now||d.smartLastRunDay===state.day)continue;
      const r=hfV138RunDepot(d,false);sent=hfV138Round(sent+r.sent);trips+=r.trips;blocked+=r.blocked;
    }
    return {sent,trips,blocked};
  }
  function hfV138ScheduleStatus(d,row){
    const sh=row.shipmentId?(state.shipments||[]).find(x=>x.id===row.shipmentId):null;
    if(sh?.completed)return 'Erledigt';
    if(sh){
      if(sh.movementStatus==='moving')return 'Unterwegs';
      if(sh.movementStatus==='queued')return 'Wartet auf Straße';
      return sh.waitingReason||'Unterwegs';
    }
    return row.status||'Geplant';
  }
  function hfV138ScheduleMarkup(d){
    hfV138Ensure(d);
    const current=(d.smartScheduleDay===state.day&&d.smartSchedule?.length)?d.smartSchedule:hfV138BuildPlans(d);
    const isPreview=!(d.smartScheduleDay===state.day&&d.smartSchedule?.length);
    if(!current.length)return `<div class="empty"><div class="big">🗓️</div>Für heute ist keine Fahrt nötig oder es fehlen passende Waren beziehungsweise freie Depotfahrzeuge.</div>`;
    return `<div class="hf-v138-timetable">${current.map((row,i)=>{
      const status=isPreview?'Vorschau':hfV138ScheduleStatus(d,row),statusClass=/Erledigt/.test(status)?'done':/Blockiert|fehlt|Keine/.test(status)?'blocked':/Unterwegs|Wartet/.test(status)?'live':'planned';
      const multi=row.stops.length>1?`<span class="pill blue">${row.stops.length} Stopps</span>`:'';
      const mixed=row.cargo.length>1?`<span class="pill orange">${row.cargo.length} Waren</span>`:'';
      return `<article class="hf-v138-trip"><div class="hf-v138-time"><b>${hfV138Clock(row.startMinute)}</b><small>bis ca. ${hfV138Clock(row.endMinute)}</small></div>${vehicleImg(row.vehicleType,'asset-img asset-route-vehicle')}<div class="hf-v138-trip-main"><div class="row"><b>${VEHICLES[row.vehicleType]?.name||row.vehicleType} ${row.vehicleNo||i+1}</b><span class="hf-v138-status ${statusClass}">${status}</span></div><div class="hf-v138-route">🏬 ${d.name} → ${hfV138StopSummary(row.stops)} → 🏬</div><div class="sub">${hfV138CargoSummary(row.cargo,4)}</div><div class="hf-v138-badges">${multi}${mixed}<span class="pill">${formatWeight(hfV138CargoTotal(row.cargo))}</span></div>${row.reason?`<div class="sub bad">${row.reason}</div>`:''}</div></article>`;
    }).join('')}</div>`;
  }
  function hfV138InjectDepotUI(id){
    const d=hfV138Depot(id),modal=document.getElementById('modal');
    if(!d||!modal||modal.querySelector('#hfV138SchedulePanel'))return;
    hfV138Ensure(d);
    const anchor=modal.querySelector('#hfV136AutoOrderPanel')||modal.querySelector('.modal-actions.depot-actions');
    if(!anchor)return;
    const panel=document.createElement('section');panel.className='hf-depot-panel';panel.id='hfV138SchedulePanel';
    panel.innerHTML=`<div class="row"><div><h3 style="margin:0">Tagesfahrplan Depotfahrzeuge</h3><div class="sub">Fahrzeuge kombinieren automatisch mehrere Stopps und ergänzen freie Nutzlast mit weiteren benötigten Waren.</div></div><label class="hf-v138-auto"><input type="checkbox" id="hfV138Active" ${d.active?'checked':''}><span>AUTO</span></label></div><div class="hf-v138-controls"><div class="field"><label>Täglicher Start</label><input type="time" id="hfV138Time" value="${hfV138Clock(d.smartDispatchMinute)}"></div><button class="btn sm secondary" id="hfV138Replan">Fahrplan neu berechnen</button></div><div class="compact-note">Die Route wird nach Dringlichkeit und kurzer zusätzlicher Fahrzeit gebildet. Ein Fahrzeug kann bis zu ${HF_V138_MAX_STOPS} Städte bedienen und mehrere kompatible Waren gleichzeitig laden.</div><div id="hfV138ScheduleBody">${hfV138ScheduleMarkup(d)}</div>`;
    anchor.parentNode.insertBefore(panel,anchor);
    const saveCfg=()=>{d.active=modal.querySelector('#hfV138Active')?.checked!==false;d.smartDispatchMinute=hfV138ParseClock(modal.querySelector('#hfV138Time')?.value);d.smartScheduleDay=-1;d.smartSchedule=[];save(false);const body=modal.querySelector('#hfV138ScheduleBody');if(body)body.innerHTML=hfV138ScheduleMarkup(d)};
    modal.querySelector('#hfV138Active')?.addEventListener('change',saveCfg);
    modal.querySelector('#hfV138Time')?.addEventListener('change',saveCfg);
    modal.querySelector('#hfV138Replan')?.addEventListener('click',()=>{d.smartScheduleDay=-1;d.smartSchedule=[];const body=modal.querySelector('#hfV138ScheduleBody');if(body)body.innerHTML=hfV138ScheduleMarkup(d)});
  }

  (state.depots||[]).forEach(hfV138Ensure);

  // Prevent the legacy one-city-per-truck dispatcher from running at day rollover.
  const hfV138BaseFinishDay=finishDay;
  finishDay=function(){
    const depots=state.depots||[],active=depots.map(d=>d.active);
    depots.forEach(d=>d.active=false);
    let result;
    try{result=hfV138BaseFinishDay()}finally{depots.forEach((d,i)=>d.active=active[i])}
    return result;
  };

  // Run the new optimized tours at each depot's configured departure time.
  const hfV138BaseScheduled=runScheduledRoutesAtCurrentTime;
  runScheduledRoutesAtCurrentTime=function(){
    const base=hfV138BaseScheduled(),smart=hfV138RunAtCurrentTime();
    if(smart.trips)save(false);
    return {sent:hfV138Round((Number(base?.sent)||0)+smart.sent),blocked:(Number(base?.blocked)||0)+smart.blocked};
  };

  // Correct depot-specific vehicle accounting when a smart multi-stop tour returns.
  const hfV138BaseComplete=completeShipmentLeg;
  completeShipmentLeg=function(sh){
    if(!sh?.isDepotSmartTour)return hfV138BaseComplete(sh);
    const phaseBefore=sh.phase,type=sh.vehicleType,before=Number(state.usedVehicles?.[type])||0;
    const result=hfV138BaseComplete(sh);
    if(phaseBefore==='tour_return'&&sh.completed){
      state.usedVehicles[type]=before;
      const d=hfV138Depot(sh.depotId);
      if(d){
        d.usedVehicles[type]=Math.max(0,(Number(d.usedVehicles[type])||0)-1);
        const row=(d.smartSchedule||[]).find(x=>x.id===sh.smartPlanId);
        if(row)row.status='Erledigt';
      }
    }
    return result;
  };

  const hfV138BaseOpen=window.HF?.hfOpenDepot;
  if(hfV138BaseOpen)window.HF.hfOpenDepot=function(id){const r=hfV138BaseOpen(id);hfV138InjectDepotUI(id);return r};
  for(const name of ['hfSaveDepotConfig','hfDepotBuyVehicle','hfDepotSellVehicle']){
    const base=window.HF?.[name];if(!base)continue;
    window.HF[name]=function(id,...args){const r=base(id,...args);setTimeout(()=>hfV138InjectDepotUI(id),0);return r};
  }
  window.HF.hfRunDepotNow=function(id){
    const d=hfV138Depot(id);if(!d)return;
    d.smartLastRunDay=-1;const r=hfV138RunDepot(d,true);save(false);renderAll();
    toast(r.trips?`${r.trips} optimierte Rundfahrt${r.trips===1?'':'en'} mit ${formatWeight(r.sent)} gestartet.`:d.lastStatus,r.trips?'good':'bad');
    window.HF.hfOpenDepot(id);
  };

  if(!document.getElementById('hf-v138-style')){
    const style=document.createElement('style');style.id='hf-v138-style';style.textContent=`
      .hf-v138-controls{display:grid;grid-template-columns:minmax(0,180px) auto;gap:8px;align-items:end;margin:10px 0}.hf-v138-controls .field{margin:0}.hf-v138-auto{display:flex;align-items:center;gap:5px;font-size:9px;font-weight:900;color:#197457}.hf-v138-auto input{width:19px;height:19px;accent-color:#197457}.hf-v138-timetable{display:grid;gap:8px;margin-top:10px}.hf-v138-trip{display:grid;grid-template-columns:58px 52px minmax(0,1fr);gap:8px;align-items:center;padding:9px;border:1px solid #dce4de;border-radius:13px;background:#fff}.hf-v138-time{align-self:start;padding-top:2px}.hf-v138-time b{display:block;font-size:14px;color:#173d31}.hf-v138-time small{display:block;font-size:8px;color:#748078;margin-top:2px}.hf-v138-trip>.asset-route-vehicle{width:50px;height:38px;object-fit:contain}.hf-v138-trip-main{min-width:0}.hf-v138-route{font-size:10px;font-weight:850;color:#27473d;margin:3px 0;overflow-wrap:anywhere}.hf-v138-badges{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}.hf-v138-status{font-size:8px;font-weight:900;padding:3px 6px;border-radius:99px;background:#e8eee9;color:#526158}.hf-v138-status.live{background:#ddf5e8;color:#147548}.hf-v138-status.done{background:#dff0ff;color:#24658c}.hf-v138-status.blocked{background:#ffe6df;color:#a8442b}.hf-v138-status.planned{background:#fff3d2;color:#8c6517}@media(max-width:430px){.hf-v138-controls{grid-template-columns:1fr auto}.hf-v138-trip{grid-template-columns:50px 44px minmax(0,1fr);padding:8px}.hf-v138-trip>.asset-route-vehicle{width:42px;height:34px}}
    `;document.head.appendChild(style);
  }

  document.body.dataset.hfBuild=HF_V138_BUILD;
  document.body.dataset.hfSmartDepotTours='1';
  document.body.dataset.hfDepotTimetable='1';
  save(false);
})();


// --- v1.0.39: visible-panel recovery and safe local-file storage ---
(function(){
  document.body.dataset.hfBuild='1.0.40';
  document.body.dataset.hfSafeStorage='1';
  document.body.dataset.hfPanelRecovery='1';
  if(window.HF){
    window.HF.hfRepairView=function(){
      try{
        const root=document.getElementById('content');
        if(root){root.scrollTop=0;root.innerHTML=''}
        renderAll();
        setTimeout(()=>map?.invalidateSize({pan:false,animate:false}),30);
      }catch(err){
        console.error('Ansicht konnte nicht repariert werden',err);
        const root=document.getElementById('content');
        if(root)root.innerHTML='<section class="card"><h2>Neustart der Ansicht fehlgeschlagen</h2><p class="sub">Bitte die Datei vollständig schließen und erneut öffnen.</p></section>';
      }
    };
  }
  const ensureVisible=()=>{
    const root=document.getElementById('content');
    if(!root)return;
    root.style.visibility='visible';root.style.opacity='1';
    if(!root.children.length){try{renderAll()}catch(err){console.error(err)}}
  };
  requestAnimationFrame(ensureVisible);
  setTimeout(ensureVisible,250);
  window.addEventListener('resize',()=>{setTimeout(()=>map?.invalidateSize({pan:false,animate:false}),40)});
})();


// --- v1.0.40: hard clean start before any save is loaded ---
(function(){
  document.body.dataset.hfBuild='1.0.40';
  document.body.dataset.hfHardReset='1';
  state.cleanStartVersion='1.0.40';
  state.tab=['city','network','logistics','depot','company'].includes(state.tab)?state.tab:'city';
  if(!state.selected||!CITY[state.selected])state.selected='zurich';
  save(false);
  try{renderAll()}catch(err){
    console.error('v1.0.40 initial render failed',err);
    const root=document.getElementById('content');
    if(root)root.innerHTML='<section class="card"><h2>Ansicht konnte nicht gestartet werden</h2><p class="sub">Bitte die Datei schließen und erneut öffnen.</p><button class="btn danger full" onclick="window.HF.performReset()">Spielstand vollständig zurücksetzen</button></section>';
  }
  setTimeout(()=>map?.invalidateSize({pan:false,animate:false}),80);
})();


// --- v1.0.41: compact depot vehicle popup, exact daily consumption, Outlook-style timetable ---
(function(){
  const HF_V141_BUILD='1.0.41';
  document.body.dataset.hfBuild=HF_V141_BUILD;
  document.body.dataset.hfDepotCalendar='outlook';
  const hfV141PreviewCache=new Map();

  function hfV141Round(n){return typeof roundCargo==='function'?roundCargo(Number(n)||0):Math.round((Number(n)||0)*1000)/1000}
  function hfV141Clock(minute){minute=((Math.floor(Number(minute)||0)%1440)+1440)%1440;return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`}
  function hfV141ParseClock(value){const m=/^(\d{1,2}):(\d{2})$/.exec(value||'');return m?Math.max(0,Math.min(1439,Number(m[1])*60+Number(m[2]))):480}
  function hfV141Depot(id){return (state.depots||[]).find(d=>d.id===id)}
  function hfV141Inventory(d){return state.cities[d.id]?.inventory||{}}
  function hfV141RoadVehicles(){const order=typeof vehicleShopOrder==='function'?vehicleShopOrder():Object.keys(VEHICLES);return order.filter(type=>VEHICLES[type]?.mode==='road')}
  function hfV141FleetCount(d){return Object.values(d.fleet||{}).reduce((n,x)=>n+(Number(x)||0),0)}
  function hfV141FleetCapacity(d){return Object.entries(d.fleet||{}).reduce((n,[type,count])=>n+(VEHICLES[type]?.load||0)*(Number(count)||0),0)}
  function hfV141Used(d,type){return Number(d.usedVehicles?.[type])||0}

  // Determine the exact demand added by the currently active replenishDemand() rules.
  let hfV141DemandCacheKey='',hfV141DemandCache={};
  function hfV141DemandSignature(){return CITIES.map(c=>c.id+'|'+Object.entries(state.cities[c.id]?.demands||{}).sort(([a],[b])=>a.localeCompare(b)).map(([g,d])=>g+':'+Number(d.max||0)).join(',')).join(';')}
  function hfV141ActualDailyDemandMap(){
    const sig=hfV141DemandSignature();if(sig===hfV141DemandCacheKey)return hfV141DemandCache;
    const result={};
    for(const c of CITIES){
      result[c.id]={};
      for(const good of Object.keys(state.cities[c.id]?.demands||{}))result[c.id][good]=hfV141Round(hfDepotDailyNeed(c.id,good));
    }
    hfV141DemandCacheKey=sig;hfV141DemandCache=result;return result;
  }
  function hfV141SelectedConfig(d,modal){
    const cityInputs=[...modal.querySelectorAll('#hfDepotCities input:checked')],goodInputs=[...modal.querySelectorAll('#hfDepotGoods input:checked')];
    return {cities:cityInputs.length?cityInputs.map(x=>x.value):[...(d.cities||[])],goods:goodInputs.length?goodInputs.map(x=>x.value):[...(d.goods||[])]};
  }
  function hfV141DemandRows(d,modal){
    const cfg=hfV141SelectedConfig(d,modal),dailyMap=hfV141ActualDailyDemandMap(),inventory=hfV141Inventory(d),rows=[];
    for(const good of cfg.goods){let daily=0,current=0;for(const cityId of cfg.cities){daily+=Number(dailyMap?.[cityId]?.[good])||0;const city=state.cities[cityId],dem=city?.demands?.[good];if(dem)current+=Math.max(0,(Number(dem.need)||0)-(Number(city.inventory?.[good])||0))}rows.push({good,daily:hfV141Round(daily),current:hfV141Round(current),stock:Number(inventory[good])||0})}
    return rows;
  }
  function hfV141SummaryMarkup(d,modal){
    const rows=hfV141DemandRows(d,modal),total=rows.reduce((n,x)=>n+x.daily,0),stock=Object.values(hfV141Inventory(d)).reduce((n,x)=>n+(Number(x)||0),0),coverage=total?Math.min(999,Math.round(stock/total*100)):0;
    return `<div class="hf-depot-summary-grid"><div><span>Tatsächlicher Verbrauch</span><b>${formatWeight(total)}/Tag</b></div><div><span>Fahrzeugkapazität</span><b>${formatWeight(hfV141FleetCapacity(d))}/Tag</b></div><div><span>Lagerbestand</span><b>${formatWeight(stock)}</b></div><div><span>Lagerdeckung</span><b>${coverage}%</b></div></div>${rows.length?`<div class="hf-depot-demand-list">${rows.map(x=>`<div><span>${goodImg(x.good,'asset-img asset-xs')} ${GOODS[x.good]?.name||x.good}</span><b>${formatWeight(x.daily)}/Tag</b><small>tatsächlicher täglicher Verbrauch · aktuell offen ${formatWeight(x.current)} · Depotlager ${formatWeight(x.stock)}</small></div>`).join('')}</div>`:'<div class="empty">Noch keine Waren ausgewählt.</div>'}`;
  }
  function hfV141UpdateSummary(id){const d=hfV141Depot(id),modal=document.getElementById('modal'),root=modal?.querySelector('#hfDepotLiveSummary');if(d&&root)root.innerHTML=hfV141SummaryMarkup(d,modal)}

  function hfV141CloseVehiclePopup(){document.getElementById('hfV141VehiclePopup')?.remove()}
  function hfV141FleetSummary(d){const items=hfV141RoadVehicles().filter(type=>(d.fleet?.[type]||0)>0);return items.length?items.map(type=>`<span class="hf-v141-fleet-chip">${vehicleImg(type,'asset-img')}<b>${d.fleet[type]||0}×</b> ${VEHICLES[type]?.name||type}</span>`).join(''):'<span class="sub">Noch keine Depotfahrzeuge.</span>'}
  function hfV141CompactFleetPanel(id){
    const d=hfV141Depot(id),modal=document.getElementById('modal');if(!d||!modal)return;
    const heading=[...modal.querySelectorAll('.hf-depot-panel h3')].find(h=>h.textContent.includes('Depot-Fuhrpark'));
    const panel=heading?.closest('.hf-depot-panel');if(!panel)return;
    panel.id='hfV141FleetPanel';panel.innerHTML=`<div class="row"><div><h3 style="margin:0">Depot-Fuhrpark</h3><div class="sub">Fahrzeuge gehören ausschließlich zu diesem Depot.</div></div><span class="pill live">${hfV141FleetCount(d)} Fz.</span></div><div class="hf-v141-fleet-summary">${hfV141FleetSummary(d)}</div><button class="btn sm primary hf-v141-fleet-open" onclick="window.HF.hfOpenDepotVehiclePopup('${d.id}')">🚚 Fahrzeuge kaufen & verwalten</button>`;
  }
  window.HF.hfCloseDepotVehiclePopup=hfV141CloseVehiclePopup;
  window.HF.hfOpenDepotVehiclePopup=function(id){
    hfV141CloseVehiclePopup();const d=hfV141Depot(id);if(!d)return;
    const wrap=document.createElement('div');wrap.id='hfV141VehiclePopup';wrap.className='hf-v141-popup-backdrop';
    wrap.innerHTML=window.HF_MODAL_MARKUP.depotVehiclePopupMarkup(d,{roadVehicles:hfV141RoadVehicles,fleetCount:hfV141FleetCount,used:hfV141Used});
    wrap.addEventListener('click',e=>{if(e.target===wrap)hfV141CloseVehiclePopup()});document.body.appendChild(wrap);
  };
  window.HF.hfV141BuyDepotVehicle=function(id,type){hfV141CloseVehiclePopup();return window.HF.hfDepotBuyVehicle(id,type)};
  window.HF.hfV141SellDepotVehicle=function(id,type){hfV141CloseVehiclePopup();return window.HF.hfDepotSellVehicle(id,type)};

  function hfV141Shipment(row){return row.shipmentId?(state.shipments||[]).find(x=>x.id===row.shipmentId):null}
  function hfV141Status(row,preview){const sh=hfV141Shipment(row);if(preview)return row.status||'Vorschau';if(sh?.completed)return 'Erledigt';if(sh){if(sh.movementStatus==='moving')return 'Unterwegs';if(sh.movementStatus==='queued')return 'Wartet auf Straße';return sh.waitingReason||'Unterwegs'}return row.status||'Geplant'}
  function hfV141CompletedStops(row){const sh=hfV141Shipment(row);if(!sh)return 0;if(sh.completed||sh.phase==='tour_return'||sh.phase==='tour_waiting_return')return row.stops?.length||0;return Math.max(0,Math.min(row.stops?.length||0,Number(sh.tourStopIndex)||0))}
  function hfV141CargoSummary(cargo,max=3){const list=(cargo||[]).filter(x=>(Number(x.amount)||0)>.001);return list.slice(0,max).map(x=>`${formatGoodAmount(x.good,x.amount)} ${GOODS[x.good]?.name||x.good}`).join(' · ')+(list.length>max?` · +${list.length-max}`:'')}
  function hfV141StatusClass(status){return /Erledigt/.test(status)?'done':/Blockiert|fehlt|Keine/.test(status)?'blocked':/Unterwegs|Wartet/.test(status)?'live':'planned'}
  function hfV141ExtractPreview(panel){
    const rows=[...panel.querySelectorAll('.hf-v138-trip')].map((el,index)=>{
      const start=hfV141ParseClock(el.querySelector('.hf-v138-time b')?.textContent),endText=el.querySelector('.hf-v138-time small')?.textContent.match(/(\d{1,2}:\d{2})/)?.[1],end=hfV141ParseClock(endText||hfV141Clock(start+120));
      const route=(el.querySelector('.hf-v138-route')?.textContent||'').split('→').map(x=>x.replace(/🏬/g,'').trim()).filter(Boolean),stops=route.slice(1,-1).map(name=>({cityId:Object.keys(CITY).find(id=>CITY[id]?.name===name)||name,name}));
      return {id:'preview_'+index,startMinute:start,endMinute:end,vehicleType:null,vehicleLabel:el.querySelector('.hf-v138-trip-main .row b')?.textContent||`Fahrzeug ${index+1}`,vehicleHtml:el.querySelector(':scope > img')?.outerHTML||'',stops,cargoText:el.querySelector('.hf-v138-trip-main>.sub')?.textContent||'',status:'Vorschau'};
    });
    return rows;
  }
  function hfV141ScheduleRows(d,panel){
    const actual=d.smartScheduleDay===state.day&&Array.isArray(d.smartSchedule)&&d.smartSchedule.length;
    if(actual)return {rows:d.smartSchedule,preview:false};
    const parsed=hfV141ExtractPreview(panel);if(parsed.length)hfV141PreviewCache.set(d.id,parsed);
    return {rows:parsed.length?parsed:(hfV141PreviewCache.get(d.id)||[]),preview:true};
  }
  function hfV141LayoutEvents(rows){
    const sorted=rows.map((row,index)=>({row,index,start:Number(row.startMinute)||0,end:Math.max((Number(row.startMinute)||0)+30,Number(row.endMinute)||0)})).sort((a,b)=>a.start-b.start||a.end-b.end);let i=0;
    while(i<sorted.length){const group=[sorted[i]];let groupEnd=sorted[i].end,j=i+1;while(j<sorted.length&&sorted[j].start<groupEnd){group.push(sorted[j]);groupEnd=Math.max(groupEnd,sorted[j].end);j++}const laneEnds=[];for(const e of group){let lane=laneEnds.findIndex(end=>end<=e.start);if(lane<0){lane=laneEnds.length;laneEnds.push(e.end)}else laneEnds[lane]=e.end;e.lane=lane}for(const e of group)e.lanes=Math.max(1,laneEnds.length);i=j}return sorted;
  }
  function hfV141CalendarMarkup(d,panel){
    const {rows,preview}=hfV141ScheduleRows(d,panel),defaultStart=Math.max(0,Math.floor((Number(d.smartDispatchMinute)||480)/60)*60-60),minEvent=rows.length?Math.min(...rows.map(r=>Number(r.startMinute)||defaultStart)):defaultStart,maxEvent=rows.length?Math.max(...rows.map(r=>Number(r.endMinute)||minEvent+180)):defaultStart+600,rangeStart=Math.max(0,Math.floor((minEvent-45)/60)*60),rangeEnd=Math.min(1440,Math.max(rangeStart+480,Math.ceil((maxEvent+45)/60)*60)),pxPerMinute=.82,height=Math.max(420,(rangeEnd-rangeStart)*pxPerMinute),hours=[];for(let m=rangeStart;m<=rangeEnd;m+=60)hours.push(m);const current=minuteOfDay(),nowVisible=current>=rangeStart&&current<=rangeEnd;
    const entries=hfV141LayoutEvents(rows).map(({row,index,start,end,lane,lanes})=>{const status=hfV141Status(row,preview),cls=hfV141StatusClass(status),done=hfV141CompletedStops(row),top=(start-rangeStart)*pxPerMinute,left=(lane/lanes)*100,width=100/lanes,stops=(row.stops||[]).map((s,i)=>`<span class="hf-v141-calendar-stop ${i<done?'done':''}">${i<done?'✓ ':''}${s.name||CITY[s.cityId]?.name||s.cityId}</span>`).join(''),vehicle=row.vehicleHtml||vehicleImg(row.vehicleType,'asset-img');return `<article class="hf-v141-calendar-event ${cls}" style="top:${top}px;height:${Math.max(76,(end-start)*pxPerMinute-4)}px;left:calc(${left}% + 4px);width:calc(${width}% - 8px)"><div class="hf-v141-calendar-event-head"><b>${hfV141Clock(start)}–${hfV141Clock(end)}</b><span>${status}</span></div><div class="hf-v141-calendar-title">${vehicle}<strong>${row.vehicleLabel||`${VEHICLES[row.vehicleType]?.name||row.vehicleType} ${row.vehicleNo||index+1}`}</strong></div><div class="hf-v141-calendar-stops">${stops}</div><div class="hf-v141-calendar-cargo">${row.cargoText||hfV141CargoSummary(row.cargo,3)}</div>${row.reason?`<div class="hf-v141-calendar-reason">${row.reason}</div>`:''}</article>`}).join('');
    return `<div class="hf-v141-calendar-legend"><span><i class="planned"></i>Geplant</span><span><i class="live"></i>Unterwegs</span><span><i class="done"></i>Erledigt</span><span><i class="blocked"></i>Blockiert</span></div><div class="hf-v141-calendar-scroll"><div class="hf-v141-calendar" style="height:${height}px"><div class="hf-v141-calendar-times">${hours.map(m=>`<span style="top:${(m-rangeStart)*pxPerMinute}px">${hfV141Clock(m)}</span>`).join('')}</div><div class="hf-v141-calendar-board">${hours.map(m=>`<i class="hf-v141-hour-line" style="top:${(m-rangeStart)*pxPerMinute}px"></i>`).join('')}${nowVisible?`<i class="hf-v141-now-line" style="top:${(current-rangeStart)*pxPerMinute}px"><b>${hfV141Clock(current)}</b></i>`:''}${entries||`<div class="hf-v141-calendar-empty"><b>Keine Termine geplant</b><span>Der Kalender bleibt sichtbar. Sobald Bedarf, Waren und freie Fahrzeuge vorhanden sind, erscheinen hier die Rundfahrten.</span></div>`}</div></div></div>`;
  }
  function hfV141EnsureCalendarPanel(id){
    const d=hfV141Depot(id),modal=document.getElementById('modal');if(!d||!modal)return null;let panel=modal.querySelector('#hfV138SchedulePanel');
    if(!panel){panel=document.createElement('section');panel.id='hfV138SchedulePanel';panel.className='hf-depot-panel';panel.innerHTML=`<div class="row"><div><h3 style="margin:0">Tagesfahrplan</h3><div class="sub">Outlook-Ansicht für alle Depotfahrzeuge.</div></div><label class="hf-v138-auto"><input type="checkbox" id="hfV138Active" ${d.active?'checked':''}><span>AUTO</span></label></div><div class="hf-v138-controls"><div class="field"><label>Täglicher Start</label><input type="time" id="hfV138Time" value="${hfV141Clock(d.smartDispatchMinute||480)}"></div><button class="btn sm secondary" id="hfV138Replan">Fahrplan neu berechnen</button></div><div id="hfV138ScheduleBody"></div>`;const first=modal.querySelector('.hf-depot-panel');(first?.parentNode||modal).insertBefore(panel,first||modal.querySelector('.modal-actions'));panel.querySelector('#hfV138Active')?.addEventListener('change',e=>{d.active=e.target.checked;d.smartScheduleDay=-1;d.smartSchedule=[];save(false);hfV141RenderCalendar(id)});panel.querySelector('#hfV138Time')?.addEventListener('change',e=>{d.smartDispatchMinute=hfV141ParseClock(e.target.value);d.smartScheduleDay=-1;d.smartSchedule=[];hfV141PreviewCache.delete(id);save(false);hfV141RenderCalendar(id)});panel.querySelector('#hfV138Replan')?.addEventListener('click',()=>{d.smartScheduleDay=-1;d.smartSchedule=[];hfV141PreviewCache.delete(id);save(false);hfV141RenderCalendar(id)})}
    return panel;
  }
  function hfV141RenderCalendar(id){const d=hfV141Depot(id),panel=hfV141EnsureCalendarPanel(id),body=panel?.querySelector('#hfV138ScheduleBody');if(d&&body)body.innerHTML=hfV141CalendarMarkup(d,panel)}
  function hfV141EnhanceDepot(id){
    const d=hfV141Depot(id),modal=document.getElementById('modal');if(!d||!modal)return;const panel=hfV141EnsureCalendarPanel(id);if(panel){panel.dataset.depotId=id;panel.classList.add('hf-v141-calendar-panel');const h3=panel.querySelector('h3');if(h3)h3.textContent='Tagesfahrplan';const sub=h3?.parentElement?.querySelector('.sub');if(sub)sub.textContent='Outlook-Ansicht für alle Depotfahrzeuge. Jeder Halt wird grün, sobald er erledigt ist.';const first=modal.querySelector('.hf-depot-panel');if(first&&first!==panel)first.parentNode.insertBefore(panel,first);hfV141RenderCalendar(id);panel.querySelector('#hfV138Replan')?.addEventListener('click',()=>setTimeout(()=>hfV141RenderCalendar(id),0),{once:false});panel.querySelector('#hfV138Time')?.addEventListener('change',()=>setTimeout(()=>hfV141RenderCalendar(id),0),{once:false})}
    hfV141CompactFleetPanel(id);const goodsSub=[...modal.querySelectorAll('.hf-depot-panel .sub')].find(el=>el.textContent.includes('tägliche Gesamtbedarf'));if(goodsSub)goodsSub.textContent='Der tatsächliche tägliche Verbrauch der ausgewählten Städte wird automatisch berechnet.';hfV141UpdateSummary(id);if(!modal.dataset.hfV141Bound){modal.dataset.hfV141Bound='1';modal.addEventListener('change',e=>{if(e.target.matches('#hfDepotCities input,#hfDepotGoods input'))requestAnimationFrame(()=>hfV141UpdateSummary(id))})}
  }
  function hfV141RefreshOpenCalendar(){const panel=document.querySelector('#hfV138SchedulePanel[data-depot-id]');if(panel)hfV141RenderCalendar(panel.dataset.depotId)}

  const hfV141BaseOpen=window.HF?.hfOpenDepot;if(hfV141BaseOpen)window.HF.hfOpenDepot=function(id){const r=hfV141BaseOpen(id);requestAnimationFrame(()=>hfV141EnhanceDepot(id));return r};
  for(const name of ['hfSaveDepotConfig','hfDepotBuyVehicle','hfDepotSellVehicle']){const base=window.HF?.[name];if(!base)continue;window.HF[name]=function(id,...args){hfV141CloseVehiclePopup();const r=base(id,...args);setTimeout(()=>hfV141EnhanceDepot(id),0);return r}}
  const hfV141BaseBuildDepot=window.HF?.hfBuildDepot;if(hfV141BaseBuildDepot)window.HF.hfBuildDepot=function(...args){const r=hfV141BaseBuildDepot(...args);setTimeout(()=>{const d=(state.depots||[]).at(-1);if(d)hfV141EnhanceDepot(d.id)},120);return r};
  const hfV141BaseRefresh=refreshLiveTimeUi;refreshLiveTimeUi=function(...args){const r=hfV141BaseRefresh(...args);hfV141RefreshOpenCalendar();return r};

  if(!document.getElementById('hf-v141-style')){const style=document.createElement('style');style.id='hf-v141-style';style.textContent=`
    .hf-v141-fleet-summary{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.hf-v141-fleet-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 8px;border:1px solid #d8e0da;border-radius:11px;background:#fff;font-size:9px}.hf-v141-fleet-chip img{width:32px;height:24px;object-fit:contain}.hf-v141-fleet-open{width:100%}
    .hf-v141-popup-backdrop{position:fixed;inset:0;z-index:15000;background:rgba(12,29,24,.38);display:grid;place-items:center;padding:14px}.hf-v141-popup{width:min(520px,96vw);max-height:min(650px,86vh);overflow:hidden;border-radius:18px;background:#f8faf7;box-shadow:0 22px 70px rgba(0,0,0,.28);border:1px solid #d5ded7;display:flex;flex-direction:column}.hf-v141-popup-head{padding:12px 14px;border-bottom:1px solid #dbe2dc;background:#fff}.hf-v141-popup-list{padding:9px;overflow:auto;display:grid;gap:7px}.hf-v141-popup-vehicle{display:grid;grid-template-columns:74px minmax(0,1fr);gap:9px;align-items:center;padding:8px;border:1px solid #dbe2dc;border-radius:13px;background:#fff}.hf-v141-popup-vehicle>img{width:70px;height:54px;object-fit:contain}.hf-v141-popup-vehicle-main{min-width:0}.hf-v141-popup-actions{display:flex;gap:6px;margin-top:7px}.hf-v141-popup-actions .btn{flex:1}
    .hf-v141-calendar-panel{background:#f5f8f5!important;border-color:#cdd9d0!important}.hf-v141-calendar-legend{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 6px;font-size:8px;font-weight:850;color:#64736a}.hf-v141-calendar-legend span{display:flex;align-items:center;gap:4px}.hf-v141-calendar-legend i{width:9px;height:9px;border-radius:3px;background:#dceafb}.hf-v141-calendar-legend i.live{background:#f8d79a}.hf-v141-calendar-legend i.done{background:#86d1a2}.hf-v141-calendar-legend i.blocked{background:#efb0a2}.hf-v141-calendar-scroll{max-height:510px;overflow:auto;border:1px solid #d5ddd7;border-radius:13px;background:#fff}.hf-v141-calendar{display:grid;grid-template-columns:50px minmax(0,1fr);position:relative;min-width:0}.hf-v141-calendar-times{position:relative;border-right:1px solid #dce3dd;background:#f8faf8}.hf-v141-calendar-times span{position:absolute;right:7px;transform:translateY(-50%);font-size:8px;font-weight:800;color:#6d7b72}.hf-v141-calendar-board{position:relative;min-width:0;background:repeating-linear-gradient(90deg,transparent,transparent 24.8%,rgba(213,222,216,.22) 25%,transparent 25.2%)}.hf-v141-hour-line{position:absolute;left:0;right:0;border-top:1px solid #e2e8e3}.hf-v141-now-line{position:absolute;left:0;right:0;border-top:2px solid #d84c3f;z-index:9}.hf-v141-now-line b{position:absolute;right:4px;top:-9px;background:#d84c3f;color:#fff;border-radius:7px;padding:1px 5px;font-size:7px}.hf-v141-calendar-event{position:absolute;z-index:3;padding:7px 8px;border-radius:9px;border-left:4px solid #4a84c4;background:#eaf3fc;box-shadow:0 1px 4px rgba(28,60,48,.12);overflow:hidden;color:#203f35}.hf-v141-calendar-event.live{border-left-color:#d99121;background:#fff2d9}.hf-v141-calendar-event.done{border-left-color:#218955;background:#dff5e7}.hf-v141-calendar-event.blocked{border-left-color:#bd4c34;background:#fde8e2}.hf-v141-calendar-event-head{display:flex;justify-content:space-between;gap:5px;font-size:8px}.hf-v141-calendar-event-head b{font-size:9px}.hf-v141-calendar-event-head span{font-weight:900;text-transform:uppercase}.hf-v141-calendar-title{display:flex;align-items:center;gap:5px;margin-top:3px;font-size:10px}.hf-v141-calendar-title img{width:30px;height:22px;object-fit:contain}.hf-v141-calendar-stops{display:flex;flex-wrap:wrap;gap:3px;margin-top:4px}.hf-v141-calendar-stop{font-size:7px;font-weight:850;padding:2px 5px;border-radius:99px;background:rgba(255,255,255,.75);border:1px solid rgba(65,94,79,.18)}.hf-v141-calendar-stop.done{background:#2c9a61;color:#fff;border-color:#2c9a61}.hf-v141-calendar-cargo{margin-top:4px;font-size:7px;color:#59695f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hf-v141-calendar-reason{font-size:7px;color:#9d3d29;margin-top:3px}.hf-v141-calendar-empty{position:absolute;inset:70px 20px auto;display:grid;gap:5px;text-align:center;color:#6f7d74}.hf-v141-calendar-empty b{font-size:12px}.hf-v141-calendar-empty span{font-size:9px}
    @media(max-width:430px){.hf-v141-popup-backdrop{padding:8px}.hf-v141-popup{width:98vw;max-height:90vh}.hf-v141-popup-vehicle{grid-template-columns:62px minmax(0,1fr)}.hf-v141-popup-vehicle>img{width:58px;height:44px}.hf-v141-popup-actions{flex-direction:column}.hf-v141-calendar-scroll{max-height:450px}.hf-v141-calendar{grid-template-columns:42px minmax(0,1fr)}.hf-v141-calendar-event{padding:6px}.hf-v141-calendar-title strong{font-size:8px}.hf-v141-calendar-cargo{display:none}}
  `;document.head.appendChild(style)}
  save(false);
})();


// --- v1.0.42: unified depot dispatch window, exact procurement demand, mixed multi-trip orders ---
(function(){
  const HF_V142_BUILD='1.0.43';
  document.body.dataset.hfBuild=HF_V142_BUILD;
  document.body.dataset.hfUnifiedDepotDispatch='1';
  document.body.dataset.hfMixedAutoOrders='1';

  function hfV142Round(n){return typeof roundCargo==='function'?roundCargo(Number(n)||0):Math.round((Number(n)||0)*1000)/1000}
  function hfV142Clock(minute){minute=Math.max(0,Math.floor(Number(minute)||0));return `${String(Math.floor((minute%1440)/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`}
  function hfV142ParseClock(value){const m=/^(\d{1,2}):(\d{2})$/.exec(String(value||''));return m?Math.max(0,Math.min(1439,Number(m[1])*60+Number(m[2]))):480}
  function hfV142Depot(id){return (state.depots||[]).find(d=>d.id===id)}
  function hfV142Inventory(d){state.cities[d.id]=state.cities[d.id]||{unlocked:false,isDepot:true,inventory:{},demands:{},facilities:[],sales:0};return state.cities[d.id].inventory=state.cities[d.id].inventory||{}}
  function hfV142RoadTypes(){return Object.keys(VEHICLES).filter(type=>VEHICLES[type]?.mode==='road')}
  function hfV142Free(type){return typeof manualVehicleAvailable==='function'?Math.max(0,manualVehicleAvailable(type)):Math.max(0,(Number(state.fleet?.[type])||0)-(Number(state.usedVehicles?.[type])||0))}
  function hfV142CargoTotal(cargo){return hfV142Round((cargo||[]).reduce((n,x)=>n+(Number(x.amount)||0),0))}
  function hfV142CargoText(cargo,max=4){const list=(cargo||[]).filter(x=>(Number(x.amount)||0)>.001);return list.slice(0,max).map(x=>`${formatGoodAmount(x.good,x.amount)} ${GOODS[x.good]?.name||x.good}`).join(' · ')+(list.length>max?` · +${list.length-max}`:'')}

  // Simulate the same replenishDemand() pass that actually runs at the day change.
  let hfV142DemandSignature='',hfV142DemandCache={};
  function hfV142DemandKey(){return CITIES.map(c=>c.id+'|'+Object.entries(state.cities[c.id]?.demands||{}).sort(([a],[b])=>a.localeCompare(b)).map(([g,d])=>`${g}:${Number(d.max)||0}`).join(',')).join(';')}
  function hfV142DailyDemandMap(){
    const key=hfV142DemandKey();if(key===hfV142DemandSignature)return hfV142DemandCache;
    const result={};
    for(const c of CITIES){
      result[c.id]={};
      for(const good of Object.keys(state.cities[c.id]?.demands||{}))result[c.id][good]=hfV142Round(hfDepotDailyNeed(c.id,good));
    }
    hfV142DemandSignature=key;hfV142DemandCache=result;return result;
  }
  function hfV142DailyForDepot(d,good){const map=hfV142DailyDemandMap();return hfV142Round((d.cities||[]).reduce((n,cityId)=>n+(Number(map?.[cityId]?.[good])||0),0))}

  function hfV142EnsureOrder(d){
    const cfg=d.autoOrder&&typeof d.autoOrder==='object'?d.autoOrder:{};
    cfg.active=cfg.active===true;
    cfg.departureMinute=Math.max(0,Math.min(1439,Number.isFinite(+cfg.departureMinute)?Math.round(+cfg.departureMinute):480));
    cfg.targetDays=Math.max(1,Math.min(7,Number.isFinite(+cfg.targetDays)?Math.round(+cfg.targetDays):2));
    cfg.maxTrips=Math.max(1,Math.min(20,Number.isFinite(+cfg.maxTrips)?Math.round(+cfg.maxTrips):4));
    cfg.lastStatus=String(cfg.lastStatus||'Automatische Bestellung nicht aktiviert');
    d.autoOrder=cfg;
    d.autoOrderScheduleDay=Number.isFinite(+d.autoOrderScheduleDay)?+d.autoOrderScheduleDay:-1;
    d.autoOrderSchedule=Array.isArray(d.autoOrderSchedule)?d.autoOrderSchedule:[];
    return cfg;
  }
  (state.depots||[]).forEach(hfV142EnsureOrder);

  function hfV142FacilityProduces(cityId,good){
    const s=state.cities[cityId];if(!s?.unlocked||s.isDepot)return false;
    return (s.facilities||[]).some(fid=>{const f=FACILITIES[fid];if(!f)return false;if((Number(f.output?.[good])||0)>0)return true;return fid==='foodfactory'&&['ravioli_meat','ravioli_veg','tomato_cans','food'].includes(good)});
  }
  function hfV142Incoming(d,good){
    let total=0;
    for(const sh of state.shipments||[]){
      if(sh.completed||sh.destination!==d.id||['return','tour_return'].includes(sh.phase))continue;
      const cargo=Array.isArray(sh.cargo)&&sh.cargo.length?sh.cargo:(sh.good?[{good:sh.good,amount:sh.amount||0}]:[]);
      for(const item of cargo)if(item.good===good)total+=Number(item.amount)||0;
    }
    if(d.autoOrderScheduleDay===state.day)for(const job of d.autoOrderSchedule||[]){
      if(job.shipmentId||!['Geplant','Wartet'].includes(job.status))continue;
      for(const item of job.cargo||[])if(item.good===good)total+=Number(item.amount)||0;
    }
    return hfV142Round(total);
  }
  function hfV142OrderTasks(d,includePlanned=true){
    const cfg=hfV142EnsureOrder(d),inv=hfV142Inventory(d),tasks=[];
    for(const good of d.goods||[]){
      if(!GOODS[good])continue;
      const daily=hfV142DailyForDepot(d,good),target=hfV142Round(daily*cfg.targetDays),stock=Number(inv[good])||0,incoming=includePlanned?hfV142Incoming(d,good):0,missing=hfV142Round(Math.max(0,target-stock-incoming));
      if(target>.001)tasks.push({good,daily,target,stock,incoming,missing,coverage:(stock+incoming)/Math.max(.001,target)});
    }
    return tasks.sort((a,b)=>a.coverage-b.coverage||b.missing-a.missing);
  }
  function hfV142Sources(d,tasks){
    return CITIES.filter(c=>!c.isDepot&&state.cities[c.id]?.unlocked&&tasks.some(t=>t.missing>.001&&hfV142FacilityProduces(c.id,t.good)&&hfV117AvailableForExport(c.id,t.good)>.001));
  }
  function hfV142BuildOrderPlan(d,startMinute=null){
    const cfg=hfV142EnsureOrder(d),tasks=hfV142OrderTasks(d,false).map(x=>({...x})),sources=hfV142Sources(d,tasks),virtualStock={};
    for(const c of sources){virtualStock[c.id]={};for(const good of Object.keys(state.cities[c.id]?.inventory||{}))virtualStock[c.id][good]=hfV117AvailableForExport(c.id,good)}
    const slots=[];
    const baseStart=Math.max(0,Math.min(1439,startMinute==null?cfg.departureMinute:Number(startMinute)||0));
    for(const type of hfV142RoadTypes())for(let i=0;i<hfV142Free(type);i++)slots.push({type,no:i+1,available:baseStart});
    const jobs=[];
    for(let tripNo=0;tripNo<cfg.maxTrips;tripNo++){
      let best=null;
      for(const slot of slots){
        if(slot.available>=1435)continue;
        const v=VEHICLES[slot.type];if(!v)continue;
        for(const source of sources){
          let out,back;try{out=findPath(source.id,d.id,slot.type);back=findPath(d.id,source.id,slot.type)}catch(_){out=null;back=null}
          if(!out||!back)continue;
          let remaining=Number(v.load)||0;const cargo=[];
          const candidates=tasks.filter(t=>t.missing>.001&&(Number(virtualStock[source.id]?.[t.good])||0)>.001&&hfV142FacilityProduces(source.id,t.good)&&vehicleCanCarryGood(slot.type,t.good)).sort((a,b)=>a.coverage-b.coverage||b.missing-a.missing);
          for(const task of candidates){if(remaining<=.001)break;const amount=hfV142Round(Math.min(remaining,task.missing,Number(virtualStock[source.id][task.good])||0));if(amount>.001){cargo.push({good:task.good,amount});remaining=hfV142Round(remaining-amount)}}
          const load=hfV142CargoTotal(cargo);if(load<=.001)continue;
          const cost=Number(transportCost(out,slot.type,1))||0,outMin=Math.max(1,Math.round((Number(out.timeHours)||0)*60)),backMin=Math.max(1,Math.round((Number(back.timeHours)||0)*60)),fill=load/Math.max(1,Number(v.load)||1),priority=cargo.reduce((n,item)=>{const t=tasks.find(x=>x.good===item.good);return n+(1-Math.min(1,t?.coverage||0))*item.amount},0)/Math.max(1,load),score=fill*900+priority*280-(cost/Math.max(1,load))*8-outMin*.08-slot.available*.002;
          if(!best||score>best.score)best={slot,source:source.id,type:slot.type,cargo,load,cost,outMin,backMin,score};
        }
      }
      if(!best)break;
      const start=best.slot.available,arrival=start+best.outMin,returnMinute=arrival+best.backMin;
      const job={id:`ao42_${state.day}_${Date.now().toString(36)}_${tripNo}_${Math.random().toString(36).slice(2,6)}`,day:state.day,startMinute:start,arrivalMinute:arrival,returnMinute,source:best.source,depotId:d.id,vehicleType:best.type,vehicleNo:best.slot.no,cargo:best.cargo.map(x=>({...x})),cost:Math.round(best.cost),status:'Geplant',shipmentId:null,actualArrivalMinute:null,reason:''};
      jobs.push(job);best.slot.available=returnMinute+10;
      for(const item of best.cargo){virtualStock[best.source][item.good]=hfV142Round((Number(virtualStock[best.source][item.good])||0)-item.amount);const task=tasks.find(x=>x.good===item.good);if(task){task.missing=hfV142Round(Math.max(0,task.missing-item.amount));task.incoming=hfV142Round(task.incoming+item.amount);task.coverage=(task.stock+task.incoming)/Math.max(.001,task.target)}}
    }
    return {jobs,tasks,remaining:hfV142Round(tasks.reduce((n,t)=>n+Math.max(0,t.missing),0))};
  }
  function hfV142PlanOrders(d,startMinute=null,force=false){
    const cfg=hfV142EnsureOrder(d),start=startMinute==null?cfg.departureMinute:startMinute;
    if(!force&&d.autoOrderScheduleDay===state.day)return d.autoOrderSchedule||[];
    const plan=hfV142BuildOrderPlan(d,start);d.autoOrderScheduleDay=state.day;d.autoOrderSchedule=plan.jobs;
    cfg.lastStatus=plan.jobs.length?`${plan.jobs.length} Abholfahrt${plan.jobs.length===1?'':'en'} geplant · ${formatWeight(plan.jobs.reduce((n,j)=>n+hfV142CargoTotal(j.cargo),0))}${plan.remaining>.001?' · '+formatWeight(plan.remaining)+' noch offen':''}`:(plan.remaining>.001?'Bestellung blockiert: Produktionsbestand, Fahrzeug oder Straße fehlt':'Zielbestand bereits erreicht');
    save(false);return d.autoOrderSchedule;
  }
  function hfV142DispatchJob(d,job){
    if(job.shipmentId||['Unterwegs','Eingetroffen','Erledigt','Blockiert'].includes(job.status))return {sent:0,blocked:0};
    const v=VEHICLES[job.vehicleType];if(!v){job.status='Blockiert';job.reason='Fahrzeugtyp fehlt';return {sent:0,blocked:1}}
    if(hfV142Free(job.vehicleType)<1){job.status='Wartet';job.reason='Fahrzeug noch nicht frei';return {sent:0,blocked:0}}
    let route;try{route=findPath(job.source,d.id,job.vehicleType)}catch(_){route=null}
    if(!route){job.status='Blockiert';job.reason='Keine passende Straßenverbindung';return {sent:0,blocked:1}}
    const sourceInv=state.cities[job.source]?.inventory||{},cargo=[];let capacity=Number(v.load)||0;
    for(const item of job.cargo||[]){if(capacity<=.001)break;const amount=hfV142Round(Math.min(capacity,Number(item.amount)||0,hfV117AvailableForExport(job.source,item.good)));if(amount>.001&&vehicleCanCarryGood(job.vehicleType,item.good)){cargo.push({good:item.good,amount});capacity=hfV142Round(capacity-amount)}}
    const total=hfV142CargoTotal(cargo);if(total<=.001){job.status='Blockiert';job.reason='Ware am Produktionsort nicht mehr verfügbar';return {sent:0,blocked:1}}
    const cost=Number(transportCost(route,job.vehicleType,1))||0;if(state.cash<cost){job.status='Wartet';job.reason='Zu wenig Kapital für die Fahrt';return {sent:0,blocked:0}}
    for(const item of cargo)sourceInv[item.good]=hfV142Round((Number(sourceInv[item.good])||0)-item.amount);
    state.cash-=cost;state.usedVehicles=state.usedVehicles||{};state.usedVehicles[job.vehicleType]=(Number(state.usedVehicles[job.vehicleType])||0)+1;
    const mins=Math.max(1,Math.round((Number(route.timeHours)||0)*60)),id='ao42s'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    state.shipments.push({id,home:job.source,destination:d.id,from:job.source,to:d.id,good:cargo[0].good,amount:total,cargo,remainingMinutes:mins,totalMinutes:mins,path:route.path,edgeIds:(route.edges||[]).map(e=>e.id),vehicleType:job.vehicleType,trips:1,phase:'outbound',returnPolicy:'empty',returnCargo:[],returnGood:null,returnAmount:0,waitingReason:'Automatische Mischbestellung wartet auf freie Einfahrt',movementStatus:'queued',currentEdgeIndex:0,currentNode:job.source,edgeRemainingMinutes:0,edgeTotalMinutes:0,isDepotSupply:true,isAutoFacilityOrder:true,isAutoOrderMixed:true,depotId:d.id,autoOrderJobId:job.id});
    job.shipmentId=id;job.status='Unterwegs';job.reason='';job.cargo=cargo;return {sent:total,blocked:0};
  }
  function hfV142RunOrders(){
    const now=minuteOfDay();let sent=0,blocked=0,trips=0;
    for(const d of state.depots||[]){
      const cfg=hfV142EnsureOrder(d);if(!cfg.active)continue;
      if(d.autoOrderScheduleDay!==state.day&&now>=cfg.departureMinute)hfV142PlanOrders(d,Math.max(now,cfg.departureMinute),false);
      if(d.autoOrderScheduleDay!==state.day)continue;
      for(const job of d.autoOrderSchedule||[]){if(job.shipmentId||!['Geplant','Wartet'].includes(job.status)||now<job.startMinute)continue;const r=hfV142DispatchJob(d,job);sent+=r.sent;blocked+=r.blocked;if(r.sent)trips++}
      if(trips||blocked)save(false);
    }
    return {sent:hfV142Round(sent),blocked,trips};
  }

  // Suppress the legacy one-good auto-order runner and run the mixed planner instead.
  const hfV142BaseScheduled=runScheduledRoutesAtCurrentTime;
  runScheduledRoutesAtCurrentTime=function(){
    const states=(state.depots||[]).map(d=>{const cfg=hfV142EnsureOrder(d),active=cfg.active;cfg.active=false;return [cfg,active]});let base;
    try{base=hfV142BaseScheduled()}finally{for(const [cfg,active] of states)cfg.active=active}
    const orders=hfV142RunOrders();return {sent:hfV142Round((Number(base?.sent)||0)+orders.sent),blocked:(Number(base?.blocked)||0)+orders.blocked};
  };

  // Deliver every cargo line of a mixed procurement trip, then return the vehicle.
  const hfV142BaseComplete=completeShipmentLeg;
  completeShipmentLeg=function(sh){
    if(!sh?.isAutoOrderMixed)return hfV142BaseComplete(sh);
    const d=hfV142Depot(sh.depotId),job=d?.autoOrderSchedule?.find(x=>x.id===sh.autoOrderJobId);
    if(sh.phase==='outbound'){
      const inv=state.cities[sh.destination].inventory=state.cities[sh.destination].inventory||{};
      for(const item of sh.cargo||[])inv[item.good]=hfV142Round((Number(inv[item.good])||0)+(Number(item.amount)||0));
      if(job){job.status='Eingetroffen';job.actualArrivalMinute=minuteOfDay()}
      sh.from=sh.destination;sh.to=sh.home;sh.phase='awaiting_return';sh.movementStatus='waiting_return';sh.currentNode=sh.destination;sh.remainingMinutes=0;sh.totalMinutes=0;sh.path=[sh.destination];sh.edgeIds=[];sh.currentEdgeIndex=0;sh.waitingReason='Rückfahrt wird vorbereitet';tryStartReturn(sh);return false;
    }
    state.usedVehicles[sh.vehicleType]=Math.max(0,(Number(state.usedVehicles[sh.vehicleType])||0)-(sh.trips||1));sh.completed=true;if(job)job.status='Erledigt';return true;
  };

  function hfV142ReadOrderInputs(d,modal){
    const cfg=hfV142EnsureOrder(d),active=modal.querySelector('#hfV136AutoOrderActive'),time=modal.querySelector('#hfV136AutoOrderTime'),days=modal.querySelector('#hfV136TargetDays'),trips=modal.querySelector('#hfV136MaxTrips');
    if(active)cfg.active=active.checked;if(time)cfg.departureMinute=hfV142ParseClock(time.value);if(days)cfg.targetDays=Math.max(1,Math.min(7,Number(days.value)||2));if(trips)cfg.maxTrips=Math.max(1,Math.min(20,Number(trips.value)||4));
    d.autoOrderScheduleDay=-1;d.autoOrderSchedule=[];save(false);
  }
  function hfV142OrderRows(d){
    const cfg=hfV142EnsureOrder(d),inv=hfV142Inventory(d),tasks=hfV142OrderTasks(d,true);
    return tasks.length?`<div class="hf-v142-demand-rows">${tasks.map(t=>`<div><span>${goodImg(t.good,'asset-img asset-xs')}<b>${GOODS[t.good]?.name||t.good}</b></span><strong>${formatGoodAmount(t.good,t.daily)}/Tag</strong><small>tatsächlicher Verbrauch · Ziel ${formatGoodAmount(t.good,t.target)} · Lager ${formatGoodAmount(t.good,Number(inv[t.good])||0)} · unterwegs/geplant ${formatGoodAmount(t.good,t.incoming)}</small></div>`).join('')}</div>`:'<div class="empty">Wähle zuerst Waren und Städte für dieses Depot aus.</div>';
  }
  function hfV142ScheduleJobs(d,preview=false){
    const cfg=hfV142EnsureOrder(d),actual=d.autoOrderScheduleDay===state.day&&Array.isArray(d.autoOrderSchedule),jobs=actual?d.autoOrderSchedule:hfV142BuildOrderPlan(d,cfg.departureMinute).jobs;
    if(!jobs.length)return '<div class="empty">Keine Abholfahrt erforderlich oder noch nicht möglich.</div>';
    return `<div class="hf-v142-arrivals">${jobs.map(job=>{const status=preview||!actual?'Vorschau':job.status,cls=/Erledigt|Eingetroffen/.test(status)?'done':/Blockiert/.test(status)?'blocked':/Unterwegs|Wartet/.test(status)?'live':'planned';return `<article class="${cls}"><div class="hf-v142-arrival-time"><b>${hfV142Clock(job.startMinute)}</b><span>Abfahrt</span><i>→</i><b>${hfV142Clock(job.arrivalMinute)}</b><span>Ankunft Depot</span></div><div class="hf-v142-arrival-main"><div class="row"><strong>${CITY[job.source]?.name||job.source} → ${d.name}</strong><span class="pill ${cls==='done'?'live':''}">${status}</span></div><div class="sub">${VEHICLES[job.vehicleType]?.name||job.vehicleType} ${job.vehicleNo||''} · ${hfV142CargoText(job.cargo,5)}</div><small>Rückkehr ca. ${hfV142Clock(job.returnMinute)}${job.actualArrivalMinute!=null?` · tatsächlich angekommen ${hfV142Clock(job.actualArrivalMinute)}`:''}${job.reason?` · ${job.reason}`:''}</small></div></article>`}).join('')}</div>`;
  }
  function hfV142RenderOrderPanel(id){
    const d=hfV142Depot(id),modal=document.getElementById('modal'),panel=modal?.querySelector('#hfV136AutoOrderPanel');if(!d||!panel)return;
    const cfg=hfV142EnsureOrder(d);
    panel.innerHTML=`<div class="row"><div><h3 style="margin:0">Automatische Warenbestellung & Wareneingang</h3><div class="sub">Bestellt den echten Tagesverbrauch aus deinen Produktionsstätten. Fahrzeuge dürfen mehrere kompatible Waren mischen und fahren bei Bedarf mehrmals am Tag.</div></div><label class="hf-v136-switch"><input type="checkbox" id="hfV136AutoOrderActive" ${cfg.active?'checked':''}><span>AUTO</span></label></div><div class="hf-v136-order-grid"><div class="field"><label>Erste Abfahrt</label><input type="time" id="hfV136AutoOrderTime" value="${hfV142Clock(cfg.departureMinute)}"></div><div class="field"><label>Zielbestand</label><select id="hfV136TargetDays">${[1,2,3,4,5,6,7].map(n=>`<option value="${n}" ${n===cfg.targetDays?'selected':''}>${n} Tagesbedarf${n===1?'':'e'}</option>`).join('')}</select></div><div class="field"><label>Max. Fahrten/Tag</label><input type="number" min="1" max="20" id="hfV136MaxTrips" value="${cfg.maxTrips}"></div></div><div class="compact-note">Die erste Fahrt startet zur Bestellzeit. Weitere Fahrten werden automatisch auf freie Fahrzeuge verteilt oder nach deren Rückkehr eingeplant.</div>${hfV142OrderRows(d)}<div class="hf-v142-arrival-head"><b>Geplante Wareneingänge</b><button class="btn sm orange" onclick="window.HF.hfV142OrderNow('${d.id}')">Jetzt planen</button></div><div id="hfV142ArrivalList">${hfV142ScheduleJobs(d,d.autoOrderScheduleDay!==state.day)}</div><small class="hf-v142-order-status">${cfg.lastStatus}</small>`;
    const changed=()=>{hfV142ReadOrderInputs(d,modal);hfV142RenderOrderPanel(id)};
    panel.querySelectorAll('#hfV136AutoOrderActive,#hfV136AutoOrderTime,#hfV136TargetDays,#hfV136MaxTrips').forEach(el=>el.addEventListener('change',changed,{once:true}));
  }
  window.HF.hfV142OrderNow=function(id){const d=hfV142Depot(id);if(!d)return;const modal=document.getElementById('modal');hfV142ReadOrderInputs(d,modal);const now=minuteOfDay(),jobs=hfV142PlanOrders(d,Math.max(now,hfV142EnsureOrder(d).departureMinute),true);let sent=0;for(const job of jobs){if(job.startMinute<=now){const r=hfV142DispatchJob(d,job);sent+=r.sent}}save(false);renderAll();toast(jobs.length?`${jobs.length} Abholfahrt${jobs.length===1?'':'en'} geplant${sent?` · ${formatWeight(sent)} gestartet`:''}.`:d.autoOrder.lastStatus,jobs.length?'good':'bad');window.HF.hfOpenDepot(id)};
  window.HF.hfV136OrderNow=window.HF.hfV142OrderNow;

  // Crop the Outlook calendar exactly at the selected depot start time.
  function hfV142CropCalendar(id){
    const d=hfV142Depot(id),panel=document.querySelector('#hfV138SchedulePanel[data-depot-id]')||document.querySelector('#hfV138SchedulePanel'),body=panel?.querySelector('#hfV138ScheduleBody'),cal=body?.querySelector('.hf-v141-calendar');if(!d||!cal)return;
    const spans=[...cal.querySelectorAll('.hf-v141-calendar-times span')];if(!spans.length)return;const desired=Math.max(0,Math.min(1439,Number(d.smartDispatchMinute)||480));if(spans[0].dataset.hfV142Cropped===String(desired))return;
    const parse=el=>hfV142ParseClock(el.textContent.trim()),top=el=>parseFloat(el.style.top)||0,firstMinute=parse(spans[0]),second=spans[1],pxPerMinute=second?Math.abs(top(second)-top(spans[0]))/Math.max(1,parse(second)-firstMinute):.82,delta=Math.max(0,(desired-firstMinute)*pxPerMinute);if(delta<=.1){spans[0].dataset.hfV142Cropped=String(desired);return}
    const shift=(el,clip=false)=>{const old=parseFloat(el.style.top)||0,newTop=old-delta;el.style.top=`${Math.max(0,newTop)}px`;if(newTop<-.5){if(clip&&el.classList.contains('hf-v141-calendar-event')){const oldH=parseFloat(el.style.height)||76,cut=Math.min(oldH,-newTop);el.style.height=`${Math.max(24,oldH-cut)}px`;el.style.display=oldH-cut<20?'none':''}else el.style.display='none'}};
    spans.forEach(el=>shift(el));cal.querySelectorAll('.hf-v141-hour-line,.hf-v141-now-line').forEach(el=>shift(el));cal.querySelectorAll('.hf-v141-calendar-event').forEach(el=>shift(el,true));
    const oldHeight=parseFloat(cal.style.height)||500;cal.style.height=`${Math.max(360,oldHeight-delta)}px`;const exact=spans.find(el=>parse(el)===desired);if(exact){exact.style.display='';exact.style.top='0px'}else{const label=document.createElement('span');label.textContent=hfV142Clock(desired);label.style.top='0px';cal.querySelector('.hf-v141-calendar-times')?.appendChild(label)}
    spans[0].dataset.hfV142Cropped=String(desired);panel.querySelector('.hf-v141-calendar-scroll')?.scrollTo(0,0);
  }

  function hfV142EnhanceDepot(id){
    const d=hfV142Depot(id),modal=document.getElementById('modal');if(!d||!modal)return;
    modal.classList.add('hf-v142-dispatch-modal');const title=modal.querySelector('h2');if(title)title.textContent=`📅 Disponieren · ${d.name}`;const headerSub=title?.parentElement?.querySelector('.sub');if(headerSub)headerSub.textContent='Tagesfahrplan, Warenbestellung, Versorgungsgebiet und Depotfuhrpark';
    hfV142RenderOrderPanel(id);
    const calendar=modal.querySelector('#hfV138SchedulePanel'),order=modal.querySelector('#hfV136AutoOrderPanel'),need=[...modal.querySelectorAll('.hf-depot-panel')].find(p=>p.querySelector('h3')?.textContent.includes('Bedarf & Lager')),fleet=modal.querySelector('#hfV141FleetPanel'),area=[...modal.querySelectorAll('.hf-depot-panel')].find(p=>p.querySelector('h3')?.textContent==='Versorgungsgebiet'),goods=[...modal.querySelectorAll('.hf-depot-panel')].find(p=>p.querySelector('h3')?.textContent==='Waren'),actions=modal.querySelector('.modal-actions.depot-actions');
    for(const panel of [calendar,order,need,fleet,area,goods])if(panel&&actions)actions.parentNode.insertBefore(panel,actions);
    if(calendar){calendar.dataset.depotId=id;const sub=calendar.querySelector('h3')?.parentElement?.querySelector('.sub');if(sub)sub.textContent=`Der Kalender beginnt exakt um ${hfV142Clock(d.smartDispatchMinute||480)}. Erledigte Stopps werden grün.`}
    const supply=actions?.querySelector('button[onclick*="hfOpenDepotSupply"]'),run=actions?.querySelector('button[onclick*="hfRunDepotNow"]'),saveBtn=actions?.querySelector('button[onclick*="hfSaveDepotConfig"]');if(supply)supply.textContent='📦 Manuell beliefern';if(run)run.textContent='▶ Jetzt disponieren';if(saveBtn)saveBtn.textContent='Disposition speichern';
    requestAnimationFrame(()=>hfV142CropCalendar(id));
  }

  const hfV142BaseOpen=window.HF?.hfOpenDepot;if(hfV142BaseOpen)window.HF.hfOpenDepot=function(id){const r=hfV142BaseOpen(id);requestAnimationFrame(()=>hfV142EnhanceDepot(id));return r};
  for(const name of ['hfSaveDepotConfig','hfDepotBuyVehicle','hfDepotSellVehicle','hfRunDepotNow']){const base=window.HF?.[name];if(!base)continue;window.HF[name]=function(id,...args){const r=base(id,...args);setTimeout(()=>hfV142EnhanceDepot(id),0);return r}}

  const hfV142BaseRenderDepot=typeof renderDepot==='function'?renderDepot:null;renderDepot=function(root){const result=hfV142BaseRenderDepot?hfV142BaseRenderDepot(root):undefined;window.HF?.hfRenderDepotLogisticsSection?.(root);root.querySelectorAll('button[onclick*="hfOpenDepot("]').forEach(btn=>btn.textContent='📅 Disponieren');root.querySelectorAll('button[onclick*="hfOpenDepotSupply"]').forEach(btn=>{if(btn.closest('.hf-depot-card'))btn.textContent='📦 Direkt beliefern'});return result};
  const hfV142BaseRefresh=refreshLiveTimeUi;refreshLiveTimeUi=function(...args){const r=hfV142BaseRefresh(...args);const panel=document.querySelector('#hfV138SchedulePanel[data-depot-id]');if(panel){const id=panel.dataset.depotId;requestAnimationFrame(()=>{hfV142CropCalendar(id);const d=hfV142Depot(id);if(d)hfV142RenderOrderPanel(id)})}return r};

  if(!document.getElementById('hf-v142-style')){const style=document.createElement('style');style.id='hf-v142-style';style.textContent=`
    .hf-v142-dispatch-modal> .row:first-child{position:sticky;top:-1px;z-index:20;background:#fbfcf8;padding:4px 0 9px;border-bottom:1px solid #e0e6e1}.hf-v142-dispatch-modal #hfV138SchedulePanel{order:1}.hf-v142-demand-rows{display:grid;gap:6px;margin-top:9px}.hf-v142-demand-rows>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;padding:8px;border:1px solid #dfe6e1;border-radius:10px;background:#fff}.hf-v142-demand-rows span{display:flex;align-items:center;gap:6px}.hf-v142-demand-rows span img{width:25px;height:25px}.hf-v142-demand-rows strong{align-self:center}.hf-v142-demand-rows small{grid-column:1/-1;color:#66746c}.hf-v142-arrival-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:11px}.hf-v142-arrivals{display:grid;gap:7px;margin-top:7px}.hf-v142-arrivals article{display:grid;grid-template-columns:112px minmax(0,1fr);gap:9px;padding:8px;border:1px solid #dce4de;border-left:4px solid #4a84c4;border-radius:11px;background:#fff}.hf-v142-arrivals article.live{border-left-color:#d99121;background:#fff8e9}.hf-v142-arrivals article.done{border-left-color:#218955;background:#e8f8ee}.hf-v142-arrivals article.blocked{border-left-color:#bd4c34;background:#fdece7}.hf-v142-arrival-time{display:grid;grid-template-columns:auto 1fr;gap:1px 5px;align-content:start}.hf-v142-arrival-time b{font-size:12px}.hf-v142-arrival-time span{font-size:7px;color:#6e7b73}.hf-v142-arrival-time i{grid-column:1/-1;font-style:normal;color:#859189}.hf-v142-arrival-main{min-width:0}.hf-v142-arrival-main small{display:block;margin-top:3px;color:#68766f}.hf-v142-order-status{display:block;margin-top:8px;color:#5e6e65}.hf-v142-dispatch-modal .hf-v141-calendar-scroll{max-height:560px}@media(max-width:430px){.hf-v142-arrivals article{grid-template-columns:88px minmax(0,1fr)}.hf-v142-arrival-time b{font-size:10px}}
  `;document.head.appendChild(style)}

  save(false);
})();

// --- v1.0.47: depot marker always opens the dispatch desk ---
(function(){
  const HF_V144_BUILD='1.0.47';
  document.body.dataset.hfBuild=HF_V144_BUILD;
  document.body.dataset.hfProduction='daily-midnight';

  function hfV144Round(value){
    return typeof roundCargo==='function' ? roundCargo(value) : Math.round((Number(value)||0)*1000)/1000;
  }

  // Production quantities in the data model are daily quantities. Display them as such everywhere.
  recipeText=function(recipe){
    const ins=Object.entries(recipe?.inputs||{}).map(([g,q])=>`${formatGoodAmount(g,q)} ${GOODS[g]?.name||g}`).join(' + ');
    const outs=Object.entries(recipe?.outputs||{}).map(([g,q])=>`${formatGoodAmount(g,q)} ${GOODS[g]?.name||g}`).join(' + ');
    return `${ins?ins+' → ':''}${outs}${outs?' / Tag':''}`;
  };
  facilityFlowText=function(fid){
    const f=FACILITIES[fid];if(!f)return '';
    if(fid==='foodfactory')return 'Produktionsmix aus Ravioli und Tomatenkonserven · Produktion täglich um 00:00';
    const ins=Object.entries(f.inputs||{}).map(([g,q])=>`${formatGoodAmount(g,q)} ${GOODS[g]?.name||g}`).join(' + ');
    const outs=Object.entries(f.output||{}).map(([g,q])=>`${formatGoodAmount(g,q)} ${GOODS[g]?.name||g}`).join(' + ');
    return `${ins?ins+' → ':''}${outs}${outs?' / Tag':''}`;
  };

  // Disable the old hourly production tick.
  produceHourly=function(){return {made:0,blocked:0}};

  function hfV144ProduceDaily(){return hfV117ProduceDaily()}
  produce=hfV144ProduceDaily;

  // Keep all existing shipment and timetable behaviour, but produce only once after the day changes to 00:00.
  advanceMinutes=function(minutes,{quiet=false,live=false}={}){
    let arrivals=0,prodMade=0,prodBlocked=0,salesUnits=0,salesRevenue=0,autoSent=0,autoBlocked=0,maintenance=0,dayWraps=0,stateChanged=false;
    const count=Math.max(0,Math.floor(Number(minutes)||0));
    for(let i=0;i<count;i++){
      const before=shipmentStateSignature(),done=processShipments(1);arrivals+=done.length;
      state.minute++;
      if(state.minute>=60){state.minute=0;state.hour++}
      if(state.hour>=24){
        state.hour=0;
        const daily=finishDay();
        const production=hfV144ProduceDaily();
        hfV117MidnightRecalculateDepots();
        dayWraps++;prodMade+=production.made;prodBlocked+=production.blocked;
        salesUnits+=Number(daily?.sales?.units)||0;salesRevenue+=Number(daily?.sales?.revenue)||0;maintenance+=Number(daily?.maintenance)||0;
        stateChanged=true;
      }
      if(typeof runScheduledRoutesAtCurrentTime==='function'){
        const scheduled=runScheduledRoutesAtCurrentTime()||{};
        autoSent+=Number(scheduled.sent)||0;autoBlocked+=Number(scheduled.blocked)||0;
        if(scheduled.sent||scheduled.blocked)stateChanged=true;
      }
      if(before!==shipmentStateSignature()||done.length)stateChanged=true;
    }
    playTick+=count;
    if(!live||playTick%10===0)save(false);
    refreshLiveTimeUi(!live||stateChanged);
    if(!quiet||arrivals||dayWraps||autoSent||autoBlocked){
      const parts=[formatClock(state.day,state.hour,state.minute)];
      if(arrivals)parts.push(`${arrivals} Rundfahrt(en) abgeschlossen`);
      if(prodMade)parts.push(`${formatWeight(prodMade)} um 00:00 produziert`);
      if(prodBlocked)parts.push(`${prodBlocked} Betrieb(e) ohne ausreichende Vorprodukte`);
      if(autoSent)parts.push(`${formatWeight(autoSent)} nach Fahrplan gestartet`);
      if(autoBlocked)parts.push(`${autoBlocked} geplante Abfahrt(en) blockiert`);
      if(salesUnits)parts.push(`${formatWeight(salesUnits)} Tagesverbrauch verkauft für ${money(salesRevenue)}`);
      if(maintenance)parts.push(`${money(maintenance)} Unterhalt`);
      toast(parts.join(' · '),(salesRevenue>maintenance&&dayWraps>0)?'good':'');
    }
    if(state.cash<0)toast('Achtung: Dein Unternehmen ist überschuldet. Verkaufe dringend Waren.','bad');
  };

  // Correct production wording in city and construction views.
  const hfV144RenderCity=renderCity;
  renderCity=function(root){
    const result=hfV144RenderCity(root);
    root.querySelectorAll('.facility-card .sub').forEach(el=>{el.innerHTML=el.innerHTML.replaceAll(' / Std.',' / Tag')});
    root.querySelectorAll('.facility-head').forEach(head=>{
      if(!head.querySelector('.hf-v144-midnight'))head.insertAdjacentHTML('beforeend','<span class="pill blue hf-v144-midnight">00:00</span>');
    });
    return result;
  };
  const hfV144OpenFacility=openFacility;
  openFacility=function(...args){
    const result=hfV144OpenFacility(...args),modal=document.getElementById('modal');
    if(modal){
      modal.querySelectorAll('p.sub,.sub').forEach(el=>{
        el.innerHTML=el.innerHTML.replaceAll('Alle Produktionen laufen stündlich.','Alle Betriebe produzieren einmal täglich um 00:00.').replaceAll('Alle Betriebe produzieren stündlich.','Alle Betriebe produzieren einmal täglich um 00:00.').replaceAll(' / Std.',' / Tag');
      });
    }
    return result;
  };

  // Daily production mix editor (the old editor divided the displayed values by 24).
  openFoodFactorySettings=function(cityId,index){
    const s=state.cities[cityId];if(!s||s.facilities[index]!=='foodfactory')return;
    const cfg=ensureFacilityConfigs(s)[index]||{},mix=normalizedFoodFactoryMix(cfg),modal=document.getElementById('modal');
    modal.className='modal project-dialog-open';
    const rows=[['meat','ravioli_meat','Ravioli mit Fleisch',mix.meatPct],['veg','ravioli_veg','Ravioli ohne Fleisch',mix.vegPct],['tomato','tomato_cans','Tomatenkonserven',mix.tomatoPct]];
    modal.innerHTML=`<h2>Produktionsanteile</h2><p class="sub">Lebensmittelfabrik in ${CITY[cityId].name}. Die gesamte Tagesproduktion wird um 00:00 dem Lager gutgeschrieben.</p><div class="hf-food-product-list">${rows.map(([key,good,name,value])=>`<div class="hf-food-product-row">${goodImg(good,'asset-img')}<div class="hf-food-product-main"><div class="row"><b>${name}</b><strong id="foodPct_${key}">${value}%</strong></div><input class="food-slider hf-food-product-slider" id="foodSlider_${key}" data-key="${key}" type="range" min="0" max="100" step="5" value="${value}"><div class="sub" id="foodOutput_${key}"></div></div></div>`).join('')}</div><div class="compact-note" id="foodMixTotal">Gesamt: 100 %</div><div class="recipe-preview"><div class="list-item"><b>Gesamte Produktion pro Tag</b><div class="sub" id="foodMixRecipe"></div></div><div class="list-item"><b>Vorprodukte pro Tag</b><div class="sub" id="foodMixInputs"></div></div></div><div class="modal-actions"><button class="btn primary" onclick="window.HF.saveFoodFactoryMix('${cityId}',${index})">Übernehmen</button><button class="btn secondary" onclick="window.HF.closeModal()">Abbrechen</button></div>`;
    document.getElementById('modalBack').classList.add('show');
    const keys=['meat','veg','tomato'],sliders=keys.map(k=>document.getElementById('foodSlider_'+k));let current=[mix.meatPct,mix.vegPct,mix.tomatoPct];
    function rebalance(changed,newValue){newValue=clamp(Math.round(newValue/5)*5,0,100);const other=[0,1,2].filter(i=>i!==changed),remaining=100-newValue,oldSum=current[other[0]]+current[other[1]];let first=oldSum<=0?Math.round((remaining/2)/5)*5:Math.round((remaining*current[other[0]]/oldSum)/5)*5;first=clamp(first,0,remaining);const next=[...current];next[changed]=newValue;next[other[0]]=first;next[other[1]]=remaining-first;return next}
    function refresh(){
      const local={meatPct:current[0],vegPct:current[1],tomatoPct:current[2]},r=foodFactoryRecipe(local);
      keys.forEach((k,i)=>{sliders[i].value=current[i];document.getElementById('foodPct_'+k).textContent=current[i]+'%'});
      document.getElementById('foodOutput_meat').textContent=current[0]?`${formatGoodAmount('ravioli_meat',r.outputs.ravioli_meat||0)} / Tag`:'pausiert';
      document.getElementById('foodOutput_veg').textContent=current[1]?`${formatGoodAmount('ravioli_veg',r.outputs.ravioli_veg||0)} / Tag`:'pausiert';
      document.getElementById('foodOutput_tomato').textContent=current[2]?`${formatGoodAmount('tomato_cans',r.outputs.tomato_cans||0)} / Tag`:'pausiert';
      document.getElementById('foodMixTotal').textContent=`Gesamt: ${current.reduce((a,b)=>a+b,0)} % · Produktion um 00:00`;
      document.getElementById('foodMixRecipe').textContent=Object.entries(r.outputs).map(([g,q])=>`${formatGoodAmount(g,q)} ${GOODS[g].name}`).join(' + ')||'Produktion pausiert';
      document.getElementById('foodMixInputs').textContent=Object.entries(r.inputs).map(([g,q])=>`${formatGoodAmount(g,q)} ${GOODS[g].name}`).join(' + ')||'keine';
    }
    sliders.forEach((slider,sliderIndex)=>slider.addEventListener('input',()=>{current=rebalance(sliderIndex,Number(slider.value));refresh()}));refresh();
  };

  // The depot itself now opens directly into the single dispatch desk. Remove obsolete duplicate/standard content and the redundant "Jetzt disponieren" action.
  function hfV144FindPanel(modal,title){return [...modal.querySelectorAll(':scope > section.hf-depot-panel')].find(p=>p.querySelector('h3')?.textContent.trim()===title)}
  function hfV144CleanDepotDesk(id){
    const modal=document.getElementById('modal');if(!modal||!modal.classList.contains('hf-v142-dispatch-modal'))return;
    modal.classList.add('hf-v144-dispatch-only');modal.dataset.depotId=id;
    const header=[...modal.children].find(x=>x.matches?.('.row')&&x.querySelector('h2'));
    const calendar=modal.querySelector(':scope > #hfV138SchedulePanel');
    const order=modal.querySelector(':scope > #hfV136AutoOrderPanel');
    const need=hfV144FindPanel(modal,'Bedarf & Lager');
    const fleet=modal.querySelector(':scope > #hfV141FleetPanel');
    const area=hfV144FindPanel(modal,'Versorgungsgebiet');
    const goods=hfV144FindPanel(modal,'Waren');
    const actions=modal.querySelector(':scope > .modal-actions.depot-actions');
    const keep=[header,calendar,order,need,fleet,area,goods,actions].filter(Boolean);
    for(const child of [...modal.children])if(!keep.includes(child))child.remove();
    for(const node of keep)modal.appendChild(node);
    const title=header?.querySelector('h2');if(title)title.textContent=`📅 Disponieren · ${state.depots?.find(d=>d.id===id)?.name||'Depot'}`;
    const sub=header?.querySelector('.sub');if(sub)sub.textContent='Einziger Depot-Leitstand: Tagesfahrplan, Nachschub, Fuhrpark und Versorgungsgebiet';
    actions?.querySelector('button[onclick*="hfRunDepotNow"]')?.remove();
    const supply=actions?.querySelector('button[onclick*="hfOpenDepotSupply"]');if(supply)supply.textContent='📦 Manuelle Sonderfahrt';
    const saveBtn=actions?.querySelector('button[onclick*="hfSaveDepotConfig"]');if(saveBtn)saveBtn.textContent='Disposition speichern';
    if(actions&&!actions.querySelector('.hf-v144-close'))actions.insertAdjacentHTML('beforeend','<button class="btn secondary hf-v144-close" onclick="window.HF.closeModal()">Schließen</button>');
    requestAnimationFrame(()=>{modal.scrollTop=0});
  }
  function hfV144ScheduleClean(id){for(const delay of [0,40,140])setTimeout(()=>hfV144CleanDepotDesk(id),delay)}
  const hfV144OpenDepot=window.HF?.hfOpenDepot;
  if(hfV144OpenDepot)window.HF.hfOpenDepot=function(id){const result=hfV144OpenDepot(id);hfV144ScheduleClean(id);return result};
  for(const name of ['hfSaveDepotConfig','hfDepotBuyVehicle','hfDepotSellVehicle','hfRunDepotNow','hfV142OrderNow','hfV136OrderNow']){
    const base=window.HF?.[name];if(!base)continue;
    window.HF[name]=function(id,...args){const result=base(id,...args);hfV144ScheduleClean(id);return result};
  }

  if(!document.getElementById('hf-v144-style')){
    const style=document.createElement('style');style.id='hf-v144-style';style.textContent=`
      .hf-v144-dispatch-only{display:flex!important;flex-direction:column;gap:10px}.hf-v144-dispatch-only>section,.hf-v144-dispatch-only>.modal-actions{flex:0 0 auto}.hf-v144-dispatch-only>.row:first-child{order:0}.hf-v144-dispatch-only>#hfV138SchedulePanel{order:1}.hf-v144-dispatch-only>#hfV136AutoOrderPanel{order:2}.hf-v144-dispatch-only>.hf-depot-panel{order:3}.hf-v144-dispatch-only>.modal-actions{order:9;position:sticky;bottom:-1px;background:#fbfcf8;padding-top:9px;border-top:1px solid #dce4de;z-index:15}.hf-v144-midnight{margin-left:4px}
    `;document.head.appendChild(style);
  }

  state.productionCycleVersion=2;
  save(false);
  window.HF={...window.HF,openFacility,openFoodFactorySettings};
})();


// --- v1.0.52: operational multi-trip planner inside the game scope ---
// --- v1.0.48: multi-trip depot day planning until daily demand is covered ---
(function(){
  'use strict';
  const BUILD='1.0.52';
  const PLANNER_VERSION=148;
  const MAX_STOPS=6;
  const MAX_TOTAL_TRIPS=80;
  const MAX_TRIPS_PER_VEHICLE=16;
  const TURNAROUND_MINUTES=15;
  const STOP_SERVICE_MINUTES=6;
  const LOAD_MINUTES=8;
  const LAST_RETURN_MINUTE=1439;

  document.body.dataset.hfBuild=BUILD;
  document.body.dataset.hfDepotMultiTrip='1';
  document.documentElement.dataset.hfVersion=BUILD;

  const round=n=>typeof roundCargo==='function'?roundCargo(Number(n)||0):Math.round((Number(n)||0)*1000)/1000;
  const depotById=id=>(state.depots||[]).find(d=>d.id===id);
  const depotInventory=d=>{
    state.cities[d.id]=state.cities[d.id]||{unlocked:false,isDepot:true,inventory:{},demands:{},facilities:[],sales:0};
    return state.cities[d.id].inventory=state.cities[d.id].inventory||{};
  };
  const nodeName=id=>CITY[id]?.name||(state.depots||[]).find(d=>d.id===id)?.name||id;
  const openNeed=(cityId,good)=>{
    const city=state.cities?.[cityId],dem=city?.demands?.[good];
    if(!dem)return 0;
    return round(Math.max(0,(Number(dem.need)||0)-(Number(city.inventory?.[good])||0)));
  };
  const urgency=(cityId,good)=>{
    const dem=state.cities?.[cityId]?.demands?.[good];
    if(!dem)return 0;
    const daily=Math.max(.001,Number(dem.need)||Number(dem.max)||1);
    return Math.min(4,openNeed(cityId,good)/daily);
  };
  const route=(from,to,type)=>{
    try{return findPath(from,to,type)}catch(_){return null}
  };
  const totalCargo=cargo=>(cargo||[]).reduce((n,x)=>n+(Number(x.amount)||0),0);

  function ensureDepot(d){
    if(!d)return null;
    d.fleet=d.fleet||{};d.usedVehicles=d.usedVehicles||{};
    d.smartDispatchMinute=Math.max(0,Math.min(1439,Number.isFinite(+d.smartDispatchMinute)?Math.round(+d.smartDispatchMinute):480));
    d.smartSchedule=Array.isArray(d.smartSchedule)?d.smartSchedule:[];
    d.smartScheduleDay=Number.isFinite(+d.smartScheduleDay)?+d.smartScheduleDay:-1;
    if(d.multiTripPlannerVersion!==PLANNER_VERSION){
      d.multiTripPlannerVersion=PLANNER_VERSION;
      d.smartSchedule=[];d.smartScheduleDay=-1;d.smartLastRunDay=-1;
    }
    return d;
  }

  function routeMetrics(d,stops,type){
    const v=VEHICLES[type];if(!v||!stops?.length)return null;
    let current=d.id,distance=0,travelMinutes=0,minCapacity=Infinity;
    for(const stop of stops){
      const leg=route(current,stop.cityId,type);if(!leg)return null;
      distance+=Number(leg.distance)||0;travelMinutes+=Math.max(1,Math.round((Number(leg.timeHours)||0)*60));
      if(leg.edges?.length)minCapacity=Math.min(minCapacity,...leg.edges.map(e=>Number(e.capacity)||0));
      current=stop.cityId;
    }
    const back=route(current,d.id,type);if(!back)return null;
    distance+=Number(back.distance)||0;travelMinutes+=Math.max(1,Math.round((Number(back.timeHours)||0)*60));
    if(back.edges?.length)minCapacity=Math.min(minCapacity,...back.edges.map(e=>Number(e.capacity)||0));
    const durationMinutes=LOAD_MINUTES+travelMinutes+stops.length*STOP_SERVICE_MINUTES;
    return {distance,travelMinutes,durationMinutes,cost:Math.max(0,Math.round(distance*(Number(v.kmCost)||0))),capacity:Number.isFinite(minCapacity)?minCapacity:1};
  }

  function buildSingleTrip(d,lane,tasks,stock,startMinute,tripIndex){
    const type=lane.type,v=VEHICLES[type];if(!v||startMinute>=LAST_RETURN_MINUTE)return null;
    let capacity=Number(v.load)||0,current=d.id,forcedCity=null;
    const allocations=[];
    const compatible=()=>tasks.filter(t=>t.remaining>.001&&(stock[t.good]||0)>.001&&vehicleCanCarryGood(type,t.good)&&route(d.id,t.cityId,type)&&route(t.cityId,d.id,type));
    const initial=compatible();if(!initial.length)return null;
    forcedCity=initial.slice().sort((a,b)=>{
      const sa=a.urgency*1000+Math.min(a.remaining,capacity)/Math.max(1,capacity)*160-(Number(route(d.id,a.cityId,type)?.timeHours)||0)*8;
      const sb=b.urgency*1000+Math.min(b.remaining,capacity)/Math.max(1,capacity)*160-(Number(route(d.id,b.cityId,type)?.timeHours)||0)*8;
      return sb-sa;
    })[0]?.cityId||null;
    const stops=[],cargoMap=new Map();
    while(capacity>.001&&stops.length<MAX_STOPS){
      const cityCandidates=[...new Set(compatible().map(t=>t.cityId))].filter(id=>!stops.some(s=>s.cityId===id));
      if(!cityCandidates.length)break;
      let nextCity=null,best=-Infinity;
      for(const cityId of cityCandidates){
        if(forcedCity&&cityId!==forcedCity)continue;
        const leg=route(current,cityId,type),back=route(cityId,d.id,type),directBack=route(current,d.id,type);
        if(!leg||!back)continue;
        const cityTasks=tasks.filter(t=>t.cityId===cityId&&t.remaining>.001&&(stock[t.good]||0)>.001&&vehicleCanCarryGood(type,t.good));
        const benefit=cityTasks.reduce((n,t)=>n+Math.min(t.remaining,stock[t.good]||0,capacity),0);
        const urgent=Math.max(0,...cityTasks.map(t=>t.urgency));
        const detour=(Number(leg.timeHours)||0)+(Number(back.timeHours)||0)-(Number(directBack?.timeHours)||0);
        if(stops.length&&detour>2.75)continue;
        const score=urgent*720+Math.min(1,benefit/Math.max(1,capacity))*210-detour*38-(Number(leg.timeHours)||0)*5;
        if(score>best){best=score;nextCity=cityId}
      }
      forcedCity=null;if(!nextCity)break;
      const unloads=[];
      const cityTasks=tasks.filter(t=>t.cityId===nextCity&&t.remaining>.001&&(stock[t.good]||0)>.001&&vehicleCanCarryGood(type,t.good)).sort((a,b)=>b.urgency-a.urgency||b.remaining-a.remaining);
      for(const task of cityTasks){
        if(capacity<=.001)break;
        const amount=round(Math.min(capacity,task.remaining,stock[task.good]||0));if(amount<=.001)continue;
        unloads.push({good:task.good,amount});allocations.push({task,good:task.good,amount});
        cargoMap.set(task.good,round((cargoMap.get(task.good)||0)+amount));
        task.remaining=round(task.remaining-amount);stock[task.good]=round((stock[task.good]||0)-amount);capacity=round(capacity-amount);
      }
      if(!unloads.length)break;
      stops.push({cityId:nextCity,name:nodeName(nextCity),dailyDemand:false,unloads});current=nextCity;
    }
    const rollback=()=>{for(const a of allocations){a.task.remaining=round(a.task.remaining+a.amount);stock[a.good]=round((stock[a.good]||0)+a.amount)}};
    if(!stops.length){rollback();return null}
    const metrics=routeMetrics(d,stops,type);if(!metrics){rollback();return null}
    const endMinute=startMinute+metrics.durationMinutes;
    if(endMinute>LAST_RETURN_MINUTE){rollback();return null}
    const cargo=[...cargoMap].map(([good,amount])=>({good,amount}));
    return {
      id:`v148_${state.day}_${d.id}_${type}_${lane.index}_${tripIndex}_${Math.random().toString(36).slice(2,6)}`,
      day:state.day,plannerVersion:PLANNER_VERSION,vehicleType:type,vehicleNo:lane.index,startMinute,endMinute,
      stops,cargo,cost:metrics.cost,timeHours:metrics.durationMinutes/60,status:'Geplant',shipmentId:null,
      tripNumber:tripIndex,laneKey:`${type}:${lane.index}`
    };
  }

  function buildPlans(d,startOverride=null){
    ensureDepot(d);
    const inv=depotInventory(d),stock={};for(const g of d.goods||[])stock[g]=Number(inv[g])||0;
    const tasks=[];
    for(const cityId of d.cities||[])for(const good of d.goods||[]){
      const remaining=openNeed(cityId,good);if(remaining>.001)tasks.push({cityId,good,remaining,urgency:urgency(cityId,good)});
    }
    const hasOverride=startOverride!==null&&startOverride!==undefined&&Number.isFinite(Number(startOverride));
    const baseStart=Math.max(0,Math.min(1439,hasOverride?Math.round(Number(startOverride)):d.smartDispatchMinute));
    const lanes=[];
    for(const [type,countRaw] of Object.entries(d.fleet||{})){
      const count=Math.max(0,Math.floor(Number(countRaw)||0));if(!VEHICLES[type]||VEHICLES[type].mode!=='road')continue;
      for(let index=1;index<=count;index++)lanes.push({type,index,available:baseStart+(lanes.length%4)*3,trips:0,disabled:false});
    }
    const plans=[];let safety=0;
    while(plans.length<MAX_TOTAL_TRIPS&&safety++<MAX_TOTAL_TRIPS*5){
      if(!tasks.some(t=>t.remaining>.001)||!Object.values(stock).some(q=>q>.001))break;
      const candidates=lanes.filter(l=>!l.disabled&&l.trips<MAX_TRIPS_PER_VEHICLE&&l.available<LAST_RETURN_MINUTE).sort((a,b)=>a.available-b.available||a.type.localeCompare(b.type)||a.index-b.index);
      if(!candidates.length)break;
      let made=false;
      for(const lane of candidates){
        const plan=buildSingleTrip(d,lane,tasks,stock,lane.available,lane.trips+1);
        if(!plan){lane.disabled=true;continue}
        plans.push(plan);lane.trips++;lane.available=plan.endMinute+TURNAROUND_MINUTES;made=true;break;
      }
      if(!made)break;
    }
    return plans.sort((a,b)=>a.startMinute-b.startMinute||a.vehicleType.localeCompare(b.vehicleType)||a.vehicleNo-b.vehicleNo);
  }

  function ensureSchedule(d,force=false){
    ensureDepot(d);
    const valid=d.smartScheduleDay===state.day&&Array.isArray(d.smartSchedule)&&d.smartSchedule.every(p=>p?.plannerVersion===PLANNER_VERSION);
    if(force||!valid){
      d.smartSchedule=buildPlans(d);d.smartScheduleDay=state.day;d.smartLastRunDay=state.day;
      d.lastStatus=d.smartSchedule.length?`${d.smartSchedule.length} Fahrt${d.smartSchedule.length===1?'':'en'} für heute geplant`:'Kein offener Bedarf, keine Depotware oder kein passendes Fahrzeug';
    }
    return d.smartSchedule;
  }

  function laneBusy(d,plan){
    return (state.shipments||[]).some(sh=>!sh.completed&&sh.isDepotSmartTour&&sh.depotId===d.id&&sh.vehicleType===plan.vehicleType&&Number(sh.vehicleNo||0)===Number(plan.vehicleNo||0));
  }

  function reconcileDepotRuntime(d){
    ensureDepot(d);
    const active=(state.shipments||[]).filter(sh=>!sh.completed&&sh.depotId===d.id&&(sh.isDepotSmartTour||sh.isDepotDelivery));
    const counts={};
    for(const sh of active){const type=sh.vehicleType;if(type)counts[type]=(counts[type]||0)+Math.max(1,Number(sh.trips)||1)}
    d.usedVehicles=d.usedVehicles||{};
    for(const type of new Set([...Object.keys(d.fleet||{}),...Object.keys(d.usedVehicles||{}),...Object.keys(counts)]))d.usedVehicles[type]=Math.max(0,Number(counts[type])||0);
    const activeById=new Map(active.map(sh=>[sh.id,sh]));
    for(const row of d.smartSchedule||[]){
      if(!row)continue;
      const sh=row.shipmentId?activeById.get(row.shipmentId):null;
      if(sh){row.status=sh.phase==='tour_return'?'Rückfahrt':'Unterwegs';continue}
      if(row.shipmentId&&!['Erledigt','Blockiert'].includes(row.status)){
        row.status='Erledigt';row.actualEndMinute=typeof minuteOfDay==='function'?minuteOfDay():row.endMinute;
      }else if(!row.shipmentId&&row.status==='Unterwegs')row.status='Geplant';
    }
    d.depotPlannerMigrationVersion=152;
    return active;
  }

  function adaptPlanToCurrentNeed(d,plan){
    const inv=depotInventory(d),available={};for(const item of plan.cargo||[])available[item.good]=Number(inv[item.good])||0;
    let capacity=Number(VEHICLES[plan.vehicleType]?.load)||0;
    const stops=[],cargoMap=new Map();
    for(const stop of plan.stops||[]){
      const unloads=[];
      for(const item of stop.unloads||[]){
        if(capacity<=.001)break;
        const actual=round(Math.min(Number(item.amount)||0,openNeed(stop.cityId,item.good),available[item.good]||0,capacity));
        if(actual<=.001)continue;
        unloads.push({good:item.good,amount:actual});cargoMap.set(item.good,round((cargoMap.get(item.good)||0)+actual));
        available[item.good]=round((available[item.good]||0)-actual);capacity=round(capacity-actual);
      }
      if(unloads.length)stops.push({cityId:stop.cityId,name:nodeName(stop.cityId),dailyDemand:false,unloads});
    }
    return {stops,cargo:[...cargoMap].map(([good,amount])=>({good,amount}))};
  }

  function setLeg(sh,from,to,phase){
    const leg=route(from,to,sh.vehicleType);if(!leg)return false;
    sh.from=from;sh.to=to;sh.destination=to;sh.phase=phase;
    sh.remainingMinutes=Math.max(1,Math.round((Number(leg.timeHours)||0)*60));sh.totalMinutes=sh.remainingMinutes;
    sh.path=leg.path;sh.edgeIds=(leg.edges||[]).map(e=>e.id);sh.movementStatus='queued';sh.currentEdgeIndex=0;sh.currentNode=from;sh.edgeRemainingMinutes=0;sh.edgeTotalMinutes=0;sh.waitingReason='Wartet auf freie Einfahrt';
    return true;
  }

  function dispatchPlan(d,plan){
    const v=VEHICLES[plan.vehicleType];if(!v)return {sent:0,blocked:1,reason:'Fahrzeugtyp fehlt'};
    if(laneBusy(d,plan)){plan.status='Wartet auf Rückkehr';return {sent:0,blocked:0,waiting:true}}
    if((Number(d.usedVehicles?.[plan.vehicleType])||0)>=(Number(d.fleet?.[plan.vehicleType])||0)){plan.status='Wartet auf Fahrzeug';return {sent:0,blocked:0,waiting:true}}
    const adapted=adaptPlanToCurrentNeed(d,plan);
    if(!adapted.cargo.length||!adapted.stops.length){plan.status='Erledigt';plan.reason='Tagesbedarf bereits gedeckt';return {sent:0,blocked:0}}
    const inv=depotInventory(d);
    for(const item of adapted.cargo)if((Number(inv[item.good])||0)+.001<item.amount){plan.status='Wartet auf Ware';plan.reason=`${GOODS[item.good]?.name||item.good} fehlt im Depot`;return {sent:0,blocked:0,waiting:true}}
    const metrics=routeMetrics(d,adapted.stops,plan.vehicleType);if(!metrics){plan.status='Blockiert';plan.reason='Route nicht vollständig erreichbar';return {sent:0,blocked:1}}
    if(state.cash<metrics.cost){plan.status='Blockiert';plan.reason='Zu wenig Kapital für Fahrtkosten';return {sent:0,blocked:1}}
    for(const item of adapted.cargo)inv[item.good]=round((Number(inv[item.good])||0)-item.amount);
    state.cash-=metrics.cost;d.usedVehicles=d.usedVehicles||{};d.usedVehicles[plan.vehicleType]=(Number(d.usedVehicles[plan.vehicleType])||0)+1;
    plan.stops=adapted.stops;plan.cargo=adapted.cargo;plan.cost=metrics.cost;plan.timeHours=metrics.durationMinutes/60;
    const sh={
      id:'dsmart148_'+Date.now()+Math.random().toString(16).slice(2),isMultiStop:true,isDepotSmartTour:true,depotId:d.id,smartPlanId:plan.id,
      vehicleNo:plan.vehicleNo,home:d.id,from:d.id,to:plan.stops[0].cityId,destination:plan.stops[0].cityId,
      cargo:plan.cargo.map(x=>({...x})),initialCargo:plan.cargo.map(x=>({...x})),returnCargoPlan:[],
      tourStops:plan.stops.map(s=>({cityId:s.cityId,dailyDemand:false,unloads:s.unloads.map(x=>({...x}))})),tourStopIndex:0,
      vehicleType:plan.vehicleType,routeId:null,trips:1,returnPolicy:'empty',returnGood:null,returnAmount:0,
      good:plan.cargo[0]?.good||null,amount:totalCargo(plan.cargo),phase:'tour_outbound',movementStatus:'queued',currentEdgeIndex:0,currentNode:d.id,edgeRemainingMinutes:0,edgeTotalMinutes:0,waitingReason:'Wartet auf freie Einfahrt'
    };
    if(!setLeg(sh,d.id,plan.stops[0].cityId,'tour_outbound')){
      state.cash+=metrics.cost;d.usedVehicles[plan.vehicleType]=Math.max(0,(Number(d.usedVehicles[plan.vehicleType])||0)-1);
      for(const item of adapted.cargo)inv[item.good]=round((Number(inv[item.good])||0)+item.amount);
      plan.status='Blockiert';plan.reason='Erster Streckenabschnitt nicht erreichbar';return {sent:0,blocked:1};
    }
    state.shipments=state.shipments||[];state.shipments.push(sh);plan.shipmentId=sh.id;plan.status='Unterwegs';plan.actualStartMinute=typeof minuteOfDay==='function'?minuteOfDay():plan.startMinute;
    return {sent:totalCargo(plan.cargo),blocked:0};
  }

  function runMultiTripPlanner(){
    const now=typeof minuteOfDay==='function'?minuteOfDay():0;let sent=0,blocked=0,trips=0;
    for(const d of state.depots||[]){
      ensureDepot(d);reconcileDepotRuntime(d);if(!d.active)continue;
      let plans=ensureSchedule(d,false);
      const hasPending=plans.some(p=>!p.shipmentId&&!['Erledigt','Blockiert'].includes(p.status));
      const hasActive=plans.some(p=>p.shipmentId&&!['Erledigt','Blockiert'].includes(p.status));
      const hasBlocked=plans.some(p=>p.status==='Blockiert');
      const inv=depotInventory(d);
      const canPlanMore=!hasBlocked&&(d.cities||[]).some(cityId=>(d.goods||[]).some(g=>openNeed(cityId,g)>.001))&&(d.goods||[]).some(g=>(Number(inv[g])||0)>.001);
      if(!hasPending&&!hasActive&&canPlanMore){
        const nextStart=Math.max(now+TURNAROUND_MINUTES,d.smartDispatchMinute);
        const extra=buildPlans(d,nextStart);
        if(extra.length){d.smartSchedule.push(...extra);plans=d.smartSchedule;d.lastStatus=`${extra.length} zusätzliche Fahrt${extra.length===1?'':'en'} ab ${String(Math.floor((nextStart%1440)/60)).padStart(2,'0')}:${String(nextStart%60).padStart(2,'0')} eingeplant`;}
      }
      for(const plan of plans){
        if(plan.shipmentId||plan.status==='Erledigt'||plan.status==='Blockiert'||Number(plan.startMinute)>now)continue;
        const r=dispatchPlan(d,plan);sent=round(sent+(Number(r.sent)||0));blocked+=Number(r.blocked)||0;if(r.sent)trips++;
      }
      const pending=plans.filter(p=>!p.shipmentId&&!['Erledigt','Blockiert'].includes(p.status)).length;
      const complete=plans.filter(p=>p.status==='Erledigt').length;
      if(plans.length)d.lastStatus=`${complete}/${plans.length} Fahrten erledigt${pending?` · ${pending} geplant/wartend`:''}`;
    }
    if(trips||blocked)save(false);
    return {sent,blocked,trips};
  }

  // Suppress the older one-trip-per-vehicle dispatcher while preserving all other scheduled systems.
  const baseScheduled=runScheduledRoutesAtCurrentTime;
  runScheduledRoutesAtCurrentTime=function(){
    const active=(state.depots||[]).map(d=>[d,d.active]);
    for(const [d] of active)d.active=false;
    let base;
    try{base=baseScheduled()||{}}finally{for(const [d,value] of active)d.active=value}
    const multi=runMultiTripPlanner();
    return {sent:round((Number(base.sent)||0)+multi.sent),blocked:(Number(base.blocked)||0)+multi.blocked};
  };

  function refreshPlannerUi(id,force=false){
    const d=depotById(id);if(!d)return;
    ensureSchedule(d,force);save(false);
    const panel=document.querySelector('#hfV138SchedulePanel');
    if(panel){
      const sub=panel.querySelector('h3')?.parentElement?.querySelector('.sub');
      if(sub)sub.textContent=`Plant automatisch mehrere Fahrten pro Fahrzeug, bis Tagesbedarf oder Depotbestand ausgeschöpft ist. Heute: ${d.smartSchedule.length} Fahrt${d.smartSchedule.length===1?'':'en'}.`;
    }
    try{refreshLiveTimeUi(false)}catch(_){try{renderAll()}catch(__){}}
  }

  for(const d of state.depots||[]){ensureDepot(d);reconcileDepotRuntime(d)}
  save(false);

  const baseOpen=window.HF?.hfOpenDepot;
  if(baseOpen)window.HF.hfOpenDepot=function(id){const d=depotById(id);if(d)ensureSchedule(d,false);const result=baseOpen(id);setTimeout(()=>refreshPlannerUi(id,false),80);return result};

  for(const name of ['hfSaveDepotConfig','hfDepotBuyVehicle','hfDepotSellVehicle']){
    const base=window.HF?.[name];if(!base)continue;
    window.HF[name]=function(id,...args){const result=base(id,...args);const d=depotById(id);if(d){d.smartSchedule=[];d.smartScheduleDay=-1;setTimeout(()=>{ensureSchedule(d,true);save(false);try{window.HF.hfOpenDepot(id)}catch(_){}},100)}return result};
  }

  document.addEventListener('click',event=>{
    if(event.target?.id!=='hfV138Replan')return;
    const id=document.getElementById('modal')?.dataset?.depotId;setTimeout(()=>{const d=depotById(id);if(!d)return;d.smartSchedule=[];d.smartScheduleDay=-1;ensureSchedule(d,true);save(false);window.HF?.hfOpenDepot?.(id)},20);
  },true);
  document.addEventListener('change',event=>{
    if(event.target?.id!=='hfV138Time')return;
    const id=document.getElementById('modal')?.dataset?.depotId;setTimeout(()=>{const d=depotById(id);if(!d)return;d.smartSchedule=[];d.smartScheduleDay=-1;ensureSchedule(d,true);save(false);window.HF?.hfOpenDepot?.(id)},20);
  },true);

  window.HF={...window.HF,hfV148ReplanDepot(id){const d=depotById(id);if(!d)return [];d.smartSchedule=[];d.smartScheduleDay=-1;const plans=ensureSchedule(d,true);save(false);return plans}};
})();
