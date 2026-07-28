const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync('v2/app.js', 'utf8');
const helpers = source.slice(
  source.indexOf('  function factoryProductionVisual('),
  source.indexOf('  function factoryMaxLevel('),
);

function renderHelpers({factoryImage = '', goodImage = ''} = {}) {
  const context = vm.createContext({
    window: {
      HFV2FactoryAssets: {factoryImage: () => factoryImage},
      HFV2GoodsAssets: {goodImage: () => goodImage},
    },
    escapeHtml: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;'),
    goodById: goodId => ({id: goodId, name: `Ware ${goodId}`, icon: '📦'}),
    formatDailyKg: value => `${Number(value) || 0} kg/Tag`,
  });
  vm.runInContext(`${helpers}; this.visual = factoryProductionVisual; this.outputs = factoryProductionOutputs; this.status = factoryProductionStatus;`, context);
  return context;
}

test('Fabrik- und Warenassets sind dekorativ und fallen ohne Bild auf Emoji zurück', () => {
  const fallback = renderHelpers();
  assert.match(fallback.visual({id: 'missing', icon: '🏭'}), /factory-production-emoji[^>]*.*🏭/);
  assert.doesNotMatch(fallback.visual({id: 'missing', icon: '🏭'}), /<img/);

  const assets = renderHelpers({factoryImage: 'factory.png', goodImage: 'good.png'});
  assert.match(assets.visual({id: 'factory'}), /src="factory.png" alt="" loading="lazy"/);
  assert.match(assets.outputs({grain: 2}), /src="good.png" alt="" loading="lazy"/);
});

test('Warenchips verwenden ausschließlich die tatsächlich geschätzten Ausgaben', () => {
  const {outputs} = renderHelpers();
  const markup = outputs({first: 12.5, second: 3, theoretical_only: 0, invalid: Number.NaN});
  assert.match(markup, /Ware first.*12\.5 kg\/Tag/);
  assert.match(markup, /Ware second.*3 kg\/Tag/);
  assert.doesNotMatch(markup, /theoretical_only|invalid|NaN/);
  assert.match(outputs({}), /Keine Ware produziert/);
});

test('alle Produktionsgründe besitzen unterscheidbare Statusmeldungen', () => {
  const {status} = renderHelpers();
  const reasons = ['demand-limited', 'capacity-limited', 'input-limited', 'no-output', 'blocked', 'ready'];
  assert.equal(new Set(reasons.map(reason => status(reason).tone)).size, reasons.length);
  assert.equal(status('capacity-limited').label, 'Lagerkapazität erreicht');
  assert.equal(status('ready').label, 'Produktion bereit');
});

test('Balken und deaktiviertes Upgrade bleiben statisch abgesichert', () => {
  const production = source.slice(source.indexOf('  function factoryProductionMarkup('), source.indexOf('  function cityName('));
  assert.match(production, /capacityKg > 0 \? Math\.min\(100, actualKg \/ capacityKg \* 100\) : 0/);
  assert.match(production, /Number\.isFinite\(estimatedCapacity\)/);
  assert.match(production, /role="progressbar"[^>]*aria-valuemax="\$\{capacityKg\}"[^>]*aria-valuenow="\$\{actualKg\}"/);
  assert.match(production, /data-hf-v2-factory-upgrade[^>]*data-city-id=[^>]*data-factory-ref=[^>]*title=[^>]*\$\{buttonState\.disabled \? ' disabled' : ''\}/);
});
