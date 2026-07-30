const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function capacityApi() {
  const window = {};
  const context = vm.createContext({window});
  for (const file of ['v2/vehicle-catalog.js', 'v2/vehicle-capacity.js']) vm.runInContext(readFileSync(file, 'utf8'), context);
  return window.HFV2VehicleCapacity;
}

const pallet = (grossKg, carrierCount) => ({grossKg, carrierCount, loadCarrier: 'euro-pallet'});

test('gewichtslimitierte Ladung benötigt trotz freier Stellplätze zwei Fahrzeuge', () => {
  const api = capacityApi();
  const result = api.evaluate('fluto-gianco', [pallet(2100, 2)], 1);
  assert.equal(result.ok, false);
  assert.deepEqual(Array.from(result.exceeded), ['weight']);
  assert.equal(result.limitingFactor, 'weight');
  assert.equal(api.requiredVehicleCount('fluto-gianco', [pallet(2100, 2)]), 2);
});

test('stellplatzlimitierte Ladung benötigt trotz freien Gewichts zwei Fahrzeuge', () => {
  const api = capacityApi();
  const result = api.evaluate('fluto-gianco', [pallet(1250, 5)], 1);
  assert.equal(result.ok, false);
  assert.deepEqual(Array.from(result.exceeded), ['volume']);
  assert.equal(result.limitingFactor, 'volume');
  assert.equal(api.requiredVehicleCount('fluto-gianco', [pallet(1250, 5)]), 2);
});

test('gemischte Sammellieferung wird an beiden Grenzen gemeinsam bewertet', () => {
  const api = capacityApi();
  const mixed = [pallet(975, 2), pallet(975, 2)];
  const result = api.evaluate('fluto-gianco', mixed, 1);
  assert.equal(result.ok, true);
  assert.equal(result.usage.grossKg, 1950);
  assert.equal(result.usage.palletSlots, 4);
  assert.equal(result.capacity.grossKg, 2000);
  assert.equal(result.capacity.palletSlots, 4);
  assert.equal(result.limitingFactor, 'volume');
});

test('Kühltransporter hat bewusst weniger Stellplätze', () => {
  const api = capacityApi();
  assert.equal(api.limits('fluto-gianco').palletSlots, 4);
  assert.equal(api.limits('fluto-gianco-fr').palletSlots, 3);
});
