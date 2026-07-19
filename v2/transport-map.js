(() => {
  'use strict';

  const ACTIVE_STATUSES = new Set(['planned', 'running', 'active']);
  const INACTIVE_STATUSES = new Set(['completed', 'partial', 'blocked', 'failed', 'cancelled', 'canceled']);
  const markerByDeliveryId = new Map();
  const trailByDeliveryId = new Map();
  let map = null;

  function normalizeInteger(value, fallback, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const integer = Math.trunc(numeric);
    return integer >= min && integer <= max ? integer : fallback;
  }

  function absoluteMinute(day, minute) {
    return (Math.max(1, normalizeInteger(day, 1, 1)) - 1) * 1440 + normalizeInteger(minute, 0, 0, 1439);
  }

  function currentAbsoluteMinute() {
    const time = window.HFV2Time?.getState?.() || window.HFV2Save?.getState?.().time || {day: 1, hour: 8, minute: 0};
    const minuteOfDay = normalizeInteger(time.hour, 0, 0, 23) * 60 + normalizeInteger(time.minute, 0, 0, 59);
    return absoluteMinute(time.day, minuteOfDay);
  }

  function deliveryId(delivery) {
    const segmentSuffix = delivery?.tripSegment ? `-trip-${delivery.tripSegment.tripIndex || 1}` : '';
    return String((delivery?.id || `${delivery?.orderId || 'delivery'}-${delivery?.scheduledDay || delivery?.deliveryDay}-${delivery?.scheduledMinute || delivery?.deliveryMinute}`) + segmentSuffix).trim();
  }

  function isActiveDelivery(delivery) {
    const status = String(delivery?.status || '').trim().toLowerCase();
    if (INACTIVE_STATUSES.has(status) || delivery?.blocked || delivery?.cancelled || delivery?.canceled || delivery?.completed) return false;
    return !status || ACTIVE_STATUSES.has(status);
  }

  function deliveryWindow(delivery) {
    const segment = delivery?.tripSegment || null;
    const departureDay = normalizeInteger(segment?.departureDay ?? delivery?.departureDay ?? delivery?.scheduledDay ?? delivery?.deliveryDay, 1, 1);
    const departureMinute = normalizeInteger(segment?.departureMinute ?? delivery?.departureMinute ?? delivery?.scheduledMinute ?? delivery?.deliveryMinute, 0, 0, 1439);
    const departureAbs = absoluteMinute(departureDay, departureMinute);
    const roundTripMinutes = Math.max(1, normalizeInteger(delivery?.roundTripMinutes, delivery?.durationMinutes ?? 120, 1));
    const outboundMinutes = Math.max(1, normalizeInteger(delivery?.outboundMinutes ?? delivery?.routeMinutes, Math.ceil(roundTripMinutes / 2), 1));
    return {startAbs: departureAbs, endAbs: departureAbs + outboundMinutes, outboundMinutes};
  }

  function deliveryProgress(delivery) {
    const {startAbs, endAbs} = deliveryWindow(delivery);
    const now = currentAbsoluteMinute();
    if (now < startAbs || now > endAbs) return null;
    if (endAbs <= startAbs) return 1;
    return Math.min(1, Math.max(0, (now - startAbs) / (endAbs - startAbs)));
  }

  function cityById(cityId) {
    return window.HFV2CitiesById?.[String(cityId || '').trim()] || null;
  }

  function interpolate(source, destination, progress) {
    return [source.lat + ((destination.lat - source.lat) * progress), source.lng + ((destination.lng - source.lng) * progress)];
  }

  function vehicleIcon(delivery, source, destination) {
    const vehicleType = String(delivery?.vehicleType || 'van').trim() || 'van';
    const image = window.HFV2VehicleAssets?.vehicleImage?.(vehicleType) || window.HFV2VehicleAssets?.embeddedVehicleImage?.(vehicleType) || '';
    const east = Number(destination?.lng) >= Number(source?.lng);
    const imageMarkup = image ? `<img src="${image}" alt="" draggable="false" style="transform:scaleX(${east ? -1 : 1})">` : '<span aria-hidden="true">🚚</span>';
    return L.divIcon({
      className: '',
      html: `<div class="hf-v2-transport-marker hf-v2-transport-marker--${vehicleType}">${imageMarkup}</div>`,
      iconSize: [50, 34],
      iconAnchor: [25, 17],
    });
  }

  function goodName(goodId) {
    return (window.HFV2GoodsCatalog || []).find(good => good.id === goodId)?.name || goodId || 'Ware';
  }

  function bindTooltip(marker, delivery, source, destination, progress) {
    const percent = Math.round(progress * 100);
    marker.unbindTooltip();
    marker.bindTooltip(`${goodName(delivery.goodId)} · ${percent}%<br>${source.name} → ${destination.name}`, {className: 'hf-v2-transport-tooltip'});
  }

  function removeDelivery(id) {
    const marker = markerByDeliveryId.get(id);
    if (marker) map?.removeLayer(marker);
    markerByDeliveryId.delete(id);
    const trail = trailByDeliveryId.get(id);
    if (trail) map?.removeLayer(trail);
    trailByDeliveryId.delete(id);
  }

  function renderDelivery(delivery, activeIds) {
    const id = deliveryId(delivery);
    const source = cityById(delivery?.sourceCityId || delivery?.sourceId);
    const destination = cityById(delivery?.destinationCityId || delivery?.cityId);
    const progress = deliveryProgress(delivery);
    if (!id || !source || !destination || progress === null || !isActiveDelivery(delivery)) {
      removeDelivery(id);
      return;
    }
    activeIds.add(id);
    const position = interpolate(source, destination, progress);
    let marker = markerByDeliveryId.get(id);
    if (!marker) {
      marker = L.marker(position, {icon: vehicleIcon(delivery, source, destination), zIndexOffset: 850, interactive: true}).addTo(map);
      marker._hfVehicleType = delivery.vehicleType;
      markerByDeliveryId.set(id, marker);
    } else {
      if (marker._hfVehicleType !== delivery.vehicleType) {
        marker.setIcon(vehicleIcon(delivery, source, destination));
        marker._hfVehicleType = delivery.vehicleType;
      }
      marker.setLatLng(position);
    }
    bindTooltip(marker, delivery, source, destination, progress);

    let trail = trailByDeliveryId.get(id);
    if (!trail) {
      trail = L.polyline([[source.lat, source.lng], [destination.lat, destination.lng]], {className: 'hf-v2-transport-trail', color: '#d99026', weight: 2, opacity: 0.45, dashArray: '5 8', interactive: false}).addTo(map);
      trailByDeliveryId.set(id, trail);
    }
  }

  function refresh() {
    if (!map || !window.L) return;
    const activeIds = new Set();
    const deliveries = window.HFV2Orders?.getState?.().deliveries || [];
    deliveries.flatMap(delivery => {
      if (!Array.isArray(delivery?.tripSegments) || !delivery.tripSegments.length) return [delivery];
      return delivery.tripSegments.map(segment => ({...delivery, status: segment.status, tripSegment: segment, quantityKg: segment.quantityKg}));
    }).forEach(delivery => renderDelivery(delivery, activeIds));
    for (const id of markerByDeliveryId.keys()) if (!activeIds.has(id)) removeDelivery(id);
  }

  function init(nextMap) {
    map = nextMap || map || window.HFV2Map || null;
    refresh();
    window.addEventListener('hf:v2:state-changed', refresh);
    window.addEventListener('hf:v2:order-created', refresh);
    window.addEventListener('hf:network:confirmed', refresh);
    return {refresh};
  }

  window.HFV2TransportMap = {init, refresh};
})();
