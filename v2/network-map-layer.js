(() => {
  'use strict';

  let networkLineLayer = null;

  function transportSpec(type) {
    return window.HFNetwork?.TRANSPORT_TYPES?.[type] || window.HFNetwork?.TRANSPORT_TYPES?.mainroad || {};
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    }[char]));
  }

  function formatKm(value) {
    const distance = Number(value);
    return Number.isFinite(distance) ? `${Math.round(distance)} km` : 'Distanz unbekannt';
  }

  function formatCapacity(connection, spec) {
    const capacity = Number(connection.capacity ?? spec.capacity);
    const unit = spec.capacityUnit || 'Einheiten';
    return Number.isFinite(capacity) ? `${capacity} ${unit}` : 'Kapazität unbekannt';
  }

  function lineCoordinates(connection, start, target) {
    return connection.geometry?.length > 1
      ? connection.geometry
      : [[start.lat, start.lng], [target.lat, target.lng]];
  }

  function nodeInfo(id, citiesById) {
    return citiesById[id] || window.HFNetwork?.nodeInfo?.(id) || null;
  }

  function initNetworkLayer(map) {
    if (!map || !window.L) return null;

    if (networkLineLayer && networkLineLayer._map !== map) {
      networkLineLayer.remove();
    }

    if (!networkLineLayer) {
      networkLineLayer = L.layerGroup();
    }

    if (!networkLineLayer._map) {
      networkLineLayer.addTo(map);
    }

    return networkLineLayer;
  }

  function clearNetworkLines() {
    networkLineLayer?.clearLayers?.();
  }

  function renderNetworkLines(connections = [], citiesById = {}) {
    if (!networkLineLayer || !window.L) return null;

    clearNetworkLines();

    connections.forEach(connection => {
      const start = nodeInfo(connection.a, citiesById);
      const target = nodeInfo(connection.b, citiesById);
      if (!start || !target) return;

      const spec = transportSpec(connection.type);
      const coords = lineCoordinates(connection, start, target);
      const typeName = spec.name || connection.type || 'Verbindung';
      const capacity = formatCapacity(connection, spec);
      const baseWeight = Number(spec.weight) || 4;
      const lineOptions = {
        dashArray: spec.dashArray || null,
        lineCap: 'round',
        lineJoin: 'round',
      };
      const glow = L.polyline(coords, {
        ...lineOptions,
        color: spec.color || '#3d6fae',
        weight: baseWeight + 12,
        opacity: .22,
        interactive: false,
      });
      const casing = L.polyline(coords, {
        ...lineOptions,
        color: '#fffdf7',
        weight: baseWeight + 7,
        opacity: .96,
        interactive: false,
      });
      const line = L.polyline(coords, {
        ...lineOptions,
        color: spec.color || '#3d6fae',
        weight: baseWeight + 3,
        opacity: .98,
      });

      line.bindTooltip([
        `<strong>${escapeHtml(start.name)} → ${escapeHtml(target.name)}</strong>`,
        `Typ: ${escapeHtml(typeName)}`,
        `Distanz: ${escapeHtml(formatKm(connection.distance))}`,
        `Kapazität: ${escapeHtml(capacity)}`,
      ].join('<br>'));

      networkLineLayer.addLayer(glow);
      networkLineLayer.addLayer(casing);
      networkLineLayer.addLayer(line);
    });

    return networkLineLayer;
  }

  const api = {initNetworkLayer, renderNetworkLines, clearNetworkLines};
  window.HFNetworkLayer = api;
  window.HFNetwork = {...(window.HFNetwork || {}), ...api};
})();
