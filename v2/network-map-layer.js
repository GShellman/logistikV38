(() => {
  'use strict';

  let networkLineLayer = null;
  let renderedConnections = [];
  let renderedCitiesById = {};

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

  function distanceBetween(a, b) {
    if (window.HFNetwork?.dist) {
      return window.HFNetwork.dist({lat: a[0], lng: a[1]}, {lat: b[0], lng: b[1]});
    }
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  function geometryMidpoint(coords) {
    if (!Array.isArray(coords) || coords.length < 2) return coords?.[0] || null;
    const lengths = coords.slice(1).map((point, index) => distanceBetween(coords[index], point));
    const halfway = lengths.reduce((sum, length) => sum + length, 0) / 2;
    let covered = 0;
    for (let index = 0; index < lengths.length; index += 1) {
      if (covered + lengths[index] >= halfway) {
        const ratio = lengths[index] ? (halfway - covered) / lengths[index] : 0;
        return [
          coords[index][0] + (coords[index + 1][0] - coords[index][0]) * ratio,
          coords[index][1] + (coords[index + 1][1] - coords[index][1]) * ratio,
        ];
      }
      covered += lengths[index];
    }
    return coords[coords.length - 1];
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
    renderedConnections = connections;
    renderedCitiesById = citiesById;

    connections.forEach(connection => {
      const start = nodeInfo(connection.a, citiesById);
      const target = nodeInfo(connection.b, citiesById);
      if (!start || !target) return;

      const spec = transportSpec(connection.type);
      const coords = lineCoordinates(connection, start, target);
      const typeName = spec.name || connection.type || 'Verbindung';
      const capacity = formatCapacity(connection, spec);
      const baseWeight = Number(spec.weight) || 4;
      const isRail = /rail|train|schiene/i.test(`${connection.type} ${spec.name || ''}`);
      const lineOptions = {
        // Pattern, rather than colour alone, distinguishes rail and road.
        dashArray: isRail ? '2 8' : (spec.dashArray || null),
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

      if (!isRail) {
        const occupancy = window.HFNetwork?.getEdgeOccupancy?.(connection) || {used: 0, capacity: Number(connection.capacity ?? spec.capacity) || 0};
        const label = `Belegung ${start.name} nach ${target.name}: ${occupancy.used} von ${occupancy.capacity}`;
        const bubble = L.marker(geometryMidpoint(coords), {
          icon: L.divIcon({
            className: 'hf-v2-capacity-marker',
            html: `<span class="hf-v2-capacity-bubble" role="status" aria-label="${escapeHtml(label)}">${escapeHtml(occupancy.used)}/${escapeHtml(occupancy.capacity)}</span>`,
            iconSize: [52, 28],
            iconAnchor: [26, 14],
          }),
          interactive: false,
          keyboard: false,
          title: label,
        });
        networkLineLayer.addLayer(bubble);
      }
    });

    return networkLineLayer;
  }

  function refreshRenderedNetwork() {
    if (networkLineLayer) renderNetworkLines(renderedConnections, renderedCitiesById);
  }

  function setNetworkLayerVisible(visible, map) {
    if (!networkLineLayer || !map) return;
    if (visible && !map.hasLayer(networkLineLayer)) networkLineLayer.addTo(map);
    if (!visible && map.hasLayer(networkLineLayer)) map.removeLayer(networkLineLayer);
  }

  const api = {initNetworkLayer, renderNetworkLines, clearNetworkLines, setNetworkLayerVisible};
  window.HFNetworkLayer = api;
  window.HFNetwork = {...(window.HFNetwork || {}), ...api};
  window.addEventListener?.('hf:network:capacity-changed', refreshRenderedNetwork);
  window.addEventListener?.('hf:v2:state-changed', event => {
    const reason = String(event?.detail?.reason || '');
    if (reason.startsWith('time-') || reason === 'state-configured') refreshRenderedNetwork();
  });
})();
