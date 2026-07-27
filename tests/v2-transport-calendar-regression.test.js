const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync('v2/app.js', 'utf8');

function calendarHelpers() {
  const start = source.indexOf('  function shipmentCalendarPosition(');
  const end = source.indexOf('  function shipmentCalendarRows(', start);
  assert.ok(start >= 0 && end > start, 'Kalender-Hilfsfunktionen müssen separat testbar sein');
  const context = {};
  vm.runInNewContext(`${source.slice(start, end)}; result = {position: shipmentCalendarPosition, layout: shipmentCalendarLayout};`, context);
  return context.result;
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
  const rowsSource = source.slice(source.indexOf('  function shipmentCalendarRows('), source.indexOf('  function shipmentCalendarMarkup('));
  assert.match(rowsSource, /shipment\.returnDepartureAbsMinute/);
  assert.match(rowsSource, /kind: shipment\.status === 'returned' \? 'completed' : 'return'/);
  assert.match(rowsSource, /dispatchPlan\?\.legs/);
  assert.match(rowsSource, /repositioning \? 'reposition' : 'planned'/);
});
