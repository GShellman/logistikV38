const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadScript(file, window) {
  vm.runInContext(readFileSync(file, 'utf8'), vm.createContext({window, console}), {filename: file});
}

function harness({orders, shipment, nowAbsMinute, returnDistances}) {
  const time = {day: Math.floor(nowAbsMinute / 1440) + 1, hour: Math.floor((nowAbsMinute % 1440) / 60), minute: nowAbsMinute % 60};
  const vehicles = [
    {id: 1, vehicleType: 'van', status: 'assigned', currentCityId: 'zurich', availableAbsMinute: shipment.arrivalAbsMinute, activeAssignmentId: String(shipment.id)},
    // Weekly returns must not be suppressed merely because a replacement exists.
    {id: 2, vehicleType: 'van', status: 'available', currentCityId: 'zurich', availableAbsMinute: 0, activeAssignmentId: null},
  ];
  const reservations = [];
  const window = {
    HFVehicleCatalog: {VEHICLE_TYPES: ['van'], VEHICLE_CATALOG: {van: {mode: 'road', load: 1, speed: 60, kmCost: 1}}},
    HFV2Save: {STARTING_CASH: 500000, getState: () => ({time}), dispatchStateChanged: () => {}},
    HFV2Time: {getState: () => time},
    HFV2Goods: {addToInventory: (_city, _good, amountKg) => ({ok: true, addedKg: amountKg})},
    HFNetwork: {
      findPath: (from, to) => {
        const distance = returnDistances[from];
        return {reachable: true, distance, duration: distance / 60, nodes: [from, to], edges: [{id: `${from}-${to}`, a: from, b: to, type: 'road'}]};
      },
      reservePathCapacity: (_path, options) => {
        reservations.push(options);
        return {ok: true, reservationId: options.reservationId};
      },
      nodeInfo: id => ({lat: id.length, lng: id.length + 1}),
    },
  };
  loadScript('v2/fleet-logic.js', window);
  window.HFFleet.configure({state: {vehicles, nextVehicleId: 3, depotCityId: 'zurich'}});
  loadScript('v2/logistics-logic.js', window);
  const state = window.HFV2Logistics.createLogisticsState({orders, shipments: [shipment]});
  window.HFV2Logistics.configure({state, citiesById: {zurich: {id: 'zurich'}, bern: {id: 'bern'}, basel: {id: 'basel'}, lucerne: {id: 'lucerne'}}});
  return {window, state, time, reservations};
}

function weeklyOrder(id, toCityId) {
  return {id, fromCityId: 'zurich', toCityId, goodId: 'food', frequency: 'weekly', weekday: 0, departureHour: 8, departureMinute: 0, vehicleType: 'van', amountKg: 100, enabled: true, lastDispatchedDay: 1};
}

test('wöchentliche Einzellieferung kehrt trotz Ersatzfahrzeug und Tagesende zum Ursprung zurück', () => {
  const shipment = {id: 1, orderId: 1, fromCityId: 'zurich', toCityId: 'bern', goodId: 'food', amountKg: 100, vehicleType: 'van', vehicleIds: [1], vehicleCount: 1, departureAbsMinute: 1200, arrivalAbsMinute: 1380, status: 'active'};
  const {window, state, time, reservations} = harness({orders: [weeklyOrder(1, 'bern')], shipment, nowAbsMinute: 1380, returnDistances: {bern: 120}});

  window.HFV2Logistics.advanceShipments();
  assert.equal(state.shipments[0].status, 'returning');
  assert.equal(state.shipments[0].returnDepartureAbsMinute, 1380);
  assert.equal(state.shipments[0].returnArrivalAbsMinute, 1500);
  assert.equal(state.shipments[0].returnReservationId, 'shipment-1-weekly-return');
  assert.equal(reservations[0].startAbsMinute, 1380);
  assert.equal(reservations[0].endAbsMinute, 1500);
  assert.equal(reservations[0].units, 1);
  assert.equal(reservations[0].reservationId, 'shipment-1-weekly-return');
  assert.equal(window.HFFleet.getState().vehicles[0].status, 'returning');
  assert.equal(window.HFFleet.getState().vehicles[0].activeAssignmentId, '1');

  Object.assign(time, {day: 2, hour: 1, minute: 0});
  window.HFV2Logistics.advanceShipments();
  assert.equal(state.shipments[0].status, 'returned');
  assert.equal(window.HFFleet.getState().vehicles[0].currentCityId, 'zurich');
  assert.equal(window.HFFleet.getState().vehicles[0].status, 'available');
});

test('wöchentliche Sammellieferung beginnt die Rückfahrt erst nach dem letzten Stopp', () => {
  const shipment = {
    id: 7, orderId: 1, fromCityId: 'zurich', toCityId: 'lucerne', goodId: 'food', amountKg: 200, vehicleType: 'van', vehicleIds: [1], vehicleCount: 1,
    departureAbsMinute: 480, arrivalAbsMinute: 600, status: 'active',
    stops: [
      {orderId: 1, toCityId: 'basel', goodId: 'food', amountKg: 100, arrivalAbsMinute: 540, status: 'pending'},
      {orderId: 2, toCityId: 'lucerne', goodId: 'food', amountKg: 100, arrivalAbsMinute: 600, status: 'pending'},
    ],
  };
  const setup = harness({orders: [weeklyOrder(1, 'basel'), weeklyOrder(2, 'lucerne')], shipment, nowAbsMinute: 540, returnDistances: {lucerne: 90}});

  setup.window.HFV2Logistics.advanceShipments();
  assert.equal(setup.state.shipments[0].status, 'active');
  assert.equal(setup.state.shipments[0].returnDepartureAbsMinute, null);

  Object.assign(setup.time, {hour: 10, minute: 0});
  setup.window.HFV2Logistics.advanceShipments();
  assert.equal(setup.state.shipments[0].status, 'returning');
  assert.equal(setup.state.shipments[0].returnDepartureAbsMinute, 600);
  assert.equal(setup.state.shipments[0].returnArrivalAbsMinute, 690);
  assert.equal(setup.window.HFFleet.getState().vehicles[0].currentCityId, 'lucerne');
  assert.equal(setup.window.HFFleet.getState().vehicles[0].activeAssignmentId, '7');

  Object.assign(setup.time, {hour: 11, minute: 30});
  setup.window.HFV2Logistics.advanceShipments();
  assert.equal(setup.state.shipments[0].status, 'returned');
  assert.equal(setup.window.HFFleet.getState().vehicles[0].currentCityId, 'zurich');
  assert.equal(setup.window.HFFleet.getState().vehicles[0].status, 'available');
});
