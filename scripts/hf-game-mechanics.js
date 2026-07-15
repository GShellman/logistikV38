(function(global){
'use strict';
function seeded(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
  return()=>((h=Math.imul(h^h>>>15,1|h)+Math.imul(h^h>>>7,61|h)^h>>>14)>>>0)/4294967296;
}
function makeDemands(city,demandGoods){
  const r=seeded(city.id);
  const picks=[...demandGoods].sort(()=>r()-.5).slice(0,city.tier+1);
  return Object.fromEntries(picks.map(g=>[g,{need:Math.round(3+city.tier*2+r()*5),max:Math.round(6+city.tier*3+r()*6),mult:+(0.9+r()*.35).toFixed(2)}]));
}
function createInventoryDefaults(goods){
  return Object.fromEntries(Object.keys(goods).map(id=>[id,0]));
}
function normalizeInventory(inventory={},goods){
  const normalized=createInventoryDefaults(goods);
  for(const [id,amount] of Object.entries(inventory||{})){
    if(goods[id]||Number(amount))normalized[id]=Number.isFinite(Number(amount))?Number(amount):0;
  }
  return normalized;
}
function createCityState(city,goods,demandGoods,{unlocked=false}={}){
  return {unlocked,inventory:createInventoryDefaults(goods),facilities:[],demands:makeDemands(city,demandGoods),sales:0};
}
global.HF_GAME_MECHANICS={seeded,makeDemands,createInventoryDefaults,normalizeInventory,createCityState};
})(window);
