const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function runtime() {
  const window = {
    HFV2GoodsCatalog: [
      {id: 'tools', name: 'Werkzeuge', icon: '🔧', unit: {unit: 'kg', kgPerUnit: 1}, packaging: {loadCarrier: 'euro-pallet', maxNetKgPerCarrier: 700}},
      {id: 'grain', name: 'Getreide', icon: '🌾', unit: {unit: 't', kgPerUnit: 1000}, packaging: {loadCarrier: 'loose'}},
      {id: 'chemicals', name: 'Chemikalien', icon: '⚗️', unit: {unit: 'L', kgPerUnit: 1.1}, packaging: {loadCarrier: 'tank'}},
    ],
    HFV2GoodsAssets: {goodImage: () => ''}, HFV2VehicleAssets: {},
    HFVehicleCatalog: {VEHICLE_CATALOG: {
      pallet: {name: 'Paletten-Lkw', load: 2, palletSlots: 3, loadRegions: [{id: 'deck', visualKind: 'slot', capacityMode: 'discrete', slotCount: 3, capacityKg: 2000}]},
      bulk: {name: 'Kipper', load: 2, loadRegions: [{id: 'body', visualKind: 'bulk', capacityMode: 'proportional', capacityKg: 2000}]},
      tank: {name: 'Tankwagen', load: 2, loadRegions: [{id: 'tank', visualKind: 'liquid', capacityMode: 'proportional', capacityKg: 2000}]},
    }},
    HFV2LoadCarrierCatalog: {LOAD_CARRIER_CATALOG: {
      'euro-pallet': {id: 'euro-pallet', name: 'Europalette', visualKind: 'slot', capacityMode: 'discrete', tareKg: 25},
      loose: {id: 'loose', name: 'Lose Ware', visualKind: 'bulk', capacityMode: 'proportional', tareKg: 0},
      tank: {id: 'tank', name: 'Tank', visualKind: 'liquid', capacityMode: 'proportional', tareKg: 0},
      future: {id: 'future', name: 'Zukunftsträger', visualKind: 'quantum', capacityMode: 'proportional', tareKg: 0},
    }},
  };
  vm.runInNewContext(readFileSync('v2/logistics-map-layer.js', 'utf8'), {window, Map, Set, Math, Number, String, Array, Date});
  return window.HFV2LogisticsLayer;
}

const fleet = (...types) => new Map(types.map((type, index) => [String(index + 1), {id: String(index + 1), vehicleType: type}]));

test('vollständige und teilweise Paletten sowie freie Stellplätze bleiben sichtbar', () => {
  const api = runtime();
  const model = api.normalizeCargoVisualization({vehicleIds: ['1'], vehicleType: 'pallet', goodId: 'tools', amountKg: 1050}, fleet('pallet'));
  assert.deepEqual(Array.from(model.vehicles[0].cargo, item => item.netKg), [700, 350]);
  const html = api.cargoVisualizationMarkup({vehicleIds: ['1'], vehicleType: 'pallet', goodId: 'tools', amountKg: 1050}, fleet('pallet'));
  assert.match(html, /Stellplatz 1: Werkzeuge, 100 Prozent belegt/);
  assert.match(html, /Stellplatz 2: Werkzeuge, 50 Prozent belegt/);
  assert.match(html, /Stellplatz 3: frei/);
});

test('Schüttgut, Flüssigkeit und Mischladung werden proportional segmentiert', () => {
  const api = runtime();
  for (const [type, goodId, carrier] of [['bulk', 'grain', 'loose'], ['tank', 'chemicals', 'tank']]) {
    const html = api.cargoVisualizationMarkup({vehicleIds: ['1'], vehicleType: type, goodId, amountKg: 1000, loadCarrier: carrier}, fleet(type));
    assert.match(html, /Laderaum zu 50 Prozent belegt/);
    assert.match(html, /hf-v2-cargo-segment/);
  }
  const mixed = {vehicleIds: ['1'], vehicleType: 'bulk', stops: [{goodId: 'grain', amountKg: 600}, {goodId: 'chemicals', amountKg: 400, loadCarrier: 'tank'}]};
  const html = api.cargoVisualizationMarkup(mixed, fleet('bulk'));
  assert.match(html, /Getreide/); assert.match(html, /Chemikalien/);
  assert.equal((html.match(/hf-v2-cargo-segment/g) || []).length, 2);
});

test('mehrere Fahrzeuge verteilen Mengen deterministisch und ohne Rundungsverlust', () => {
  const api = runtime();
  const model = api.normalizeCargoVisualization({vehicleIds: ['1', '2'], vehicleType: 'bulk', goodId: 'grain', amountKg: 2500}, fleet('bulk', 'bulk'));
  assert.deepEqual(Array.from(model.vehicles, vehicle => vehicle.cargo.reduce((sum, item) => sum + item.netKg, 0)), [2000, 500]);
  assert.equal(model.vehicles.flatMap(vehicle => vehicle.cargo).reduce((sum, item) => sum + item.netKg, 0), 2500);
});

test('Rückladung, Leerfahrt und wartendes Fahrzeug werden normalisiert', () => {
  const api = runtime();
  const returning = api.normalizeCargoVisualization({status: 'returning', vehicleIds: ['1'], vehicleType: 'pallet', returnStops: [{goodId: 'tools', amountKg: 350}]}, fleet('pallet'));
  assert.equal(returning.cargo[0].netKg, 350);
  assert.match(api.cargoVisualizationMarkup({status: 'returning', vehicleIds: ['1'], vehicleType: 'pallet'}, fleet('pallet')), /Leerfahrt/);
  assert.match(api.cargoVisualizationMarkup({type: 'waiting', vehicleIds: ['1'], vehicleType: 'pallet'}, fleet('pallet')), /Fahrzeug wartet/);
});

test('unbekannte visualKind-Werte fallen auf eine neutrale Auslastungsanzeige zurück', () => {
  const api = runtime();
  const shipment = {vehicleIds: ['1'], vehicleType: 'bulk', goodId: 'grain', amountKg: 500, loadCarrier: 'future'};
  assert.equal(api.normalizeCargoVisualization(shipment, fleet('bulk')).cargo[0].visualKind, 'container');
  assert.match(api.cargoVisualizationMarkup(shipment, fleet('bulk')), /Laderaum zu 25 Prozent belegt/);
});
