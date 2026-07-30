const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync('v2/network-logic.js', 'utf8');
function setup(cities, connections = []) {
  const window = {addEventListener() {}, dispatchEvent() {}};
  vm.runInContext(source, vm.createContext({window, CustomEvent: class {}, AbortController, console, structuredClone, Math, Date, Map, Set, JSON}));
  const state = window.HFNetwork.createNetworkState({connections});
  window.HFNetwork.configure({state, cities, citiesById: Object.fromEntries(cities.map(city => [city.id, city]))});
  return {api: window.HFNetwork, state};
}
function road(id, a, b, geometry) {
  return {id, a, b, type: 'localroad', geometry, distance: 1, duration: 1, capacity: 3, maintenance: 12};
}

test('Kreuzungen werden ohne manuellen Knoten nicht verbunden', () => {
  const cities = [{id:'w',lat:0,lng:-1},{id:'e',lat:0,lng:1},{id:'s',lat:-1,lng:0},{id:'n',lat:1,lng:0}];
  const {api,state} = setup(cities, [road('old','s','n',[[-1,0],[1,0]])]);
  const parts = api.splitRoadsForAutomaticJunctions(road('project','w','e',[[0,-1],[0,1]]), state);
  state.connections.push(...parts);
  assert.equal(state.junctions.length, 0);
  assert.equal(parts.length, 1);
  assert.equal(api.findPath('w','n',{state,mode:'road'}), null);
});

test('öffentliche Knotenoperation validiert Fangdistanz und rastet auf die Trasse ein', () => {
  const cities = [{id:'w',lat:0,lng:-1},{id:'e',lat:0,lng:1}];
  const {api,state} = setup(cities);
  const project = road('project','w','e',[[0,-1],[0,1]]);
  assert.equal(api.createManualJunction(project,{lat:1,lng:0},state).reason, 'junction-off-route');
  const result = api.createManualJunction(project,{lat:0.0002,lng:0},state);
  assert.equal(result.ok, true);
  assert.equal(result.junction.lat, 0);
  assert.equal(result.junction.automatic, false);
  assert.equal(result.junction.name, 'Netzknoten');
  assert.equal(state.junctions.length, 0, 'Abbrechen darf noch keinen gespeicherten Knoten hinterlassen');
});

test('bestätigter manueller Knoten teilt neue und bestehende Straße', () => {
  const cities = [{id:'w',lat:0,lng:-1},{id:'e',lat:0,lng:1},{id:'s',lat:-1,lng:0},{id:'n',lat:1,lng:0}];
  const {api,state} = setup(cities, [road('old','s','n',[[-1,0],[1,0]])]);
  const project = road('project','w','e',[[0,-1],[0,1]]);
  assert.equal(api.createManualJunction(project,{lat:0,lng:0},state).ok, true);
  const parts = api.splitRoadsForAutomaticJunctions(project,state);
  state.connections.push(...parts);
  assert.equal(parts.length, 2);
  assert.equal(state.connections.length, 4);
  assert.equal(state.junctions.length, 1);
  assert.equal(state.junctions[0].automatic, false);
  assert.equal(state.junctions[0].name, 'Netzknoten');
  assert.ok(api.findPath('w','n',{state,mode:'road'}));
});

test('Klick auf bestehende Straße plant eine angebundene T-Kreuzung', () => {
  const cities = [{id:'w',lat:0,lng:-1},{id:'s',lat:-1,lng:0},{id:'n',lat:1,lng:0}];
  const {api,state} = setup(cities, [road('old','s','n',[[-1,0],[1,0]])]);
  const project = api.planRoadJunction('w','localroad',[[0,-1],[0,0]],'old',{lat:0,lng:0});
  assert.equal(project.endpointJunction.lat, 0);
  assert.equal(project.endpointJunction.lng, 0);
  const built = api.confirmProject();
  assert.ok(built);
  assert.equal(state.junctions.length, 1);
  assert.equal(state.connections.length, 3, 'bestehende Straße wird in zwei Teile plus neue Zufahrt geteilt');
  assert.ok(api.findPath('w','n',{state,mode:'road'}));
  assert.ok(api.findPath('w','s',{state,mode:'road'}));
});
