(() => {
  'use strict';

  const SCHEMA_VERSION = 2;
  const SAVE_FILE_PREFIX = 'helvetic-freight-v2';
  const STARTING_CASH = 500000;

  let state = null;

  function dispatchStateChanged(reason = 'state-updated') {
    window.dispatchEvent?.(new CustomEvent('hf:v2:state-changed', {detail: {reason, state, cash: state?.cash}}));
  }

  function getState() {
    if (!state) state = createDefaultState().state;
    return state;
  }

  function getCash() {
    return Number(getState().cash) || 0;
  }

  function setCash(value, reason = 'cash-changed') {
    const nextCash = Number(value);
    if (!Number.isFinite(nextCash)) return getCash();
    getState().cash = nextCash;
    dispatchStateChanged(reason);
    return nextCash;
  }

  function changeCash(delta, reason = 'cash-changed') {
    return setCash(getCash() + (Number(delta) || 0), reason);
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function defaultNetworkState() {
    if (window.HFNetwork?.createNetworkState) {
      return window.HFNetwork.createNetworkState({networkOriginNode: 'zurich', selected: 'zurich'});
    }
    return {connections: [], pendingProject: null, networkOriginNode: 'zurich', selected: 'zurich', cities: {}, junctions: [], usedCapacity: {}};
  }

  function defaultFleetState() {
    if (window.HFFleet?.createFleetState) return window.HFFleet.createFleetState();
    return {cityFleets: {}};
  }

  function normalizePackage(savePackage) {
    const source = savePackage && typeof savePackage === 'object' ? savePackage : {};
    const sourceState = source.state && typeof source.state === 'object' ? source.state : {};
    const network = {...defaultNetworkState(), ...(sourceState.network || {})};
    const fleet = {...defaultFleetState(), ...(sourceState.fleet || {})};
    network.connections = Array.isArray(network.connections) ? network.connections : [];
    network.junctions = Array.isArray(network.junctions) ? network.junctions : [];
    network.cities = network.cities && typeof network.cities === 'object' ? network.cities : {};
    network.usedCapacity = network.usedCapacity && typeof network.usedCapacity === 'object' ? network.usedCapacity : {};
    fleet.cityFleets = fleet.cityFleets && typeof fleet.cityFleets === 'object' ? fleet.cityFleets : {};
    delete network.cash;
    delete fleet.cash;
    const legacyCash = Number.isFinite(Number(sourceState.cash)) ? Number(sourceState.cash) : Number(sourceState.fleet?.cash ?? sourceState.network?.cash);
    const cash = Number.isFinite(legacyCash) ? legacyCash : STARTING_CASH;

    return {
      schemaVersion: SCHEMA_VERSION,
      savedAt: source.savedAt || new Date().toISOString(),
      state: {cash, network, fleet},
    };
  }

  function createDefaultState() {
    return normalizePackage({schemaVersion: SCHEMA_VERSION, state: {network: defaultNetworkState(), fleet: defaultFleetState()}});
  }

  function serializeState(savePackage = null) {
    const liveNetwork = window.HFNetwork?.getState?.();
    const liveFleet = window.HFFleet?.getState?.();
    const source = savePackage || {state: {network: liveNetwork, fleet: liveFleet, cash: getCash()}};
    const normalized = normalizePackage(source);
    normalized.savedAt = new Date().toISOString();
    return deepClone(normalized);
  }

  function hydrateState(savePackage) {
    const normalized = normalizePackage(savePackage);
    return deepClone(normalized);
  }

  function configureState(savePackageOrState) {
    const nextState = savePackageOrState?.state || savePackageOrState || createDefaultState().state;
    const normalized = normalizePackage({state: nextState});
    state = normalized.state;
    dispatchStateChanged('state-configured');
    return state;
  }

  function downloadJson(savePackage) {
    const blob = new Blob([JSON.stringify(savePackage, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${SAVE_FILE_PREFIX}-${savePackage.savedAt.replace(/[:.]/g, '-')}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportSave(savePackage = null) {
    const serialized = serializeState(savePackage);
    if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && window.URL) downloadJson(serialized);
    return serialized;
  }

  async function importSave(fileOrJson) {
    let raw = fileOrJson;
    if (typeof File !== 'undefined' && fileOrJson instanceof File) raw = await fileOrJson.text();
    if (typeof Blob !== 'undefined' && fileOrJson instanceof Blob && typeof fileOrJson.text === 'function') raw = await fileOrJson.text();
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return hydrateState(parsed);
  }

  window.HFV2Save = {SCHEMA_VERSION, STARTING_CASH, createDefaultState, configureState, getState, getCash, setCash, changeCash, dispatchStateChanged, serializeState, hydrateState, exportSave, importSave};
})();
