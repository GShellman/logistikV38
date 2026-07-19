(() => {
  'use strict';

  const MAX_CONNECTION_DISTANCE_KM = 105;
  const STARTING_CASH = window.HFV2Save?.STARTING_CASH ?? 500000;
  const INTERSECTION_EPS = 1e-7;
  const CAPACITY_WINDOW_MINUTES = 60;

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

  function geometryPointOffset(coords, segmentIndex, segmentT) {
    let total = 0;
    for (let i = 0; i < segmentIndex; i++) {
      total += dist({lat: coords[i][0], lng: coords[i][1]}, {lat: coords[i + 1][0], lng: coords[i + 1][1]});
    }
    const a = coords[segmentIndex];
    const b = coords[segmentIndex + 1];
    return total + dist({lat: a[0], lng: a[1]}, {lat: a[0] + (b[0] - a[0]) * segmentT, lng: a[1] + (b[1] - a[1]) * segmentT});
  }

  function segmentIntersection(a, b, c, d) {
    const ax = a[1], ay = a[0], bx = b[1], by = b[0], cx = c[1], cy = c[0], dx = d[1], dy = d[0];
    const rX = bx - ax, rY = by - ay, sX = dx - cx, sY = dy - cy;
    const denom = rX * sY - rY * sX;
    if (Math.abs(denom) < 1e-12) return null;
    const qpx = cx - ax, qpy = cy - ay;
    const t = (qpx * sY - qpy * sX) / denom;
    const u = (qpx * rY - qpy * rX) / denom;
    if (t <= INTERSECTION_EPS || t >= 1 - INTERSECTION_EPS || u <= INTERSECTION_EPS || u >= 1 - INTERSECTION_EPS) return null;
    return {point: [ay + rY * t, ax + rX * t], t, u};
  }

  function geometryIntersections(aCoords, bCoords) {
    const hits = [];
    for (let ai = 0; ai < aCoords.length - 1; ai++) {
      for (let bi = 0; bi < bCoords.length - 1; bi++) {
        const hit = segmentIntersection(aCoords[ai], aCoords[ai + 1], bCoords[bi], bCoords[bi + 1]);
        if (!hit) continue;
        hits.push({
          point: hit.point,
          aIndex: ai,
          aT: hit.t,
          bIndex: bi,
          bT: hit.u,
          aOffset: geometryPointOffset(aCoords, ai, hit.t),
          bOffset: geometryPointOffset(bCoords, bi, hit.u),
        });
      }
    }
    return hits;
  }

  function uniqueIntersections(hits) {
    return hits.filter((hit, index) => !hits.slice(0, index).some(other => samePoint(other.point, hit.point)));
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
    const existing = targetState.junctions.find(junction => dist(junction, {lat: point[0], lng: point[1]}) < .05);
    if (existing) return existing;
    const junction = {
      id: `j${Date.now()}${Math.random().toString(16).slice(2)}`,
      name: 'Automatischer Netzknoten',
      lat: point[0],
      lng: point[1],
      tier: 0,
      slots: 0,
      isJunction: true,
      automatic: true,
    };
    targetState.junctions.push(junction);
    return junction;
  }

  function edgeWithGeometry(base, a, b, type, coords) {
    const spec = transportSpec(type);
    const distance = geometryDistance(coords);
    return {
      ...base,
      id: `e${Date.now()}${Math.random().toString(16).slice(2)}`,
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

  function splitRoadsForAutomaticJunctions(project, targetState = state) {
    const projectSpec = transportSpec(project.type);
    if (projectSpec.mode !== 'road') return [{id: `e${Date.now()}${Math.random().toString(16).slice(2)}`, a: project.a, b: project.b, type: project.type, distance: project.distance, duration: project.duration, geometry: project.geometry, capacity: projectSpec.capacity, maintenance: project.maintenance}];

    const projectGeometry = Array.isArray(project.geometry) && project.geometry.length > 1
      ? project.geometry
      : [[nodeInfo(project.a, targetState).lat, nodeInfo(project.a, targetState).lng], [nodeInfo(project.b, targetState).lat, nodeInfo(project.b, targetState).lng]];
    const newCuts = [];
    const replacements = new Map();

    for (const edge of targetState.connections || []) {
      if (!isRoadType(edge.type)) continue;
      if (edge.a === project.a || edge.a === project.b || edge.b === project.a || edge.b === project.b) continue;
      const existingGeometry = edgeGeometry(edge, targetState);
      const hits = uniqueIntersections(geometryIntersections(projectGeometry, existingGeometry));
      if (!hits.length) continue;

      const existingCuts = hits.map(hit => {
        const junction = createJunction(hit.point, targetState);
        newCuts.push({offset: hit.aOffset, segmentIndex: hit.aIndex, point: hit.point, junctionId: junction.id, type: edge.type});
        return {offset: hit.bOffset, segmentIndex: hit.bIndex, point: hit.point, junctionId: junction.id};
      });
      const sortedExistingCuts = normalizeCuts(existingGeometry, existingCuts);
      const existingParts = splitGeometryAtOffsets(existingGeometry, sortedExistingCuts);
      const nodeIds = [edge.a, ...sortedExistingCuts.map(cut => cut.junctionId), edge.b];
      replacements.set(edge.id, existingParts.map((part, index) => edgeWithGeometry(edge, nodeIds[index], nodeIds[index + 1], edge.type, part.coords)));
    }

    if (replacements.size) {
      targetState.connections = targetState.connections.flatMap(edge => replacements.get(edge.id) || [edge]);
    }

    const sortedNewCuts = normalizeCuts(projectGeometry, newCuts);
    const newParts = splitGeometryAtOffsets(projectGeometry, sortedNewCuts);
    const newNodeIds = [project.a, ...sortedNewCuts.map(cut => cut.junctionId), project.b];
    return newParts.map((part, index) => {
      const touchingType = sortedNewCuts[index - 1]?.type || project.type;
      const type = dominantRoadType(project.type, touchingType);
      return edgeWithGeometry(project, newNodeIds[index], newNodeIds[index + 1], type, part.coords);
    });
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
    return Object.entries(reservations).reduce((total, [id, units]) => total + (id === exceptReservationId ? 0 : Math.max(0, Number(units) || 0)), 0);
  }

  function pathCapacityStatus(path, options = {}) {
    const targetState = options.state || state || createNetworkState();
    const edges = Array.isArray(path?.edges) ? path.edges : [];
    const start = Number(options.startAbsMinute);
    const end = Number(options.endAbsMinute);
    const units = Math.max(1, Math.floor(Number(options.units) || 1));
    const reservationId = String(options.reservationId || '');
    if (!edges.length || !Number.isFinite(start) || !Number.isFinite(end)) return {ok: true, overloaded: []};
    const overloaded = [];
    for (const edge of edges) {
      const capacity = edgeCapacity(edge);
      for (const windowKey of capacityWindowRange(start, end)) {
        if (reservedUnitsFor(edge, windowKey, targetState, reservationId) + units > capacity) overloaded.push({edgeId: edgeId(edge), windowKey, capacity});
      }
    }
    return {ok: overloaded.length === 0, overloaded};
  }

  function reservePathCapacity(path, options = {}) {
    const targetState = options.state || state || createNetworkState();
    targetState.usedCapacity = targetState.usedCapacity && typeof targetState.usedCapacity === 'object' ? targetState.usedCapacity : {};
    const status = pathCapacityStatus(path, {...options, state: targetState});
    if (!status.ok) return {ok: false, reason: 'route-overloaded', overloaded: status.overloaded};
    const reservationId = String(options.reservationId || `res-${Date.now()}${Math.random().toString(16).slice(2)}`);
    const units = Math.max(1, Math.floor(Number(options.units) || 1));
    for (const edge of Array.isArray(path?.edges) ? path.edges : []) {
      const id = edgeId(edge);
      targetState.usedCapacity[id] = targetState.usedCapacity[id] && typeof targetState.usedCapacity[id] === 'object' ? targetState.usedCapacity[id] : {};
      for (const windowKey of capacityWindowRange(options.startAbsMinute, options.endAbsMinute)) {
        targetState.usedCapacity[id][windowKey] = targetState.usedCapacity[id][windowKey] && typeof targetState.usedCapacity[id][windowKey] === 'object' ? targetState.usedCapacity[id][windowKey] : {};
        targetState.usedCapacity[id][windowKey][reservationId] = units;
      }
    }
    return {ok: true, reservationId};
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

  async function fetchRoadRoute(a, b) {
    if (!window.fetch) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&steps=false`;
      const res = await fetch(url, {signal: controller.signal});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const route = data.routes?.[0];
      if (data.code !== 'Ok' || !route) throw new Error(data.code || 'Keine Route');
      return {distance: route.distance / 1000, duration: route.duration / 3600, geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng])};
    } finally {
      clearTimeout(timer);
    }
  }

  async function planConnection(fromId, toId, type) {
    const from = citiesById[fromId];
    const to = citiesById[toId];
    const t = TRANSPORT_TYPES[type];
    const mode = t?.mode;
    if (!state || !from || !to || !t || dist(from, to) > MAX_CONNECTION_DISTANCE_KM || connectionExists(fromId, toId, mode)) return null;
    const fallback = mode === 'road' ? {distance: estimateRoadDistance(dist(from, to)), duration: estimateRoadDistance(dist(from, to)) / t.speed, geometry: null} : {distance: dist(from, to), duration: dist(from, to) / t.speed, geometry: null};
    const route = mode === 'road' ? (await fetchRoadRoute(from, to).catch(() => null)) || fallback : fallback;
    const quote = buildQuote(type, route.distance);
    const cash = window.HFV2Save?.getCash?.() ?? STARTING_CASH;
    if (cash < quote.cost) {
      state.pendingProject = null;
      return {ok: false, reason: 'not-enough-cash', cost: quote.cost, cash};
    }
    state.pendingProject = {kind: 'build', a: fromId, b: toId, type, distance: route.distance, duration: route.duration, geometry: route.geometry, cost: quote.cost, maintenance: quote.maintenance};
    return state.pendingProject;
  }

  function getState() {
    return configure();
  }

  function confirmProject() {
    const project = state?.pendingProject;
    if (!project || project.kind !== 'build') return null;
    const cash = window.HFV2Save?.getCash?.() ?? STARTING_CASH;
    if (cash < project.cost) return null;
    window.HFV2Save?.changeCash?.(-project.cost, 'network-build');
    const edges = splitRoadsForAutomaticJunctions(project);
    state.connections.push(...edges);
    state.cities = state.cities && typeof state.cities === 'object' ? state.cities : {};
    state.usedCapacity = state.usedCapacity && typeof state.usedCapacity === 'object' ? state.usedCapacity : {};
    state.cities[project.a] = {...(state.cities[project.a] || {}), unlocked: true};
    state.cities[project.b] = {...(state.cities[project.b] || {}), unlocked: true};
    state.selected = project.b;
    state.pendingProject = null;
    window.dispatchEvent?.(new CustomEvent('hf:network:confirmed', {detail: {edge: edges[0], edges, state}}));
    return edges[0];
  }

  window.HFNetwork = {TRANSPORT_TYPES, ROAD_ORDER, STARTING_CASH, CAPACITY_WINDOW_MINUTES, createNetworkState, configure, dist, estimateRoadDistance, buildQuote, connectionExists, findPath, isReachable, getCandidateTargets, getAvailableConnections: getCandidateTargets, openNetworkBuildMenu, nodeInfo, planConnection, getState, confirmProject, pathCapacityStatus, reservePathCapacity, releaseCapacityReservation, cleanupCapacityReservations};
})();
