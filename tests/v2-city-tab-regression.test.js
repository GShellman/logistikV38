const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync('v2/app.js', 'utf8');

function functionSource(name, nextName) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf(`  function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} muss in v2/app.js vorhanden sein`);
  assert.notEqual(end, -1, `${nextName} muss nach ${name} vorhanden sein`);
  return source.slice(start, end);
}

test('Produktion bleibt nach einem Live-Refresh als Stadttab ausgewählt und sichtbar', () => {
  let clickHandler;
  const makeNode = (kind, name) => ({
    dataset: kind === 'tab' ? {hfV2Tab: name} : {hfV2Panel: name},
    hidden: kind === 'panel' && name !== 'overview',
    tabIndex: name === 'overview' ? 0 : -1,
    attributes: {['aria-selected']: String(name === 'overview')},
    setAttribute(attribute, value) { this.attributes[attribute] = value; },
    focus() { this.focused = true; },
  });
  const facts = {
    render() {
      this.tabs = ['overview', 'goods', 'production', 'transporte'].map(name => makeNode('tab', name));
      this.panels = ['overview', 'goods', 'production', 'transporte'].map(name => makeNode('panel', name));
    },
    querySelectorAll(selector) { return selector.includes('panel') ? this.panels : this.tabs; },
    querySelector(selector) {
      const name = selector.match(/="([^"]+)"/)?.[1];
      return this.tabs.find(tab => tab.dataset.hfV2Tab === name) || null;
    },
  };
  facts.render();

  const context = vm.createContext({
    facts,
    document: {
      getElementById: id => id === 'hfV2Facts' ? facts : null,
      addEventListener(type, handler) { if (type === 'click') clickHandler = handler; },
    },
    window: {HFV2Time: {advanceMinutes: () => null, formatClock: () => '08:01'}},
    renderHud() {},
    renderActiveShipments() {},
    runWithDailyCycleSummary: action => ({time: action(), summary: null}),
    dailyCycleSummaryText: () => '',
    setTimeStatus() {},
  });

  vm.runInContext(`
    let activeCityTab = 'overview';
    let selectedId = 'zurich';
    const citiesById = {zurich: {id: 'zurich'}};
    ${functionSource('applyCityTabState', 'selectCity')}
    function selectCity() { facts.render(); applyCityTabState(); }
    ${functionSource('refreshSelectedCity', 'updateAdvanceStatus')}
    ${functionSource('liveTick', 'toggleLiveTime')}
    ${functionSource('bindLogisticsPanelActions', 'bindTimeControls')}
    bindLogisticsPanelActions();
  `, context);

  const productionButton = facts.tabs.find(tab => tab.dataset.hfV2Tab === 'production');
  clickHandler({target: {closest: () => productionButton}});
  vm.runInContext('liveTick()', context);

  const selectedTab = facts.tabs.find(tab => tab.attributes['aria-selected'] === 'true');
  const productionPanel = facts.panels.find(panel => panel.dataset.hfV2Panel === 'production');
  assert.equal(selectedTab.dataset.hfV2Tab, 'production');
  assert.equal(selectedTab.tabIndex, 0);
  assert.equal(productionPanel.hidden, false);
});
