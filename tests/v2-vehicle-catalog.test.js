const assert = require('node:assert/strict');
const {existsSync, readFileSync} = require('node:fs');
const {join} = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = join(__dirname, '..');

function load(file, window) {
  vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), vm.createContext({
    window,
    console,
    CustomEvent: class {},
  }), {filename: file});
}

function loadCatalog() {
  const window = {};
  load('v2/vehicle-catalog.js', window);
  return window.HFVehicleCatalog.VEHICLE_CATALOG;
}

test('VEHICLE_TYPES enthält exakt die beiden Fluto-Modelle', () => {
  const window = {};
  load('v2/vehicle-catalog.js', window);
  assert.deepEqual(Array.from(window.HFVehicleCatalog.VEHICLE_TYPES), ['fluto-gianco', 'fluto-gianco-fr']);
});

test('Fluto Gianco ist mit Stammdaten und passenden PNG-Assets registriert', () => {
  const catalog = loadCatalog();
  const vehicle = catalog['fluto-gianco'];
  assert.ok(vehicle, 'Fluto Gianco fehlt im Fahrzeugkatalog');
  assert.equal(vehicle.brand, 'Fluto');
  assert.equal(vehicle.model, 'Gianco');
  assert.equal(vehicle.load, 2);

  const window = {};
  load('v2/vehicle-assets.js', window);
  assert.equal(window.HFV2VehicleAssets.vehicleImage(vehicle.id), 'assets/vehicles/fluto-gianco.png');
  assert.equal(window.HFV2VehicleAssets.roadVehicleImage(vehicle.id), 'assets/vehicles/fluto-gianco-road.png');
});

test('Fluto Gianco FR ist ein eigenständiger Kühltransporter mit Hauptasset', () => {
  const catalog = loadCatalog();
  const vehicle = catalog['fluto-gianco-fr'];
  assert.ok(vehicle, 'Fluto Gianco FR fehlt im Fahrzeugkatalog');
  assert.notStrictEqual(vehicle, catalog['fluto-gianco']);
  assert.equal(vehicle.id, 'fluto-gianco-fr');
  assert.equal(vehicle.load, 1.7);
  assert.equal(vehicle.refrigerated, true);
  const window = {};
  load('v2/vehicle-assets.js', window);
  const mainAsset = window.HFV2VehicleAssets.vehicleImage(vehicle.id);
  assert.equal(mainAsset, 'assets/vehicles/fluto-gianco.png');
  assert.equal(existsSync(join(ROOT, 'v2', mainAsset)), true);
});

test('Fahrzeugkatalog enthält vollständige, eindeutige Modelle und Pflichtassets', () => {
  const catalog = loadCatalog();
  const ids = new Set();

  for (const [key, vehicle] of Object.entries(catalog)) {
    assert.equal(vehicle.id, key, `${key}: Schlüssel und id müssen übereinstimmen`);
    assert.match(vehicle.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${key}: ungültiger ASCII-Slug`);
    assert.equal(ids.has(vehicle.id), false, `${key}: doppelte id`);
    ids.add(vehicle.id);

    for (const field of ['brandId', 'brand', 'model', 'category', 'mode']) {
      assert.equal(typeof vehicle[field], 'string', `${key}: ${field} muss eine Zeichenkette sein`);
      assert.notEqual(vehicle[field].trim(), '', `${key}: ${field} fehlt`);
    }
    for (const field of ['load', 'speed', 'cost', 'daily', 'kmCost']) {
      assert.equal(Number.isFinite(vehicle[field]) && vehicle[field] > 0, true, `${key}: ${field} muss positiv und endlich sein`);
    }
    assert.equal(existsSync(join(ROOT, 'v2', 'assets', 'vehicles', `${vehicle.id}.png`)), true, `${key}: Pflichtasset fehlt`);
  }
});

test('Fluto-Modelle bleiben beim Kaufen, Speichern und Laden getrennte Fahrzeugtypen', () => {
  const catalog = loadCatalog();
  const models = Object.values(catalog);

  let cash = 500000;
  const fleetWindow = {
    HFVehicleCatalog: {VEHICLE_TYPES: Object.keys(catalog), VEHICLE_CATALOG: catalog},
    HFV2Save: {STARTING_CASH: cash, getCash: () => cash, changeCash: delta => { cash += delta; }},
    HFNetwork: {getState: () => ({cities: {zurich: {unlocked: true}}})},
  };
  load('v2/fleet-logic.js', fleetWindow);
  fleetWindow.HFFleet.configure({state: {vehicles: [], nextVehicleId: 1, depotCityId: 'zurich'}});
  for (const model of models) assert.equal(fleetWindow.HFFleet.buyVehicle('zurich', model.id).ok, true);

  const saveWindow = {dispatchEvent() {}};
  load('v2/save-logic.js', saveWindow);
  const serialized = saveWindow.HFV2Save.serializeState({state: {fleet: fleetWindow.HFFleet.getState()}});
  const loaded = saveWindow.HFV2Save.hydrateState(serialized).state.fleet;
  fleetWindow.HFFleet.configure({state: loaded});

  assert.deepEqual(
    Array.from(fleetWindow.HFFleet.getState().vehicles, vehicle => vehicle.vehicleType),
    models.map(model => model.id),
  );
});

test('alte Fahrzeugtypen werden in Fluto-Modelle migriert, auch in Aufträgen und Sendungen', () => {
  const window = {dispatchEvent() {}};
  load('v2/save-logic.js', window);
  const state = window.HFV2Save.hydrateState({state: {
    fleet: {vehicles: [
      {id: 1, vehicleType: 'van'},
      {id: 2, vehicleType: 'reefer'},
    ]},
    logistics: {
      orders: [{id: 1, vehicleType: 'heavy-truck'}, {id: 2, vehicleType: 'refrigerated-van'}],
      shipments: [{id: 1, vehicleType: 'tipper'}, {id: 2, vehicleType: 'reefer'}],
    },
  }}).state;

  assert.deepEqual(Array.from(state.fleet.vehicles, vehicle => vehicle.vehicleType), ['fluto-gianco', 'fluto-gianco-fr']);
  assert.deepEqual(Array.from(state.logistics.orders, order => order.vehicleType), ['fluto-gianco', 'fluto-gianco-fr']);
  assert.deepEqual(Array.from(state.logistics.shipments, shipment => shipment.vehicleType), ['fluto-gianco', 'fluto-gianco-fr']);
});
