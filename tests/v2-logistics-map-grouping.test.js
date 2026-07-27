const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync('v2/logistics-map-layer.js', 'utf8');

function setup({goods, goodImage} = {}) {
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
    HFV2GoodsCatalog: goods || [{id: 'wood', name: 'Holz', icon: '🪵', unit: {unit: 'kg', kgPerUnit: 1}}],
    HFV2GoodsAssets: {goodImage: goodImage || (goodId => goodId === 'wood' ? '/goods/wood.png' : '')},
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
  assert.match(marker.options.icon.html, /class="hf-v2-transport-marker__good-icon" src="\/goods\/wood\.png"/);
  assert.match(marker.options.icon.html, /Geladene Waren: Holz/);
  assert.match(marker.options.title, /geladen: Holz/);
});

test('Sammellieferungen zeigen eindeutige Waren und einen kompakten Überlauf', () => {
  const goods = ['wood', 'apples', 'fish', 'tools', 'ore'].map(id => ({id, name: id.toUpperCase(), icon: '📦'}));
  const {api, layers} = setup({goods, goodImage: id => `/goods/${id}.png`});
  const bundled = {...shipment('bundle', [[0, 0], [0, 10]]), stops: [
    {toCityId: 'b', goodId: 'wood', amountKg: 10},
    {toCityId: 'b', goodId: 'apples', amountKg: 10},
    {toCityId: 'b', goodId: 'fish', amountKg: 10},
    {toCityId: 'b', goodId: 'tools', amountKg: 10},
    {toCityId: 'b', goodId: 'ore', amountKg: 10},
    {toCityId: 'b', goodId: 'wood', amountKg: 10},
  ]};
  api.renderActiveShipments([bundled], cities);
  const [marker] = layers;
  assert.equal((marker.options.icon.html.match(/<img class="hf-v2-transport-marker__good-icon"/g) || []).length, 3);
  assert.match(marker.options.icon.html, /hf-v2-transport-marker__badge--multiple/);
  assert.match(marker.options.icon.html, />\+2<\/span>/);
  assert.match(marker.options.title, /WOOD, APPLES, FISH, TOOLS, ORE/);
});

test('bereits ausgeladene oder gescheiterte Stopps verschwinden aus dem Marker', () => {
  const goods = [
    {id: 'wood', name: 'Holz', icon: '🪵'},
    {id: 'apples', name: 'Äpfel', icon: '🍎'},
    {id: 'fish', name: 'Fisch', icon: '🐟'},
    {id: 'tools', name: 'Werkzeug', icon: '🛠️'},
  ];
  const {api, layers} = setup({goods, goodImage: () => ''});
  const bundled = {...shipment('unloaded', [[0, 0], [0, 10]]), stops: [
    {toCityId: 'b', goodId: 'wood', amountKg: 10, status: 'delivered'},
    {toCityId: 'b', goodId: 'apples', amountKg: 10, status: 'failed'},
    {toCityId: 'b', goodId: 'fish', amountKg: 10, status: 'partial'},
    {toCityId: 'b', goodId: 'tools', amountKg: 10, status: 'pending'},
  ]};
  api.renderActiveShipments([bundled], cities);
  const [marker] = layers;
  assert.match(marker.options.icon.html, /🛠️/);
  assert.doesNotMatch(marker.options.icon.html, /🪵|🍎|🐟/);
  assert.match(marker.options.title, /geladen: Werkzeug/);
});

test('fehlende Warenbilder verwenden Katalog-Icon und Paket-Fallback', () => {
  const {api, layers} = setup({goods: [
    {id: 'wood', name: 'Holz', icon: '🪵'},
    {id: 'unknown', name: 'Unbekannt'},
  ], goodImage: () => ''});
  api.renderActiveShipments([
    shipment('icon', [[0, 0], [0, 10]], 'b', 'wood'),
    shipment('box', [[10, 0], [10, 10]], 'c', 'unknown'),
  ], cities);
  const html = [...layers].map(marker => marker.options.icon.html).join('');
  assert.match(html, /🪵/);
  assert.match(html, /📦/);
});

test('Leerfahrten und wartende Fahrzeuge behalten nicht-blaue Statusindikatoren', () => {
  const {api, layers} = setup();
  api.renderActiveShipments([], cities, [{
    id: 'empty', type: 'repositioning', status: 'active', fromCityId: 'a', toCityId: 'b',
    vehicleType: 'truck', departureAbsMinute: 0, arrivalAbsMinute: 10, routeGeometry: [[0, 0], [0, 10]],
  }], [{id: 'idle', status: 'available', currentCityId: 'c', vehicleType: 'truck'}]);
  const html = [...layers].map(marker => marker.options.icon.html).join('');
  assert.match(html, /hf-v2-transport-marker--empty[\s\S]*hf-v2-transport-marker__badge--status[\s\S]*>○</);
  assert.match(html, /hf-v2-transport-marker--waiting[\s\S]*hf-v2-transport-marker__badge--status[\s\S]*>P</);
  assert.match(html, /aria-label="Leerfahrt"/);
  assert.match(html, /aria-label="Fahrzeug wartet"/);
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
