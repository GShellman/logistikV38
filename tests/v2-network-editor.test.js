const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const logicSource=readFileSync('v2/network-logic.js','utf8');
function contextFor(fetch) {
  const window={fetch,addEventListener(){},dispatchEvent(){},HFV2Save:{getCash:()=>1e9}};
  const context=vm.createContext({window,fetch,AbortController,CustomEvent:class{},console,structuredClone,Math,Date,Map,Set,JSON,setTimeout,clearTimeout});
  vm.runInContext(logicSource,context);
  return window;
}

test('OSRM erhält Start, Wegpunkte und Ziel in Reihenfolge; Quote nutzt bearbeitete Route', async()=>{
  let requested='';
  const window=contextFor(async url=>{requested=url;return {ok:true,json:async()=>({code:'Ok',routes:[{distance:42000,duration:3600,geometry:{coordinates:[[8,47],[8.3,47.2],[8.6,47.4]]}}]})};});
  const cities=[{id:'a',lat:47,lng:8},{id:'b',lat:47.4,lng:8.6}];
  const state=window.HFNetwork.createNetworkState();
  window.HFNetwork.configure({state,cities,citiesById:{a:cities[0],b:cities[1]}});
  const project=await window.HFNetwork.planConnection('a','b','localroad',{waypoints:[{lat:47.2,lng:8.3}]});
  assert.match(requested,/8,47;8\.3,47\.2;8\.6,47\.4/);
  assert.equal(project.distance,42);
  assert.equal(project.cost,Math.round(window.HFNetwork.TRANSPORT_TYPES.localroad.baseCost+42*window.HFNetwork.TRANSPORT_TYPES.localroad.buildKm));
  assert.equal(project.waypoints.length,1);
  assert.equal(state.junctions.length,0);
});

test('Menü und Kartenlayer enthalten die vollständigen Editor-Aktionen',()=>{
  const menu=readFileSync('v2/network-menu.js','utf8');
  const layer=readFileSync('v2/network-map-layer.js','utf8');
  for(const label of ['Route auf Karte bearbeiten','Wegpunkt hinzufügen','Wegpunkt entfernen','Anschlussknoten setzen','Bau bestätigen','Automatische Route wiederherstellen','Bearbeitung abbrechen']) assert.match(menu,new RegExp(label));
  assert.match(layer,/draggable: true/); assert.match(layer,/contextmenu/); assert.match(layer,/renderProjectPreview/);
  const handleBody=menu.slice(menu.indexOf('async function handleBuild'),menu.indexOf('function bindNetworkMenuEvents'));
  assert.doesNotMatch(handleBody,/confirmProject/,'handleBuild darf nicht unmittelbar bestätigen');
});
