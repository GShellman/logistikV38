(() => {
  'use strict';

  let networkLineLayer = null;
  let renderedConnections = [];
  let renderedCitiesById = {};
  let networkMap = null;
  let previewLayer = null;
  let previewProject = null;
  let previewCallbacks = {};
  let drawing = null;
  let drawingCursor = null;

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
    const coords = connection.geometry?.length > 1
      ? connection.geometry
      : [[start.lat, start.lng], [target.lat, target.lng]];
    // Persisted routes can contain the pre-snap coordinate.  Rendering endpoints
    // from their graph nodes guarantees adjacent split edges meet pixel-perfectly.
    return [[start.lat, start.lng], ...coords.slice(1, -1), [target.lat, target.lng]];
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
    networkMap = map;

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

  function clearProjectPreview() {
    if (previewLayer && networkMap?.hasLayer?.(previewLayer)) networkMap.removeLayer(previewLayer);
    previewLayer = null;
    previewProject = null;
    networkMap?.off?.('click', handlePreviewMapClick);
    networkMap?.off?.('mousemove', handleDrawingMouseMove);
    drawing = null;
    drawingCursor = null;
  }

  function handlePreviewMapClick(event) {
    if (drawing) {
      if (event?.originalEvent?.target?.closest?.('.leaflet-marker-icon')) return;
      drawing.points.push([event.latlng.lat, event.latlng.lng]);
      renderDrawing();
      drawing.callbacks.onChange?.(drawing.points.map(point => [...point]));
      return;
    }
    if (!previewProject || event?.originalEvent?.target?.closest?.('.leaflet-marker-icon')) return;
    previewCallbacks.onAddWaypoint?.({lat: event.latlng.lat, lng: event.latlng.lng});
  }

  function handleDrawingMouseMove(event) {
    if (!drawing) return;
    drawingCursor = [event.latlng.lat, event.latlng.lng];
    renderDrawing();
  }

  function renderDrawing() {
    if (!drawing || !networkMap || !window.L) return;
    previewLayer?.clearLayers?.();
    const spec = transportSpec(drawing.type);
    const points = drawing.points;
    for (let index = 1; index < points.length; index += 1) {
      previewLayer.addLayer(L.polyline([points[index - 1], points[index]], {color: spec.color || '#15a6a6', weight: 7, opacity: .95}));
    }
    if (drawingCursor) previewLayer.addLayer(L.polyline([points[points.length - 1], drawingCursor], {color: spec.color || '#15a6a6', weight: 5, opacity: .7, dashArray: '8 8', interactive: false}));
    previewLayer.addLayer(L.marker(points[0], {icon: markerIcon('start', 'A'), draggable: false, title: 'Gewählte Startstadt'}));
    points.slice(1).forEach((point, offset) => {
      const index = offset + 1;
      const marker = L.marker(point, {icon: markerIcon('waypoint', String(index)), draggable: true, title: 'Stützpunkt ziehen oder per Rechtsklick löschen'});
      marker.on('drag', event => { drawing.points[index] = [event.latlng.lat, event.latlng.lng]; renderDrawing(); });
      marker.on('dragend', () => drawing.callbacks.onChange?.(drawing.points.map(entry => [...entry])));
      marker.on('contextmenu', () => { drawing.points.splice(index, 1); renderDrawing(); drawing.callbacks.onChange?.(drawing.points.map(entry => [...entry])); });
      previewLayer.addLayer(marker);
    });
  }

  function beginRoadDrawing({originId, type, allowedTargetIds = [], onChange, onComplete} = {}) {
    clearProjectPreview();
    const start = nodeInfo(originId, renderedCitiesById);
    if (!networkMap || !window.L || !start) return false;
    previewLayer = L.layerGroup().addTo(networkMap);
    previewCallbacks = {};
    previewProject = {a: originId, type};
    drawing = {originId, type, points: [[start.lat, start.lng]], allowedTargetIds: new Set(allowedTargetIds), callbacks: {onChange, onComplete}};
    networkMap.on?.('click', handlePreviewMapClick);
    networkMap.on?.('mousemove', handleDrawingMouseMove);
    renderDrawing();
    return true;
  }

  function handleDrawingCityClick(cityId) {
    if (!drawing || cityId === drawing.originId || !drawing.allowedTargetIds.has(cityId)) return false;
    const target = nodeInfo(cityId, renderedCitiesById);
    if (!target) return false;
    const geometry = [...drawing.points.map(point => [...point]), [target.lat, target.lng]];
    const complete = drawing.callbacks.onComplete;
    drawing = null;
    drawingCursor = null;
    networkMap?.off?.('mousemove', handleDrawingMouseMove);
    networkMap?.off?.('click', handlePreviewMapClick);
    complete?.({targetId: cityId, geometry});
    return true;
  }

  function markerIcon(kind, label) {
    return L.divIcon({className: `hf-v2-route-editor-marker is-${kind}`, html: `<span>${escapeHtml(label)}</span>`, iconSize: [30, 30], iconAnchor: [15, 15]});
  }

  function renderProjectPreview(project, callbacks = {}) {
    clearProjectPreview();
    if (!networkMap || !window.L || !project) return null;
    previewProject = project;
    previewCallbacks = callbacks;
    previewLayer = L.layerGroup().addTo(networkMap);
    const start = nodeInfo(project.a, renderedCitiesById);
    const target = nodeInfo(project.b, renderedCitiesById);
    const geometry = project.geometry?.length > 1 ? project.geometry : (start && target ? [[start.lat, start.lng], [target.lat, target.lng]] : []);
    if (geometry.length) previewLayer.addLayer(L.polyline(geometry, {color: '#15a6a6', weight: 7, opacity: .9, dashArray: '12 8'}));
    if (start) previewLayer.addLayer(L.marker([start.lat, start.lng], {icon: markerIcon('start', 'A'), draggable: false, title: 'Start'}));
    if (target) previewLayer.addLayer(L.marker([target.lat, target.lng], {icon: markerIcon('target', 'Z'), draggable: false, title: 'Ziel'}));
    (project.waypoints || []).forEach((point, index) => {
      const marker = L.marker([point.lat, point.lng], {icon: markerIcon('waypoint', String(index + 1)), draggable: true, title: 'Wegpunkt (Rechtsklick zum Löschen)'});
      marker.on('dragend', event => callbacks.onMoveWaypoint?.(index, event.target.getLatLng()));
      marker.on('contextmenu', () => callbacks.onRemoveWaypoint?.(index));
      previewLayer.addLayer(marker);
    });
    (project.connectionPoints || []).forEach(candidate => {
      const marker = L.marker([candidate.lat, candidate.lng], {icon: markerIcon(candidate.enabled === false ? 'connection-off' : 'connection', candidate.automatic ? 'A' : 'K'), title: candidate.enabled === false ? 'Anschluss aktivieren' : 'Anschluss deaktivieren'});
      marker.on('click', () => callbacks.onToggleConnection?.(candidate.id));
      previewLayer.addLayer(marker);
    });
    networkMap.on?.('click', handlePreviewMapClick);
    return previewLayer;
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

    const junctions = window.HFNetwork?.getState?.().junctions || [];
    for (const junction of junctions) {
      if (!junction?.isJunction) continue;
      networkLineLayer.addLayer(L.marker([junction.lat, junction.lng], {
        icon: L.divIcon({className: 'hf-v2-junction-marker', html: '<span aria-hidden="true"></span>', iconSize: [12, 12], iconAnchor: [6, 6]}),
        interactive: false,
        keyboard: false,
        title: junction.name || 'Netzknoten',
      }));
    }

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

  const api = {initNetworkLayer, renderNetworkLines, clearNetworkLines, setNetworkLayerVisible, renderProjectPreview, clearProjectPreview, beginRoadDrawing, handleDrawingCityClick};
  window.HFNetworkLayer = api;
  window.HFNetwork = {...(window.HFNetwork || {}), ...api};
  window.addEventListener?.('hf:network:capacity-changed', refreshRenderedNetwork);
  window.addEventListener?.('hf:v2:state-changed', event => {
    const reason = String(event?.detail?.reason || '');
    if (reason.startsWith('time-') || reason === 'state-configured') refreshRenderedNetwork();
  });
})();
