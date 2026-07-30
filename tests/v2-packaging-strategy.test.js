const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function runtime() {
  const window = {HFV2FleetDispatch: {configure() {}}};
  const context = vm.createContext({window});
  for (const file of ['v2/goods-catalog.js', 'v2/load-carrier-catalog.js', 'v2/vehicle-catalog.js', 'v2/vehicle-capacity.js', 'v2/logistics-logic.js']) {
    vm.runInContext(readFileSync(file, 'utf8'), context);
  }
  return window;
}

test('bestehende Transporter lehnen Wechselbehälter explizit ab', () => {
  const window = runtime();
  const cargo = window.HFV2LoadCarrierCatalog.metrics('tools', 1000, 'swap-body');
  const result = window.HFV2VehicleCapacity.evaluate('fluto-gianco', cargo);
  assert.equal(result.ok, false);
  assert.ok(Array.from(result.exceeded).includes('load-carrier'));
  assert.equal(window.HFV2VehicleCapacity.requiredVehicleCount('fluto-gianco', cargo), Infinity);
});

test('Automatik wählt die günstigste kompatible Gesamtkostenalternative', () => {
  const window = runtime();
  window.HFFleet = {VEHICLES: {truck: {load: 14000, containerSlots: 1, palletSlots: 20, euroPalletSlots: 20, kmCost: 2, supportedLoadCarriers: ['euro-pallet', 'swap-body']}}};
  const result = window.HFV2Logistics.selectPackagingStrategy({packagingStrategy: 'automatic', vehicleType: 'truck', goodId: 'tools', amountKg: 7000, distanceKm: 100, durationHours: 2});
  assert.equal(result.selected.strategy, 'swap-body');
  assert.ok(result.alternatives.every(item => item.costs.total > 0));
  assert.ok(result.selected.costs.total < result.alternatives.find(item => item.strategy === 'pallet').costs.total);
});

test('Tara des Wechselbehälters reduziert die nutzbare Fahrzeugkapazität', () => {
  const window = runtime();
  const truck = {load: 12000, containerSlots: 1, palletSlots: 20, euroPalletSlots: 20, supportedLoadCarriers: ['swap-body']};
  const cargo = window.HFV2LoadCarrierCatalog.metrics('tools', 10000, 'swap-body');
  assert.equal(cargo.netKg, 10000);
  assert.equal(cargo.tareKg, 2500);
  assert.equal(cargo.grossKg, 12500);
  assert.equal(window.HFV2VehicleCapacity.evaluate(truck, cargo).ok, false);
  assert.equal(window.HFV2VehicleCapacity.requiredVehicleCount(truck, cargo), 2);
});
