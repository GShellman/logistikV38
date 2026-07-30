(() => {
  'use strict';

  const MAX_CONNECTION_DISTANCE_KM = 105;
  const STARTING_CASH = window.HFV2Save?.STARTING_CASH ?? 500000;
  const INTERSECTION_EPS = 1e-7;
  // 50 metres is large enough to absorb routing/rounding noise, but small enough
  // not to join neighbouring streets accidentally.  Unlike a degree epsilon it
  // has the same meaning everywhere on the map.
  const JUNCTION_SNAP_KM = 0.05;
  const ROAD_REUSE_MIN_KM = 0.15;
  const CAPACITY_WINDOW_MINUTES = 60;
  let intersectionStats = {segmentChecks: 0, bboxRejects: 0};

  const TRANSPORT_TYPES = {
    localroad: {name: 'Gemeindestraße', short: 'GEMEINDE', mode: 'road', icon: '🛤️', capacity: 3, capacityUnit: 'Fahrzeuge', speed: 35, baseCost: 4000, buildKm: 280, maintenanceKm: 12, color: '#85796b', weight: 2, desc: 'Sehr günstig, aber langsam und mit geringer Tageskapazität.'},
    regional: {name: 'Regionalstraße', short: 'REGIONAL', mode: 'road', icon: '🚚', capacity: 8, capacityUnit: 'Fahrzeuge', speed: 60, baseCost: 9000, buildKm: 650, maintenanceKm: 25, color: '#a66a2d', weight: 3, desc: 'Mehr Geschwindigkeit und Kapazität als eine Gemeindestraße.'},
    mainroad: {name: 'Kantonsstraße', short: 'KANTON', mode: 'road', icon: '🚛', capacity: 16, capacityUnit: 'Fahrzeuge', speed: 90, baseCost: 22000, buildKm: 1400, maintenanceKm: 58, color: '#e18a2d', weight: 4, desc: 'Solider Ausbau für schnellere und größere Lieferketten.'},
    expressway: {name: 'Schnellstraße', short: 'SCHNELL', mode: 'road', icon: '🛣️', capacity: 28, capacityUnit: 'Fahrzeuge', speed: 110, baseCost: 48000, buildKm: 2800, maintenanceKm: 105, color: '#d96c38', weight: 5, desc: 'Schneller Ausbau für hohe Tagesmengen und kurze Fahrzeiten.'},
    motorway: {name: 'Autobahn', short: 'AUTOBAHN', mode: 'road', icon: '🛣️', capacity: 48, capacityUnit: 'Fahrzeuge', speed: 130, baseCost: 85000, buildKm: 4500, maintenanceKm: 175, color: '#c94b32', weight: 7, desc: 'Maximale Geschwindigkeit und Fahrzeugkapazität.'},
    rail: {name: 'Bahnstrecke', short: 'BAHN', mode: 'rail', icon: '🚆', capacity: 10, capacityUnit: 'Zugtrassen', speed: 140, baseCost: 50000, buildKm: 5000, maintenanceKm: 130, color: '#3d6fae', weight: 5, dashArray: '8 8', desc: 'Nur mit eigenen Güterzügen nutzbar.'},
  };

  const ROAD_ORDER = ['localroad', 'regional', 'mainroad', 'expressway', 'motorway'];

  let state = null;
  let cities = [];
  let citiesById = {};

  function createNetworkState(overrides = {}) {
    return {
      connections: [],
      pendingProject: null,
      networkOriginNode: 'zurich',
      selected: 'zurich',
      cities: {zurich: {unlocked: true}},
      junctions: [],
      usedCapacity: {},
      terminalReservations: {},
      ...overrides,
    };
  }

  function configure(options = {}) {
    state = options.state || state || createNetworkState();
    state.cities = state.cities && typeof state.cities === 'object' ? state.cities : {};
    state.usedCapacity = state.usedCapacity && typeof state.usedCapacity === 'object' ? state.usedCapacity : {};
    state.cities.zurich = {...(state.cities.zurich || {}), unlocked: true};
    cities = options.cities || cities;
    citiesById = options.citiesById || citiesById;
    return state;
  }

  function dist(a, b) {
    const R = 6371;
    const p = Math.PI / 180;
    const dlat = (b.lat - a.lat) * p;
    const dlon = (b.lng - a.lng) * p;
    const x = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dlon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function estimateRoadDistance(distance) {
    return distance * 1.22;
  }

  function buildQuote(type, distance) {
    const t = TRANSPORT_TYPES[type];
    if (!t) return null;
    return {cost: Math.round(t.baseCost + distance * t.buildKm), maintenance: Math.round(distance * t.maintenanceKm)};
  }

  function sameEndpoints(edge, a, b) {
    return (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a);
  }

  function transportSpec(edgeOrType) {
    const type = typeof edgeOrType === 'string' ? edgeOrType : edgeOrType?.type;
    return TRANSPORT_TYPES[type] || TRANSPORT_TYPES.mainroad;
  }

  function isRoadType(type) {
    return transportSpec(type).mode === 'road';
  }

  function roadRank(type) {
    const index = ROAD_ORDER.indexOf(type);
    return index < 0 ? -1 : index;
  }

  function dominantRoadType(a, b) {
    return roadRank(a) >= roadRank(b) ? a : b;
  }

  function nodeInfo(id, targetState = state) {
    return citiesById[id] || (targetState?.junctions || []).find(junction => junction.id === id) || null;
  }

  function connectionExists(a, b, mode = null, targetState = state) {
    return (targetState?.connections || []).some(edge => sameEndpoints(edge, a, b) && (!mode || transportSpec(edge).mode === mode));
  }

  function samePoint(a, b) {
    return Math.abs(a[0] - b[0]) < INTERSECTION_EPS && Math.abs(a[1] - b[1]) < INTERSECTION_EPS;
  }

  function edgeGeometry(edge, targetState = state) {
    const start = nodeInfo(edge.a, targetState);
    const target = nodeInfo(edge.b, targetState);
    if (Array.isArray(edge.geometry) && edge.geometry.length > 1) return edge.geometry;
    if (!start || !target) return [];
    return [[start.lat, start.lng], [target.lat, target.lng]];
  }

  function geometryDistance(coords) {
    let total = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      total += dist({lat: coords[i][0], lng: coords[i][1]}, {lat: coords[i + 1][0], lng: coords[i + 1][1]});
    }
    return total;
  }

  function geometryMetrics(coords) {
    const offsets = new Array(coords.length).fill(0);
    const segmentLengths = new Array(Math.max(0, coords.length - 1));
    for (let i = 0; i < coords.length - 1; i++) {
      segmentLengths[i] = dist({lat: coords[i][0], lng: coords[i][1]}, {lat: coords[i + 1][0], lng: coords[i + 1][1]});
      offsets[i + 1] = offsets[i] + segmentLengths[i];
    }
    return {offsets, segmentLengths, total: offsets[offsets.length - 1] || 0};
  }

  function geometryPointOffset(coords, segmentIndex, segmentT, metrics = geometryMetrics(coords)) {
    const a = coords[segmentIndex];
    const b = coords[segmentIndex + 1];
    // Scaling a straight segment by t also scales its great-circle distance
    // sufficiently accurately for the short drawn segments used here.
    return metrics.offsets[segmentIndex] + metrics.segmentLengths[segmentIndex] * Math.max(0, Math.min(1, segmentT));
  }

  function segmentBounds(a, b, padding = 0) {
    return {minLat: Math.min(a[0], b[0]) - padding, maxLat: Math.max(a[0], b[0]) + padding,
      minLng: Math.min(a[1], b[1]) - padding, maxLng: Math.max(a[1], b[1]) + padding};
  }

  function boundsOverlap(a, b) {
    return a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLng <= b.maxLng && a.maxLng >= b.minLng;
  }

  function geometryBounds(coords, padding = 0) {
    const result = {minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity};
    for (const point of coords) {
      result.minLat = Math.min(result.minLat, point[0] - padding); result.maxLat = Math.max(result.maxLat, point[0] + padding);
      result.minLng = Math.min(result.minLng, point[1] - padding); result.maxLng = Math.max(result.maxLng, point[1] + padding);
    }
    return result;
  }

  function segmentIntersection(a, b, c, d) {
    const ax = a[1], ay = a[0], bx = b[1], by = b[0], cx = c[1], cy = c[0], dx = d[1], dy = d[0];
    const rX = bx - ax, rY = by - ay, sX = dx - cx, sY = dy - cy;
    const denom = rX * sY - rY * sX;
    if (Math.abs(denom) < 1e-12) {
      const cross = (cx - ax) * rY - (cy - ay) * rX;
      if (Math.abs(cross) > 1e-10) return null;
      const rr = rX * rX + rY * rY;
      const ss = sX * sX + sY * sY;
      if (rr < 1e-20 || ss < 1e-20) return null;
      const tc = ((cx - ax) * rX + (cy - ay) * rY) / rr;
      const td = ((dx - ax) * rX + (dy - ay) * rY) / rr;
      const low = Math.max(0, Math.min(tc, td));
      const high = Math.min(1, Math.max(tc, td));
      if (high < low - INTERSECTION_EPS) return null;
      // Return both overlap boundaries.  Callers split there and subsequently
      // discard the duplicate edge; no zero-length overlap edge is produced.
      return [low, high].filter((value, index, values) => index === 0 || Math.abs(value - values[0]) > INTERSECTION_EPS).map(t => {
        const point = [ay + rY * t, ax + rX * t];
        const u = ((point[1] - cx) * sX + (point[0] - cy) * sY) / ss;
        return {point, t, u, collinear: true};
      });
    }
    const qpx = cx - ax, qpy = cy - ay;
    const t = (qpx * sY - qpy * sX) / denom;
    const u = (qpx * rY - qpy * rX) / denom;
    if (t < -INTERSECTION_EPS || t > 1 + INTERSECTION_EPS || u < -INTERSECTION_EPS || u > 1 + INTERSECTION_EPS) return null;
    return {point: [ay + rY * t, ax + rX * t], t, u};
  }

  function closestPointOnSegment(point, a, b) {
    const latScale = Math.cos(point[0] * Math.PI / 180);
    const px = point[1] * latScale, py = point[0];
    const ax = a[1] * latScale, ay = a[0], bx = b[1] * latScale, by = b[0];
    const length2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = length2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / length2)) : 0;
    return {point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], t};
  }

  function segmentsAreParallel(a, b, c, d) {
    const latitude = (a[0] + b[0] + c[0] + d[0]) / 4 * Math.PI / 180;
    const ax = (b[1] - a[1]) * Math.cos(latitude), ay = b[0] - a[0];
    const bx = (d[1] - c[1]) * Math.cos(latitude), by = d[0] - c[0];
    const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);
    return lengths > 1e-14 && Math.abs((ax * bx + ay * by) / lengths) >= 0.94;
  }

  function geometryIntersections(aCoords, bCoords) {
    const hits = [];
    const aMetrics = geometryMetrics(aCoords);
    const bMetrics = geometryMetrics(bCoords);
    // A conservative degree padding retains the existing 50 m near-miss/T-join
    // behaviour before doing the more expensive geodesic test.
    const padding = JUNCTION_SNAP_KM / 110;
    const aBounds = aCoords.slice(0, -1).map((point, index) => segmentBounds(point, aCoords[index + 1], padding));
    const bBounds = bCoords.slice(0, -1).map((point, index) => segmentBounds(point, bCoords[index + 1], padding));
    const corridorVertices = new Map();
    for (let ai = 0; ai < aCoords.length - 1; ai++) {
      for (let bi = 0; bi < bCoords.length - 1; bi++) {
        if (!boundsOverlap(aBounds[ai], bBounds[bi])) {
          intersectionStats.bboxRejects += 1;
          continue;
        }
        intersectionStats.segmentChecks += 1;
        if (segmentsAreParallel(aCoords[ai], aCoords[ai + 1], bCoords[bi], bCoords[bi + 1])) {
          for (const vertexIndex of [ai, ai + 1]) {
            const projected = closestPointOnSegment(aCoords[vertexIndex], bCoords[bi], bCoords[bi + 1]);
            const separation = dist({lat: aCoords[vertexIndex][0], lng: aCoords[vertexIndex][1]},
              {lat: projected.point[0], lng: projected.point[1]});
            const previous = corridorVertices.get(vertexIndex);
            if (separation <= JUNCTION_SNAP_KM && (!previous || separation < previous.separation)) {
              corridorVertices.set(vertexIndex, {vertexIndex, point: projected.point, separation,
                bIndex: bi, bT: projected.t, bOffset: geometryPointOffset(bCoords, bi, projected.t, bMetrics)});
            }
          }
        }
        const result = segmentIntersection(aCoords[ai], aCoords[ai + 1], bCoords[bi], bCoords[bi + 1]);
        const exactHits = Array.isArray(result) ? result : (result ? [result] : []);
        for (const hit of exactHits) hits.push({
          point: hit.point,
          aIndex: ai,
          aT: hit.t,
          bIndex: bi,
          bT: hit.u,
          aOffset: geometryPointOffset(aCoords, ai, hit.t, aMetrics),
          bOffset: geometryPointOffset(bCoords, bi, hit.u, bMetrics),
        });
        if (exactHits.length) continue;
        // Snapping every shape point to a nearby/parallel road creates a
        // junction every few metres. Near misses are meaningful only where one
        // of the complete polylines ends (a T join or shared route endpoint).
        // Interior crossings are handled by the exact intersection above.
        const candidates = [];
        const endpoints = [];
        if (ai === 0) endpoints.push([aCoords[ai], true, 0]);
        if (ai === aCoords.length - 2) endpoints.push([aCoords[ai + 1], true, 1]);
        if (bi === 0) endpoints.push([bCoords[bi], false, 0]);
        if (bi === bCoords.length - 2) endpoints.push([bCoords[bi + 1], false, 1]);
        for (const [point, onA, endpointT] of endpoints) {
          const projected = onA ? closestPointOnSegment(point, bCoords[bi], bCoords[bi + 1]) : closestPointOnSegment(point, aCoords[ai], aCoords[ai + 1]);
          if (dist({lat: point[0], lng: point[1]}, {lat: projected.point[0], lng: projected.point[1]}) > JUNCTION_SNAP_KM) continue;
          const aT = onA ? endpointT : projected.t;
          const bT = onA ? projected.t : endpointT;
          candidates.push({point: onA ? point : projected.point, aT, bT});
        }
        for (const hit of candidates) hits.push({point: hit.point, aIndex: ai, aT: hit.aT, bIndex: bi, bT: hit.bT,
          aOffset: geometryPointOffset(aCoords, ai, hit.aT, aMetrics), bOffset: geometryPointOffset(bCoords, bi, hit.bT, bMetrics)});
      }
    }
    // Nearby drawn lines for the same physical road commonly run a few metres
    // apart and therefore never intersect exactly. Collapse every sufficiently
    // long, continuous parallel run to its entry and exit. The splitter can then
    // connect there and discard the duplicate project edge between those nodes.
    const vertices = [...corridorVertices.values()].sort((a, b) => a.vertexIndex - b.vertexIndex);
    const runs = [];
    for (const vertex of vertices) {
      const run = runs[runs.length - 1];
      const previous = run?.[run.length - 1];
      const aGap = previous ? aMetrics.offsets[vertex.vertexIndex] - aMetrics.offsets[previous.vertexIndex] : 0;
      const continues = previous && vertex.vertexIndex === previous.vertexIndex + 1
        && Math.abs(vertex.bOffset - previous.bOffset) <= Math.max(0.5, aGap * 3);
      if (continues) run.push(vertex); else runs.push([vertex]);
    }
    for (const run of runs) {
      const first = run[0], last = run[run.length - 1];
      if (aMetrics.offsets[last.vertexIndex] - aMetrics.offsets[first.vertexIndex] < ROAD_REUSE_MIN_KM) continue;
      for (const vertex of first === last ? [first] : [first, last]) {
        const aIndex = Math.min(vertex.vertexIndex, aCoords.length - 2);
        const aT = vertex.vertexIndex === aCoords.length - 1 ? 1 : 0;
        const aOffset = geometryPointOffset(aCoords, aIndex, aT, aMetrics);
        const endpointWindow = Math.max(ROAD_REUSE_MIN_KM, (aMetrics.segmentLengths[aIndex] || 0) * 2);
        // Coarsely sampled routes may enter a shared corridor one shape point
        // after an already detected existing-road endpoint. Prefer that stable
        // graph node instead of adding a junction a few metres farther along.
        const hasNearbyEndpointHit = hits.some(hit => Math.abs(hit.aOffset - aOffset) <= endpointWindow
          && ((hit.bOffset <= INTERSECTION_EPS && vertex.bOffset <= endpointWindow)
            || (hit.bOffset >= bMetrics.total - INTERSECTION_EPS && vertex.bOffset >= bMetrics.total - endpointWindow)));
        if (hasNearbyEndpointHit) continue;
        hits.push({point: vertex.point, aIndex, aT, bIndex: vertex.bIndex, bT: vertex.bT,
          aOffset, bOffset: vertex.bOffset, corridor: true});
      }
    }
    return hits;
  }

  function uniqueIntersections(hits) {
    const sorted = hits.sort((a, b) => a.aOffset - b.aOffset || a.bOffset - b.bOffset);
    const cellDegrees = JUNCTION_SNAP_KM / 110;
    const cells = new Map();
    const unique = [];
    for (const hit of sorted) {
      const x = Math.floor(hit.point[1] / cellDegrees);
      const y = Math.floor(hit.point[0] / cellDegrees);
      let duplicate = false;
      for (let dx = -1; dx <= 1 && !duplicate; dx++) for (let dy = -1; dy <= 1 && !duplicate; dy++) {
        duplicate = (cells.get(`${x + dx}:${y + dy}`) || []).some(other => dist(
          {lat: other.point[0], lng: other.point[1]}, {lat: hit.point[0], lng: hit.point[1]}) < JUNCTION_SNAP_KM);
      }
      if (duplicate) continue;
      unique.push(hit);
      const key = `${x}:${y}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(hit);
    }
    return unique;
  }

  function normalizeCuts(coords, cuts) {
    return cuts
      .filter(cut => cut.offset > INTERSECTION_EPS && cut.offset < geometryDistance(coords) - INTERSECTION_EPS)
      .sort((a, b) => a.offset - b.offset)
      .filter((cut, index, sorted) => index === 0 || !samePoint(cut.point, sorted[index - 1].point));
  }

  function splitGeometryAtOffsets(coords, cuts) {
    const sorted = normalizeCuts(coords, cuts);
    if (!sorted.length) return [{coords, cut: null}];
    const segments = [];
    let current = [coords[0]];
    let cutIndex = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      while (cutIndex < sorted.length && sorted[cutIndex].segmentIndex === i) {
        const cut = sorted[cutIndex];
        if (!samePoint(current[current.length - 1], cut.point)) current.push(cut.point);
        segments.push({coords: current, cut});
        current = [cut.point];
        cutIndex++;
      }
      if (!samePoint(current[current.length - 1], b)) current.push(b);
    }
    segments.push({coords: current, cut: null});
    return segments.filter(segment => segment.coords.length > 1 && geometryDistance(segment.coords) > INTERSECTION_EPS);
  }

  function createJunction(point, targetState = state) {
    targetState.junctions = Array.isArray(targetState.junctions) ? targetState.junctions : [];
    const existing = targetState.junctions.find(junction => dist(junction, {lat: point[0], lng: point[1]}) < JUNCTION_SNAP_KM);
    if (existing) return existing;
    const key = `${point[0].toFixed(6)}_${point[1].toFixed(6)}`.replace(/[^0-9_-]/g, '_');
    const used = new Set([...(targetState.junctions || []).map(item => item.id), ...(targetState.connections || []).map(item => item.id)]);
    let id = `junction-${key}`;
    let suffix = 2;
    while (used.has(id)) id = `junction-${key}-${suffix++}`;
    const junction = {
      id,
      name: 'Netzknoten',
      lat: point[0],
      lng: point[1],
      tier: 0,
      slots: 0,
      isJunction: true,
      automatic: false,
    };
    targetState.junctions.push(junction);
    return junction;
  }

  function closestPointOnGeometry(point, geometry) {
    if (!Array.isArray(geometry) || geometry.length < 2) return null;
    const metrics = geometryMetrics(geometry);
    let closest = null;
    for (let index = 0; index < geometry.length - 1; index += 1) {
      const projected = closestPointOnSegment(point, geometry[index], geometry[index + 1]);
      const distance = dist({lat: point[0], lng: point[1]}, {lat: projected.point[0], lng: projected.point[1]});
      if (!closest || distance < closest.distance) closest = {point: projected.point, distance, segmentIndex: index,
        segmentT: projected.t, offset: geometryPointOffset(geometry, index, projected.t, metrics)};
    }
    return closest;
  }

  // Manual nodes are deliberately kept on the pending project until it is
  // confirmed. This makes cancelling side-effect free and gives the map layer
  // one authoritative validation/snap operation for clicks and drags.
  function createManualJunction(project, value, targetState = state) {
    const geometry = project?.geometry;
    const point = Array.isArray(value) ? [Number(value[0]), Number(value[1])] : [Number(value?.lat), Number(value?.lng)];
    if (!project || transportSpec(project.type).mode !== 'road' || point.some(coordinate => !Number.isFinite(coordinate))) {
      return {ok: false, reason: 'invalid-junction'};
    }
    const snapped = closestPointOnGeometry(point, geometry);
    if (!snapped || snapped.distance > JUNCTION_SNAP_KM) return {ok: false, reason: 'junction-off-route', maxDistanceKm: JUNCTION_SNAP_KM};
    project.manualJunctions = Array.isArray(project.manualJunctions) ? project.manualJunctions : [];
    const existing = project.manualJunctions.find(node => dist(node, {lat: snapped.point[0], lng: snapped.point[1]}) < JUNCTION_SNAP_KM);
    if (existing) return {ok: true, junction: existing, snapped: true};
    const junction = {id: `manual-${Date.now()}-${project.manualJunctions.length + 1}`, name: 'Netzknoten',
      lat: snapped.point[0], lng: snapped.point[1], automatic: false};
    project.manualJunctions.push(junction);
    return {ok: true, junction, snapped: snapped.distance > INTERSECTION_EPS};
  }

  function edgeWithGeometry(base, a, b, type, coords, targetState = state) {
    const spec = transportSpec(type);
    const distance = geometryDistance(coords);
    return {
      ...base,
      id: nextStateId('edge', targetState),
      a,
      b,
      type,
      distance,
      duration: distance / Math.max(1, spec.speed || 1),
      geometry: coords,
      capacity: spec.capacity,
      maintenance: Math.round(distance * (spec.maintenanceKm || 0)),
    };
  }

  function nextStateId(prefix, targetState = state) {
    targetState._networkSequence = Math.max(0, Number(targetState._networkSequence) || 0);
    const used = new Set((targetState.connections || []).map(edge => String(edge.id)));
    let id;
    do id = `${prefix}-${++targetState._networkSequence}`; while (used.has(id));
    return id;
  }

  function splitRoadsForAutomaticJunctions(project, targetState = state) {
    intersectionStats = {segmentChecks: 0, bboxRejects: 0};
    const projectSpec = transportSpec(project.type);
    if (projectSpec.mode !== 'road') return [edgeWithGeometry(project, project.a, project.b, project.type,
      project.geometry || [[nodeInfo(project.a, targetState).lat, nodeInfo(project.a, targetState).lng], [nodeInfo(project.b, targetState).lat, nodeInfo(project.b, targetState).lng]], targetState)];

    const projectGeometry = Array.isArray(project.geometry) && project.geometry.length > 1
      ? project.geometry
      : [[nodeInfo(project.a, targetState).lat, nodeInfo(project.a, targetState).lng], [nodeInfo(project.b, targetState).lat, nodeInfo(project.b, targetState).lng]];
    const newCuts = [];
    const replacements = new Map();
    const manualJunctions = (project.manualJunctions || []).filter(node => node?.automatic === false);
    let endpointJunctionId = project.b;

    if (project.endpointJunction) {
      const endpoint = createJunction([project.endpointJunction.lat, project.endpointJunction.lng], targetState);
      endpointJunctionId = endpoint.id;
    }

    for (const manual of manualJunctions) {
      const onProject = closestPointOnGeometry([manual.lat, manual.lng], projectGeometry);
      if (!onProject || onProject.distance > JUNCTION_SNAP_KM) continue;
      const junction = createJunction(onProject.point, targetState);
      newCuts.push({...onProject, point: [junction.lat, junction.lng], junctionId: junction.id, type: project.type});
    }

    for (const edge of targetState.connections || []) {
      if (!isRoadType(edge.type)) continue;
      const existingGeometry = edgeGeometry(edge, targetState);
      const existingCuts = [];
      for (const manual of manualJunctions) {
        const onProject = closestPointOnGeometry([manual.lat, manual.lng], projectGeometry);
        const onExisting = closestPointOnGeometry(onProject?.point || [manual.lat, manual.lng], existingGeometry);
        if (!onProject || !onExisting || onProject.distance > JUNCTION_SNAP_KM || onExisting.distance > JUNCTION_SNAP_KM) continue;
        const junction = targetState.junctions.find(node => dist(node, {lat: onProject.point[0], lng: onProject.point[1]}) < JUNCTION_SNAP_KM);
        if (!junction) continue;
        existingCuts.push({...onExisting, point: [junction.lat, junction.lng], junctionId: junction.id});
      }
      const sortedExistingCuts = normalizeCuts(existingGeometry, existingCuts);
      if (!sortedExistingCuts.length) continue;
      const existingParts = splitGeometryAtOffsets(existingGeometry, sortedExistingCuts);
      const nodeIds = [edge.a, ...sortedExistingCuts.map(cut => cut.junctionId), edge.b];
      replacements.set(edge.id, existingParts.map((part, index) => edgeWithGeometry(edge, nodeIds[index], nodeIds[index + 1], edge.type, part.coords, targetState)));
    }

    if (replacements.size) {
      targetState.connections = targetState.connections.flatMap(edge => replacements.get(edge.id) || [edge]);
      targetState.usedCapacity = targetState.usedCapacity && typeof targetState.usedCapacity === 'object' ? targetState.usedCapacity : {};
      for (const [oldId, parts] of replacements) {
        const reservations = targetState.usedCapacity[oldId];
        if (!reservations) continue;
        for (const part of parts) targetState.usedCapacity[part.id] = structuredCloneSafe(reservations);
        delete targetState.usedCapacity[oldId];
      }
    }

    const sortedNewCuts = normalizeCuts(projectGeometry, newCuts);
    const newParts = splitGeometryAtOffsets(projectGeometry, sortedNewCuts);
    const newNodeIds = [project.a, ...sortedNewCuts.map(cut => cut.junctionId), endpointJunctionId];
    const result = newParts.map((part, index) => {
      const touchingType = sortedNewCuts[index - 1]?.type || project.type;
      const type = dominantRoadType(project.type, touchingType);
      return edgeWithGeometry(project, newNodeIds[index], newNodeIds[index + 1], type, part.coords, targetState);
    });
    // Collinear overlap boundaries produce the same graph edge as an existing
    // part.  Keep the existing edge and never introduce zero/parallel duplicates.
    return result.filter((edge, index) => edge.a !== edge.b
      && !targetState.connections.some(existing => sameEndpoints(existing, edge.a, edge.b) && isRoadType(existing.type))
      && !result.slice(0, index).some(existing => sameEndpoints(existing, edge.a, edge.b)));
  }

  function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
  }


  function edgeId(edge) {
    return String(edge?.id || `${edge?.a || ''}-${edge?.b || ''}-${edge?.type || ''}`);
  }

  function edgeCapacity(edge) {
    const spec = transportSpec(edge);
    const value = Number(edge?.capacity ?? spec.capacity);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function capacityWindowKey(absMinute) {
    const bucket = Math.floor(Math.max(0, Number(absMinute) || 0) / CAPACITY_WINDOW_MINUTES);
    return `h${bucket}`;
  }

  function capacityWindowRange(startAbsMinute, endAbsMinute) {
    const start = Math.max(0, Math.floor(Number(startAbsMinute) || 0));
    const end = Math.max(start + 1, Math.ceil(Number(endAbsMinute) || start + 1));
    const first = Math.floor(start / CAPACITY_WINDOW_MINUTES);
    const last = Math.floor(Math.max(start, end - 1) / CAPACITY_WINDOW_MINUTES);
    const keys = [];
    for (let bucket = first; bucket <= last; bucket += 1) keys.push(capacityWindowKey(bucket * CAPACITY_WINDOW_MINUTES));
    return keys;
  }

  function reservedUnitsFor(edge, windowKey, targetState = state, exceptReservationId = '') {
    const reservations = targetState?.usedCapacity?.[edgeId(edge)]?.[windowKey] || {};
    return Object.entries(reservations).reduce((total, [id, reservation]) => total + (id === exceptReservationId ? 0 : reservationUnits(reservation)), 0);
  }

  function reservationUnits(reservation) {
    return Math.max(0, Number(typeof reservation === 'object' ? reservation?.units : reservation) || 0);
  }

  function edgeDistance(edge, targetState = state) {
    const explicit = Number(edge?.distance);
    if (Number.isFinite(explicit) && explicit >= 0) return explicit;
    return geometryDistance(edgeGeometry(edge, targetState));
  }

  // The common source of truth for both capacity validation and persistence.
  function pathEdgeOccupations(path, options = {}) {
    const targetState = options.state || state || createNetworkState();
    const edges = Array.isArray(path?.edges) ? path.edges : [];
    const nodes = Array.isArray(path?.nodes) ? path.nodes : [];
    let cursor = Number(options.startAbsMinute);
    if (!Number.isFinite(cursor)) return [];
    const requestedSpeed = Math.max(1, Number(options.vehicleSpeed ?? options.speed) || Infinity);
    return edges.map((edge, index) => {
      const roadSpeed = Math.max(1, Number(edge?.speed ?? transportSpec(edge).speed) || 1);
      const speed = Math.min(requestedSpeed, roadSpeed);
      const entryAbsMinute = cursor;
      const exitAbsMinute = entryAbsMinute + edgeDistance(edge, targetState) / speed * 60;
      cursor = exitAbsMinute;
      const from = nodes[index] || edge?.a;
      const to = nodes[index + 1] || (from === edge?.a ? edge?.b : edge?.a);
      return Object.freeze({edge, edgeId: edgeId(edge), direction: `${from || ''}>${to || ''}`, entryAbsMinute, exitAbsMinute, speed});
    });
  }

  function reservationsForInterval(edge, start, end, targetState, exceptReservationId = '') {
    const found = new Map();
    for (const key of capacityWindowRange(start, end)) {
      for (const [id, reservation] of Object.entries(targetState?.usedCapacity?.[edgeId(edge)]?.[key] || {})) {
        if (id === exceptReservationId || found.has(id)) continue;
        const entry = Number(typeof reservation === 'object' ? reservation.entryAbsMinute : -Infinity);
        const exit = Number(typeof reservation === 'object' ? reservation.exitAbsMinute : Infinity);
        if (entry < end && exit > start) found.set(id, {entry, exit, units: reservationUnits(reservation)});
      }
    }
    return [...found.values()];
  }

  function currentAbsoluteMinute() {
    const time = window.HFV2Time?.getState?.() || window.HFV2Save?.getState?.().time || {day: 1, hour: 0, minute: 0};
    if (window.HFV2Time?.absoluteMinute) return window.HFV2Time.absoluteMinute(time);
    return (Math.max(1, Math.trunc(Number(time.day) || 1)) - 1) * 1440
      + Math.max(0, Math.trunc(Number(time.hour) || 0)) * 60
      + Math.max(0, Math.trunc(Number(time.minute) || 0));
  }

  // Read-only view of the same reservation buckets used by capacity checks.
  function getEdgeOccupancy(edge, options = {}) {
    const targetState = options.state || state || createNetworkState();
    const absMinute = Number.isFinite(Number(options.absMinute)) ? Number(options.absMinute) : currentAbsoluteMinute();
    return Object.freeze({
      used: reservationsForInterval(edge, absMinute, absMinute + 1e-7, targetState).reduce((sum, item) => sum + item.units, 0),
      capacity: edgeCapacity(edge),
    });
  }

  function dispatchCapacityChanged() {
    window.dispatchEvent?.(new CustomEvent('hf:network:capacity-changed'));
  }

  function pathCapacityStatus(path, options = {}) {
    const targetState = options.state || state || createNetworkState();
    const edges = Array.isArray(path?.edges) ? path.edges : [];
    const units = Math.max(1, Math.floor(Number(options.units) || 1));
    const reservationId = String(options.reservationId || '');
    const occupations = pathEdgeOccupations(path, {...options, state: targetState});
    if (!edges.length || !occupations.length) return {ok: true, overloaded: [], occupations};
    const overloaded = [];
    for (const occupation of occupations) {
      const edge = occupation.edge;
      const capacity = edgeCapacity(edge);
      const existing = reservationsForInterval(edge, occupation.entryAbsMinute, occupation.exitAbsMinute, targetState, reservationId);
      const points = [occupation.entryAbsMinute, ...existing.flatMap(item => [Math.max(occupation.entryAbsMinute, item.entry), Math.min(occupation.exitAbsMinute, item.exit)])];
      if (points.some(point => units + existing.filter(item => item.entry <= point && item.exit > point).reduce((sum, item) => sum + item.units, 0) > capacity)) {
        overloaded.push({edgeId: occupation.edgeId, entryAbsMinute: occupation.entryAbsMinute, exitAbsMinute: occupation.exitAbsMinute, capacity});
      }
    }
    return {ok: overloaded.length === 0, overloaded, occupations};
  }

  function reservePathCapacity(path, options = {}) {
    const targetState = options.state || state || createNetworkState();
    targetState.usedCapacity = targetState.usedCapacity && typeof targetState.usedCapacity === 'object' ? targetState.usedCapacity : {};
    const suppliedTimes = Array.isArray(options.edgeTimes) ? options.edgeTimes : null;
    const statuses = suppliedTimes ? suppliedTimes.map((time, index) => pathCapacityStatus({nodes: [path?.nodes?.[index], path?.nodes?.[index + 1]], edges: [path.edges[index]]}, {...options, state: targetState, startAbsMinute: time.entryAbsMinute, units: options.units})) : [pathCapacityStatus(path, {...options, state: targetState})];
    const status = {ok: statuses.every(item => item.ok), overloaded: statuses.flatMap(item => item.overloaded || []), occupations: statuses.flatMap(item => item.occupations || [])};
    if (!status.ok) return {ok: false, reason: 'route-overloaded', overloaded: status.overloaded};
    const reservationId = String(options.reservationId || `res-${Date.now()}${Math.random().toString(16).slice(2)}`);
    const units = Math.max(1, Math.floor(Number(options.units) || 1));
    for (const occupation of status.occupations || []) {
      const id = occupation.edgeId;
      targetState.usedCapacity[id] = targetState.usedCapacity[id] && typeof targetState.usedCapacity[id] === 'object' ? targetState.usedCapacity[id] : {};
      for (const windowKey of capacityWindowRange(occupation.entryAbsMinute, occupation.exitAbsMinute)) {
        targetState.usedCapacity[id][windowKey] = targetState.usedCapacity[id][windowKey] && typeof targetState.usedCapacity[id][windowKey] === 'object' ? targetState.usedCapacity[id][windowKey] : {};
        targetState.usedCapacity[id][windowKey][reservationId] = {units, vehicleId: options.vehicleId ?? null, vehicleIds: options.vehicleIds || undefined, tripId: options.tripId || reservationId, direction: occupation.direction, entryAbsMinute: occupation.entryAbsMinute, exitAbsMinute: occupation.exitAbsMinute};
      }
    }
    dispatchCapacityChanged();
    return {ok: true, reservationId};
  }

  // Finds a capacity-backed traversal without changing state. Vehicles may
  // wait at intermediate nodes when a later edge is occupied.
  function findEarliestPathSlot(path, earliestStartAbsMinute, options = {}) {
    const targetState = options.state || state || createNetworkState();
    const earliest = Number(earliestStartAbsMinute);
    if (!Number.isFinite(earliest)) return {ok: false, reason: 'invalid-start'};
    const latest = Number.isFinite(Number(options.latestArrivalAbsMinute)) ? Number(options.latestArrivalAbsMinute) : earliest + 1440;
    const edges = Array.isArray(path?.edges) ? path.edges : [];
    if (!edges.length) return {ok: true, departureAbsMinute: earliest, scheduledDepartureAbsMinute: earliest, arrivalAbsMinute: earliest, waitingMinutes: 0, edgeTimes: []};
    const nodes = Array.isArray(path?.nodes) ? path.nodes : [];
    const units = Math.max(1, Math.floor(Number(options.units) || 1));
    const requestedSpeed = Math.max(1, Number(options.vehicleSpeed ?? options.speed) || Infinity);
    let cursor = earliest;
    let waitingMinutes = 0;
    const edgeTimes = [];
    for (let index = 0; index < edges.length; index += 1) {
      const edge = edges[index];
      const from = nodes[index] || edge.a;
      const to = nodes[index + 1] || (from === edge.a ? edge.b : edge.a);
      const speed = Math.min(requestedSpeed, Math.max(1, Number(edge?.speed ?? transportSpec(edge).speed) || 1));
      const duration = edgeDistance(edge, targetState) / speed * 60;
      let entry = cursor;
      while (entry + duration <= latest + INTERSECTION_EPS) {
        const status = pathCapacityStatus({nodes: [from, to], edges: [edge]}, {...options, state: targetState, startAbsMinute: entry, units, vehicleSpeed: requestedSpeed});
        if (status.ok) break;
        const conflicts = reservationsForInterval(edge, entry, entry + duration, targetState, String(options.reservationId || ''));
        const next = Math.min(...conflicts.filter(item => item.exit > entry + INTERSECTION_EPS).map(item => item.exit));
        entry = Number.isFinite(next) ? next : entry + 1;
      }
      if (entry + duration > latest + INTERSECTION_EPS) return {ok: false, reason: 'no-feasible-slot', earliestStartAbsMinute: earliest, nextPossibleAbsMinute: entry, edgeId: edgeId(edge)};
      waitingMinutes += entry - cursor;
      const exit = entry + duration;
      edgeTimes.push(Object.freeze({edgeId: edgeId(edge), direction: `${from || ''}>${to || ''}`, entryAbsMinute: entry, exitAbsMinute: exit, waitingMinutes: entry - cursor}));
      cursor = exit;
    }
    const departureAbsMinute = edgeTimes[0].entryAbsMinute;
    return {ok: true, departureAbsMinute, scheduledDepartureAbsMinute: departureAbsMinute, arrivalAbsMinute: cursor, waitingMinutes, edgeTimes: Object.freeze(edgeTimes)};
  }

  function getEdgeSchedule(requestedEdgeId, day, targetState = state) {
    const start = (Math.max(1, Math.trunc(Number(day) || 1)) - 1) * 1440;
    const end = start + 1440;
    const found = new Map();
    for (const key of capacityWindowRange(start, end)) for (const [reservationId, value] of Object.entries(targetState?.usedCapacity?.[String(requestedEdgeId)]?.[key] || {})) {
      if (typeof value !== 'object' || Number(value.entryAbsMinute) >= end || Number(value.exitAbsMinute) <= start) continue;
      found.set(reservationId, Object.freeze({reservationId, ...structuredCloneSafe(value)}));
    }
    return Object.freeze([...found.values()].sort((a, b) => a.entryAbsMinute - b.entryAbsMinute));
  }

  function releaseCapacityReservation(reservationId, targetState = state) {
    const id = String(reservationId || '');
    if (!id || !targetState?.usedCapacity) return 0;
    let removed = 0;
    for (const edgeKey of Object.keys(targetState.usedCapacity)) {
      for (const windowKey of Object.keys(targetState.usedCapacity[edgeKey] || {})) {
        if (Object.prototype.hasOwnProperty.call(targetState.usedCapacity[edgeKey][windowKey], id)) {
          delete targetState.usedCapacity[edgeKey][windowKey][id];
          removed += 1;
        }
        if (!Object.keys(targetState.usedCapacity[edgeKey][windowKey]).length) delete targetState.usedCapacity[edgeKey][windowKey];
      }
      if (!Object.keys(targetState.usedCapacity[edgeKey] || {}).length) delete targetState.usedCapacity[edgeKey];
    }
    if (removed) dispatchCapacityChanged();
    return removed;
  }

  function cleanupCapacityReservations(beforeAbsMinute, targetState = state) {
    if (!targetState?.usedCapacity) return 0;
    const minBucket = Math.floor(Math.max(0, Number(beforeAbsMinute) || 0) / CAPACITY_WINDOW_MINUTES);
    let removed = 0;
    for (const edgeKey of Object.keys(targetState.usedCapacity)) {
      for (const windowKey of Object.keys(targetState.usedCapacity[edgeKey] || {})) {
        const bucket = Number(String(windowKey).replace(/^h/, ''));
        if (Number.isFinite(bucket) && bucket < minBucket) {
          delete targetState.usedCapacity[edgeKey][windowKey];
          removed += 1;
        }
      }
      if (!Object.keys(targetState.usedCapacity[edgeKey] || {}).length) delete targetState.usedCapacity[edgeKey];
    }
    if (removed) dispatchCapacityChanged();
    return removed;
  }

  function findPath(fromId, toId, options = {}) {
    const start = String(fromId || '').trim();
    const target = String(toId || '').trim();
    if (!start || !target) return null;
    const targetState = options.state || state || createNetworkState();
    const mode = options.mode || null;
    if (start === target) return {reachable: true, nodes: [start], edges: [], distance: 0, duration: 0};
    const adjacency = new Map();
    for (const edge of targetState.connections || []) {
      if (!edge?.a || !edge?.b) continue;
      if (mode && transportSpec(edge).mode !== mode) continue;
      if (options.requireCapacity === true) {
        const status = pathCapacityStatus({edges: [edge]}, {state: targetState, startAbsMinute: options.startAbsMinute, endAbsMinute: options.endAbsMinute, units: options.units, reservationId: options.reservationId});
        if (!status.ok) continue;
      }
      if (!adjacency.has(edge.a)) adjacency.set(edge.a, []);
      if (!adjacency.has(edge.b)) adjacency.set(edge.b, []);
      adjacency.get(edge.a).push({node: edge.b, edge});
      adjacency.get(edge.b).push({node: edge.a, edge});
    }
    const weight = options.weight || options.metric || 'duration';
    const edgeScore = edge => {
      let value = null;
      if (typeof options.cost === 'function') value = options.cost(edge);
      else if (options.cost && typeof options.cost === 'object') value = options.cost[edge.id] ?? options.cost[`${edge.a}:${edge.b}`] ?? options.cost[`${edge.b}:${edge.a}`];
      else if (typeof weight === 'function') value = weight(edge);
      else if (typeof weight === 'string') value = edge[weight];
      const score = Number(value);
      if (Number.isFinite(score)) return Math.max(0, score);
      return Math.max(0, Number(edge.duration) || 0);
    };
    const best = new Map([[start, 0]]);
    const queue = [{node: start, score: 0, nodes: [start], edges: [], distance: 0, duration: 0}];
    while (queue.length) {
      queue.sort((a, b) => a.score - b.score);
      const current = queue.shift();
      if (current.score !== best.get(current.node)) continue;
      if (current.node === target) return {reachable: true, nodes: current.nodes, edges: current.edges, distance: current.distance, duration: current.duration};
      for (const next of adjacency.get(current.node) || []) {
        const edgeDistance = Math.max(0, Number(next.edge.distance) || 0);
        const edgeDuration = Math.max(0, Number(next.edge.duration) || 0);
        const candidateScore = current.score + edgeScore(next.edge);
        if (candidateScore >= (best.get(next.node) ?? Infinity)) continue;
        best.set(next.node, candidateScore);
        queue.push({
          node: next.node,
          score: candidateScore,
          nodes: [...current.nodes, next.node],
          edges: [...current.edges, next.edge],
          distance: current.distance + edgeDistance,
          duration: current.duration + edgeDuration,
        });
      }
    }
    return null;
  }

  function isReachable(fromId, toId, options = {}) {
    return findPath(fromId, toId, options)?.reachable === true;
  }

  function getCandidateTargets(cityId, targetState = state) {
    const from = citiesById[cityId];
    if (!from) return [];
    return cities
      .filter(city => city.id !== cityId && dist(from, city) <= MAX_CONNECTION_DISTANCE_KM)
      .filter(city => !connectionExists(cityId, city.id, 'road', targetState) || !connectionExists(cityId, city.id, 'rail', targetState))
      .sort((a, b) => dist(from, a) - dist(from, b));
  }

  function openNetworkBuildMenu(fromCityId) {
    if (state) state.networkOriginNode = fromCityId;
    return getCandidateTargets(fromCityId).map(city => ({
      city,
      roadDistance: estimateRoadDistance(dist(citiesById[fromCityId], city)),
      hasRoad: connectionExists(fromCityId, city.id, 'road'),
      hasRail: connectionExists(fromCityId, city.id, 'rail'),
    }));
  }

  function editorGeometry(value, from, to) {
    if (!Array.isArray(value) || value.length < 2) return null;
    const coords = value.map(point => Array.isArray(point) ? [Number(point[0]), Number(point[1])] : [Number(point?.lat), Number(point?.lng)]);
    if (coords.some(point => !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) return null;
    coords[0] = [from.lat, from.lng];
    coords[coords.length - 1] = [to.lat, to.lng];
    return geometryDistance(coords) > 0 ? coords : null;
  }

  async function planConnection(fromId, toId, type, options = {}) {
    const from = citiesById[fromId];
    const to = citiesById[toId];
    const t = TRANSPORT_TYPES[type];
    const mode = t?.mode;
    if (!state || !from || !to || !t || dist(from, to) > MAX_CONNECTION_DISTANCE_KM || connectionExists(fromId, toId, mode)) return null;
    const geometry = mode === 'road' ? editorGeometry(options.geometry, from, to) : [[from.lat, from.lng], [to.lat, to.lng]];
    if (mode === 'road' && !geometry) {
      state.pendingProject = null;
      return {ok: false, reason: 'invalid-geometry'};
    }
    const distance = geometryDistance(geometry);
    const quote = buildQuote(type, distance);
    const cash = window.HFV2Save?.getCash?.() ?? STARTING_CASH;
    if (cash < quote.cost) {
      state.pendingProject = null;
      return {ok: false, reason: 'not-enough-cash', cost: quote.cost, cash};
    }
    const project = {kind: 'build', a: fromId, b: toId, type, distance, duration: distance / t.speed, geometry, cost: quote.cost, maintenance: quote.maintenance,
      waypoints: geometry.slice(1, -1).map(([lat, lng]) => ({lat, lng}))};
    project.manualJunctions = [];
    for (const junction of options.manualJunctions || []) createManualJunction(project, junction);
    state.pendingProject = project;
    return state.pendingProject;
  }

  function planRoadJunction(fromId, type, geometry, connectionId, clickPoint) {
    const from = citiesById[fromId];
    const road = state?.connections?.find(edge => String(edge.id) === String(connectionId) && isRoadType(edge.type));
    const rawGeometry = Array.isArray(geometry) ? geometry.map(point => [Number(point[0]), Number(point[1])]) : [];
    const existingGeometry = road ? edgeGeometry(road, state) : null;
    const requested = Array.isArray(clickPoint) ? clickPoint : [clickPoint?.lat, clickPoint?.lng];
    const snapped = existingGeometry && closestPointOnGeometry(requested.map(Number), existingGeometry);
    const spec = TRANSPORT_TYPES[type];
    if (!state || !from || !road || spec?.mode !== 'road' || !snapped || rawGeometry.length < 2) return {ok: false, reason: 'invalid-road-junction'};
    rawGeometry[0] = [from.lat, from.lng];
    rawGeometry[rawGeometry.length - 1] = [...snapped.point];
    const distance = geometryDistance(rawGeometry);
    if (!(distance > 0)) return {ok: false, reason: 'invalid-geometry'};
    const quote = buildQuote(type, distance);
    const cash = window.HFV2Save?.getCash?.() ?? STARTING_CASH;
    if (cash < quote.cost) return {ok: false, reason: 'not-enough-cash', cost: quote.cost, cash};
    const endpointJunction = {id: `pending-junction-${Date.now()}`, name: 'Netzknoten', lat: snapped.point[0], lng: snapped.point[1], automatic: false};
    const project = {kind: 'build', a: fromId, b: endpointJunction.id, type, distance, duration: distance / spec.speed,
      geometry: rawGeometry, cost: quote.cost, maintenance: quote.maintenance, endpointJunction, connectionId: road.id,
      waypoints: rawGeometry.slice(1, -1).map(([lat, lng]) => ({lat, lng})), manualJunctions: [endpointJunction]};
    state.pendingProject = project;
    return project;
  }

  function getState() {
    return configure();
  }

  function confirmProject() {
    const project = state?.pendingProject;
    if (!project || project.kind !== 'build') return null;
    const start = nodeInfo(project.a);
    const target = project.endpointJunction || nodeInfo(project.b);
    const validGeometry = project.endpointJunction
      ? Array.isArray(project.geometry) && project.geometry.length > 1 && geometryDistance(project.geometry) > 0
      : editorGeometry(project.geometry, start, target);
    if (!start || !target || (isRoadType(project.type) && !validGeometry)) return null;
    const cash = window.HFV2Save?.getCash?.() ?? STARTING_CASH;
    if (cash < project.cost) return null;
    window.HFV2Save?.changeCash?.(-project.cost, 'network-build', {reference: {networkProject: `${project.a}:${project.b}:${project.type}`}});
    const edges = splitRoadsForAutomaticJunctions(project);
    state.connections.push(...edges);
    state.cities = state.cities && typeof state.cities === 'object' ? state.cities : {};
    state.usedCapacity = state.usedCapacity && typeof state.usedCapacity === 'object' ? state.usedCapacity : {};
    state.cities[project.a] = {...(state.cities[project.a] || {}), unlocked: true};
    if (!project.endpointJunction) state.cities[project.b] = {...(state.cities[project.b] || {}), unlocked: true};
    state.selected = edges.at(-1)?.b || project.b;
    state.pendingProject = null;
    window.dispatchEvent?.(new CustomEvent('hf:network:confirmed', {detail: {edge: edges[0], edges, state}}));
    return edges[0];
  }

  window.HFNetwork = {TRANSPORT_TYPES, ROAD_ORDER, STARTING_CASH, CAPACITY_WINDOW_MINUTES, JUNCTION_SNAP_KM, createNetworkState, configure, dist, estimateRoadDistance, buildQuote, connectionExists, findPath, isReachable, getCandidateTargets, getAvailableConnections: getCandidateTargets, openNetworkBuildMenu, nodeInfo, planConnection, planRoadJunction, createManualJunction, getState, confirmProject, segmentIntersection, geometryIntersections, splitRoadsForAutomaticJunctions, getIntersectionStats: () => ({...intersectionStats}), getEdgeOccupancy, getEdgeSchedule, pathEdgeOccupations, pathCapacityStatus, findEarliestPathSlot, reservePathCapacity, releaseCapacityReservation, cleanupCapacityReservations};
})();
