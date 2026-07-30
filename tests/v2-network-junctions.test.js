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

test('lange OSRM-artige Geometrien werden mit linear begrenzten Segmentprüfungen aufgeteilt', () => {
  const projectGeometry = Array.from({length: 1201}, (_, index) => [0, -2 + 4 * index / 1200]);
  const cities = [{id:'west',lat:0,lng:-2},{id:'east',lat:0,lng:2}];
  const existing = [];
  for (const [index, lng] of [-1, 0, 1].entries()) {
    const south = `s${index}`, north = `n${index}`;
    cities.push({id:south,lat:-1,lng},{id:north,lat:1,lng});
    const geometry = Array.from({length: 601}, (_, part) => [-1 + 2 * part / 600, lng]);
    existing.push(road(`cross-${index}`, south, north, geometry));
  }
  // Real networks also contain many roads whose overall bounding boxes cannot
  // touch the project. They must be rejected without scanning their segments.
  for (let index = 0; index < 20; index++) {
    const a = `far-a-${index}`, b = `far-b-${index}`, lat = 5 + index / 10;
    cities.push({id:a,lat,lng:-2},{id:b,lat,lng:2});
    existing.push(road(`far-${index}`, a, b,
      Array.from({length: 401}, (_, part) => [lat, -2 + 4 * part / 400])));
  }

  const {api,state} = setup(cities, existing);
  const parts = build(api, state, 'west', 'east', projectGeometry);
  const stats = api.getIntersectionStats();
  assert.equal(parts.length, 4);
  assert.equal(state.junctions.length, 3);
  assert.ok(api.findPath('west', 'n2', {state, mode:'road'}));
  assert.ok(stats.segmentChecks < 100,
    `Bounding-Box-Filter führte unerwartet ${stats.segmentChecks} genaue Segmentprüfungen aus`);
  assert.ok(stats.bboxRejects > 1000000, 'Segment-Bounding-Boxen sollten den kartesischen Vergleich früh verwerfen');
});

test('nahe parallele OSRM-Geometrien erzeugen keine Kette aus Miniabschnitten', () => {
  const points = 801;
  const existingGeometry = Array.from({length: points}, (_, index) => [0.0002, index / (points - 1) * 2]);
  const projectGeometry = Array.from({length: points + 801}, (_, index) => [0, -1 + index / (points + 800) * 4]);
  const cities = [
    {id:'west',lat:0,lng:-1}, {id:'east',lat:0,lng:3},
    {id:'parallel-west',lat:0.0002,lng:0}, {id:'parallel-east',lat:0.0002,lng:2},
  ];
  const {api,state} = setup(cities, [road('parallel', 'parallel-west', 'parallel-east', existingGeometry)]);

  const parts = build(api, state, 'west', 'east', projectGeometry);
  // The middle project part has the same graph endpoints as the existing road
  // and is intentionally discarded as a duplicate.
  assert.equal(parts.length, 2, 'nur die beiden Endpunkte der bestehenden Straße dürfen einrasten');
  assert.equal(state.connections.length, 3);
  assert.equal(state.junctions.length, 0);
  assert.ok(api.findPath('west', 'parallel-east', {state, mode:'road'}));
});

test('gemeinsamer Straßenkorridor wird an Ein- und Ausfahrt verbunden statt doppelt gebaut', () => {
  const existingGeometry = Array.from({length: 401}, (_, index) => [0, index / 200]);
  const shared = Array.from({length: 321}, (_, index) => [0.0002, 0.2 + index / 200]);
  const projectGeometry = [[0.01, -0.5], ...shared, [0.01, 2.5]];
  const cities = [
    {id:'west',lat:0.01,lng:-0.5}, {id:'east',lat:0.01,lng:2.5},
    {id:'road-west',lat:0,lng:0}, {id:'road-east',lat:0,lng:2},
  ];
  const {api,state} = setup(cities, [road('existing', 'road-west', 'road-east', existingGeometry)]);

  const parts = build(api, state, 'west', 'east', projectGeometry);
  assert.equal(parts.length, 2, 'der parallele Mittelteil muss durch die bestehende Straße ersetzt werden');
  assert.equal(state.junctions.length, 2, 'der gemeinsame Korridor benötigt nur Ein- und Ausfahrt');
  assert.equal(state.connections.length, 5, 'bestehende Straße wird dreigeteilt und nur zwei Zufahrten werden ergänzt');
  assert.ok(api.findPath('west', 'east', {state, mode:'road'}));
  const sharedEdges = state.connections.filter(edge => sameEndpointsForTest(edge, parts[0].b, parts[1].a));
  assert.equal(sharedEdges.length, 1, 'zwischen den Anschlussknoten darf nur die bestehende Straße liegen');
});

function sameEndpointsForTest(edge, a, b) {
  return (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a);
}

test('Kreuzungen in der Stadtzufahrt bleiben eine durchgehende Straße bis ins Zentrum', () => {
  const cities = [{id:'centre',lat:0,lng:0},{id:'outside',lat:0,lng:0.1}];
  const existing = [];
  for (const [index, lng] of [0.001, 0.0025, 0.004, 0.02].entries()) {
    const south = `city-s-${index}`, north = `city-n-${index}`;
    cities.push({id:south,lat:-0.01,lng},{id:north,lat:0.01,lng});
    existing.push(road(`city-cross-${index}`, south, north, [[-0.01,lng],[0.01,lng]]));
  }
  const {api,state} = setup(cities, existing);

  const parts = build(api, state, 'centre', 'outside', [[0,0],[0,0.1]]);
  assert.equal(parts.length, 2, 'die drei zentrumsnahen Kreuzungen dürfen die Zufahrt nicht zerstückeln');
  assert.equal(state.junctions.length, 1, 'nur die Kreuzung außerhalb der Stadtzufahrt wird zum Netzknoten');
  assert.equal(state.connections.filter(edge => edge.a === 'centre' || edge.b === 'centre').length, 1,
    'vom Zentrum darf pro Richtung nur ein Straßenabschnitt wegführen');
  assert.ok(api.findPath('centre', 'city-n-3', {state, mode:'road'}));
});

test('Wegpunkte sind reine Formkontrolle und deaktivierte Kandidaten bleiben unverbunden', () => {
  const cities=[{id:'w',lat:0,lng:-1},{id:'e',lat:0,lng:1},{id:'s',lat:-1,lng:0},{id:'n',lat:1,lng:0}];
  const {api,state}=setup(cities,[road('old','s','n',[[-1,0],[1,0]])]);
  const project={...road('project','w','e',[[0,-1],[0,1]]),waypoints:[{lat:0,lng:-.5}]};
  const candidates=api.findConnectionCandidates(project,state);
  project.connectionPoints=candidates.map(point=>({...point,enabled:false}));
  state.connections.push(...api.splitRoadsForAutomaticJunctions(project,state));
  assert.equal(state.junctions.length,0,'Wegpunkt und deaktivierte Kreuzung dürfen keine Knoten erzeugen');
  assert.equal(api.findPath('w','n',{state,mode:'road'}),null);
});

test('bestätigter Anschluss teilt beide Kanten an der ausgewählten Kreuzung', () => {
  const cities=[{id:'w',lat:0,lng:-1},{id:'e',lat:0,lng:1},{id:'s',lat:-1,lng:0},{id:'n',lat:1,lng:0}];
  const {api,state}=setup(cities,[road('old','s','n',[[-1,0],[1,0]])]);
  const project=road('project','w','e',[[0,-1],[0,1]]);
  project.connectionPoints=api.findConnectionCandidates(project,state);
  const parts=api.splitRoadsForAutomaticJunctions(project,state); state.connections.push(...parts);
  assert.equal(parts.length,2); assert.equal(state.connections.length,4); assert.equal(state.junctions.length,1);
  assert.ok(api.findPath('w','n',{state,mode:'road'}));
});
