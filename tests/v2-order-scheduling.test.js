const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function load(file, window) {
  vm.runInContext(readFileSync(file, 'utf8'), vm.createContext({window, console, Blob: undefined, File: undefined, CustomEvent: class {}}), {filename: file});
}

function logisticsHarness({capacity = true, vehicles = [{id: 1, vehicleType: 'van', currentCityId: 'a', availableAbsMinute: 0}], stock = 10000} = {}) {
  const time = {day: 1, hour: 0, minute: 0};
  const path = (from, to) => ({reachable: true, distance: 60, duration: 1, nodes: [from, to], edges: []});
  const window = {
    HFV2Time: {getState: () => time},
    HFV2Save: {getState: () => ({time}), dispatchStateChanged: () => {}},
    HFVehicleCatalog: {VEHICLE_CATALOG: {van: {mode: 'road', load: 1, speed: 60}}},
    HFFleet: {getState: () => ({vehicles}), getAvailableVehicles: ({cityId, vehicleType, atAbsMinute}) => vehicles.filter(v => v.vehicleType === vehicleType && v.currentCityId === cityId && v.availableAbsMinute <= atAbsMinute)},
    HFNetwork: {findPath: path, pathCapacityStatus: () => ({ok: capacity})},
    HFV2Goods: {getCityInventory: () => ({food: stock}), getCityDailyDemandMap: () => ({food: 100})},
  };
  load('v2/logistics-logic.js', window);
  const state = window.HFV2Logistics.createLogisticsState();
  window.HFV2Logistics.configure({state, citiesById: {a: {id: 'a'}, b: {id: 'b'}, c: {id: 'c'}}});
  return {window, state, time};
}

test('alle sieben Wochentage werden normalisiert und nur am gewählten Tag fällig', () => {
  const {window} = logisticsHarness();
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const order = {enabled: true, frequency: 'weekly', weekday, departureHour: 0, departureMinute: 0, lastDispatchedDay: null};
    for (let day = 1; day <= 7; day += 1) assert.equal(window.HFV2Logistics.orderDueToday(order, {day, hour: 0, minute: 0}), day - 1 === weekday);
  }
});

test('tägliche und wöchentliche Folgetermine überschreiten Tages- und Wochengrenzen', () => {
  const {window} = logisticsHarness();
  assert.equal(window.HFV2Logistics.nextOrderDueAbsMinute({enabled: true, frequency: 'daily', departureHour: 23, departureMinute: 55, lastDispatchedDay: null}, {day: 1, hour: 23, minute: 56}), 2875);
  assert.equal(window.HFV2Logistics.nextOrderDueAbsMinute({enabled: true, frequency: 'weekly', weekday: 0, departureHour: 8, departureMinute: 0, lastDispatchedDay: 1}, {day: 1, hour: 8, minute: 0}), 10560);
});

test('Terminfindung wählt ein freies Zeitfenster und berücksichtigt Repositionierung', () => {
  const {window} = logisticsHarness({vehicles: [{id: 4, vehicleType: 'van', currentCityId: 'c', availableAbsMinute: 0}]});
  const result = window.HFV2Logistics.findOrderSchedule({fromCityId: 'a', toCityId: 'b', goodId: 'food', frequency: 'daily', vehicleType: 'van'});
  assert.equal(result.ok, true);
  assert.deepEqual(result.vehicleIds, [4]);
  assert.ok(result.arrivalAbsMinute > result.departureAbsMinute);
});

test('Terminfindung lehnt Straßenüberlastung und fehlende Termine ab', () => {
  const {window} = logisticsHarness({capacity: false});
  const result = window.HFV2Logistics.findOrderSchedule({fromCityId: 'a', toCityId: 'b', goodId: 'food', frequency: 'daily', vehicleType: 'van', horizonDays: 1});
  assert.deepEqual({ok: result.ok, reason: result.reason}, {ok: false, reason: 'no-feasible-slot'});
  assert.throws(() => window.HFV2Logistics.createOrder({fromCityId: 'a', toCityId: 'b', goodId: 'food', frequency: 'daily', vehicleType: 'van', horizonDays: 1}), /no-feasible-slot/);
});

test('alte wöchentliche Bestellungen migrieren stabil auf Montag und Plan-Caches werden verworfen', () => {
  const window = {dispatchEvent: () => {}};
  load('v2/save-logic.js', window);
  const logistics = window.HFV2Save.hydrateState({state: {logistics: {orders: [{id: 1, frequency: 'weekly', departureHour: 8, departureMinute: 30}], dispatchPlan: {legs: [1]}}}}).state.logistics;
  assert.equal(logistics.orders[0].weekday, 0);
  assert.equal(logistics.orders[0].plannedDepartureAbsMinute, 510);
  assert.equal(logistics.dispatchPlan, null);
  assert.equal(logistics.schemaVersion, 3);
});
