(function(){'use strict';
function createStateApi({CITIES,CITY,VEHICLES,GOODS,DEMAND_GOODS,createCityState,migrateState,hfClone,hfSafeGet,HF_SAVE_KEY,HF_SAVE_LAST_GOOD_KEY,HF_SAVE_BACKUP_1_KEY,HF_SAVE_BACKUP_2_KEY,hfReadEnvelope,hfStateIsStructurallyValid}){
function freshState(){const cities={}; CITIES.forEach(c=>cities[c.id]=createCityState(c,{unlocked:c.id==='zurich'}));return {version:8,day:1,hour:8,minute:0,cash:335000,reputation:0,totalRevenue:0,totalDelivered:0,selected:'zurich',tab:'city',cities,connections:[],shipments:[],routes:[],fleet:{van:1,lightTruck:0,heavyTruck:0,artic:0,freightTrain:0},usedCapacity:{},usedVehicles:{},history:[],tutorial:0};}
function load(){const candidates=[HF_SAVE_KEY,HF_SAVE_LAST_GOOD_KEY,HF_SAVE_BACKUP_1_KEY,HF_SAVE_BACKUP_2_KEY];for(const key of candidates){try{const raw=hfSafeGet(key);if(!raw)continue;const source=hfReadEnvelope(raw);if(!hfStateIsStructurallyValid(source))continue;const migrated=migrateState(hfClone(source));if(hfStateIsStructurallyValid(migrated))return migrated;}catch(err){console.warn('Spielstand konnte nicht aus '+key+' geladen werden',err)}}return null;}
function initialState(){return window.__HF_FORCE_CLEAN_START__?freshState():(load()||freshState());}
return {freshState,load,initialState};}
window.HF_STATE={createStateApi};
})();
