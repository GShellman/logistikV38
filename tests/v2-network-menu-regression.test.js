const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

test('Straßenauswahl öffnet zuerst die Planungsphase und bestätigt erst auf Wunsch', async () => {
  let clickHandler;
  let modalBodyHtml = '<p>Netzwerkplanung</p>';
  const calls = [];
  const modalBody = {contains: () => true};
  const document = {
    addEventListener(type, handler) {
      if (type === 'click') clickHandler = handler;
    },
    getElementById(id) {
      return id === 'hfV2ModalBody' ? modalBody : null;
    },
  };
  const window = {
    HFV2CitiesById: {
      zurich: {id: 'zurich', name: 'Zürich'},
      bern: {id: 'bern', name: 'Bern'},
    },
    HF_V2: {
      async planConnection() {
        calls.push('plan');
        return {a: 'zurich', b: 'bern', type: 'localroad', distance: 120};
      },
      async confirmProject() {
        calls.push('confirm');
        return {a: 'zurich', b: 'bern', type: 'localroad', distance: 120};
      },
    },
    HFNetwork: {getState: () => ({pendingProject: null})},
    HFV2Modal: {
      setModalBody(html) {
        calls.push('set-body');
        modalBodyHtml = html;
      },
      closeModal() {
        calls.push('close');
      },
    },
  };

  vm.runInContext(
    readFileSync('v2/network-menu.js', 'utf8'),
    vm.createContext({window, document, console}),
    {filename: 'v2/network-menu.js'},
  );

  const buildButton = {
    dataset: {action: 'plan-connection', origin: 'zurich', target: 'bern', type: 'localroad'},
    closest: selector => selector === '[data-action]' ? buildButton : null,
  };
  clickHandler({target: buildButton, preventDefault() {}});
  await flushPromises();

  assert.deepEqual(calls, ['plan', 'set-body']);
  assert.match(modalBodyHtml, /Route auf Karte bearbeiten/);
  assert.match(modalBodyHtml, /Bau bestätigen/);

  const confirmButton = {dataset: {action: 'confirm-project'}, closest: selector => selector === '[data-action]' ? confirmButton : null};
  clickHandler({target: confirmButton, preventDefault() {}});
  assert.deepEqual(calls, ['plan', 'set-body', 'confirm', 'close']);
});
