const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const logicSource = readFileSync('v2/network-logic.js', 'utf8');
const layerSource = readFileSync('v2/network-map-layer.js', 'utf8');

function setup() {
  const layers = [];
  const listeners = {};
  const L = {
    layerGroup: () => ({
      _map: null,
      addTo(map) { this._map = map; return this; },
      remove() { this._map = null; },
      clearLayers() { layers.length = 0; },
      addLayer(layer) { layers.push(layer); return this; },
    }),
    polyline: (coords, options) => ({kind: 'line', coords, options, bindTooltip(content) { this.tooltip = content; return this; }}),
    divIcon: options => options,
    marker: (position, options) => ({kind: 'marker', position, options}),
  };
  const window = {
    L,
    HFV2Time: {getState: () => ({day: 1, hour: 0, minute: 30}), absoluteMinute: () => 30},
    addEventListener(name, handler) { listeners[name] = handler; },
    dispatchEvent(event) { listeners[event.type]?.(event); },
  };
  const context = vm.createContext({window, L, CustomEvent: class { constructor(type) { this.type = type; } }, Math, Number, String, Array, Object, Date, Map, Set});
  vm.runInContext(logicSource, context, {filename: 'v2/network-logic.js'});
  vm.runInContext(layerSource, context, {filename: 'v2/network-map-layer.js'});
  window.HFNetworkLayer.initNetworkLayer({});
  return {window, layers};
}

test('Straßen-Bubbles zeigen leere, teilweise und volle Belegung am Streckenmittelpunkt', () => {
  const {window, layers} = setup();
  const connections = [
    {id: 'empty', a: 'a', b: 'b', type: 'localroad', capacity: 3},
    {id: 'partial', a: 'c', b: 'd', type: 'regional', capacity: 8},
    {id: 'full', a: 'e', b: 'f', type: 'localroad', capacity: 3},
    {id: 'curved', a: 'g', b: 'h', type: 'mainroad', capacity: 16, geometry: [[30, 0], [30, 2], [30, 10]]},
    {id: 'rail', a: 'i', b: 'j', type: 'rail', capacity: 10},
  ];
  const cities = Object.fromEntries('abcdefghij'.split('').map((id, index) => [id, {
    id,
    name: id.toUpperCase(),
    lat: Math.floor(index / 2) * 10,
    lng: index % 2 ? 10 : 0,
  }]));
  const state = window.HFNetwork.createNetworkState({connections, usedCapacity: {
    partial: {h0: {one: 2}},
    full: {h0: {one: 1, two: 2}},
  }});
  window.HFNetwork.configure({state, cities: Object.values(cities), citiesById: cities});

  const occupancy = window.HFNetwork.getEdgeOccupancy(connections[1]);
  assert.deepEqual({...occupancy}, {used: 2, capacity: 8});
  assert.equal(Object.isFrozen(occupancy), true);

  window.HFNetworkLayer.renderNetworkLines(connections, cities);
  const markers = layers.filter(layer => layer.kind === 'marker');
  assert.equal(markers.length, 4, 'Bahnverbindungen erhalten keine Belegungs-Bubble');
  assert.deepEqual(markers.map(marker => marker.options.icon.html.match(/>(\d+\/\d+)<\/span>/)[1]), ['0/3', '2/8', '3/3', '0/16']);
  assert.match(markers[1].options.icon.html, /aria-label="Belegung C nach D: 2 von 8"/);
  assert.equal(markers[3].position[0], 30);
  assert.ok(Math.abs(markers[3].position[1] - 5) < .001, 'Mittelpunkt folgt der Länge der mehrteiligen Geometrie');

  state.usedCapacity.empty = {h0: {newReservation: 1}};
  window.dispatchEvent({type: 'hf:network:capacity-changed'});
  const refreshedMarkers = layers.filter(layer => layer.kind === 'marker');
  assert.equal(refreshedMarkers.length, 4, 'Neuzeichnen lässt keine alten Bubble-Layer zurück');
  assert.match(refreshedMarkers[0].options.icon.html, />1\/3<\/span>/);
});

test('Plan → Hinfahrt → Rückfahrt → angekommen zählt ein Fahrzeug je Zeitfenster nur einmal', () => {
  const {window} = setup();
  const edge = {id: 'road', a: 'zurich', b: 'bern', type: 'localroad', capacity: 3, distance: 60};
  const cities = [{id: 'zurich', lat: 47, lng: 8}, {id: 'bern', lat: 46, lng: 7}];
  const networkState = window.HFNetwork.createNetworkState({connections: [edge]});
  window.HFNetwork.configure({state: networkState, cities, citiesById: Object.fromEntries(cities.map(city => [city.id, city]))});
  const path = {reachable: true, distance: 60, edges: [edge], nodes: ['zurich', 'bern']};
  window.HFNetwork.reservePathCapacity(path, {startAbsMinute: 480, endAbsMinute: 540, units: 1, reservationId: 'planned-outbound'});
  window.HFNetwork.reservePathCapacity(path, {startAbsMinute: 540, endAbsMinute: 600, units: 1, reservationId: 'planned-return'});

  window.HFV2Goods = {getCityInventory: () => ({food: 100})};
  window.HFVehicleCatalog = {VEHICLE_CATALOG: {van: {load: 1, speed: 60}}};
  window.HFFleet = {getState: () => ({vehicles: [{id: 1, vehicleType: 'van', currentCityId: 'zurich'}]})};
  vm.runInContext(readFileSync('v2/fleet-dispatch-logic.js', 'utf8'), vm.createContext({window, console}), {filename: 'v2/fleet-dispatch-logic.js'});
  const logisticsState = {orders: [], assignments: [], dispatchPlan: {horizonEndAbsMinute: 10000, legs: [
    {id: 'outbound', type: 'shipment', status: 'planned', orderId: 1, tripId: 'trip-1', vehicleIds: [1], departureAbsMinute: 480, capacityReservationIds: ['planned-outbound']},
    {id: 'return', type: 'return', status: 'planned', orderId: 1, tripId: 'trip-1', vehicleIds: [1], departureAbsMinute: 540, arrivalAbsMinute: 600, capacityReservationIds: ['planned-return']},
  ]}};
  window.HFV2FleetDispatch.configure({state: logisticsState});

  const trip = window.HFV2FleetDispatch.consumeTrip(1, 480, {transferReservations: true, vehicleIds: [1]});
  assert.equal(window.HFNetwork.getEdgeOccupancy(edge, {absMinute: 480}).used, 1, 'Übernahme erzeugt keine zweite Hinfahrt-Reservierung');
  window.HFNetwork.releaseCapacityReservation(trip.capacityReservationIds[0]);
  assert.deepEqual({...window.HFNetwork.getEdgeOccupancy(edge, {absMinute: 480})}, {used: 0, capacity: 3});
  assert.equal(window.HFNetwork.getEdgeOccupancy(edge, {absMinute: 540}).used, 1, 'dieselbe Fahrt zählt auf der Rückfahrt einmal');
  window.HFNetwork.releaseCapacityReservation(trip.plannedReturn.capacityReservationIds[0]);
  assert.deepEqual({...window.HFNetwork.getEdgeOccupancy(edge, {absMinute: 600})}, {used: 0, capacity: 3}, 'unmittelbar nach Fahrtende: 0/3');
});
