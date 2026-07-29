const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function load(file, window) {
  const context = vm.createContext({window, console, Blob: undefined, File: undefined, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }});
  vm.runInContext(readFileSync(file, 'utf8'), context, {filename: file});
}

function harness() {
  const window = {dispatchEvent() {}};
  window.HFVehicleCatalog = {VEHICLE_CATALOG: {'fluto-gianco': {daily: 25}}};
  window.HFV2FactoryCatalog = [{id: 'mill', maintenance: 100}];
  load('v2/save-logic.js', window);
  window.HFV2Factories = {
    FACTORIES: window.HFV2FactoryCatalog,
    operatingCostForFactory: (factory, level) => factory.maintenance * level,
  };
  const state = window.HFV2Save.configureState({
    cash: 10000,
    time: {day: 2, hour: 0, minute: 0},
    network: {connections: [{maintenance: 40}, {maintenance: 60}]},
    factories: {cityFactories: {zurich: ['mill']}, factoryUpgrades: {zurich: {'0': 3}}},
    fleet: {vehicles: [{id: 1, vehicleType: 'fluto-gianco'}, {id: 2, vehicleType: 'fluto-gianco'}]},
  });
  load('v2/day-cycle-logic.js', window);
  return {window, state};
}

test('Tageskosten werden je Tag und Objekt genau einmal gebucht und Fabrikstufen berücksichtigt', () => {
  const {window, state} = harness();
  const first = window.HFV2DayCycle.runDailyCycle();
  const second = window.HFV2DayCycle.runDailyCycle();
  assert.deepEqual(JSON.parse(JSON.stringify(first.costs)), {network: 100, factories: 300, fleet: 50, transport: 0, total: 450});
  assert.equal(second.costs.total, 450);
  assert.equal(state.cash, 9550);
  assert.equal(state.finance.journal.filter(entry => entry.category === 'fleet-daily').length, 2);
});

test('Journal bleibt beim Speichern erhalten und Buchungs-IDs verhindern Doppelbuchungen', () => {
  const {window, state} = harness();
  window.HFV2Save.changeCash(-12, 'logistics-repositioning-cost', {bookingId: 'repositioning:7', reference: {assignmentId: 7}});
  window.HFV2Save.changeCash(-12, 'logistics-repositioning-cost', {bookingId: 'repositioning:7'});
  assert.equal(state.cash, 9988);
  const saved = window.HFV2Save.serializeState();
  const hydrated = window.HFV2Save.hydrateState(saved).state;
  assert.equal(hydrated.finance.journal.length, 1);
  assert.equal(hydrated.finance.journal[0].category, 'repositioning-distance');
  assert.equal(hydrated.finance.journal[0].reference.assignmentId, 7);
});

test('operatives Ergebnis trennt Investitionen von laufenden Kosten', () => {
  const {window, state} = harness();
  window.HFV2Save.changeCash(1000, 'goods-daily-sales', {absMinute: 100});
  window.HFV2Save.changeCash(-2000, 'fleet-buy', {absMinute: 110, reference: {vehicleId: 3}});
  const summary = window.HFV2DayCycle.runDailyCycle();
  assert.equal(summary.revenue.sales, 1000);
  assert.equal(summary.operatingResult, 550);
  assert.equal(summary.investments, 2000);
  assert.equal(summary.cashChange, -1450);
  assert.equal(state.finance.lastClosedDay, 1);
});

test('alte Speicherstände erhalten ein leeres Finanzjournal', () => {
  const window = {dispatchEvent() {}};
  load('v2/save-logic.js', window);
  const state = window.HFV2Save.hydrateState({state: {cash: 42}}).state;
  assert.deepEqual(JSON.parse(JSON.stringify(state.finance)), {journal: [], nextEntryId: 1, lastClosedDay: 0});
});
