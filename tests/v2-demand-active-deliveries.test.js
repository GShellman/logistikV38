const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync('v2/app.js', 'utf8');

function functionSource(name, nextName) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf(`  function ${nextName}(`, start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

const demandRows = ['food', 'wood', 'fish', 'tools', 'ore'].map((id, index) => ({
  good: {id, name: id, unit: {unit: 'kg', kgPerUnit: 1}},
  dailyKg: 100 - index,
}));

function renderDemand(shipments) {
  const context = vm.createContext({
    window: {
      HFV2Logistics: {getState: () => ({shipments})},
      HFV2Goods: {getCityInventory: () => ({}), salePriceForCity: () => 1},
    },
    expandedListState: new Map(),
    escapeHtml: String,
    formatDailyKg: value => `${value} kg/Tag`,
    formatGoodAmount: (_goodId, value) => `${value} kg`,
    formatSalePrice: () => 'CHF 1 / kg',
    goodIcon: () => '',
    v2DemandRows: () => demandRows,
  });
  return vm.runInContext(`
    ${functionSource('limitedEntriesMarkup', 'demandPanel')}
    ${functionSource('demandPanel', 'factoryById')}
    demandPanel({id: 'bern'});
  `, context);
}

function groups(markup) {
  const detailsAt = markup.indexOf('<details');
  return {
    direct: detailsAt < 0 ? markup : markup.slice(0, detailsAt),
    folded: detailsAt < 0 ? '' : markup.slice(detailsAt),
  };
}

test('aktive Einzellieferung wird direkt gezeigt und nur übrige Waren werden eingeklappt', () => {
  const markup = renderDemand([{status: 'active', toCityId: 'bern', goodId: 'fish'}]);
  const {direct, folded} = groups(markup);
  assert.match(direct, /<b>fish<\/b>/);
  assert.doesNotMatch(direct, /<b>food<\/b>/);
  assert.doesNotMatch(folded, /<b>fish<\/b>/);
  assert.match(folded, /Alle anzeigen \(4\)/);
});

test('mehrere gleichzeitig gelieferte Waren bleiben vollständig direkt sichtbar', () => {
  const markup = renderDemand([
    {status: 'active', toCityId: 'bern', goodId: 'food'},
    {status: 'active', toCityId: 'bern', goodId: 'wood'},
    {status: 'active', toCityId: 'bern', goodId: 'fish'},
    {status: 'active', toCityId: 'bern', goodId: 'tools'},
    {status: 'active', toCityId: 'bern', goodId: 'ore'},
  ]);
  const {direct, folded} = groups(markup);
  for (const id of ['food', 'wood', 'fish', 'tools', 'ore']) assert.match(direct, new RegExp(`<b>${id}</b>`));
  assert.equal(folded, '');
});

test('Sammellieferung berücksichtigt nur noch nicht abgeschlossene Stopps der Stadt', () => {
  const markup = renderDemand([{status: 'active', goodId: 'food', stops: [
    {toCityId: 'bern', goodId: 'wood', status: 'pending'},
    {toCityId: 'bern', goodId: 'fish', status: 'processing'},
    {toCityId: 'bern', goodId: 'tools', status: 'delivered'},
    {toCityId: 'zurich', goodId: 'ore', status: 'pending'},
  ]}]);
  const {direct, folded} = groups(markup);
  assert.match(direct, /<b>wood<\/b>/);
  assert.match(direct, /<b>fish<\/b>/);
  assert.doesNotMatch(direct, /<b>(food|tools|ore)<\/b>/);
  assert.match(folded, /Alle anzeigen \(3\)/);
});

test('abgeschlossene Transporte und Rückfahrten markieren keine Ware als geliefert', () => {
  const markup = renderDemand([
    {status: 'delivered', toCityId: 'bern', goodId: 'food'},
    {status: 'returning', toCityId: 'bern', goodId: 'wood'},
    {status: 'returned', toCityId: 'bern', goodId: 'fish'},
  ]);
  const {direct, folded} = groups(markup);
  assert.doesNotMatch(direct, /<article class="hf-v2-demand-tile">/);
  assert.match(folded, /Alle anzeigen \(5\)/);
});

test('ohne laufende Lieferung bleibt der vollständige Bedarf unter Alle anzeigen erreichbar', () => {
  const markup = renderDemand([]);
  const {direct, folded} = groups(markup);
  assert.doesNotMatch(direct, /<article class="hf-v2-demand-tile">/);
  assert.match(folded, /Alle anzeigen \(5\)/);
  for (const id of ['food', 'wood', 'fish', 'tools', 'ore']) assert.match(folded, new RegExp(`<b>${id}</b>`));
});
