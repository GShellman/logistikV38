(() => {
  'use strict';

  const MAX_CONNECTION_DISTANCE_KM = 105;

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
  let renderedLines = {};

  function createNetworkState(overrides = {}) {
    return {
      connections: [],
      pendingProject: null,
      networkOriginNode: 'zurich',
      cash: 0,
      selected: 'zurich',
      cities: {},
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

  function connectionExists(a, b, mode = null, targetState = state) {
    return (targetState?.connections || []).some(edge => sameEndpoints(edge, a, b) && (!mode || transportSpec(edge).mode === mode));
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
    state.pendingProject = {kind: 'build', a: fromId, b: toId, type, distance: route.distance, duration: route.duration, geometry: route.geometry, cost: quote.cost, maintenance: quote.maintenance};
    return state.pendingProject;
  }

  function confirmProject() {
    const project = state?.pendingProject;
    if (!project || project.kind !== 'build') return null;
    const t = TRANSPORT_TYPES[project.type];
    const edge = {id: `e${Date.now()}${Math.random().toString(16).slice(2)}`, a: project.a, b: project.b, type: project.type, distance: project.distance, duration: project.duration, geometry: project.geometry, capacity: t.capacity, maintenance: project.maintenance};
    state.connections.push(edge);
    if (state.cities?.[project.a]) state.cities[project.a].unlocked = true;
    if (state.cities?.[project.b]) state.cities[project.b].unlocked = true;
    state.selected = project.b;
    state.pendingProject = null;
    return edge;
  }

  function edgeMidpoint(coords) {
    return coords?.length ? coords[Math.floor(coords.length / 2)] : null;
  }

  function renderNetworkLines(map, targetState = state, targetCitiesById = citiesById) {
    if (!map || !window.L) return {};
    Object.values(renderedLines).forEach(line => map.removeLayer(line));
    renderedLines = {};
    (targetState?.connections || []).forEach(edge => {
      const a = targetCitiesById[edge.a];
      const b = targetCitiesById[edge.b];
      if (!a || !b) return;
      const t = transportSpec(edge);
      const coords = edge.geometry?.length > 1 ? edge.geometry : [[a.lat, a.lng], [b.lat, b.lng]];
      const used = targetState.usedCapacity?.[edge.id] || 0;
      const line = L.polyline(coords, {color: t.color, weight: t.weight + 2, dashArray: t.dashArray || null, opacity: 1, lineCap: 'round', lineJoin: 'round'});
      const badge = L.marker(edgeMidpoint(coords), {interactive: false, icon: L.divIcon({className: 'route-badge-wrap', html: `<div class="route-badge idle">${used}/${edge.capacity}</div>`, iconSize: [44, 20], iconAnchor: [22, 10]})});
      const group = L.layerGroup([line, badge]).addTo(map);
      line.bindTooltip(`${t.name} · ${Math.round(edge.distance)} km · ${used}/${edge.capacity} ${t.capacityUnit}`);
      renderedLines[edge.id] = group;
    });
    return renderedLines;
  }

  window.HFNetwork = {TRANSPORT_TYPES, ROAD_ORDER, createNetworkState, configure, dist, estimateRoadDistance, buildQuote, connectionExists, getCandidateTargets, getAvailableConnections: getCandidateTargets, openNetworkBuildMenu, planConnection, confirmProject, renderNetworkLines};
})();
