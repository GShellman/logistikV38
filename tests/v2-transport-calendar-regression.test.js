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

test('Kalender zeigt ausschließlich Transporte mit Überschneidung zum aktuellen Tag', () => {
  const {markup} = calendarHelpers();
  const shipments = [
    {id: 'past', goodId: 'past-good', status: 'completed', fromCityId: 'a', toCityId: 'b', departureAbsMinute: 60, arrivalAbsMinute: 120},
    {id: 'current', goodId: 'current-good', status: 'active', fromCityId: 'a', toCityId: 'b', departureAbsMinute: 1500, arrivalAbsMinute: 1560},
    {id: 'overnight', goodId: 'overnight-good', status: 'active', fromCityId: 'a', toCityId: 'b', departureAbsMinute: 1380, arrivalAbsMinute: 1500},
    {id: 'future', goodId: 'future-good', status: 'active', fromCityId: 'a', toCityId: 'b', departureAbsMinute: 2940, arrivalAbsMinute: 3000},
  ];

  const html = markup({id: 'a'}, {currentDay: 2, shipments, cityName: id => id});

  assert.equal((html.match(/class="hf-v2-transport-calendar__day-title"/g) || []).length, 1);
  assert.match(html, />Tag 2<\/h4>/);
  assert.match(html, /current-good/);
  assert.match(html, /overnight-good/);
  assert.doesNotMatch(html, /past-good/);
  assert.doesNotMatch(html, /future-good/);
});

test('Kalender zeigt den aktuellen Tag auch ohne passende Transporte', () => {
  const {markup} = calendarHelpers();
  const html = markup({id: 'a'}, {
    state: {time: {day: 3}},
    shipments: [{id: 'past', status: 'completed', fromCityId: 'a', toCityId: 'b', departureAbsMinute: 60, arrivalAbsMinute: 120}],
  });

  assert.equal((html.match(/class="hf-v2-transport-calendar__day-title"/g) || []).length, 1);
  assert.match(html, />Tag 3<\/h4>/);
  assert.match(html, /Keine Transporte an Tag 3\./);
  assert.doesNotMatch(html, /shipment-past/);
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

test('gestartete Planfahrt wird neben dem zugehörigen Shipment nicht doppelt angezeigt', () => {
  const {rows} = calendarHelpers();
  const shipment = {id: 41, orderId: 7, status: 'active', fromCityId: 'a', toCityId: 'b', departureAbsMinute: 480, arrivalAbsMinute: 600, vehicleIds: [3]};
  const plan = {legs: [
    {id: 'out', type: 'shipment', status: 'started', orderId: 7, fromCityId: 'a', toCityId: 'b', departureAbsMinute: 480, arrivalAbsMinute: 600, vehicleIds: [3]},
  ]};

  const result = rows({id: 'a'}, [shipment], [], plan);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'shipment-41');
  assert.equal(result[0].kind, 'active');
});

test('gleichzeitige Fahrten derselben Bestellung werden anhand der Fahrzeuge unterschieden', () => {
  const {rows} = calendarHelpers();
  const shipment = {id: 42, orderId: 7, status: 'active', fromCityId: 'a', toCityId: 'b', departureAbsMinute: 480, arrivalAbsMinute: 600, vehicleIds: [3]};
  const plan = {legs: [
    {id: 'taken', type: 'shipment', status: 'started', orderId: 7, fromCityId: 'a', toCityId: 'b', departureAbsMinute: 480, arrivalAbsMinute: 600, vehicleIds: [3]},
    {id: 'other', type: 'shipment', status: 'planned', orderId: 7, fromCityId: 'a', toCityId: 'b', departureAbsMinute: 480, arrivalAbsMinute: 600, vehicleIds: [4]},
  ]};

  const result = rows({id: 'a'}, [shipment], [], plan);

  assert.deepEqual(Array.from(result, row => row.id), ['plan-other', 'shipment-42']);
});

test('aktive Rückfahrt ersetzt den passenden geplanten Rückfahrtblock', () => {
  const {rows} = calendarHelpers();
  const shipment = {
    id: 43, orderId: 7, status: 'returning', fromCityId: 'a', toCityId: 'b',
    departureAbsMinute: 480, arrivalAbsMinute: 600, returnDepartureAbsMinute: 600,
    returnArrivalAbsMinute: 720, vehicleIds: [3],
  };
  const plan = {legs: [
    {id: 'out', type: 'shipment', status: 'started', orderId: 7, fromCityId: 'a', toCityId: 'b', departureAbsMinute: 480, arrivalAbsMinute: 600, vehicleIds: [3]},
    {id: 'back', type: 'return', status: 'planned', orderId: 7, fromCityId: 'b', toCityId: 'a', departureAbsMinute: 600, arrivalAbsMinute: 720, vehicleIds: [3]},
  ]};

  const result = rows({id: 'b'}, [shipment], [], plan);

  assert.deepEqual(Array.from(result, row => row.id), ['shipment-43', 'shipment-43-return']);
  assert.equal(result.filter(row => row.kind === 'return').length, 1);
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

test('Kalender leitet Mehrstopp-Tour und Rückfahrt aus dem kanonischen Trip ab', () => {
  const {rows} = calendarHelpers();
  const trip = {id:'trip-1-1-2',status:'planned',vehicleType:'van',vehicleIds:[1],orderIds:[1,2],stops:[
    {orderId:1,toCityId:'b',goodId:'food',amountKg:100,arrivalAbsMinute:120},
    {orderId:2,toCityId:'c',goodId:'food',amountKg:50,arrivalAbsMinute:180},
  ],segments:[
    {fromCityId:'a',toCityId:'b',departureAbsMinute:60,arrivalAbsMinute:120},
    {fromCityId:'b',toCityId:'c',departureAbsMinute:120,arrivalAbsMinute:180},
  ],disposition:{action:'return',fromCityId:'c',toCityId:'a',targetCityId:'a',departureAbsMinute:180,arrivalAbsMinute:300}};
  const plan={trips:[trip],legs:[{id:'legacy',tripId:trip.id,type:'shipment',fromCityId:'a',toCityId:'b',departureAbsMinute:60,arrivalAbsMinute:120}]};

  assert.deepEqual(Array.from(rows({id:'b'},[],[],plan),row=>[row.id,row.kind,row.departureAbsMinute,row.arrivalAbsMinute]), [
    ['trip-trip-1-1-2-stop-1','planned',60,120],
    ['trip-trip-1-1-2-stop-2','planned',120,180],
  ]);
  assert.deepEqual(Array.from(rows({id:'c'},[],[],plan),row=>row.kind), ['planned','return']);
});
