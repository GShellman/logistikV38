(() => {
  'use strict';

  const DEFAULT_STATUS = 'active';
  const DEFAULT_FREQUENCY = 'daily';
  const VALID_FREQUENCIES = new Set(['once', 'daily', 'weekly']);
  const VALID_STATUSES = new Set(['active', 'cancelled', 'paused', 'completed']);
  const VALID_DELIVERY_STATUSES = new Set(['planned', 'running', 'completed', 'partial', 'blocked', 'failed', 'cancelled']);

  let state = null;

  function createOrderState(overrides = {}) {
    const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
    return normalizeOrderState({
      orders: [],
      deliveries: [],
      nextOrderId: 1,
      nextDeliveryId: 1,
      schemaVersion: 1,
      ...source,
    });
  }

  function getState() {
    return configure();
  }

  function configure(options = {}) {
    state = normalizeOrderState(options.state || state || createOrderState());
    return state;
  }

  function normalizeOrderState(source = {}) {
    const normalized = {
      orders: normalizeOrders(source.orders),
      deliveries: normalizeDeliveries(source.deliveries),
      nextOrderId: normalizeCounter(source.nextOrderId, 1),
      nextDeliveryId: normalizeCounter(source.nextDeliveryId, 1),
      schemaVersion: Number.isFinite(Number(source.schemaVersion)) ? Number(source.schemaVersion) : 1,
    };
    normalized.nextOrderId = Math.max(normalized.nextOrderId, nextNumericId(normalized.orders, 'order') + 1);
    normalized.nextDeliveryId = Math.max(normalized.nextDeliveryId, nextNumericId(normalized.deliveries, 'delivery') + 1);
    return normalized;
  }

  function normalizeOrders(orders = []) {
    const sourceOrders = Array.isArray(orders) ? orders : Object.values(orders || {});
    return sourceOrders.map(normalizeOrder).filter(Boolean);
  }

  function normalizeDeliveries(deliveries = []) {
    const sourceDeliveries = Array.isArray(deliveries) ? deliveries : Object.values(deliveries || {});
    return sourceDeliveries.map(normalizeDelivery).filter(Boolean);
  }

  function normalizeOrder(order) {
    if (!order || typeof order !== 'object') return null;
    const destinationCityId = String(order.destinationCityId || order.cityId || '').trim();
    const goodId = String(order.goodId || '').trim();
    if (!destinationCityId || !goodId) return null;
    const id = String(order.id || '').trim() || createId('order', state?.nextOrderId || 1);
    return {
      id,
      destinationCityId,
      goodId,
      sourceType: String(order.sourceType || 'city').trim() || 'city',
      sourceId: String(order.sourceId || '').trim(),
      frequency: normalizeFrequency(order.frequency),
      dailyDemandKg: normalizeNonNegative(order.dailyDemandKg),
      quantityKg: normalizeNonNegative(order.quantityKg ?? order.dailyDemandKg),
      deliveryDay: normalizeInteger(order.deliveryDay, 1, 1),
      deliveryMinute: normalizeInteger(order.deliveryMinute, 8 * 60, 0, 1439),
      deliveryWeekday: normalizeInteger(order.deliveryWeekday ?? order.weekday ?? 4, 4, 0, 6),
      weekday: normalizeInteger(order.weekday ?? order.deliveryWeekday ?? 4, 4, 0, 6),
      targetStockDays: normalizeFrequency(order.frequency) === 'weekly' ? 7 : 1,
      allowFallback: order.allowFallback !== false,
      openQuantity: normalizeNonNegative(order.openQuantity),
      primarySource: normalizePrimarySource(order.primarySource, order),
      status: normalizeStatus(order.status),
      lastStatus: String(order.lastStatus || 'Noch nicht disponiert'),
    };
  }

  function normalizeDelivery(delivery) {
    if (!delivery || typeof delivery !== 'object') return null;
    const orderId = String(delivery.orderId || '').trim();
    const destinationCityId = String(delivery.destinationCityId || delivery.cityId || '').trim();
    const goodId = String(delivery.goodId || '').trim();
    if (!orderId || !destinationCityId || !goodId) return null;

    const deliveryDay = normalizeInteger(delivery.deliveryDay ?? delivery.scheduledDay, 1, 1);
    const deliveryMinute = normalizeInteger(delivery.deliveryMinute ?? delivery.scheduledMinute, 0, 0, 1439);
    const scheduledDay = normalizeInteger(delivery.scheduledDay ?? delivery.deliveryDay, deliveryDay, 1);
    const scheduledMinute = normalizeInteger(delivery.scheduledMinute ?? delivery.deliveryMinute, deliveryMinute, 0, 1439);
    const quantityKg = normalizeNonNegative(delivery.quantityKg);
    const requestedQuantityKg = normalizeNonNegative(delivery.requestedQuantityKg ?? delivery.quantityKg);
    const plannedQuantityKg = normalizeNonNegative(delivery.plannedQuantityKg ?? delivery.quantityKg ?? requestedQuantityKg);
    const normalized = {
      id: String(delivery.id || '').trim() || createId('delivery', state?.nextDeliveryId || 1),
      orderId,
      destinationCityId,
      goodId,
      sourceType: String(delivery.sourceType || 'city').trim() || 'city',
      sourceId: String(delivery.sourceId || delivery.sourceCityId || '').trim(),
      sourceCityId: String(delivery.sourceCityId || delivery.sourceId || '').trim(),
      requestedQuantityKg,
      quantityKg,
      plannedQuantityKg,
      scheduledDay,
      scheduledMinute,
      deliveryDay,
      deliveryMinute,
      vehicleType: String(delivery.vehicleType || '').trim(),
      vehicleCapacityKg: normalizeNonNegative(delivery.vehicleCapacityKg),
      tripCount: normalizeInteger(delivery.tripCount, 1, 1),
      routeMinutes: normalizeInteger(delivery.routeMinutes, 0, 0),
      roundTripMinutes: normalizeInteger(delivery.roundTripMinutes, 0, 0),
      distanceKm: normalizeNonNegative(delivery.distanceKm),
      transportCost: normalizeNonNegative(delivery.transportCost),
      departedKg: normalizeNonNegative(delivery.departedKg),
      deliveredKg: normalizeNonNegative(delivery.deliveredKg),
      bookedCost: normalizeNonNegative(delivery.bookedCost),
      costBooked: delivery.costBooked === true,
      message: String(delivery.message || ''),
      statusMessage: String(delivery.statusMessage || delivery.message || ''),
      updatedAtMinute: normalizeInteger(delivery.updatedAtMinute, 0, 0),
      status: normalizeDeliveryStatus(delivery.status || 'planned'),
    };

    if ('departureDay' in delivery) normalized.departureDay = normalizeInteger(delivery.departureDay, scheduledDay, 1);
    if ('departureMinute' in delivery) normalized.departureMinute = normalizeInteger(delivery.departureMinute, scheduledMinute, 0, 1439);
    if ('arrivalDay' in delivery) normalized.arrivalDay = normalizeInteger(delivery.arrivalDay, scheduledDay, 1);
    if ('arrivalMinute' in delivery) normalized.arrivalMinute = normalizeInteger(delivery.arrivalMinute, scheduledMinute, 0, 1439);
    if ('vehicleFreeDay' in delivery) normalized.vehicleFreeDay = normalizeInteger(delivery.vehicleFreeDay, scheduledDay, 1);
    if ('vehicleFreeMinute' in delivery) normalized.vehicleFreeMinute = normalizeInteger(delivery.vehicleFreeMinute, scheduledMinute, 0, 1439);
    if ('vehicleFreeAtMinute' in delivery) normalized.vehicleFreeAtMinute = normalizeInteger(delivery.vehicleFreeAtMinute, 0, 0);

    return normalized;
  }

  function normalizePrimarySource(primarySource, order = {}) {
    const sourceType = String(primarySource?.type || order.sourceType || 'city').trim() || 'city';
    const sourceId = String(primarySource?.id || order.sourceId || order.sourceCityId || '').trim();
    return sourceId ? {type: sourceType, id: sourceId} : null;
  }

  function normalizeCounter(value, fallback) {
    return normalizeInteger(value, fallback, 1, Number.MAX_SAFE_INTEGER);
  }

  function normalizeInteger(value, fallback, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const integer = Math.trunc(numeric);
    return integer >= min && integer <= max ? integer : fallback;
  }

  function normalizeNonNegative(value) {
    return Math.max(0, Number(value) || 0);
  }

  function normalizeFrequency(value) {
    const frequency = String(value || DEFAULT_FREQUENCY).trim();
    return VALID_FREQUENCIES.has(frequency) ? frequency : DEFAULT_FREQUENCY;
  }

  function normalizeStatus(value) {
    const status = String(value || DEFAULT_STATUS).trim();
    return VALID_STATUSES.has(status) ? status : DEFAULT_STATUS;
  }

  function normalizeDeliveryStatus(value) {
    const status = String(value || 'planned').trim();
    return VALID_DELIVERY_STATUSES.has(status) ? status : 'planned';
  }

  function createId(prefix, nextId) {
    return `${prefix}-${normalizeCounter(nextId, 1)}`;
  }

  function nextNumericId(items, prefix) {
    return items.reduce((max, item) => {
      const match = String(item.id || '').match(new RegExp(`^${prefix}-(\\d+)$`));
      return match ? Math.max(max, Number(match[1]) || 0) : max;
    }, 0);
  }

  function cityById(cityId) {
    const id = String(cityId || '').trim();
    if (!id) return null;
    const fromMap = window.HFV2CitiesById?.[id];
    if (fromMap) return fromMap;
    const raw = (window.HF_CITY_CATALOG || []).find(city => String(city.id || '').trim() === id);
    if (!raw) return null;
    const coordinates = raw.coordinates || {};
    return {
      ...raw,
      id,
      name: String(raw.name || id),
      lat: Number(raw.lat ?? coordinates.lat),
      lng: Number(raw.lng ?? coordinates.lng),
      tier: Number(raw.tier) || 1,
      slots: Number(raw.slots) || 0,
    };
  }

  function factoryById(factoryId) {
    const id = String(factoryId || '').trim();
    return (window.HFV2FactoryCatalog || []).find(factory => factory.id === id) || null;
  }

  function factoryRecipeOptions(factory) {
    const recipes = Array.isArray(factory?.recipes) ? factory.recipes : [];
    if (recipes.length) return recipes.map(recipe => ({
      id: recipe.id || factory.id,
      name: recipe.name || factory.name,
      outputs: recipe.outputs || recipe.output || {},
    }));
    return [{id: factory?.id, name: factory?.name, outputs: factory?.outputs || factory?.output || {}}];
  }

  function factoryProducesGood(factoryId, goodId) {
    const factory = factoryById(factoryId);
    return factory ? factoryRecipeOptions(factory).some(recipe => Number(recipe.outputs?.[goodId]) > 0) : false;
  }

  function contractTarget(order) {
    const daily = normalizeNonNegative(order?.dailyDemandKg || order?.quantityKg);
    return Math.round(daily * (order?.frequency === 'weekly' ? 7 : 1));
  }

  function absoluteWeekday(day) {
    return (Math.max(1, normalizeInteger(day, 1, 1)) - 1) % 7;
  }

  function contractDue(order, absoluteDay) {
    if (normalizeNonNegative(order?.openQuantity) > 0) return true;
    if (order?.frequency !== 'weekly') return true;
    return absoluteWeekday(absoluteDay) === normalizeInteger(order.deliveryWeekday ?? order.weekday, 4, 0, 6);
  }

  function incomingTo(destinationCityId, goodId) {
    return getState().deliveries.filter(delivery => delivery.destinationCityId === destinationCityId && delivery.goodId === goodId && ['planned', 'running'].includes(delivery.status)).reduce((sum, delivery) => sum + normalizeNonNegative(delivery.quantityKg), 0);
  }

  function contractRequired(order, absoluteDay, actualToday = false) {
    if (!contractDue(order, absoluteDay)) return 0;
    const target = contractTarget(order);
    const open = normalizeNonNegative(order.openQuantity);
    if (!actualToday) return Math.round(Math.max(target, open));
    const stock = Math.max(0, Number(window.HFV2Goods?.getCityInventory?.(order.destinationCityId)?.[order.goodId]) || 0);
    return Math.round(Math.max(open, target - stock - incomingTo(order.destinationCityId, order.goodId), 0));
  }

  function sourceCandidates(destinationCityId, goodId) {
    const destinationId = String(destinationCityId || '').trim();
    const targetGoodId = String(goodId || '').trim();
    if (!destinationId || !targetGoodId) return [];
    const cityFactories = window.HFV2Factories?.getState?.().cityFactories || {};
    return Object.entries(cityFactories).map(([sourceCityId, factoryIds]) => {
      const producingFactoryIds = (Array.isArray(factoryIds) ? factoryIds : []).filter(factoryId => factoryProducesGood(factoryId, targetGoodId));
      if (!producingFactoryIds.length) return null;
      const city = cityById(sourceCityId);
      if (!city) return null;
      const inventoryKg = Math.max(0, Number(window.HFV2Goods?.getCityInventory?.(sourceCityId)?.[targetGoodId]) || 0);
      const estimatedProductionKg = producingFactoryIds.reduce((sum, factoryId) => {
        const estimate = window.HFV2Goods?.estimateCityFactoryProduction?.(sourceCityId, factoryId);
        const producedKg = Number(estimate?.outputs?.[targetGoodId] ?? estimate?.production?.[targetGoodId] ?? estimate?.[targetGoodId] ?? 0) || 0;
        return sum + Math.max(0, producedKg);
      }, 0);
      const path = window.HFNetwork?.findPath?.(sourceCityId, destinationId) || null;
      const reachable = sourceCityId === destinationId || path?.reachable === true;
      const availableKg = inventoryKg + estimatedProductionKg;
      const transportableKg = inventoryKg;
      return {
        city,
        cityId: sourceCityId,
        sourceCityId,
        goodId: targetGoodId,
        factoryIds: producingFactoryIds,
        producesGood: true,
        inventoryKg,
        estimatedProductionKg,
        availableKg,
        transportableKg,
        reachable,
        transportReady: reachable && sourceCityId !== destinationId && transportableKg > 0,
        path,
      };
    }).filter(Boolean).sort((a, b) => Number(b.transportReady) - Number(a.transportReady) || b.availableKg - a.availableKg || a.city.name.localeCompare(b.city.name, 'de-CH'));
  }

  function createOrder(payload = {}) {
    const current = getState();
    const order = normalizeOrder({
      id: payload.id || createId('order', current.nextOrderId),
      ...payload,
    });
    if (!order) throw new Error('destinationCityId and goodId are required');
    if (!order.dailyDemandKg) order.dailyDemandKg = normalizeNonNegative(payload.dailyDemandKg || payload.quantityKg);
    order.quantityKg = normalizeNonNegative(payload.quantityKg ?? contractTarget(order));
    if (!order.primarySource && order.sourceId) order.primarySource = {type: order.sourceType, id: order.sourceId};
    current.orders.push(order);
    current.nextOrderId = Math.max(current.nextOrderId + 1, nextNumericId(current.orders, 'order') + 1);
    if (order.frequency === 'once' && payload.scheduleLegacyDelivery === true) scheduleLegacyDeliveryForOrder(order);
    return order;
  }

  function scheduleLegacyDeliveryForOrder(order) {
    const current = getState();
    const delivery = normalizeDelivery({
      id: createId('delivery', current.nextDeliveryId),
      orderId: order.id,
      destinationCityId: order.destinationCityId,
      goodId: order.goodId,
      sourceType: order.sourceType,
      sourceId: order.sourceId,
      quantityKg: order.quantityKg,
      deliveryDay: order.deliveryDay,
      deliveryMinute: order.deliveryMinute,
      status: 'planned',
    });
    if (!delivery) return null;
    current.deliveries.push(delivery);
    current.nextDeliveryId = Math.max(current.nextDeliveryId + 1, nextNumericId(current.deliveries, 'delivery') + 1);
    return delivery;
  }

  function cancelOrder(orderId) {
    const id = String(orderId || '').trim();
    if (!id) return null;
    const current = getState();
    const order = current.orders.find(item => item.id === id);
    if (!order) return null;
    order.status = 'cancelled';
    current.deliveries.filter(delivery => delivery.orderId === id && delivery.status === 'planned').forEach(delivery => { delivery.status = 'cancelled'; });
    return order;
  }

  function getOrdersForCity(cityId) {
    const id = String(cityId || '').trim();
    return getState().orders.filter(order => order.destinationCityId === id);
  }

  function getDeliveriesForDay(day) {
    const targetDay = normalizeInteger(day, 1, 1);
    return getState().deliveries.filter(delivery => delivery.deliveryDay === targetDay);
  }

  window.HFV2Orders = {createOrderState, configure, getState, normalizeOrderState, contractTarget, contractDue, contractRequired, sourceCandidates, createOrder, cancelOrder, getOrdersForCity, getDeliveriesForDay};
})();
