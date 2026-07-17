(function(global){
'use strict';
function seeded(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
  return()=>((h=Math.imul(h^h>>>15,1|h)+Math.imul(h^h>>>7,61|h)^h>>>14)>>>0)/4294967296;
}
function deprecatedGoods(){
  return new Set(global.HF_GOODS_DATABASE?.deprecations?.goods||[]);
}
function activeGoods(goods={}){
  const deprecated=deprecatedGoods();
  return Object.fromEntries(Object.entries(goods||{}).filter(([id])=>!deprecated.has(id)));
}
function roundDemand(value){
  return Math.round((Number(value)||0)*100)/100;
}
function enabledDemandGoods(demandGoods){
  const deprecated=deprecatedGoods();
  const goods=global.HF_GOODS_DATABASE?.goods||{};
  return [...demandGoods]
    .filter(id=>!deprecated.has(id))
    .map(id=>goods[id]||{id,demand:{enabled:true}})
    .filter(g=>g?.demand?.enabled===true);
}
function cityDemandPreset(cityId){
  const profile=global.HF_DEMAND_DATABASE?.cityDemandProfiles?.[cityId];
  return profile?.goods&&typeof profile.goods==='object'?profile.goods:null;
}
function demandProfileFactor(city,good){
  const factors=global.HF_DEMAND_DATABASE?.demandProfileFactors?.[city?.demandProfile];
  if(!factors||typeof factors!=='object')return 1;
  return Number(factors[good.category]??factors[good.demand?.profile])||1;
}
function demandEntryFromDailyKg(dailyKg,dailyRate,mult=1){
  const rate=Math.max(0.000001,Number(dailyRate)||1);
  const need=roundDemand(dailyKg/rate);
  return {need,max:roundDemand(need/0.62),mult:roundDemand(mult)||1,dailyRate:rate};
}
function makeDemandsV2(city,demandGoods,{minDailyKg=1}={}){
  const preset=cityDemandPreset(city?.id);
  if(preset){
    return Object.fromEntries(Object.entries(preset).map(([id,d])=>{
      const rate=Math.max(0.000001,Number(d.dailyRate)||1);
      const max=roundDemand(Number(d.max)||0);
      return [id,{need:roundDemand(Number(d.need)>0?Number(d.need):max*0.62),max,mult:roundDemand(Number(d.mult)||1),dailyRate:rate}];
    }));
  }
  const population=Math.max(0,Number(city?.population)||0);
  const wealthFactor=Math.max(0,Number(city?.wealthFactor)||1);
  return Object.fromEntries(enabledDemandGoods(demandGoods).map(g=>{
    const d=g.demand||{};
    const base=Number(d.baseDemandPer100kKg)||0;
    if(!(base>0))return null;
    const elasticity=Number.isFinite(Number(d.wealthElasticity))?Number(d.wealthElasticity):0;
    const profileFactor=demandProfileFactor(city,g);
    const dailyKg=population/100000*base*Math.pow(wealthFactor,elasticity)*profileFactor;
    const minimum=Number(d.minDailyKg??global.HF_DEMAND_DATABASE?.demandProfiles?.[d.profile]?.minDailyKg??minDailyKg)||minDailyKg;
    if(dailyKg<minimum)return null;
    return [g.id,demandEntryFromDailyKg(dailyKg,d.dailyRate,1)];
  }).filter(Boolean));
}
function makeDemands(city,demandGoods){
  const demands=makeDemandsV2(city,demandGoods);
  if(Object.keys(demands).length)return demands;
  const r=seeded(city.id);
  const deprecated=deprecatedGoods();
  const picks=[...demandGoods].filter(g=>!deprecated.has(g)).sort(()=>r()-.5).slice(0,city.tier+1);
  return Object.fromEntries(picks.map(g=>[g,{need:Math.round(3+city.tier*2+r()*5),max:Math.round(6+city.tier*3+r()*6),mult:+(0.9+r()*.35).toFixed(2)}]));
}
function createInventoryDefaults(goods){
  return Object.fromEntries(Object.keys(activeGoods(goods)).map(id=>[id,0]));
}
function normalizeInventory(inventory={},goods){
  const validGoods=activeGoods(goods);
  const normalized=createInventoryDefaults(validGoods);
  for(const [id,amount] of Object.entries(inventory||{})){
    if(validGoods[id])normalized[id]=Number.isFinite(Number(amount))?Number(amount):0;
  }
  return normalized;
}
function createCityState(city,goods,demandGoods,{unlocked=false}={}){
  const validGoods=activeGoods(goods);
  return {unlocked,inventory:createInventoryDefaults(validGoods),facilities:[],demands:makeDemands(city,demandGoods),sales:0};
}
function cloneJson(value){
  if(typeof global.structuredClone==='function')return global.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
function normalizeCityRuntimeState(cityState,city,goods,demandGoods){
  const normalized=cityState&&typeof cityState==='object'?cloneJson(cityState):{};
  normalized.unlocked=Boolean(normalized.unlocked||city?.id==='zurich');
  normalized.inventory=normalizeInventory(normalized.inventory,goods);
  if(!Array.isArray(normalized.facilities))normalized.facilities=[];
  if(!normalized.demands||typeof normalized.demands!=='object')normalized.demands=makeDemands(city,demandGoods);
  if(!Number.isFinite(Number(normalized.sales)))normalized.sales=0;
  return normalized;
}
function createFreshStateFromPackage(initialPackage,{goods={},demandGoods=[],cities=[]}={}){
  const packagedState=initialPackage?.state;
  if(!packagedState||typeof packagedState!=='object')throw new Error('HF_INITIAL_STATE_PACKAGE.state fehlt');
  const state=cloneJson(packagedState);
  if(!state.cities||typeof state.cities!=='object')state.cities={};
  for(const city of cities){
    state.cities[city.id]=normalizeCityRuntimeState(state.cities[city.id],city,goods,demandGoods);
  }
  state.connections=Array.isArray(state.connections)?state.connections:[];
  state.shipments=Array.isArray(state.shipments)?state.shipments:[];
  state.routes=Array.isArray(state.routes)?state.routes:[];
  state.history=Array.isArray(state.history)?state.history:[];
  state.fleet=state.fleet&&typeof state.fleet==='object'?state.fleet:{van:1,lightTruck:0,heavyTruck:0,artic:0,freightTrain:0};
  state.usedCapacity=state.usedCapacity&&typeof state.usedCapacity==='object'?state.usedCapacity:{};
  state.usedVehicles=state.usedVehicles&&typeof state.usedVehicles==='object'?state.usedVehicles:{};
  return state;
}
global.HF_GAME_MECHANICS={seeded,makeDemands,makeDemandsV2,createInventoryDefaults,normalizeInventory,createCityState,createFreshStateFromPackage};
})(window);
