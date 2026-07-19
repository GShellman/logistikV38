(() => {
  'use strict';

  let logisticsVehicleLayer = null;
  const shipmentMarkers = new Map();

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
    const stored = Array.isArray(shipment?.routeGeometry) ? shipment.routeGeometry.map(sanitizeCoordinate).filter(Boolean) : [];
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

  function vehicleIcon(shipment, isMovingRight = false) {
    const vehicleType = String(shipment?.vehicleType || '').trim();
    const src = window.HFV2VehicleAssets?.roadVehicleImage?.(vehicleType) || window.HFV2VehicleAssets?.vehicleImage?.(vehicleType) || '';
    const fallbackSrc = window.HFV2VehicleAssets?.vehicleImage?.(vehicleType) || '';
    const fallback = window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicleType]?.icon || '🚚';
    const directionClass = isMovingRight ? ' hf-v2-shipment-asset--right' : '';
    const markerDirectionClass = isMovingRight ? ' hf-v2-shipment-marker--right' : '';
    const html = src
      ? `<img class="hf-v2-shipment-asset${directionClass}" src="${escapeHtml(src)}"${fallbackSrc && fallbackSrc !== src ? ` onerror="this.onerror=null;this.src='${escapeHtml(fallbackSrc)}';"` : ''} alt="" aria-hidden="true">`
      : `<div class="hf-v2-shipment-marker${markerDirectionClass}"><span class="hf-v2-shipment-marker__emoji" aria-hidden="true">${escapeHtml(fallback)}</span></div>`;
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

  function updateMarkerIcon(marker, shipment, direction) {
    const vehicleType = String(shipment?.vehicleType || '').trim();
    if (marker._hfV2VehicleType === vehicleType && marker._hfV2DirectionRight === direction) return;
    marker.setIcon?.(vehicleIcon(shipment, direction));
    marker._hfV2VehicleType = vehicleType;
    marker._hfV2DirectionRight = direction;
  }

  function shipmentStops(shipment) {
    return Array.isArray(shipment?.stops) ? shipment.stops.filter(stop => stop?.toCityId && stop?.goodId && Number(stop.amountKg) > 0) : [];
  }

  function stopCityName(stop) {
    return citiesById?.[stop.toCityId]?.name || stop.toCityName || stop.toCityId;
  }

  function shipmentTooltip(shipment, fromCity, toCity) {
    const stops = shipmentStops(shipment);
    const isBundled = stops.length > 0;
    const good = goodById(shipment.goodId);
    const isReturnTrip = shipment.status === 'returning';
    const departureAbsMinute = isReturnTrip ? shipment.returnDepartureAbsMinute : shipment.departureAbsMinute;
    const arrivalAbsMinute = isReturnTrip ? shipment.returnArrivalAbsMinute : shipment.arrivalAbsMinute;
    const stopList = isBundled ? `<ul class="hf-v2-shipment-tooltip__stops">${stops.map(stop => {
      const stopGood = goodById(stop.goodId);
      const arrival = Number.isFinite(Number(stop.arrivalAbsMinute)) ? ` · ${formatAbsMinute(stop.arrivalAbsMinute)}` : '';
      return `<li><strong>${escapeHtml(stopCityName(stop))}</strong>: ${escapeHtml(stopGood.name || stop.goodId)} · ${escapeHtml(formatGoodAmount(stop.goodId, stop.amountKg))}${escapeHtml(arrival)}</li>`;
    }).join('')}</ul>` : '';
    return [
      `<strong>${escapeHtml(fromCity?.name || shipment.fromCityId)} → ${escapeHtml(toCity?.name || shipment.toCityId)}</strong>`,
      isBundled ? 'Transport: Sammellieferung' : `Ware: ${escapeHtml(good.name || shipment.goodId)}`,
      isBundled ? `Stopps:${stopList}` : `Menge: ${escapeHtml(formatGoodAmount(shipment.goodId, shipment.amountKg))}`,
      `Abfahrt: ${escapeHtml(formatAbsMinute(departureAbsMinute))}`,
      `Ankunft: ${escapeHtml(formatAbsMinute(arrivalAbsMinute))}`,
      `Status: ${escapeHtml(isReturnTrip ? 'Rückfahrt' : shipment.status)}`,
    ].join('<br>');
  }

  function renderActiveShipments(shipments = [], citiesById = {}) {
    if (!logisticsVehicleLayer || !window.L) return null;
    const nowAbsMinute = currentAbsMinute();
    const activeShipmentIds = new Set();

    shipments.filter(shipment => shipment?.status === 'active' || shipment?.status === 'returning').forEach(shipment => {
      const id = shipmentId(shipment);
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

      activeShipmentIds.add(id);
      const title = `${fromCity?.name || shipment.fromCityId} → ${toCity?.name || shipment.toCityId}`;
      let marker = shipmentMarkers.get(id);
      if (!marker) {
        const direction = initialDirection(coords);
        marker = L.marker(position, {icon: vehicleIcon(shipment, direction), title, zIndexOffset: 700}).addTo(logisticsVehicleLayer);
        marker._hfV2VehicleType = String(shipment?.vehicleType || '').trim();
        marker._hfV2DirectionRight = direction;
        marker.bindTooltip(shipmentTooltip(shipment, fromCity, toCity), {direction: 'top', sticky: true, className: 'city-label'});
        shipmentMarkers.set(id, marker);
        return;
      }

      const currentLatLng = marker.getLatLng?.();
      const hasHorizontalMovement = Math.abs(Number(position[1]) - Number(currentLatLng?.lng)) > 0.000001;
      const direction = hasHorizontalMovement ? isMovingRight(currentLatLng, position) : Boolean(marker._hfV2DirectionRight);
      marker.options.title = title;
      updateMarkerIcon(marker, shipment, direction);
      marker.setTooltipContent?.(shipmentTooltip(shipment, fromCity, toCity));
      animateMarkerTo(marker, position);
    });

    shipmentMarkers.forEach((marker, id) => {
      if (activeShipmentIds.has(id)) return;
      cancelMarkerAnimation(marker);
      logisticsVehicleLayer.removeLayer(marker);
      shipmentMarkers.delete(id);
    });

    return logisticsVehicleLayer;
  }

  window.HFV2LogisticsLayer = {initLogisticsLayer, renderActiveShipments, clearLogisticsVehicles, animateMarkerTo};
})();
