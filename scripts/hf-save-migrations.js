// Versioned save-state migrations for Helvetic Freight.
(function initHfSaveMigrations(global) {
  'use strict';

  const DEPRECATED_GOODS_SCHEMA = 138;

  const round = value => typeof global.roundCargo === 'function'
    ? global.roundCargo(Number(value) || 0)
    : Math.round((Number(value) || 0) * 1000) / 1000;

  function deprecatedGoods() {
    return new Set(global.HF_GOODS_DATABASE?.deprecations?.goods || []);
  }

  function activeGoods() {
    return new Set(Object.keys(global.HF_GOODS_DATABASE?.goods || {}));
  }

  function purgeDeprecatedGoods(target) {
    const deprecated = deprecatedGoods();
    const allowed = activeGoods();
    if (!deprecated.size && !allowed.size) return target;
    for (const city of Object.values(target?.cities || {})) {
      if (!city || typeof city !== 'object') continue;
      if (city.inventory && typeof city.inventory === 'object') {
        for (const id of deprecated) delete city.inventory[id];
        for (const id of Object.keys(city.inventory)) if (allowed.size && !allowed.has(id)) delete city.inventory[id];
      }
      if (city.demands && typeof city.demands === 'object') {
        for (const id of deprecated) delete city.demands[id];
        for (const id of Object.keys(city.demands)) if (allowed.size && !allowed.has(id)) delete city.demands[id];
      }
    }
    target.deprecatedGoodsSchema = DEPRECATED_GOODS_SCHEMA;
    return target;
  }


  function normalizeLegacySaveV1ToV8(source, context = {}) {
    const target = source;
    if (!target || ![1, 2, 3, 4, 5, 6, 7, 8].includes(target.version)) return null;
    const oldVersion = target.version;
    const transportTypes = context.transportTypes || global.TRANSPORT_TYPES || {};
    const vehicles = context.vehicles || global.VEHICLES || {};
    const cities = context.cities || global.CITIES || [];
    const cityById = context.cityById || global.CITY || Object.fromEntries(cities.map(city => [city.id, city]));
    const createCityState = context.createCityState || global.createCityState;
    const normalizeInventory = context.normalizeInventory || (inventory => inventory || {});
    const makeDemands = context.makeDemands || (() => ({}));

    if (oldVersion === 1) {
      target.connections = (target.connections || []).map(edge => ({
        ...edge,
        type: edge.type === 'road' ? 'mainroad' : edge.type,
        geometry: edge.geometry || null
      }));
    }

    target.connections = (target.connections || []).map(edge => {
      const type = transportTypes[edge.type] ? edge.type : (edge.type === 'road' ? 'mainroad' : 'rail');
      const transport = transportTypes[type] || transportTypes.mainroad || transportTypes.rail || {capacity: 1, maintenanceKm: 0};
      return {
        ...edge,
        type,
        capacity: oldVersion < 3 ? transport.capacity : (edge.capacity || transport.capacity),
        maintenance: oldVersion < 3 ? Math.round(edge.distance * transport.maintenanceKm) : (edge.maintenance || Math.round(edge.distance * transport.maintenanceKm)),
        geometry: edge.geometry || null
      };
    });

    target.routes = (target.routes || []).map(route => {
      const vehicle = vehicles[route.vehicleType] || vehicles.van || {load: 1};
      const count = Math.max(1, Math.floor(route.vehicleCount || 1));
      const amount = count * vehicle.load;
      return {
        ...route,
        vehicleCount: count,
        amountPerDay: amount,
        returnPolicy: route.returnPolicy || 'empty',
        returnGood: route.returnGood || null,
        returnAmount: (route.returnPolicy && route.returnPolicy !== 'empty') ? amount : 0
      };
    });

    target.fleet = target.fleet || {van: 2, lightTruck: 0, heavyTruck: 0, artic: 0, freightTrain: 0};
    Object.keys(vehicles).forEach(key => { target.fleet[key] = target.fleet[key] || 0; });
    target.usedCapacity = {};

    target.shipments = (target.shipments || []).map(shipment => {
      const remainingMinutes = shipment.remainingMinutes ?? Math.max(0, Math.round((shipment.remainingHours ?? shipment.eta ?? 1) * 60));
      const totalMinutes = shipment.totalMinutes ?? Math.max(1, Math.round((shipment.totalHours ?? shipment.eta ?? 1) * 60));
      const phase = shipment.phase || 'outbound';
      const currentNode = shipment.currentNode || (phase === 'awaiting_return' ? (shipment.destination || shipment.to) : (shipment.from || shipment.home));
      const next = {
        ...shipment,
        vehicleType: shipment.vehicleType || 'van',
        remainingMinutes,
        totalMinutes,
        edgeIds: shipment.edgeIds || [],
        trips: shipment.trips || 1,
        home: shipment.home || shipment.from,
        destination: shipment.destination || shipment.to,
        phase,
        returnPolicy: shipment.returnPolicy || 'empty',
        returnGood: shipment.returnGood || null,
        returnAmount: shipment.returnAmount || 0,
        waitingReason: shipment.waitingReason || '',
        movementStatus: phase === 'awaiting_return' ? 'waiting_return' : (oldVersion >= 8 ? (shipment.movementStatus || 'queued') : 'queued'),
        currentEdgeIndex: oldVersion >= 8 ? (shipment.currentEdgeIndex || 0) : 0,
        currentNode,
        edgeRemainingMinutes: oldVersion >= 8 ? (shipment.edgeRemainingMinutes || 0) : 0,
        edgeTotalMinutes: oldVersion >= 8 ? (shipment.edgeTotalMinutes || 0) : 0
      };
      delete next.eta;
      delete next.remainingHours;
      delete next.totalHours;
      return next;
    });

    target.usedVehicles = {};
    target.shipments.forEach(shipment => {
      target.usedVehicles[shipment.vehicleType] = (target.usedVehicles[shipment.vehicleType] || 0) + (shipment.trips || 1);
    });

    target.cities = target.cities || {};
    cities.forEach(city => {
      if (!target.cities[city.id]) {
        target.cities[city.id] = typeof createCityState === 'function' ? createCityState(city) : {inventory: {}, facilities: [], demands: {}};
      } else {
        target.cities[city.id].inventory = normalizeInventory(target.cities[city.id].inventory);
        target.cities[city.id].facilities = target.cities[city.id].facilities || [];
        target.cities[city.id].demands = target.cities[city.id].demands || makeDemands(city);
        target.cities[city.id].sales = target.cities[city.id].sales || 0;
      }
    });

    if (!target.selected || !cityById[target.selected]) target.selected = 'zurich';
    target.hour = Number.isFinite(target.hour) ? Math.floor(target.hour) : 8;
    target.minute = Number.isFinite(target.minute) ? Math.floor(target.minute) : 0;
    target.version = 8;
    return target;
  }

  function migrateSaveState(source, context = {}) {
    const target = normalizeLegacySaveV1ToV8(source, context);
    if (!target) return null;
    for (const migration of global.HF_SAVE_MIGRATIONS || []) {
      if (!migration?.schemaKey || !(Number(target?.[migration.schemaKey]) >= Number(migration.schemaVersion))) {
        try { migration?.migrate?.(target); } catch (err) { console.warn('Save-Migration fehlgeschlagen', migration?.id, err); }
      }
    }
    return target;
  }

  global.HF_SAVE_MIGRATIONS = Object.freeze([
    Object.freeze({
      id: 'deprecated-goods-cleanup-v138',
      schemaKey: 'deprecatedGoodsSchema',
      schemaVersion: DEPRECATED_GOODS_SCHEMA,
      buildVersion: global.hfCurrentBuildVersion?.() || global.HF_BUILD_VERSION || '1.1.38',
      description: 'Removes deprecated goods from city inventories and demand slots using HF_GOODS_DATABASE.',
      migrate: purgeDeprecatedGoods
    }),
    Object.freeze({
      id: 'sissach-demand-v137',
      schemaKey: 'sissachDemandSchema',
      schemaVersion: 137,
      buildVersion: '1.1.37',
      description: 'Migrates existing Sissach demand slots to the structured small_town_plus profile.',
      migrate(target) {
        const profile = global.HF_DEMAND_DATABASE?.cityDemandProfiles?.sissach;
        const city = target?.cities?.sissach;
        if (!profile || !city) return target;
        const deprecated = deprecatedGoods();
        city.inventory = city.inventory || {};
        city.demands = city.demands || {};
        const goods = Object.fromEntries(
          Object.entries(profile.goods || {}).filter(([good]) => !deprecated.has(good) && global.HF_GOODS_DATABASE?.goods?.[good])
        );
        for (const [good, preset] of Object.entries(goods)) {
          if (!Number.isFinite(Number(city.inventory[good]))) city.inventory[good] = 0;
          const previous = city.demands[good] && typeof city.demands[good] === 'object' ? city.demands[good] : {};
          const max = Math.max(0, Number(previous.max) || 0, Number(preset.max) || 0);
          city.demands[good] = {
            ...previous,
            max: round(max),
            need: round(Math.min(max, Math.max(Number(previous.need) || 0, max * 0.62))),
            mult: Number(previous.mult) > 0 ? Math.max(Number(previous.mult), Number(preset.mult) || 1) : Number(preset.mult) || 1,
            dailyRate: Number(preset.dailyRate)
          };
        }
        purgeDeprecatedGoods(target);
        target.sissachDemandSchema = 137;
        target.sissachDemandProfile = 'small_town_plus';
        return target;
      }
    })
  ]);

  global.HF_NORMALIZE_SAVE_V1_TO_V8 = normalizeLegacySaveV1ToV8;
  global.HF_MIGRATE_SAVE_STATE = migrateSaveState;
})(window);
