const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync('v2/network-logic.js', 'utf8');
function setup(cities, connections = [], extra = {}) {
  const window = {addEventListener() {}, dispatchEvent() {}};
  vm.runInContext(source, vm.createContext({window, CustomEvent: class {}, AbortController, console, structuredClone, Math, Date, Map, Set, JSON}));
  const state = window.HFNetwork.createNetworkState({connections, ...extra});
  const byId = Object.fromEntries(cities.map(city => [city.id, city]));
  window.HFNetwork.configure({state, cities, citiesById: byId});
  return {api: window.HFNetwork, state};
}
function road(id, a, b, geometry) { return {id, a, b, type: 'localroad', geometry, distance: 1, duration: 1, capacity: 3, maintenance: 12}; }
function build(api, state, a, b, geometry) {
  const edges = api.splitRoadsForAutomaticJunctions(road('project', a, b, geometry), state);
  state.connections.push(...edges);
  return edges;
}

test('X-Kreuzung teilt beide Straßen und ist als Wegenetz verbunden', () => {
  const cities = [{id:'w',lat:0,lng:-1},{id:'e',lat:0,lng:1},{id:'s',lat:-1,lng:0},{id:'n',lat:1,lng:0}];
  const {api,state}=setup(cities,[road('old','s','n',[[-1,0],[1,0]])]);
  build(api,state,'w','e',[[0,-1],[0,1]]);
  assert.equal(state.connections.length,4); assert.equal(state.junctions.length,1);
  assert.ok(api.findPath('w','n',{state,mode:'road'}));
  assert.equal(new Set(state.connections.map(e=>e.id)).size,4);
});

test('T-Anschluss und leicht versetztes Snapping nutzen denselben Knoten', () => {
  const cities=[{id:'w',lat:0,lng:-1},{id:'e',lat:0,lng:1},{id:'s',lat:-1,lng:.0002}];
  const {api,state}=setup(cities,[road('old','w','e',[[0,-1],[0,1]])]);
  build(api,state,'s','e2',[[-1,.0002],[.0002,.0002]]);
  assert.ok(api.findPath('s','w',{state}));
  assert.equal(state.connections.length,4);
  assert.ok(state.connections.every(e=>e.a!==e.b && e.distance>0));
});

test('mehrere Kreuzungen werden entlang der neuen Straße sortiert', () => {
  const cities=[{id:'a',lat:0,lng:-2},{id:'b',lat:0,lng:2},{id:'s1',lat:-1,lng:-1},{id:'n1',lat:1,lng:-1},{id:'s2',lat:-1,lng:1},{id:'n2',lat:1,lng:1}];
  const {api,state}=setup(cities,[road('v1','s1','n1',[[-1,-1],[1,-1]]),road('v2','s2','n2',[[-1,1],[1,1]])]);
  const parts=build(api,state,'a','b',[[0,-2],[0,2]]);
  assert.equal(parts.length,3); assert.ok(api.findPath('n1','n2',{state}));
  assert.equal(JSON.stringify(parts.map(e=>e.geometry[0][1])),JSON.stringify([-2,-1,1]));
});

test('vorhandener Junction-Endpunkt wird wiederverwendet', () => {
  const cities=[{id:'a',lat:0,lng:-1},{id:'b',lat:0,lng:1},{id:'n',lat:1,lng:0}];
  const junction={id:'junction-stable',lat:0,lng:0,isJunction:true,name:'J'};
  const {api,state}=setup(cities,[road('old','junction-stable','n',[[0,0],[1,0]])],{junctions:[junction]});
  build(api,state,'a','b',[[0,-1],[0,1]]);
  assert.equal(state.junctions.length,1); assert.ok(api.findPath('a','n',{state}));
});

test('kollineare Überlappung erzeugt weder Nullstrecken noch doppelte Kanten', () => {
  const cities=[{id:'a',lat:0,lng:0},{id:'b',lat:0,lng:2},{id:'c',lat:0,lng:1},{id:'d',lat:0,lng:3}];
  const {api,state}=setup(cities,[road('old','a','b',[[0,0],[0,2]])]);
  build(api,state,'c','d',[[0,1],[0,3]]);
  assert.ok(state.connections.every(e=>e.a!==e.b && e.distance>0));
  const keys=state.connections.map(e=>[e.a,e.b].sort().join(':'));
  assert.equal(new Set(keys).size,keys.length);
});

test('Reservierungen wandern auf Teilkanten und Zustand bleibt speicherbar/reproduzierbar', () => {
  const cities=[{id:'w',lat:0,lng:-1},{id:'e',lat:0,lng:1},{id:'s',lat:-1,lng:0},{id:'n',lat:1,lng:0}];
  const reservations={h0:{trip:2}};
  const {api,state}=setup(cities,[road('old','s','n',[[-1,0],[1,0]])],{usedCapacity:{old:reservations}});
  build(api,state,'w','e',[[0,-1],[0,1]]);
  assert.equal(state.usedCapacity.old,undefined);
  assert.equal(Object.values(state.usedCapacity).filter(v=>v.h0?.trip===2).length,2);
  const saved=JSON.parse(JSON.stringify(state));
  const again=setup(cities,saved.connections,saved).state;
  assert.equal(JSON.stringify(again),JSON.stringify(saved));
  assert.ok(api.findPath('s','e',{state:saved}));
});
