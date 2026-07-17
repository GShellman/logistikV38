(() => {
  'use strict';

  const MAX_CONNECTION_DISTANCE_KM = 105;
  const STARTING_CASH = window.HFV2Save?.STARTING_CASH ?? 500000;
  const INTERSECTION_EPS = 1e-7;

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
      cities: {},
      junctions: [],
      usedCapacity: {},
      ...overrides,
    };
  }

  function configure(options = {}) {
    state = options.state || state || createNetworkState();
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
    if (state.cities?.[project.a]) state.cities[project.a].unlocked = true;
    if (state.cities?.[project.b]) state.cities[project.b].unlocked = true;
    state.selected = project.b;
    state.pendingProject = null;
    window.dispatchEvent?.(new CustomEvent('hf:network:confirmed', {detail: {edge: edges[0], edges, state}}));
    return edges[0];
  }

  window.HFNetwork = {TRANSPORT_TYPES, ROAD_ORDER, STARTING_CASH, createNetworkState, configure, dist, estimateRoadDistance, buildQuote, connectionExists, getCandidateTargets, getAvailableConnections: getCandidateTargets, openNetworkBuildMenu, nodeInfo, planConnection, getState, confirmProject};
})();
