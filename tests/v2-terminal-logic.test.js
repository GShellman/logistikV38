const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync('v2/terminal-logic.js', 'utf8');

function setup(logistics = {}) {
  const state = {cities: {zurich: {logistics}}, terminalReservations: {}};
  const window = {HFV2Save: {getState: () => ({network: state}), getCash: () => 500000, changeCash() {}}, HFV2FleetDispatch: {invalidate() {}}};
  vm.runInContext(source, vm.createContext({window, Math, Number, String, Array, Object}), {filename: 'v2/terminal-logic.js'});
  window.HFV2Terminal.configure({state});
  return {terminal: window.HFV2Terminal, state};
}

test('zwei Rampen fertigen zwei Transporte parallel ab', () => {
  const {terminal} = setup({loadingBays: 2});
  const first = terminal.findEarliestSlot('zurich', 100, 30);
  assert.equal(terminal.reserveSlot('zurich', first, 'one'), true);
  const second = terminal.findEarliestSlot('zurich', 100, 30);
  assert.deepEqual({start: second.startAbsMinute, wait: second.waitingMinutes}, {start: 100, wait: 0});
});

test('eine belegte Rampe erzeugt eine nachvollziehbare Warteschlange', () => {
  const {terminal} = setup();
  const first = terminal.findEarliestSlot('zurich', 100, 30);
  terminal.reserveSlot('zurich', first, 'one', {requestedStartAbsMinute: 100});
  const second = terminal.findEarliestSlot('zurich', 100, 20);
  assert.deepEqual({start: second.startAbsMinute, wait: second.waitingMinutes, reason: second.reason}, {start: 130, wait: 30, reason: 'loading-bay-delayed'});
});

test('Ausbau wird bei einer Neuberechnung sofort berücksichtigt', () => {
  const {terminal} = setup();
  const first = terminal.findEarliestSlot('zurich', 100, 30);
  terminal.reserveSlot('zurich', first, 'one');
  assert.equal(terminal.findEarliestSlot('zurich', 100, 30).startAbsMinute, 130);
  assert.equal(terminal.applyUpgrade('zurich', 'second-bay').ok, true);
  assert.equal(terminal.findEarliestSlot('zurich', 100, 30).startAbsMinute, 100);
});

test('Container werden ohne passende Logistikstufe eindeutig abgelehnt', () => {
  const {terminal} = setup();
  assert.equal(terminal.findEarliestSlot('zurich', 100, 30, {containerRequired: true}).reason, 'container-terminal-required');
});
