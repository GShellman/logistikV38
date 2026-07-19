(() => {
  'use strict';

  let logisticsVehicleLayer = null;

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

  function vehicleIcon(shipment) {
    const vehicleType = String(shipment?.vehicleType || '').trim();
    const src = window.HFV2VehicleAssets?.vehicleImage?.(vehicleType) || '';
    const fallback = window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicleType]?.icon || '🚚';
    const html = src
      ? `<img class="hf-v2-shipment-asset" src="${escapeHtml(src)}" alt="" aria-hidden="true">`
      : `<div class="hf-v2-shipment-marker"><span class="hf-v2-shipment-marker__emoji" aria-hidden="true">${escapeHtml(fallback)}</span></div>`;
    return L.divIcon({className: '', html, iconSize: [62, 48], iconAnchor: [31, 24]});
  }

  function initLogisticsLayer(map) {
    if (!map || !window.L) return null;
    if (logisticsVehicleLayer && logisticsVehicleLayer._map !== map) logisticsVehicleLayer.remove();
    if (!logisticsVehicleLayer) logisticsVehicleLayer = L.layerGroup();
    if (!logisticsVehicleLayer._map) logisticsVehicleLayer.addTo(map);
    return logisticsVehicleLayer;
  }

  function clearLogisticsVehicles() {
    logisticsVehicleLayer?.clearLayers?.();
  }

  function renderActiveShipments(shipments = [], citiesById = {}) {
    if (!logisticsVehicleLayer || !window.L) return null;
    clearLogisticsVehicles();
    const nowAbsMinute = currentAbsMinute();
    shipments.filter(shipment => shipment?.status === 'active').forEach(shipment => {
      const fromCity = citiesById[shipment.fromCityId];
      const toCity = citiesById[shipment.toCityId];
      const coords = routeGeometry(shipment, fromCity, toCity);
      const duration = Number(shipment.arrivalAbsMinute) - Number(shipment.departureAbsMinute);
      const progress = duration > 0 ? clamp01((nowAbsMinute - Number(shipment.departureAbsMinute)) / duration) : 1;
      const position = interpolateAlongPolyline(coords, progress);
      if (!position) return;
      const good = goodById(shipment.goodId);
      const marker = L.marker(position, {icon: vehicleIcon(shipment), title: `${fromCity?.name || shipment.fromCityId} → ${toCity?.name || shipment.toCityId}`, zIndexOffset: 700}).addTo(logisticsVehicleLayer);
      marker.bindTooltip([
        `<strong>${escapeHtml(fromCity?.name || shipment.fromCityId)} → ${escapeHtml(toCity?.name || shipment.toCityId)}</strong>`,
        `Ware: ${escapeHtml(good.name || shipment.goodId)}`,
        `Menge: ${escapeHtml(formatGoodAmount(shipment.goodId, shipment.amountKg))}`,
        `Abfahrt: ${escapeHtml(formatAbsMinute(shipment.departureAbsMinute))}`,
        `Ankunft: ${escapeHtml(formatAbsMinute(shipment.arrivalAbsMinute))}`,
        `Status: ${escapeHtml(shipment.status)}`,
      ].join('<br>'), {direction: 'top', sticky: true, className: 'city-label'});
    });
    return logisticsVehicleLayer;
  }

  window.HFV2LogisticsLayer = {initLogisticsLayer, renderActiveShipments, clearLogisticsVehicles};
})();
