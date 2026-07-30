(() => {
  'use strict';

  function vehicleSpec(vehicleOrType) {
    if (vehicleOrType && typeof vehicleOrType === 'object') return vehicleOrType;
    return window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicleOrType]
      || window.HFFleet?.VEHICLES?.[vehicleOrType]
      || {};
  }

  function limits(vehicleOrType, vehicleCount = 1) {
    const vehicle = vehicleSpec(vehicleOrType);
    const count = Math.max(0, Math.trunc(Number(vehicleCount) || 0));
    const load = Number(vehicle.load);
    const grossKg = Number.isFinite(load) && load > 0 ? (load < 100 ? load * 1000 : load) * count : 0;
    const palletSlots = Math.max(0, Math.trunc(Number(vehicle.palletSlots) || 0)) * count;
    return {
      grossKg,
      palletSlots,
      euroPalletSlots: Math.max(0, Math.trunc(Number(vehicle.euroPalletSlots ?? vehicle.palletSlots) || 0)) * count,
      containerSlots: Math.max(0, Math.trunc(Number(vehicle.containerSlots ?? vehicle.palletSlots) || 0)) * count,
    };
  }

  function usage(cargoes) {
    const list = Array.isArray(cargoes) ? cargoes : [cargoes];
    return list.filter(Boolean).reduce((total, cargo) => {
      const carrierCount = Math.max(0, Math.trunc(Number(cargo.carrierCount) || 0));
      total.grossKg += Math.max(0, Number(cargo.grossKg ?? cargo.amountKg) || 0);
      total.palletSlots += carrierCount;
      if (cargo.loadCarrier === 'euro-pallet') total.euroPalletSlots += carrierCount;
      if (cargo.loadCarrier === 'container' || cargo.loadCarrier === 'swap-body') total.containerSlots += carrierCount;
      return total;
    }, {grossKg: 0, palletSlots: 0, euroPalletSlots: 0, containerSlots: 0});
  }

  function evaluate(vehicleOrType, cargoes, vehicleCount = 1) {
    const vehicle = vehicleSpec(vehicleOrType);
    const supported = Array.isArray(vehicle.supportedLoadCarriers) ? vehicle.supportedLoadCarriers : ['loose', 'euro-pallet', 'industrial-pallet'];
    const incompatible = (Array.isArray(cargoes) ? cargoes : [cargoes]).filter(Boolean).some(cargo => cargo.loadCarrier && !supported.includes(cargo.loadCarrier));
    const used = usage(cargoes);
    const capacity = limits(vehicleOrType, vehicleCount);
    const exceeded = [];
    if (incompatible) exceeded.push('load-carrier');
    if (!(capacity.grossKg > 0) || used.grossKg > capacity.grossKg + 1e-7) exceeded.push('weight');
    if (used.palletSlots > capacity.palletSlots) exceeded.push('volume');
    if (used.euroPalletSlots > capacity.euroPalletSlots) exceeded.push('volume');
    if (used.containerSlots > capacity.containerSlots) exceeded.push('volume');
    const weightRatio = capacity.grossKg > 0 ? used.grossKg / capacity.grossKg : Infinity;
    const slotRatios = [
      capacity.palletSlots > 0 ? used.palletSlots / capacity.palletSlots : (used.palletSlots ? Infinity : 0),
      capacity.euroPalletSlots > 0 ? used.euroPalletSlots / capacity.euroPalletSlots : (used.euroPalletSlots ? Infinity : 0),
      capacity.containerSlots > 0 ? used.containerSlots / capacity.containerSlots : (used.containerSlots ? Infinity : 0),
    ];
    const volumeRatio = Math.max(...slotRatios);
    return {
      ok: exceeded.length === 0,
      exceeded: [...new Set(exceeded)],
      limitingFactor: volumeRatio > weightRatio ? 'volume' : 'weight',
      usage: used,
      capacity,
      weightRatio,
      volumeRatio,
    };
  }

  function requiredVehicleCount(vehicleOrType, cargoes) {
    const list = Array.isArray(cargoes) ? cargoes : [cargoes];
    const supported = vehicleSpec(vehicleOrType).supportedLoadCarriers || ['loose', 'euro-pallet', 'industrial-pallet'];
    if (list.some(cargo => cargo?.loadCarrier && !supported.includes(cargo.loadCarrier))) return Infinity;
    const one = limits(vehicleOrType, 1);
    const used = usage(cargoes);
    if (!(one.grossKg > 0)) return 0;
    const requirements = [Math.ceil(used.grossKg / one.grossKg)];
    if (used.palletSlots) requirements.push(one.palletSlots > 0 ? Math.ceil(used.palletSlots / one.palletSlots) : Infinity);
    if (used.euroPalletSlots) requirements.push(one.euroPalletSlots > 0 ? Math.ceil(used.euroPalletSlots / one.euroPalletSlots) : Infinity);
    if (used.containerSlots) requirements.push(one.containerSlots > 0 ? Math.ceil(used.containerSlots / one.containerSlots) : Infinity);
    return Math.max(...requirements);
  }

  window.HFV2VehicleCapacity = Object.freeze({limits, usage, evaluate, requiredVehicleCount});
})();
