const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function load(file, window) {
  vm.runInContext(readFileSync(file, 'utf8'), vm.createContext({window, console, CustomEvent: class {}}), {filename: file});
}

function fleetHarness(vehicles = []) {
  let cash = 500000;
  const window = {
    HFVehicleCatalog: {VEHICLE_TYPES: ['van'], VEHICLE_CATALOG: {van: {cost: 1000}}},
    HFV2Save: {STARTING_CASH: 500000, getCash: () => cash, changeCash: delta => { cash += delta; }},
    HFNetwork: {getState: () => ({cities: {zurich: {unlocked: true}, bern: {unlocked: true}}})},
  };
  load('v2/fleet-logic.js', window);
  window.HFFleet.configure({state: {vehicles, nextVehicleId: vehicles.length + 1, depotCityId: 'zurich'}});
  return window;
}

test('Generierung verwendet ein lesbares Schweizer Format ohne mehrdeutige Zufallsziffern', () => {
  const window = fleetHarness();
  const plate = window.HFFleet.generateLicensePlate('zurich', new Set(), {random: () => 0});
  assert.match(plate, /^ZH [2-9]{6}$/);
  assert.doesNotMatch(plate, /[01IO]/);
});

test('Kollisionen werden innerhalb der zentralen Generierung wiederholt', () => {
  const window = fleetHarness();
  const first = window.HFFleet.generateLicensePlate('bern', new Set(), {seed: 9});
  const second = window.HFFleet.generateLicensePlate('bern', new Set([first]), {seed: 9});
  assert.notEqual(second, first);
  assert.match(second, /^BE [2-9]{6}$/);
});

test('Kauf erzeugt und speichert genau eine eindeutige sichtbare Fahrzeugidentität', () => {
  const window = fleetHarness();
  const result = window.HFFleet.buyVehicle('zurich', 'van');
  assert.equal(result.ok, true);
  assert.equal(result.vehicle.licensePlate, window.HFFleet.getState().vehicles[0].licensePlate);
  assert.match(result.vehicle.licensePlate, /^ZH [2-9]{6}$/);
});

test('Normalisierung erhält Kennzeichen und migriert ältere Fahrzeuge stabil und eindeutig', () => {
  const window = fleetHarness([
    {id: 4, vehicleType: 'van', currentCityId: 'bern'},
    {id: 5, vehicleType: 'van', currentCityId: 'bern'},
    {id: 6, vehicleType: 'van', currentCityId: 'zurich', licensePlate: 'ZH 876543'},
  ]);
  const first = window.HFFleet.getState().vehicles.map(vehicle => vehicle.licensePlate);
  window.HFFleet.configure({state: window.HFFleet.getState()});
  const second = window.HFFleet.getState().vehicles.map(vehicle => vehicle.licensePlate);
  assert.deepEqual(second, first);
  assert.equal(new Set(first).size, first.length);
  assert.equal(first[2], 'ZH 876543');
});

test('Speichern und Laden erhält Kennzeichen; anschließende Migration bleibt speicherbar', () => {
  const saveWindow = {dispatchEvent() {}};
  load('v2/save-logic.js', saveWindow);
  const loaded = saveWindow.HFV2Save.hydrateState({state: {fleet: {vehicles: [
    {id: 7, vehicleType: 'van', currentCityId: 'zurich', licensePlate: 'ZH 234567'},
    {id: 8, vehicleType: 'van', currentCityId: 'bern'},
  ]}}}).state;
  assert.equal(loaded.fleet.vehicles[0].licensePlate, 'ZH 234567');

  const fleetWindow = fleetHarness(loaded.fleet.vehicles);
  const migrated = fleetWindow.HFFleet.getState().vehicles[1].licensePlate;
  assert.match(migrated, /^BE [2-9]{6}$/);
  const savedAgain = saveWindow.HFV2Save.serializeState({state: {...loaded, fleet: fleetWindow.HFFleet.getState()}});
  assert.equal(savedAgain.state.fleet.vehicles[1].licensePlate, migrated);
});
