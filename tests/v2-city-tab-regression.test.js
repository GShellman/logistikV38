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
    hidden: kind === 'panel' && name !== 'goods',
    tabIndex: name === 'goods' ? 0 : -1,
    attributes: {['aria-selected']: String(name === 'goods')},
    setAttribute(attribute, value) { this.attributes[attribute] = value; },
    focus() { this.focused = true; },
  });
  const facts = {
    render() {
      this.tabs = ['goods', 'production', 'transporte'].map(name => makeNode('tab', name));
      this.panels = ['goods', 'production', 'transporte'].map(name => makeNode('panel', name));
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
    let activeCityTab = 'goods';
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

test('Alle anzeigen bleibt nach einem Live-Tick geöffnet', () => {
  const handlers = {};
  const facts = {
    render(markup) {
      this.details = {
        dataset: {hfV2ListKey: 'zurich:inventory'},
        open: /<details[^>]* open/.test(markup),
        closest(selector) { return selector === '[data-hf-v2-list-key]' ? this : null; },
      };
    },
  };
  const context = vm.createContext({
    facts,
    document: {
      addEventListener(type, handler) { handlers[type] = handler; },
      getElementById: () => null,
    },
    window: {HFV2Time: {advanceMinutes: () => null, formatClock: () => '08:01'}},
    Map,
    escapeHtml: value => String(value),
    renderHud() {},
    renderActiveShipments() {},
    runWithDailyCycleSummary: action => ({time: action(), summary: null}),
    dailyCycleSummaryText: () => '',
    setTimeStatus() {},
  });

  vm.runInContext(`
    let selectedId = 'zurich';
    const citiesById = {zurich: {id: 'zurich'}};
    const expandedListState = new Map();
    ${functionSource('limitedEntriesMarkup', 'demandPanel')}
    function selectCity(city) {
      facts.render(limitedEntriesMarkup([1, 2, 3, 4, 5], String, 4, 'entries', city.id + ':inventory'));
    }
    ${functionSource('refreshSelectedCity', 'updateAdvanceStatus')}
    ${functionSource('liveTick', 'toggleLiveTime')}
    ${functionSource('bindLogisticsPanelActions', 'bindTimeControls')}
    selectCity(citiesById.zurich);
    bindLogisticsPanelActions();
  `, context);

  const openedDetails = facts.details;
  openedDetails.open = true;
  handlers.toggle({target: openedDetails});
  vm.runInContext('liveTick()', context);

  assert.notEqual(facts.details, openedDetails, 'selectCity hat das details neu dargestellt');
  assert.equal(facts.details.open, true);
});

test('Waren ist der Standardtab und die Stadtansicht enthält keinen Übersicht-Tab mehr', () => {
  assert.match(source, /let activeCityTab = 'goods';/);
  assert.doesNotMatch(source, /hfV2TabOverview|hfV2PanelOverview|data-hf-v2-tab="overview"|data-hf-v2-panel="overview"/);

  const selectCitySource = functionSource('selectCity', 'openNetworkModalForCity');
  assert.match(selectCitySource, /selectedId !== city\.id\) activeCityTab = 'goods';/);
  assert.doesNotMatch(selectCitySource, /Aktuelle Probleme|Nächste sinnvolle Aktion|financeSummaryMarkup/);

  const tabNames = [...selectCitySource.matchAll(/data-hf-v2-tab="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(tabNames, ['goods', 'production', 'transporte']);
});
