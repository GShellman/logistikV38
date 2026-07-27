const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync('v2/shipment-calendar.js', 'utf8');

function calendarHelpers() {
  const window = {};
  vm.runInNewContext(source, {window});
  return window.HFV2ShipmentCalendar;
}

test('Tageswechsel schneidet einen Block proportional an beiden Tagen', () => {
  const {position} = calendarHelpers();
  const first = position(1380, 1500, 0);
  const second = position(1380, 1500, 1440);
  assert.deepEqual({...first}, {topPercent: 95.83333333333334, heightPercent: 4.166666666666666, durationMinutes: 120, continuesBefore: false, continuesAfter: true});
  assert.equal(second.topPercent, 0);
  assert.equal(second.heightPercent, 60 / 1440 * 100);
  assert.equal(second.continuesBefore, true);
});

test('mehrtägige Fahrten blockieren volle Zwischentage', () => {
  const {position} = calendarHelpers();
  const middle = position(1200, 3300, 1440);
  assert.equal(middle.topPercent, 0);
  assert.equal(middle.heightPercent, 100);
  assert.equal(middle.durationMinutes, 2100);
  assert.equal(middle.continuesBefore, true);
  assert.equal(middle.continuesAfter, true);
});

test('Überschneidungen erhalten parallele Spuren', () => {
  const {layout} = calendarHelpers();
  const rows = layout([
    {id: 'a', visibleStartAbsMinute: 60, visibleEndAbsMinute: 180},
    {id: 'b', visibleStartAbsMinute: 90, visibleEndAbsMinute: 120},
    {id: 'c', visibleStartAbsMinute: 180, visibleEndAbsMinute: 240},
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(row => [row.id, row.lane, row.laneCount]))), [['a', 0, 2], ['b', 1, 2], ['c', 0, 1]]);
});

test('Rückfahrten und Dispatch-Reservierungen werden als eigene Kalenderblöcke erzeugt', () => {
  const {rows} = calendarHelpers();
  const result = rows({id: 'b'}, [], [{id: 1, goodId: 'food'}], {legs: [
    {id: 'out', type: 'shipment', orderId: 1, fromCityId: 'a', toCityId: 'b', departureAbsMinute: 60, arrivalAbsMinute: 120, vehicleIds: [1]},
    {id: 'back', type: 'return', orderId: 1, fromCityId: 'b', toCityId: 'a', departureAbsMinute: 120, arrivalAbsMinute: 180, vehicleIds: [1]},
  ]});
  assert.deepEqual(Array.from(result, row => row.kind), ['planned', 'return']);
  assert.equal(result[1].status, 'Rückfahrt');
});

test('Tageszyklus baut den Kalender nach Verkauf und Produktion sofort neu auf', () => {
  const calls = [];
  const state = {time: {day: 2}, finance: {journal: [], nextEntryId: 1, lastClosedDay: 0}, network: {connections: []}, factories: {cityFactories: {}}, fleet: {vehicles: []}};
  const window = {
    HFV2Save: {getState: () => state, getCash: () => 0},
    HFV2Goods: {runDailySales: () => { calls.push('sales'); return {}; }, runDailyProduction: () => { calls.push('production'); return {}; }},
    HFV2FleetDispatch: {invalidate: () => calls.push('invalidate'), buildPlan: () => calls.push('plan')},
  };
  vm.runInNewContext(readFileSync('v2/day-cycle-logic.js', 'utf8'), {window});
  window.HFV2DayCycle.runDailyCycle({day: 1});
  assert.deepEqual(calls, ['sales', 'production', 'invalidate', 'plan']);
});
