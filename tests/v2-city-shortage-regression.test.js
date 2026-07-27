const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');

const source = readFileSync('v2/app.js', 'utf8');

function functionSource(name, nextName) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf(`  function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} muss in v2/app.js vorhanden sein`);
  assert.notEqual(end, -1, `${nextName} muss nach ${name} vorhanden sein`);
  return source.slice(start, end);
}

test('leerer Warenbestand erzeugt weder Warenmangel-Kartenstatus noch Problemwarnung', () => {
  const mapState = functionSource('cityMapState', 'cityIcon');
  const citySelection = functionSource('selectCity', 'openNetworkModalForCity');
  const mapControls = functionSource('addMapControls', 'bootMap');

  assert.doesNotMatch(mapState, /shortage|Warenmangel|getCityInventory|v2DemandRows/);
  assert.doesNotMatch(citySelection, /hf-v2-city-warning|Bestand liegt unter dem Tagesbedarf|Versorgung mit/);
  assert.match(citySelection, /Keine akuten Probleme erkannt/);
  assert.doesNotMatch(mapControls, /Warenmangel/);
});

test('Bestand, Tagesbedarf und Reichweite bleiben neutrale Warenkennzahlen', () => {
  const inventory = functionSource('inventorySectionMarkup', 'currentTimeState');
  const demand = functionSource('demandPanel', 'factoryById');

  assert.match(inventory, /Güter \/ Lager/);
  assert.match(inventory, /von.*belegt/);
  assert.match(demand, /Tagesbedarf/);
  assert.match(demand, /Reichweite:/);
});
