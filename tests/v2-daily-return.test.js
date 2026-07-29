const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadScript(file, window) {
  vm.runInContext(readFileSync(file, 'utf8'), vm.createContext({window, console}), {filename: file});
}

function harness({alternativeVehicles = 0, arrivalAbsMinute = 600, distance = 60} = {}) {
  const time = {day: 1, hour: Math.floor(arrivalAbsMinute / 60), minute: arrivalAbsMinute % 60};
  const vehicles = [{id: 1, vehicleType: 'van', status: 'assigned', currentCityId: 'zurich', availableAbsMinute: arrivalAbsMinute, activeAssignmentId: '1'}];
  const releasedReservations = [];
  for (let index = 0; index < alternativeVehicles; index += 1) {
    vehicles.push({id: index + 2, vehicleType: 'van', status: 'available', currentCityId: 'zurich', availableAbsMinute: 0, activeAssignmentId: null});
  }
  const window = {
    HFVehicleCatalog: {VEHICLE_TYPES: ['van'], VEHICLE_CATALOG: {van: {mode: 'road', load: 1, speed: 60, kmCost: 1}}},
    HFV2Save: {STARTING_CASH: 500000, getState: () => ({time}), dispatchStateChanged: () => {}},
    HFV2Time: {getState: () => time},
    HFV2Goods: {addToInventory: (_city, _good, amountKg) => ({ok: true, addedKg: amountKg})},
    HFNetwork: {
      findPath: (from, to) => ({reachable: true, distance, duration: 1, nodes: [from, to], edges: [{id: `${from}-${to}`, a: from, b: to, type: 'road'}]}),
      reservePathCapacity: (_path, options) => ({ok: true, reservationId: options.reservationId}),
      releaseCapacityReservation: id => releasedReservations.push(id),
      nodeInfo: id => id === 'zurich' ? {lat: 47, lng: 8} : {lat: 46, lng: 7},
    },
  };
  loadScript('v2/fleet-logic.js', window);
  window.HFFleet.configure({state: {vehicles, nextVehicleId: vehicles.length + 1, depotCityId: 'zurich'}});
  loadScript('v2/logistics-logic.js', window);
  const state = window.HFV2Logistics.createLogisticsState({
    orders: [{id: 1, fromCityId: 'zurich', toCityId: 'bern', goodId: 'food', frequency: 'daily', departureHour: 8, departureMinute: 0, vehicleType: 'van', amountKg: 100, enabled: true, lastDispatchedDay: 1}],
    shipments: [{id: 1, orderId: 1, fromCityId: 'zurich', toCityId: 'bern', goodId: 'food', amountKg: 100, vehicleType: 'van', vehicleIds: [1], vehicleCount: 1, departureAbsMinute: 480, arrivalAbsMinute, status: 'active', postDeliveryAction: 'return', postDeliveryTargetCityId: 'zurich', postDeliveryDepartureAbsMinute: arrivalAbsMinute, postDeliveryArrivalAbsMinute: arrivalAbsMinute + distance}],
  });
  window.HFV2Logistics.configure({state, citiesById: {zurich: {id: 'zurich'}, bern: {id: 'bern'}}});
  return {window, state, time, releasedReservations};
}

test('tägliche Fahrt kehrt bei fehlendem Ersatz noch am selben Tag zurück', () => {
  const {window, state} = harness();
  window.HFV2Logistics.advanceShipments();
  assert.equal(state.shipments[0].status, 'returning');
  assert.equal(state.shipments[0].returnArrivalAbsMinute, 660);
  assert.equal(window.HFFleet.getState().vehicles[0].activeAssignmentId, '1');
  assert.equal(window.HFFleet.getState().vehicles[0].status, 'returning');
});

test('Planreservierungen werden über Hin- und Rückfahrt übernommen und nach Ankunft vollständig freigegeben', () => {
  const setup = harness();
  Object.assign(setup.state.shipments[0], {
    reservationId: 'fleet-plan-loaded-1-1-0',
    plannedReturnReservationIds: ['fleet-plan-return-1-1-1'],
    plannedReturnDepartureAbsMinute: 600,
    plannedReturnArrivalAbsMinute: 660,
    postDeliveryReservationIds: ['fleet-plan-return-1-1-1'],
  });

  setup.window.HFV2Logistics.advanceShipments();
  assert.equal(setup.state.shipments[0].returnReservationId, 'fleet-plan-return-1-1-1');
  assert.deepEqual(setup.releasedReservations, ['fleet-plan-loaded-1-1-0']);

  Object.assign(setup.time, {hour: 11, minute: 0});
  setup.window.HFV2Logistics.advanceShipments();
  assert.equal(setup.state.shipments[0].status, 'returned');
  assert.deepEqual(setup.releasedReservations, ['fleet-plan-loaded-1-1-0', 'fleet-plan-return-1-1-1']);
});

test('geplante Rückfahrt wird trotz später verändertem Ersatzbestand ausgeführt', () => {
  const {window, state} = harness({alternativeVehicles: 1});
  window.HFV2Logistics.advanceShipments();
  assert.equal(state.shipments[0].status, 'returning');
  assert.equal(window.HFFleet.getState().vehicles[0].status, 'returning');
});

test('geplante Rückkehr wird auch über das Tagesende ausgeführt', () => {
  const {window, state} = harness({arrivalAbsMinute: 23 * 60, distance: 120});
  window.HFV2Logistics.advanceShipments();
  assert.equal(state.shipments[0].status, 'returning');
  assert.equal(state.shipments[0].returnArrivalAbsMinute, 1500);
});

test('reduzierte Auslieferung mit geplanter Stay-Aktion bleibt atomar und wird nur einmal verarbeitet', () => {
  const {window, state} = harness({alternativeVehicles: 1});
  Object.assign(state.shipments[0], {postDeliveryAction: 'stay', postDeliveryTargetCityId: 'bern', postDeliveryDepartureAbsMinute: 600, postDeliveryArrivalAbsMinute: 600});
  let destinationStockKg = 0;
  let inventoryCalls = 0;
  let stateChangedCalls = 0;
  let observedShipment = null;

  window.HFV2Save.dispatchStateChanged = () => {
    stateChangedCalls += 1;
    observedShipment = window.HFV2Logistics.getState().shipments[0];
  };
  window.HFV2Goods.addToInventory = (_cityId, _goodId, amountKg, options = {}) => {
    inventoryCalls += 1;
    const addedKg = Math.min(40, amountKg);
    destinationStockKg += addedKg;
    if (options.notify !== false) window.HFV2Save.dispatchStateChanged('goods-inventory-added');
    return {ok: false, reason: 'capacity-limited', addedKg};
  };

  const shipmentBeforeAdvance = window.HFV2Logistics.getState().shipments[0];
  window.HFV2Logistics.advanceShipments();
  window.HFV2Logistics.advanceShipments();
  window.HFV2Logistics.advanceShipments();

  const shipment = state.shipments[0];
  assert.equal(destinationStockKg, 40);
  assert.equal(inventoryCalls, 1);
  assert.equal(stateChangedCalls, 1);
  assert.strictEqual(observedShipment, shipmentBeforeAdvance);
  assert.strictEqual(window.HFV2Logistics.getState().shipments[0], shipmentBeforeAdvance);
  assert.equal(shipment.addedKg, 40);
  assert.equal(shipment.deliveredKg, 40);
  assert.equal(shipment.undeliveredKg, 60);
  assert.equal(shipment.status, 'partial');
  assert.equal(window.HFFleet.getState().vehicles[0].currentCityId, 'bern');
  assert.equal(window.HFFleet.getState().vehicles[0].status, 'available');
});
