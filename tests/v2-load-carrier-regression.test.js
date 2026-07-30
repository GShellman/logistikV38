const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function runtime() {
  const window = {HFV2FleetDispatch: {configure() {}}};
  const context = vm.createContext({window});
  for (const file of ['v2/goods-catalog.js', 'v2/load-carrier-catalog.js', 'v2/logistics-logic.js']) {
    vm.runInContext(readFileSync(file, 'utf8'), context);
  }
  return window;
}

test('angebrochene Paletten werden aufgerundet und ihr Leergewicht wird addiert', () => {
  const {metrics} = runtime().HFV2LoadCarrierCatalog;
  assert.deepEqual({...metrics('tools', 701)}, {
    loadCarrier: 'euro-pallet', carrierCount: 2, netKg: 701, tareKg: 50, grossKg: 751, stackable: true,
  });
  assert.deepEqual({...metrics('tools', 2100)}, {
    loadCarrier: 'euro-pallet', carrierCount: 3, netKg: 2100, tareKg: 75, grossKg: 2175, stackable: true,
  });
});

test('lose Ware bleibt ohne Verpackungsgewicht', () => {
  assert.deepEqual({...runtime().HFV2LoadCarrierCatalog.metrics('grain', 2100)}, {
    loadCarrier: 'loose', carrierCount: 0, netKg: 2100, tareKg: 0, grossKg: 2100, stackable: false,
  });
});

test('alte Savegames erhalten bei der Normalisierung berechnete Ladungsträgerdaten', () => {
  const window = runtime();
  const state = window.HFV2Logistics.createLogisticsState({orders: [{
    id: 1, fromCityId: 'a', toCityId: 'b', goodId: 'tools', frequency: 'daily', amountKg: 701,
  }], shipments: [{
    id: 1, orderId: 1, fromCityId: 'a', toCityId: 'b', goodId: 'tools', amountKg: 701,
    departureAbsMinute: 10, arrivalAbsMinute: 20,
  }]});
  window.HFV2Logistics.configure({state});
  for (const record of [state.orders[0], state.shipments[0]]) {
    assert.equal(record.amountKg, 701);
    assert.equal(record.netKg, 701);
    assert.equal(record.carrierCount, 2);
    assert.equal(record.tareKg, 50);
    assert.equal(record.grossKg, 751);
  }
});

test('Tourenplanung verwendet die gemeinsame Gewichts- und Stellplatzkapazität', () => {
  const source = readFileSync('v2/fleet-dispatch-logic.js', 'utf8');
  assert.match(source, /count = requiredVehicleCount\(type, \[cargo\]\)/);
  assert.match(source, /capacityCheck\(first\.vehicleType, \[\.\.\.group, legCargo\]/);
});
