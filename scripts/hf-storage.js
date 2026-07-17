(function(){
'use strict';
const HF_MEMORY_STORAGE=new Map();
const HF_STORAGE=(()=>{
  try{
    const s=window.localStorage,key='__hf_storage_probe__';
    s.setItem(key,'1');s.removeItem(key);
    return s;
  }catch(err){
    window.__HF_STORAGE_UNAVAILABLE__=true;
    return {
      getItem:key=>HF_MEMORY_STORAGE.has(String(key))?HF_MEMORY_STORAGE.get(String(key)):null,
      setItem:(key,value)=>{HF_MEMORY_STORAGE.set(String(key),String(value))},
      removeItem:key=>{HF_MEMORY_STORAGE.delete(String(key))},
      clear:()=>HF_MEMORY_STORAGE.clear()
    };
  }
})();
const HF_SAVE_KEY='helveticFreightSave_stable';
const HF_SAVE_TEMP_KEY=HF_SAVE_KEY+'_tmp';
const HF_SAVE_LAST_GOOD_KEY=HF_SAVE_KEY+'_lastGood';
const HF_SAVE_BACKUP_1_KEY=HF_SAVE_KEY+'_backup1';
const HF_SAVE_BACKUP_2_KEY=HF_SAVE_KEY+'_backup2';
const HF_SAVE_SCHEMA=1;
const HF_STABILITY_WIPE_MARKER='helveticFreightStabilityWipe_1_1_0';
function hfStorageKeys(){try{const keys=[];if(Number.isFinite(HF_STORAGE.length)&&typeof HF_STORAGE.key==='function'){for(let i=0;i<HF_STORAGE.length;i++){const key=HF_STORAGE.key(i);if(key!=null)keys.push(String(key));}return keys;}return Object.keys(HF_STORAGE||{});}catch(_){return []}}
function hfSafeGet(key){try{return HF_STORAGE.getItem(key)}catch(_){return null}}
function hfSafeSet(key,value){try{HF_STORAGE.setItem(key,String(value));return true}catch(_){return false}}
function hfSafeRemove(key){try{HF_STORAGE.removeItem(key);return true}catch(_){return false}}
function hfClone(value){if(typeof structuredClone==='function')return structuredClone(value);return JSON.parse(JSON.stringify(value));}
function hfStateIsStructurallyValid(value){
  return !!value && typeof value==='object' && Number.isFinite(Number(value.day)) && Number.isFinite(Number(value.cash)) &&
    value.cities && typeof value.cities==='object' && Array.isArray(value.connections) && Array.isArray(value.shipments) && Array.isArray(value.routes);
}
function hfReadEnvelope(raw){
  if(!raw)return null;
  const parsed=JSON.parse(raw);
  return parsed && parsed.state && typeof parsed.state==='object' ? parsed.state : parsed;
}
function hfSaveEnvelope(currentState){
  return JSON.stringify({schemaVersion:HF_SAVE_SCHEMA,buildVersion:'1.1.0',savedAt:new Date().toISOString(),state:currentState});
}
(function hfPerformOneTimeStabilityWipe(){
  if(hfSafeGet(HF_STABILITY_WIPE_MARKER)==='done')return;
  const legacyKeys=hfStorageKeys().filter(key=>
    /^helveticFreightSave/i.test(key) || /^helveticFreightHardReset/i.test(key) || /^helveticFreight.*Wipe/i.test(key)
  ).filter(key=>key!==HF_STABILITY_WIPE_MARKER);
  const recoverable=legacyKeys.map(key=>({key,raw:hfSafeGet(key)})).find(x=>x.raw);
  if(recoverable)hfSafeSet('helveticFreightLegacyArchive_1_1_0',recoverable.raw);
  for(const key of legacyKeys)hfSafeRemove(key);
  hfSafeSet(HF_STABILITY_WIPE_MARKER,'done');
  window.__HF_FORCE_CLEAN_START__=true;
  window.__HF_DID_STABILITY_WIPE__=true;
})();
function createSaveApi({getState,hfSaveEnvelope,hfReadEnvelope,hfStateIsStructurallyValid,toast}){
  function save(show=true){
    if(window.__HF_TITLE_PENDING__)return false;
    if(!window.__HF_BOOT_COMPLETE__){window.__HF_PENDING_SAVE__=true;return false;}
    try{
      const state=getState();
      if(!hfStateIsStructurallyValid(state))throw new Error('Spielzustand ist unvollständig');
      const payload=hfSaveEnvelope(hfClone(state));
      const current=hfSafeGet(HF_SAVE_KEY);
      if(current){const backup1=hfSafeGet(HF_SAVE_BACKUP_1_KEY);if(backup1)hfSafeSet(HF_SAVE_BACKUP_2_KEY,backup1);hfSafeSet(HF_SAVE_BACKUP_1_KEY,current);}
      if(!hfSafeSet(HF_SAVE_TEMP_KEY,payload))throw new Error('Temporärer Spielstand konnte nicht geschrieben werden');
      const verify=hfReadEnvelope(hfSafeGet(HF_SAVE_TEMP_KEY));
      if(!hfStateIsStructurallyValid(verify))throw new Error('Temporärer Spielstand ist ungültig');
      if(!hfSafeSet(HF_SAVE_KEY,payload))throw new Error('Spielstand konnte nicht übernommen werden');
      hfSafeSet(HF_SAVE_LAST_GOOD_KEY,payload);hfSafeRemove(HF_SAVE_TEMP_KEY);window.__HF_PENDING_SAVE__=false;
      if(show)toast(window.__HF_STORAGE_UNAVAILABLE__?'Temporär gespeichert – Browser blockiert dauerhaften Speicher.':'Spielstand sicher gespeichert.','good');
      return true;
    }catch(e){console.warn('Transaktionales Speichern nicht möglich',e);hfSafeRemove(HF_SAVE_TEMP_KEY);if(show)toast('Speichern nicht möglich – der letzte funktionierende Stand bleibt erhalten.','bad');return false;}
  }
  return {save};
}
window.HF_STORAGE_CORE={HF_STORAGE,HF_SAVE_KEY,HF_SAVE_TEMP_KEY,HF_SAVE_LAST_GOOD_KEY,HF_SAVE_BACKUP_1_KEY,HF_SAVE_BACKUP_2_KEY,HF_SAVE_SCHEMA,HF_STABILITY_WIPE_MARKER,hfStorageKeys,hfSafeGet,hfSafeSet,hfSafeRemove,hfClone,hfStateIsStructurallyValid,hfReadEnvelope,hfSaveEnvelope,createSaveApi};
})();
