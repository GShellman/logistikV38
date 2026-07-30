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

test('Straßenprojekt übernimmt Editor-Geometrie und berechnet daraus die Kennzahlen', async()=>{
  let fetched=false;
  const window=contextFor(async()=>{fetched=true; throw new Error('fetch darf nicht verwendet werden');});
  const cities=[{id:'a',lat:47,lng:8},{id:'b',lat:47.4,lng:8.6}];
  const state=window.HFNetwork.createNetworkState();
  window.HFNetwork.configure({state,cities,citiesById:{a:cities[0],b:cities[1]}});
  const geometry=[[47,8],[47.2,8.3],[47.4,8.6]];
  const project=await window.HFNetwork.planConnection('a','b','localroad',{geometry});
  assert.equal(fetched,false);
  assert.deepEqual(JSON.parse(JSON.stringify(project.geometry)),geometry);
  assert.equal(project.duration,project.distance/window.HFNetwork.TRANSPORT_TYPES.localroad.speed);
  assert.equal(project.cost,Math.round(window.HFNetwork.TRANSPORT_TYPES.localroad.baseCost+project.distance*window.HFNetwork.TRANSPORT_TYPES.localroad.buildKm));
  assert.equal(project.maintenance,Math.round(project.distance*window.HFNetwork.TRANSPORT_TYPES.localroad.maintenanceKm));
  assert.equal(project.waypoints.length,1);
  assert.equal(state.junctions.length,0);
});

test('Menü und Kartenlayer enthalten den expliziten Zeichenmodus',()=>{
  const menu=readFileSync('v2/network-menu.js','utf8');
  const layer=readFileSync('v2/network-map-layer.js','utf8');
  for(const label of ['Zeichenmodus','Straße zeichnen','Knoten setzen','Punkte bearbeiten','Letzten Punkt rückgängig','Wiederholen','Trasse löschen','Abbrechen','Bauen']) assert.match(menu,new RegExp(label));
  assert.doesNotMatch(menu,/Automatische Route|Route und Kreuzungen werden berechnet/);
  assert.match(layer,/editorMode === 'draw'/); assert.match(layer,/editorMode === 'node'/);
  assert.match(layer,/event\.key === 'Escape'/); assert.match(layer,/event\.key === 'Delete'/);
  assert.match(layer,/undoDrawingPoint/); assert.match(layer,/redoDrawingPoint/);
  assert.match(layer,/draggable: true/); assert.match(layer,/beginRoadDrawing/); assert.match(layer,/handleDrawingCityClick/);
  const handleBody=menu.slice(menu.indexOf('async function handleBuild'),menu.indexOf('function bindNetworkMenuEvents'));
  assert.doesNotMatch(handleBody,/confirmProject/,'handleBuild darf nicht unmittelbar bestätigen');
});

test('Bauen ist nur bei einer gültigen Verbindung aktiv',()=>{
  const menu=readFileSync('v2/network-menu.js','utf8');
  assert.match(menu,/class="hf-v2-network-build" \$\{valid \? '' : 'disabled'\}/);
  assert.match(menu,/project\.geometry\?\.length >= 2/);
});

test('Straße ohne Editor-Geometrie ist weder plan- noch bestätigbar', async()=>{
  const window=contextFor();
  const cities=[{id:'a',lat:47,lng:8},{id:'b',lat:47.4,lng:8.6}];
  const state=window.HFNetwork.createNetworkState();
  window.HFNetwork.configure({state,cities,citiesById:{a:cities[0],b:cities[1]}});
  const invalid=await window.HFNetwork.planConnection('a','b','localroad');
  assert.equal(invalid.ok,false);
  assert.equal(invalid.reason,'invalid-geometry');
  assert.equal(window.HFNetwork.confirmProject(),null);
});
