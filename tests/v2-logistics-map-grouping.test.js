const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync('v2/logistics-map-layer.js', 'utf8');

function setup() {
  const layers = new Set();
  const map = {latLngToLayerPoint: ([lat, lng]) => ({x: lng * 10, y: lat * 10})};
  const L = {
    divIcon: options => options,
    layerGroup: () => ({
      _map: null,
      addTo(target) { this._map = target; return this; },
      remove() { this._map = null; },
      clearLayers() { layers.clear(); },
      removeLayer(marker) { layers.delete(marker); },
    }),
    marker: (position, options) => ({
      position,
      options,
      addTo() { layers.add(this); return this; },
      bindTooltip(content) { this.tooltip = content; return this; },
      getLatLng() { return {lat: this.position[0], lng: this.position[1]}; },
      setLatLng(next) { this.position = next; },
      setIcon(icon) { this.options.icon = icon; },
      setTooltipContent(content) { this.tooltip = content; },
    }),
  };
  const window = {
    L,
    HFV2Time: {getState: () => ({day: 1, hour: 0, minute: 5})},
    HFV2Logistics: {absoluteMinute: () => 5},
    HFV2GoodsCatalog: [{id: 'wood', name: 'Holz', unit: {unit: 'kg', kgPerUnit: 1}}],
    HFV2VehicleAssets: {},
    HFVehicleCatalog: {VEHICLE_CATALOG: {truck: {name: 'Lastwagen', icon: '🚚'}}},
  };
  vm.runInNewContext(source, {window, L, Map, Set, Math, Number, String, Array, Date});
  window.HFV2LogisticsLayer.initLogisticsLayer(map);
  return {api: window.HFV2LogisticsLayer, layers, map};
}

const cities = {
  a: {id: 'a', name: 'Aarau', lat: 0, lng: 0},
  b: {id: 'b', name: 'Bern', lat: 0, lng: 10},
  c: {id: 'c', name: 'Chur', lat: 10, lng: 10},
};

function shipment(id, routeGeometry, toCityId = 'b', goodId = 'wood') {
  return {id, status: 'active', fromCityId: 'a', toCityId, vehicleType: 'truck', goodId, amountKg: 800, departureAbsMinute: 0, arrivalAbsMinute: 10, routeGeometry};
}

test('ein einzelner Transport behält Fahrzeug, Richtung und Fortschritt', () => {
  const {api, layers} = setup();
  api.renderActiveShipments([shipment('one', [[0, 0], [0, 10]])], cities);
  assert.equal(layers.size, 1);
  const [marker] = layers;
  assert.match(marker.options.icon.html, /hf-v2-transport-direction/);
  assert.match(marker.options.icon.html, /width:50%/);
  assert.doesNotMatch(marker.options.icon.html, /× 1/);
});

test('nahe Transporte werden mit Anzahl und Lieferdetails gruppiert', () => {
  const {api, layers} = setup();
  api.renderActiveShipments([
    shipment('one', [[0, 0], [0, 10]]),
    shipment('two', [[0, .2], [0, 10.2]], 'c'),
  ], cities);
  assert.equal(layers.size, 1);
  const [marker] = layers;
  assert.match(marker.options.icon.html, /× 2/);
  assert.doesNotMatch(marker.options.icon.html, /hf-v2-transport-direction/);
  assert.match(marker.tooltip, /2 Transporte/);
  assert.match(marker.tooltip, /Bern/);
  assert.match(marker.tooltip, /Chur/);
  assert.match(marker.tooltip, /Holz/);
});

test('eine Gruppe löst sich nach einer Positionsänderung wieder auf', () => {
  const {api, layers} = setup();
  api.renderActiveShipments([
    shipment('one', [[0, 0], [0, 10]]),
    shipment('two', [[0, .2], [0, 10.2]]),
  ], cities);
  assert.equal(layers.size, 1);

  api.renderActiveShipments([
    shipment('one', [[0, 0], [0, 10]]),
    shipment('two', [[10, 0], [10, 10]], 'c'),
  ], cities);
  assert.equal(layers.size, 2);
  for (const marker of layers) assert.doesNotMatch(marker.options.icon.html, /× 2/);
});
