const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadScript(file, window) {
  const context = vm.createContext({window, console, Blob: undefined, File: undefined, CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }});
  vm.runInContext(readFileSync(file, 'utf8'), context, {filename: file});
}

function timeHarness(initialTime, logistics) {
  const calls = [];
  const window = {
    HFV2Save: {
      defaultTimeState: () => ({day: 1, hour: 8, minute: 0}),
      getState: () => ({time: initialTime}),
      dispatchStateChanged: () => {},
    },
    HFV2DayCycle: {runDailyCycle: () => { calls.push(['midnight', window.HFV2Time.absoluteMinute()]); return {}; }},
    HFV2Logistics: {
      getState: () => logistics,
      advanceShipments: () => calls.push(['events', window.HFV2Time.absoluteMinute()]),
      tick: () => {
        const now = window.HFV2Time.absoluteMinute();
        calls.push(['dispatch', now]);
        for (const order of logistics.orders || []) {
          const day = Math.floor(now / 1440) + 1;
          const due = (day - 1) * 1440 + order.departureHour * 60 + order.departureMinute;
          if (due === now) order.lastDispatchedDay = day;
        }
      },
    },
  };
  loadScript('v2/time-logic.js', window);
  window.HFV2Time.configure({state: initialTime});
  return {window, calls};
}

test('Fahrt über Mitternacht: Ankunft wird vor der gleichzeitigen Disposition verarbeitet', () => {
  const logistics = {
    shipments: [{status: 'active', arrivalAbsMinute: 1450}],
    assignments: [],
    orders: [{id: 1, enabled: true, frequency: 'daily', departureHour: 0, departureMinute: 10, lastDispatchedDay: null}],
  };
  const {window, calls} = timeHarness({day: 1, hour: 23, minute: 50}, logistics);
  window.HFV2Time.advanceMinutes(30);
  const atArrival = calls.filter(([, minute]) => minute === 1450).map(([kind]) => kind);
  assert.deepEqual(atArrival, ['events', 'dispatch']);
});

test('mehrtägige Fahrt und großer Zeitsprung arbeiten alle Ereignispunkte chronologisch ab', () => {
  const logistics = {
    shipments: [{status: 'active', arrivalAbsMinute: 3100}],
    assignments: [{status: 'planned', departureAbsMinute: 2000, arrivalAbsMinute: 2500}],
    orders: [{id: 1, enabled: true, frequency: 'daily', departureHour: 8, departureMinute: 0, lastDispatchedDay: 1}],
  };
  const {window, calls} = timeHarness({day: 1, hour: 8, minute: 0}, logistics);
  window.HFV2Time.advanceMinutes(3 * 1440);
  const eventMinutes = calls.filter(([kind]) => kind === 'events').map(([, minute]) => minute);
  assert.deepEqual(eventMinutes, [...eventMinutes].sort((a, b) => a - b));
  assert.ok(eventMinutes.includes(2000));
  assert.ok(eventMinutes.includes(2500));
  assert.ok(eventMinutes.includes(3100));
  assert.equal(logistics.orders[0].lastDispatchedDay, 4);
});

test('Speichern/Laden während einer Fahrt erhält Standort, Assignment und absolute Verfügbarkeit', () => {
  const window = {dispatchEvent: () => {}};
  loadScript('v2/save-logic.js', window);
  const saved = window.HFV2Save.hydrateState({state: {
    time: {day: 3, hour: 4, minute: 5},
    fleet: {vehicles: [{id: 7, vehicleType: 'van', status: 'assigned', currentCityId: 'bern', availableAbsMinute: 5000, activeAssignmentId: 'move-1', routeSegment: {fromCityId: 'bern', toCityId: 'basel'}, position: [46.9, 7.4]}]},
    logistics: {assignments: [{id: 'move-1', type: 'repositioning', fromCityId: 'bern', toCityId: 'basel', vehicleIds: [7], departureAbsMinute: 4000, arrivalAbsMinute: 5000, status: 'active'}]},
  }}).state;
  assert.deepEqual(JSON.parse(JSON.stringify(saved.fleet.vehicles[0])), {id: 7, vehicleType: 'van', status: 'assigned', currentCityId: 'bern', availableAbsMinute: 5000, activeAssignmentId: 'move-1', position: [46.9, 7.4], routeSegment: {fromCityId: 'bern', toCityId: 'basel'}});
  assert.equal(saved.logistics.assignments[0].arrivalAbsMinute, 5000);
});
