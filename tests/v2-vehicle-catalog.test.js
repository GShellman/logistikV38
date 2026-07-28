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

test('Modelle derselben Kategorie bleiben beim Kaufen, Speichern und Laden getrennte Fahrzeugtypen', () => {
  const catalog = loadCatalog();
  const models = Object.values(catalog).filter(vehicle => vehicle.category === 'Transporter');
  assert.ok(models.length >= 2, 'Der Test benötigt zwei Modelle derselben Kategorie');

  let cash = 500000;
  const fleetWindow = {
    HFVehicleCatalog: {VEHICLE_TYPES: Object.keys(catalog), VEHICLE_CATALOG: catalog},
    HFV2Save: {STARTING_CASH: cash, getCash: () => cash, changeCash: delta => { cash += delta; }},
    HFNetwork: {getState: () => ({cities: {zurich: {unlocked: true}}})},
  };
  load('v2/fleet-logic.js', fleetWindow);
  fleetWindow.HFFleet.configure({state: {vehicles: [], nextVehicleId: 1, depotCityId: 'zurich'}});
  for (const model of models.slice(0, 2)) assert.equal(fleetWindow.HFFleet.buyVehicle('zurich', model.id).ok, true);

  const saveWindow = {dispatchEvent() {}};
  load('v2/save-logic.js', saveWindow);
  const serialized = saveWindow.HFV2Save.serializeState({state: {fleet: fleetWindow.HFFleet.getState()}});
  const loaded = saveWindow.HFV2Save.hydrateState(serialized).state.fleet;
  fleetWindow.HFFleet.configure({state: loaded});

  assert.deepEqual(
    Array.from(fleetWindow.HFFleet.getState().vehicles, vehicle => vehicle.vehicleType),
    models.slice(0, 2).map(model => model.id),
  );
});
