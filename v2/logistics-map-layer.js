(() => {
  'use strict';

  let logisticsVehicleLayer = null;
  const shipmentMarkers = new Map();
  let selectedTransportId = null;
  let isReconcilingSelection = false;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '\"': '&quot;',
    }[char]));
  }

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(1, Math.max(0, number));
  }

  function currentAbsMinute() {
    const time = window.HFV2Time?.getState?.() || window.HFV2Save?.getState?.().time || {day: 1, hour: 0, minute: 0};
    return window.HFV2Logistics?.absoluteMinute?.(time) || 0;
  }

  function cityCoordinates(city) {
    if (!city) return null;
    const lat = Number(city.lat ?? city.coordinates?.lat);
    const lng = Number(city.lng ?? city.coordinates?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }

  function sanitizeCoordinate(point) {
    if (!Array.isArray(point) || point.length < 2) return null;
    const lat = Number(point[0]);
    const lng = Number(point[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }

  function routeGeometry(shipment, fromCity, toCity) {
    const source = Array.isArray(shipment?.routeGeometry) ? shipment.routeGeometry : shipment?.route?.geometry;
    const stored = Array.isArray(source) ? source.map(sanitizeCoordinate).filter(Boolean) : [];
    if (stored.length > 1) return stored;
    const from = cityCoordinates(fromCity);
    const to = cityCoordinates(toCity);
    return from && to ? [from, to] : [];
  }

  function distance(a, b) {
    const lat = Number(a?.[0]) - Number(b?.[0]);
    const lng = Number(a?.[1]) - Number(b?.[1]);
    return Math.sqrt(lat * lat + lng * lng);
  }

  function interpolateAlongPolyline(coords, progress) {
    if (!Array.isArray(coords) || coords.length === 0) return null;
    if (coords.length === 1) return coords[0];
    const lengths = [];
    let total = 0;
    for (let index = 0; index < coords.length - 1; index += 1) {
      const segment = distance(coords[index], coords[index + 1]);
      lengths.push(segment);
      total += segment;
    }
    if (total <= 0) return coords[coords.length - 1];
    let target = total * clamp01(progress);
    for (let index = 0; index < lengths.length; index += 1) {
      if (target > lengths[index]) {
        target -= lengths[index];
        continue;
      }
      const ratio = lengths[index] > 0 ? target / lengths[index] : 0;
      const start = coords[index];
      const end = coords[index + 1];
      return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
    }
    return coords[coords.length - 1];
  }

  function formatWeightKg(value) {
    const kg = Math.max(0, Number(value) || 0);
    if (kg >= 1000) return `${(kg / 1000).toLocaleString('de-CH', {maximumFractionDigits: 1})} t`;
    return `${kg.toLocaleString('de-CH', {maximumFractionDigits: kg >= 10 ? 0 : 1})} kg`;
  }

  function goodById(goodId) {
    return (window.HFV2GoodsCatalog || []).find(good => good.id === goodId) || {id: goodId, name: goodId, icon: '📦', unit: {unit: 'kg', kgPerUnit: 1}};
  }

  function formatGoodAmount(goodId, kg) {
    const good = goodById(goodId);
    const unit = good.unit || {unit: 'kg', kgPerUnit: 1};
    const kgPerUnit = Math.max(Number(unit.kgPerUnit) || 1, 0.000001);
    const amount = (Number(kg) || 0) / kgPerUnit;
    if (unit.unit === 'kg') return formatWeightKg(kg);
    if (unit.unit === 't') return `${amount.toLocaleString('de-CH', {maximumFractionDigits: 1})} t`;
    return `${amount.toLocaleString('de-CH', {maximumFractionDigits: amount >= 10 ? 0 : 1})} ${unit.unit}`;
  }

  function formatAbsMinute(absMinute) {
    const total = Math.max(0, Math.trunc(Number(absMinute) || 0));
    const day = Math.floor(total / 1440) + 1;
    const minuteOfDay = total % 1440;
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    return `Tag ${day} · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  const MAX_VISIBLE_CARGO_ICONS = 3;
  const FINISHED_STOP_STATUSES = new Set(['delivered', 'failed', 'partial']);

  function returnGoodIds(shipment) {
    if (Array.isArray(shipment?.returnStops)) {
      return [...new Set(shipment.returnStops
        .filter(stop => stop?.goodId && Number(stop.amountKg) > 0 && !FINISHED_STOP_STATUSES.has(String(stop.status || '').toLowerCase()))
        .map(stop => stop.goodId))];
    }
    return shipment?.returnGoodId && Number(shipment.returnAmountKg) > 0 ? [shipment.returnGoodId] : [];
  }

  function loadedGoodIds(shipment) {
    if (shipment?.status === 'returning') return returnGoodIds(shipment);
    if (Array.isArray(shipment?.stops) && shipment.stops.length > 0) {
      return [...new Set(shipment.stops
        .filter(stop => stop?.goodId && !FINISHED_STOP_STATUSES.has(String(stop.status || '').toLowerCase()))
        .map(stop => stop.goodId))];
    }
    return shipment?.goodId ? [shipment.goodId] : [];
  }

  function isEmptyTransport(shipment) {
    return shipment?.type === 'repositioning' || (shipment?.status === 'returning' && loadedGoodIds(shipment).length === 0);
  }

  function loadedGoodNames(shipment) {
    return loadedGoodIds(shipment).map(goodId => goodById(goodId).name || goodId);
  }

  function cargoIcon(goodId) {
    const good = goodById(goodId);
    const src = window.HFV2GoodsAssets?.goodImage?.(goodId) || '';
    if (src) return `<img class="hf-v2-transport-marker__good-icon" src="${escapeHtml(src)}" alt="" aria-hidden="true" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="hf-v2-transport-marker__good-icon hf-v2-transport-marker__good-icon--fallback" aria-hidden="true" hidden>${escapeHtml(good.icon || '📦')}</span>`;
    return `<span class="hf-v2-transport-marker__good-icon hf-v2-transport-marker__good-icon--fallback" aria-hidden="true">${escapeHtml(good.icon || '📦')}</span>`;
  }

  function cargoBadge(shipment) {
    const goodIds = loadedGoodIds(shipment);
    const visible = goodIds.slice(0, MAX_VISIBLE_CARGO_ICONS);
    const overflow = goodIds.length - visible.length;
    const modifier = goodIds.length > 1 ? ' hf-v2-transport-marker__badge--multiple' : ' hf-v2-transport-marker__badge--single';
    const icons = visible.length ? visible.map(cargoIcon).join('') : cargoIcon('');
    return `<span class="hf-v2-transport-marker__badge${modifier}" aria-hidden="true">${icons}${overflow > 0 ? `<span class="hf-v2-transport-marker__overflow">+${overflow}</span>` : ''}</span>`;
  }

  function vehicleIcon(shipment, isMovingRight = false, progress = 0, options = {}) {
    const vehicleType = String(shipment?.vehicleType || '').trim();
    const src = window.HFV2VehicleAssets?.roadVehicleImage?.(vehicleType) || window.HFV2VehicleAssets?.vehicleImage?.(vehicleType) || '';
    const fallbackSrc = window.HFV2VehicleAssets?.vehicleImage?.(vehicleType) || '';
    const fallback = window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicleType]?.icon || '🚚';
    const directionClass = isMovingRight ? ' hf-v2-shipment-asset--right' : '';
    const markerDirectionClass = isMovingRight ? ' hf-v2-shipment-marker--right' : '';
    const transportKind = isEmptyTransport(shipment) ? 'empty' : (shipment?.type === 'waiting' ? 'waiting' : 'loaded');
    const groupCount = Math.max(1, Number(options.groupCount) || 1);
    const grouped = groupCount > 1;
    const arrow = isMovingRight ? '→' : '←';
    const cargoNames = loadedGoodNames(shipment);
    const accessibleStatus = transportKind === 'loaded' ? `Geladene Waren: ${cargoNames.join(', ') || 'unbekannt'}` : (transportKind === 'empty' ? 'Leerfahrt' : 'Fahrzeug wartet');
    const badge = grouped
      ? `<span class="hf-v2-transport-marker__group-count" aria-hidden="true">× ${groupCount}</span>`
      : (transportKind === 'loaded' ? cargoBadge(shipment) : `<span class="hf-v2-transport-marker__badge hf-v2-transport-marker__badge--status" aria-hidden="true">${transportKind === 'empty' ? '○' : 'P'}</span>`);
    const html = `<div class="hf-v2-transport-marker hf-v2-transport-marker--${transportKind}${grouped ? ' hf-v2-transport-marker--group' : ''}" role="img" aria-label="${escapeHtml(accessibleStatus)}" title="${escapeHtml(accessibleStatus)}">${src
      ? `<img class="hf-v2-shipment-asset${directionClass}" src="${escapeHtml(src)}"${fallbackSrc && fallbackSrc !== src ? ` onerror="this.onerror=null;this.src='${escapeHtml(fallbackSrc)}';"` : ''} alt="" aria-hidden="true">`
      : `<div class="hf-v2-shipment-marker${markerDirectionClass}"><span class="hf-v2-shipment-marker__emoji" aria-hidden="true">${escapeHtml(fallback)}</span></div>`}${grouped ? '' : `<span class="hf-v2-transport-direction" aria-hidden="true">${arrow}</span>`}<span class="hf-v2-transport-progress" aria-hidden="true"><i style="width:${Math.round(clamp01(progress) * 100)}%"></i></span>${badge}</div>`;
    return L.divIcon({className: '', html, iconSize: [50, 50], iconAnchor: [25, 25]});
  }

  function initLogisticsLayer(map) {
    if (!map || !window.L) return null;
    if (logisticsVehicleLayer && logisticsVehicleLayer._map !== map) logisticsVehicleLayer.remove();
    if (!logisticsVehicleLayer) logisticsVehicleLayer = L.layerGroup();
    if (!logisticsVehicleLayer._map) logisticsVehicleLayer.addTo(map);
    return logisticsVehicleLayer;
  }

  function cancelMarkerAnimation(marker) {
    const animationId = marker?._hfV2AnimationFrame;
    if (animationId) window.cancelAnimationFrame?.(animationId);
    if (marker) marker._hfV2AnimationFrame = null;
  }

  function animateMarkerTo(marker, targetLatLng, durationMs = 650) {
    if (!marker || !Array.isArray(targetLatLng) || targetLatLng.length < 2) return;
    const targetLat = Number(targetLatLng[0]);
    const targetLng = Number(targetLatLng[1]);
    if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) return;
    cancelMarkerAnimation(marker);

    const current = marker.getLatLng?.();
    const startLat = Number(current?.lat);
    const startLng = Number(current?.lng);
    if (!Number.isFinite(startLat) || !Number.isFinite(startLng) || durationMs <= 0 || !window.requestAnimationFrame) {
      marker.setLatLng([targetLat, targetLng]);
      return;
    }

    if (Math.abs(startLat - targetLat) < 0.000001 && Math.abs(startLng - targetLng) < 0.000001) {
      marker.setLatLng([targetLat, targetLng]);
      return;
    }

    const startedAt = window.performance?.now?.() ?? Date.now();
    const duration = Math.max(1, Number(durationMs) || 650);
    const step = timestamp => {
      const elapsed = (Number(timestamp) || Date.now()) - startedAt;
      const ratio = clamp01(elapsed / duration);
      const lat = startLat + (targetLat - startLat) * ratio;
      const lng = startLng + (targetLng - startLng) * ratio;
      marker.setLatLng([lat, lng]);
      if (ratio < 1) {
        marker._hfV2AnimationFrame = window.requestAnimationFrame(step);
      } else {
        marker._hfV2AnimationFrame = null;
      }
    };
    marker._hfV2AnimationFrame = window.requestAnimationFrame(step);
  }

  function clearLogisticsVehicles() {
    shipmentMarkers.forEach(marker => cancelMarkerAnimation(marker));
    shipmentMarkers.clear();
    logisticsVehicleLayer?.clearLayers?.();
    selectedTransportId = null;
  }

  function shipmentId(shipment) {
    return String(shipment?.id ?? shipment?.shipmentId ?? '').trim();
  }

  function isMovingRight(fromPosition, toPosition) {
    const fromLng = Number(fromPosition?.lng ?? fromPosition?.[1]);
    const toLng = Number(toPosition?.lng ?? toPosition?.[1]);
    return Number.isFinite(fromLng) && Number.isFinite(toLng) && toLng > fromLng;
  }

  function initialDirection(coords) {
    if (!Array.isArray(coords) || coords.length < 2) return false;
    return isMovingRight(coords[0], coords[coords.length - 1]);
  }

  function updateMarkerIcon(marker, shipment, direction, progress, options) {
    const vehicleType = String(shipment?.vehicleType || '').trim();
    marker.setIcon?.(vehicleIcon(shipment, direction, progress, options));
    marker._hfV2VehicleType = vehicleType;
    marker._hfV2DirectionRight = direction;
  }

  function shipmentStops(shipment) {
    return Array.isArray(shipment?.stops) ? shipment.stops.filter(stop => stop?.toCityId && stop?.goodId && Number(stop.amountKg) > 0) : [];
  }

  function stopCityName(stop) {
    return stop.toCityName || stop.toCityId;
  }

  function vehicleIds(shipment) {
    const ids = Array.isArray(shipment?.vehicleIds) ? shipment.vehicleIds : [shipment?.vehicleId ?? shipment?.id];
    return [...new Set(ids.filter(id => id !== undefined && id !== null).map(String))];
  }

  function centralVehicles(vehicles = []) {
    const stateVehicles = window.HFFleet?.getState?.().vehicles;
    const source = Array.isArray(stateVehicles) ? stateVehicles : vehicles;
    return new Map(source.map(vehicle => [String(vehicle.id), vehicle]));
  }

  function vehicleLabel(vehicle, shipment) {
    const spec = window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicle?.vehicleType || shipment?.vehicleType] || {};
    const name = vehicle?.name || spec.name || vehicle?.vehicleType || shipment?.vehicleType || 'Fahrzeug';
    const plate = vehicle?.licensePlate || shipment?.licensePlate;
    return `${name}${plate ? ` · ${plate}` : ''}`;
  }

  function vehiclesSection(shipment, fleet) {
    const ids = vehicleIds(shipment);
    const rows = ids.map(id => {
      const vehicle = fleet.get(id);
      return `<li><span>${escapeHtml(vehicleLabel(vehicle, shipment))}</span><small>ID ${escapeHtml(id)}</small></li>`;
    }).join('');
    if (!ids.length) return '<p>Keine Fahrzeugzuordnung</p>';
    if (ids.length === 1) return `<p>${escapeHtml(vehicleLabel(fleet.get(ids[0]), shipment))}</p>`;
    return `<details class="hf-v2-transport-detail__vehicles"><summary>${ids.length} Fahrzeuge anzeigen</summary><ul>${rows}</ul></details>`;
  }

  function tripLabel(shipment) {
    if (shipment.type === 'waiting') return 'Wartend';
    if (shipment.type === 'repositioning') return 'Leerfahrt';
    return shipment.status === 'returning' ? 'Rückfahrt' : 'Hinfahrt';
  }

  function stopsMarkup(shipment) {
    const isReturnTrip = shipment?.status === 'returning';
    const stops = isReturnTrip && Array.isArray(shipment.returnStops)
      ? shipment.returnStops.filter(stop => stop?.toCityId && stop?.goodId && Number(stop.amountKg) > 0)
      : shipmentStops(shipment);
    if (!stops.length) {
      const goodId = isReturnTrip ? shipment.returnGoodId : shipment.goodId;
      const amountKg = isReturnTrip ? shipment.returnAmountKg : shipment.amountKg;
      const good = goodById(goodId);
      return `<dl><div><dt>Ware</dt><dd>${escapeHtml(good.name || goodId || '–')}</dd></div><div><dt>Menge</dt><dd>${escapeHtml(formatGoodAmount(goodId, amountKg))}</dd></div></dl>`;
    }
    return `<ol class="hf-v2-transport-stops">${stops.map(stop => {
      const good = goodById(stop.goodId);
      const arrival = Number.isFinite(Number(stop.arrivalAbsMinute)) ? formatAbsMinute(stop.arrivalAbsMinute) : 'Noch offen';
      return `<li><strong>${escapeHtml(stopCityName(stop))}</strong><dl><div><dt>Ware</dt><dd>${escapeHtml(good.name || stop.goodId)}</dd></div><div><dt>Menge</dt><dd>${escapeHtml(formatGoodAmount(stop.goodId, stop.amountKg))}</dd></div><div><dt>Ankunft</dt><dd>${escapeHtml(arrival)}</dd></div></dl></li>`;
    }).join('')}</ol>`;
  }

  function activeCargo(shipment) {
    if (isEmptyTransport(shipment) || shipment?.type === 'waiting') return [];
    const returning = shipment?.status === 'returning';
    const source = returning ? shipment?.returnStops : shipment?.stops;
    if (Array.isArray(source) && source.length) return source.filter(stop => stop?.goodId && Number(stop.amountKg) > 0 && !FINISHED_STOP_STATUSES.has(String(stop.status || '').toLowerCase()));
    const goodId = returning ? shipment?.returnGoodId : shipment?.goodId;
    const amountKg = Number(returning ? shipment?.returnAmountKg : shipment?.amountKg);
    return goodId && amountKg > 0 ? [{goodId, amountKg, loadCarrier: shipment.loadCarrier, carrierCount: shipment.carrierCount, grossKg: shipment.grossKg, maxNetKgPerCarrier: shipment.maxNetKgPerCarrier}] : [];
  }

  // DOM-unabhängiges View-Model: neue Träger/Fahrzeuge benötigen nur Katalogdaten.
  function normalizeCargoVisualization(shipment, fleet = new Map()) {
    const catalog = window.HFV2LoadCarrierCatalog?.LOAD_CARRIER_CATALOG || {};
    const ids = vehicleIds(shipment);
    const vehicles = (ids.length ? ids : ['']).map(id => {
      const vehicle = fleet instanceof Map ? fleet.get(id) : (Array.isArray(fleet) ? fleet.find(item => String(item.id) === id) : fleet?.[id]);
      const type = vehicle?.vehicleType || shipment?.vehicleType;
      const spec = window.HFVehicleCatalog?.VEHICLE_CATALOG?.[type] || {};
      const capacityKg = Math.max(0, Number(vehicle?.capacityKg) || Number(spec.load) * 1000 || 0);
      const regions = Array.isArray(spec.loadRegions) ? spec.loadRegions : [{id: 'load', label: 'Laderaum', visualKind: spec.palletSlots ? 'slot' : 'container', capacityMode: spec.palletSlots ? 'discrete' : 'proportional', slotCount: Number(spec.palletSlots) || 0, capacityKg}];
      return {id, label: vehicleLabel(vehicle, shipment), capacityKg, regions, cargo: []};
    });
    const cargo = activeCargo(shipment).map((item, order) => {
      const good = goodById(item.goodId);
      const carrierId = item.loadCarrier || good.packaging?.loadCarrier || shipment.loadCarrier || 'loose';
      const carrier = catalog[carrierId] || {id: carrierId, name: carrierId, visualKind: 'container', label: 'Laderaum', capacityMode: 'proportional'};
      const netKg = Math.max(0, Number(item.amountKg) || 0);
      const maxNetKg = Math.max(0, Number(item.maxNetKgPerCarrier) || Number(good.packaging?.maxNetKgPerCarrier) || Number(carrier.netCapacityKg) || 0);
      const count = Math.max(0, Number(item.carrierCount) || (carrier.capacityMode === 'discrete' && maxNetKg ? Math.ceil(netKg / maxNetKg) : 0));
      const tareKg = Math.max(0, Number(carrier.tareKg) || 0) * count;
      return {order, goodId: item.goodId, goodName: good.name || item.goodId, icon: good.icon || '📦', carrierId, carrierName: carrier.name || carrierId, visualKind: ['slot', 'bulk', 'liquid', 'container'].includes(carrier.visualKind) ? carrier.visualKind : 'container', capacityMode: carrier.capacityMode === 'discrete' ? 'discrete' : 'proportional', color: carrier.color || '', netKg, grossKg: Math.max(netKg + tareKg, Number(item.grossKg) || 0), carrierCount: count, maxNetKgPerCarrier: maxNetKg};
    });
    let vehicleIndex = 0;
    cargo.forEach(item => {
      if (item.capacityMode === 'discrete' && item.carrierCount) {
        let remainingKg = item.netKg;
        for (let index = 0; index < item.carrierCount; index += 1) {
          while (vehicleIndex < vehicles.length - 1 && vehicles[vehicleIndex].cargo.filter(unit => unit.capacityMode === 'discrete').length >= Number(vehicles[vehicleIndex].regions.find(region => region.capacityMode === 'discrete')?.slotCount || Infinity)) vehicleIndex += 1;
          const netKg = index === item.carrierCount - 1 ? remainingKg : Math.min(remainingKg, item.maxNetKgPerCarrier || remainingKg);
          remainingKg -= netKg;
          vehicles[vehicleIndex]?.cargo.push({...item, netKg, grossKg: netKg + Math.max(0, Number(catalog[item.carrierId]?.tareKg) || 0), carrierCount: 1});
        }
      } else {
        let remainingNet = item.netKg;
        let remainingGross = item.grossKg;
        vehicles.forEach((vehicle, index) => {
          if (remainingNet <= 0) return;
          const used = vehicle.cargo.reduce((sum, unit) => sum + unit.grossKg, 0);
          const shareGross = index === vehicles.length - 1 ? remainingGross : Math.min(remainingGross, Math.max(0, vehicle.capacityKg - used));
          const shareNet = index === vehicles.length - 1 ? remainingNet : (item.grossKg ? item.netKg * shareGross / item.grossKg : 0);
          if (shareNet > 0) vehicle.cargo.push({...item, netKg: shareNet, grossKg: shareGross, carrierCount: 0});
          remainingNet -= shareNet;
          remainingGross -= shareGross;
        });
      }
    });
    return {state: shipment?.type === 'waiting' ? 'waiting' : (isEmptyTransport(shipment) ? 'empty' : cargo.length ? 'loaded' : 'empty'), vehicles, cargo};
  }

  function cargoVisualizationMarkup(shipment, fleet = new Map()) {
    const model = normalizeCargoVisualization(shipment, fleet);
    if (model.state === 'waiting') return '<p class="hf-v2-cargo-empty">Fahrzeug wartet · keine Ladung</p>';
    if (model.state === 'empty') return `<p class="hf-v2-cargo-empty">${shipment?.status === 'returning' ? 'Keine Ladung · Rückfahrt (Leerfahrt)' : 'Leerfahrt · keine Ladung'}</p>`;
    return `<div class="hf-v2-cargo-visualization">${model.vehicles.map(vehicle => {
      if (!(vehicle.capacityKg > 0)) return `<section class="hf-v2-cargo-vehicle"><h5>${escapeHtml(vehicle.label)}</h5><p>Kapazitätsdaten fehlen; Ladung: ${escapeHtml(formatWeightKg(vehicle.cargo.reduce((sum, item) => sum + item.grossKg, 0)))}</p></section>`;
      const discrete = vehicle.regions.some(region => region.capacityMode === 'discrete');
      const units = vehicle.cargo.filter(unit => unit.capacityMode === 'discrete');
      let visual;
      if (discrete) {
        const slots = Math.max(0, Number(vehicle.regions.find(region => region.capacityMode === 'discrete')?.slotCount) || 0);
        visual = `<ol class="hf-v2-cargo-slots" aria-label="${slots} nummerierte Stellplätze">${Array.from({length: slots}, (_, index) => { const item = units[index]; const fill = item?.maxNetKgPerCarrier ? Math.round(clamp01(item.netKg / item.maxNetKgPerCarrier) * 100) : item ? 100 : 0; return `<li class="hf-v2-cargo-slot${item ? ' is-occupied' : ''}" aria-label="Stellplatz ${index + 1}: ${item ? `${item.goodName}, ${fill} Prozent belegt` : 'frei'}"><b>${index + 1}</b>${item ? `<span class="hf-v2-cargo-slot__fill" style="--fill:${fill}%"></span>${cargoVisualIcon(item)}<small>${escapeHtml(item.goodName)}</small>` : '<small>frei</small>'}</li>`; }).join('')}</ol>`;
      } else {
        const total = vehicle.cargo.reduce((sum, item) => sum + item.grossKg, 0);
        visual = `<div class="hf-v2-cargo-region" role="img" aria-label="Laderaum zu ${Math.round(clamp01(total / vehicle.capacityKg) * 100)} Prozent belegt"><div class="hf-v2-cargo-fill">${vehicle.cargo.map(item => `<span class="hf-v2-cargo-segment" style="width:${clamp01(item.grossKg / vehicle.capacityKg) * 100}%;--segment-color:${escapeHtml(item.color || '#64748b')}" title="${escapeHtml(item.goodName)}">${cargoVisualIcon(item)}</span>`).join('')}</div></div>`;
      }
      const legend = `<ul class="hf-v2-cargo-legend">${vehicle.cargo.map(item => `<li><span aria-hidden="true">${escapeHtml(item.icon)}</span><span><strong>${escapeHtml(item.goodName)}</strong><small>${escapeHtml(formatGoodAmount(item.goodId, item.netKg))} · ${escapeHtml(item.carrierName)} · ${escapeHtml(formatWeightKg(item.grossKg))} Kapazität</small></span></li>`).join('')}</ul>`;
      return `<section class="hf-v2-cargo-vehicle"><h5>${escapeHtml(vehicle.label)}</h5>${visual}${legend}</section>`;
    }).join('')}</div>`;
  }

  function cargoVisualIcon(item) {
    const src = window.HFV2GoodsAssets?.goodImage?.(item.goodId) || '';
    return src ? `<img class="hf-v2-cargo-good-icon" src="${escapeHtml(src)}" alt="" aria-hidden="true" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="hf-v2-cargo-good-icon" aria-hidden="true" hidden>${escapeHtml(item.icon)}</span>` : `<span class="hf-v2-cargo-good-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>`;
  }

  function shipmentTooltip(shipment, fromCity, toCity, progress = 0, fleet = new Map()) {
    const from = fromCity?.name || shipment.fromCityId || shipment.currentCityId || '–';
    const to = toCity?.name || shipment.toCityId || shipment.currentCityId || '–';
    const departure = shipment.status === 'returning' ? shipment.returnDepartureAbsMinute : shipment.departureAbsMinute;
    const arrival = shipment.status === 'returning' ? shipment.returnArrivalAbsMinute : shipment.arrivalAbsMinute;
    const percent = Math.round(clamp01(progress) * 100);
    const now = Number(window.HFV2Logistics?.absoluteMinute?.(window.HFV2Time?.getState?.())) || 0;
    const handlingStatus = shipment.status === 'active' && now < Number(shipment.departureAbsMinute) ? 'Wird beladen'
      : shipment.status === 'active' && (shipment.stops || []).some(stop => now >= Number(stop.arrivalAbsMinute) && now < Number(stop.unloadingEndAbsMinute)) ? 'Wird entladen'
        : shipment.status;
    const status = tripLabel(shipment);
    return `<article class="hf-v2-transport-detail" tabindex="-1" aria-label="Transportdetails ${escapeHtml(from)} nach ${escapeHtml(to)}">
      <header><span class="hf-v2-transport-detail__kind hf-v2-transport-detail__kind--${escapeHtml(status.toLowerCase())}">${escapeHtml(status)}</span><h3>${escapeHtml(from)} <span aria-hidden="true">→</span> ${escapeHtml(to)}</h3></header>
      <section aria-label="Route und Status"><h4>Route &amp; Status</h4><dl><div><dt>Status</dt><dd>${escapeHtml(handlingStatus || status)}</dd></div><div><dt>Fortschritt</dt><dd><strong>${percent}%</strong></dd></div></dl><div class="hf-v2-transport-detail__progress" role="progressbar" aria-label="Fortschritt" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div></section>
      <section aria-label="Ladung"><h4>Ladung</h4>${cargoVisualizationMarkup(shipment, fleet)}${isEmptyTransport(shipment) || shipment.type === 'waiting' ? '' : stopsMarkup(shipment)}</section>
      <section aria-label="Fahrzeugdaten"><h4>Fahrzeugdaten</h4>${vehiclesSection(shipment, fleet)}</section>
      <section aria-label="Zeitplan"><h4>Zeitplan</h4><dl><div><dt>Abfahrt</dt><dd><strong>${escapeHtml(Number.isFinite(Number(departure)) ? formatAbsMinute(departure) : '–')}</strong></dd></div><div><dt>Erwartete Ankunft</dt><dd><strong>${escapeHtml(Number.isFinite(Number(arrival)) ? formatAbsMinute(arrival) : '–')}</strong></dd></div></dl></section>
    </article>`;
  }

  function hoverHint(group) {
    if (group.length > 1) return `<strong>${group.length} Transporte</strong><br><span>Klicken für Details</span>`;
    const {shipment, fromCity, toCity} = group[0];
    const from = fromCity?.name || shipment.fromCityId || shipment.currentCityId || '–';
    const to = toCity?.name || shipment.toCityId || shipment.currentCityId || '–';
    const status = shipment.status === 'returning' && isEmptyTransport(shipment) ? 'Rückfahrt · Leerfahrt' : tripLabel(shipment);
    return `<strong>${escapeHtml(from)} → ${escapeHtml(to)}</strong><br><span>${escapeHtml(status)} · Klicken für Details</span>`;
  }

  const SHIPMENT_GROUP_DISTANCE_PX = 36;

  function groupNearbyShipments(entries, map, threshold = SHIPMENT_GROUP_DISTANCE_PX) {
    if (!map?.latLngToLayerPoint || entries.length < 2) return entries.map(entry => [entry]);
    const points = entries.map(entry => map.latLngToLayerPoint(entry.position));
    const parents = entries.map((entry, index) => index);
    const root = index => parents[index] === index ? index : (parents[index] = root(parents[index]));
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const dx = Number(points[left]?.x) - Number(points[right]?.x);
        const dy = Number(points[left]?.y) - Number(points[right]?.y);
        if (Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) <= threshold) {
          const leftRoot = root(left);
          const rightRoot = root(right);
          if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
        }
      }
    }
    const groups = new Map();
    entries.forEach((entry, index) => {
      const key = root(index);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });
    return [...groups.values()];
  }

  function groupTooltip(group, fleet) {
    if (group.length === 1) return shipmentTooltip(group[0].shipment, group[0].fromCity, group[0].toCity, group[0].progress, fleet);
    return `<section class="hf-v2-transport-group" aria-label="Fahrzeuggruppe"><header><span>${group.length} Transporte</span><h3>Fahrzeuggruppe</h3></header><div class="hf-v2-transport-group__list">${group.map((entry, index) => `<details${index === 0 ? ' open' : ''}><summary>${escapeHtml(entry.fromCity?.name || entry.shipment.fromCityId || '–')} → ${escapeHtml(entry.toCity?.name || entry.shipment.toCityId || '–')} · ${escapeHtml(tripLabel(entry.shipment))}</summary>${shipmentTooltip(entry.shipment, entry.fromCity, entry.toCity, entry.progress, fleet)}</details>`).join('')}</div></section>`;
  }

  function renderActiveShipments(shipments = [], citiesById = {}, assignments = [], vehicles = []) {
    if (!logisticsVehicleLayer || !window.L) return null;
    const nowAbsMinute = currentAbsMinute();
    const activeShipmentIds = new Set();
    const entries = [];
    const fleet = centralVehicles(vehicles);

    const moving = [
      ...shipments.filter(shipment => shipment?.status === 'active' || shipment?.status === 'returning').map(shipment => ({...shipment, _markerId: `shipment-${shipmentId(shipment)}`})),
      ...assignments.filter(assignment => assignment?.type === 'repositioning' && assignment?.status === 'active').map(assignment => ({...assignment, _markerId: `assignment-${assignment.id}`})),
    ];
    moving.forEach(shipment => {
      const id = shipment._markerId;
      if (!id) return;
      const isReturnTrip = shipment.status === 'returning';
      const fromCity = citiesById[isReturnTrip ? shipment.toCityId : shipment.fromCityId];
      const toCity = citiesById[isReturnTrip ? shipment.fromCityId : shipment.toCityId];
      const coords = isReturnTrip && Array.isArray(shipment.returnGeometry) && shipment.returnGeometry.length > 1 ? shipment.returnGeometry : routeGeometry(shipment, fromCity, toCity);
      const departureAbsMinute = isReturnTrip ? Number(shipment.returnDepartureAbsMinute) : Number(shipment.departureAbsMinute);
      const arrivalAbsMinute = isReturnTrip ? Number(shipment.returnArrivalAbsMinute) : Number(shipment.arrivalAbsMinute);
      const duration = arrivalAbsMinute - departureAbsMinute;
      const progress = duration > 0 ? clamp01((nowAbsMinute - departureAbsMinute) / duration) : 1;
      const position = interpolateAlongPolyline(coords, progress);
      if (!position) return;

      const goodsTitle = loadedGoodNames(shipment);
      const emptyReturnTitle = isReturnTrip && isEmptyTransport(shipment) ? ', Rückfahrt · Leerfahrt' : '';
      const title = `${fromCity?.name || shipment.fromCityId} → ${toCity?.name || shipment.toCityId}${goodsTitle.length ? `, geladen: ${goodsTitle.join(', ')}` : emptyReturnTitle}`;
      entries.push({id, shipment, fromCity, toCity, coords, position, progress, title, zIndexOffset: 700, interactive: true});
    });

    vehicles.filter(vehicle => vehicle?.status === 'available' && vehicle?.currentCityId && citiesById[vehicle.currentCityId]).forEach(vehicle => {
      const id = `waiting-${vehicle.id}`;
      const city = citiesById[vehicle.currentCityId];
      const position = cityCoordinates(city);
      if (!position) return;
      const shipment = {...vehicle, id, vehicleId: vehicle.id, type: 'waiting'};
      entries.push({id, shipment, fromCity: city, toCity: city, coords: [position], position, progress: 0, title: `${city.name || vehicle.currentCityId}: Fahrzeug wartet`, zIndexOffset: 450, interactive: false});
    });

    isReconcilingSelection = true;
    const renderedGroups = [];
    groupNearbyShipments(entries, logisticsVehicleLayer._map).forEach(group => {
      const grouped = group.length > 1;
      const representative = [...group].sort((a, b) => (a.shipment.type === 'waiting') - (b.shipment.type === 'waiting') || (a.shipment.type === 'repositioning') - (b.shipment.type === 'repositioning'))[0];
      const id = grouped ? `group-${group.map(entry => entry.id).sort().join('|')}` : representative.id;
      const position = [group.reduce((sum, entry) => sum + entry.position[0], 0) / group.length, group.reduce((sum, entry) => sum + entry.position[1], 0) / group.length];
      const progress = group.reduce((sum, entry) => sum + entry.progress, 0) / group.length;
      const title = grouped ? `${group.length} Transporte an dieser Position` : representative.title;
      activeShipmentIds.add(id);
      renderedGroups.push({id, memberIds: group.map(entry => entry.id)});
      let marker = shipmentMarkers.get(id);
      if (!marker) {
        const direction = initialDirection(representative.coords);
        marker = L.marker(position, {icon: vehicleIcon(representative.shipment, direction, progress, {groupCount: group.length}), title: grouped ? title : `${title}, Fahrtrichtung ${direction ? 'Osten' : 'Westen'}, ${Math.round(progress * 100)} Prozent`, zIndexOffset: Math.max(...group.map(entry => entry.zIndexOffset)), interactive: grouped || representative.interactive, keyboard: grouped || representative.interactive}).addTo(logisticsVehicleLayer);
        marker._hfV2VehicleType = String(representative.shipment?.vehicleType || '').trim();
        marker._hfV2DirectionRight = direction;
        marker.bindTooltip(hoverHint(group), {direction: 'top', sticky: true, className: 'city-label hf-v2-transport-hint'});
        marker.bindPopup(groupTooltip(group, fleet), {className: 'hf-v2-transport-popup', maxWidth: 440, minWidth: 300, closeButton: true, autoClose: true});
        marker.on?.('popupopen', () => { if (!isReconcilingSelection) selectedTransportId = marker._hfV2SelectionId; });
        marker.on?.('popupclose', () => { if (!isReconcilingSelection && selectedTransportId === marker._hfV2SelectionId) selectedTransportId = null; });
        marker._hfV2SelectionId = id;
        shipmentMarkers.set(id, marker);
      } else {
        const currentLatLng = marker.getLatLng?.();
        const hasHorizontalMovement = Math.abs(Number(position[1]) - Number(currentLatLng?.lng)) > 0.000001;
        const direction = hasHorizontalMovement ? isMovingRight(currentLatLng, position) : Boolean(marker._hfV2DirectionRight);
        marker.options.title = title;
        marker._hfV2SelectionId = id;
        updateMarkerIcon(marker, representative.shipment, direction, progress, {groupCount: group.length});
        marker.setTooltipContent?.(hoverHint(group));
        marker.setPopupContent?.(groupTooltip(group, fleet));
        animateMarkerTo(marker, position);
      }
    });

    shipmentMarkers.forEach((marker, id) => {
      if (activeShipmentIds.has(id)) return;
      cancelMarkerAnimation(marker);
      logisticsVehicleLayer.removeLayer(marker);
      shipmentMarkers.delete(id);
    });

    if (selectedTransportId) {
      const selectedGroup = renderedGroups.find(group => group.id === selectedTransportId || group.memberIds.includes(selectedTransportId));
      if (selectedGroup) {
        const marker = shipmentMarkers.get(selectedGroup.id);
        marker?._popup?.isOpen?.() || marker?.openPopup?.();
      } else {
        selectedTransportId = null;
      }
    }
    isReconcilingSelection = false;

    return logisticsVehicleLayer;
  }

  function setLogisticsLayerVisible(visible, map) {
    if (!logisticsVehicleLayer || !map) return;
    if (visible && !map.hasLayer(logisticsVehicleLayer)) logisticsVehicleLayer.addTo(map);
    if (!visible && map.hasLayer(logisticsVehicleLayer)) map.removeLayer(logisticsVehicleLayer);
  }

  window.HFV2LogisticsLayer = {initLogisticsLayer, renderActiveShipments, clearLogisticsVehicles, animateMarkerTo, setLogisticsLayerVisible, stopsMarkup, normalizeCargoVisualization, cargoVisualizationMarkup};
})();
