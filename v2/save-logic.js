(() => {
  'use strict';

  const SCHEMA_VERSION = 2;
  const SAVE_FILE_PREFIX = 'helvetic-freight-v2';

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function defaultNetworkState() {
    if (window.HFNetwork?.createNetworkState) {
      return window.HFNetwork.createNetworkState({networkOriginNode: 'zurich', selected: 'zurich'});
    }
    return {connections: [], pendingProject: null, networkOriginNode: 'zurich', cash: 1000000, selected: 'zurich', cities: {}, junctions: [], usedCapacity: {}};
  }

  function defaultFleetState() {
    if (window.HFFleet?.createFleetState) return window.HFFleet.createFleetState();
    return {cash: 500000, cityFleets: {}};
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
    const cash = Number.isFinite(Number(sourceState.cash)) ? Number(sourceState.cash) : Number(fleet.cash);
    fleet.cash = Number.isFinite(cash) ? cash : Number(defaultFleetState().cash);

    return {
      schemaVersion: SCHEMA_VERSION,
      savedAt: source.savedAt || new Date().toISOString(),
      state: {cash: fleet.cash, network, fleet},
    };
  }

  function createDefaultState() {
    return normalizePackage({schemaVersion: SCHEMA_VERSION, state: {network: defaultNetworkState(), fleet: defaultFleetState()}});
  }

  function serializeState(savePackage = null) {
    const liveNetwork = window.HFNetwork?.getState?.();
    const liveFleet = window.HFFleet?.getState?.();
    const source = savePackage || {state: {network: liveNetwork, fleet: liveFleet, cash: liveFleet?.cash}};
    const normalized = normalizePackage(source);
    normalized.savedAt = new Date().toISOString();
    return deepClone(normalized);
  }

  function hydrateState(savePackage) {
    const normalized = normalizePackage(savePackage);
    return deepClone(normalized);
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

  window.HFV2Save = {SCHEMA_VERSION, createDefaultState, serializeState, hydrateState, exportSave, importSave};
})();
