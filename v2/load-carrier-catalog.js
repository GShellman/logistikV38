(() => {
  'use strict';

  const VISUAL_KINDS = Object.freeze(['slot', 'bulk', 'liquid', 'container']);

  const LOAD_CARRIER_CATALOG = Object.freeze({
    loose: Object.freeze({id: 'loose', name: 'Lose Ware', visualKind: 'bulk', label: 'Laderaum', capacityMode: 'proportional', color: '#b7791f', tareKg: 0, footprintM2: 0, depositValue: 0, baseHandlingMinutes: 10, loadingMinutesPerCarrier: 0, unloadingMinutesPerCarrier: 0}),
    'euro-pallet': Object.freeze({id: 'euro-pallet', name: 'Europalette', visualKind: 'slot', label: 'Palettenstellplatz', capacityMode: 'discrete', color: '#2563eb', tareKg: 25, footprintM2: 0.96, depositValue: 25, baseHandlingMinutes: 10, loadingMinutesPerCarrier: 3, unloadingMinutesPerCarrier: 2}),
    'industrial-pallet': Object.freeze({id: 'industrial-pallet', name: 'Industriepalette', visualKind: 'slot', label: 'Palettenstellplatz', capacityMode: 'discrete', color: '#475569', tareKg: 30, footprintM2: 1.2, depositValue: 30, baseHandlingMinutes: 12, loadingMinutesPerCarrier: 4, unloadingMinutesPerCarrier: 3}),
    'swap-body': Object.freeze({
      id: 'swap-body', name: 'Straßentauglicher Wechselbehälter', visualKind: 'container', label: 'Wechselbehälter', capacityMode: 'proportional', color: '#0f766e', roadworthy: true,
      netCapacityKg: 10000, tareKg: 2500, footprintM2: 18, rentalPrice: 180,
      baseHandlingMinutes: 15, loadingMinutesPerCarrier: 8, unloadingMinutesPerCarrier: 6,
      allowedGoodsGroups: Object.freeze(['industrial_material', 'vegetable', 'fruit', 'processed_food', 'consumer_goods']),
    }),
  });

  function carrierFor(good, strategy = 'default') {
    if (strategy === 'swap-body') return LOAD_CARRIER_CATALOG['swap-body'];
    if (strategy === 'pallet') return LOAD_CARRIER_CATALOG['euro-pallet'];
    const profile = good?.packaging || {loadCarrier: 'loose'};
    return LOAD_CARRIER_CATALOG[profile.loadCarrier] || LOAD_CARRIER_CATALOG.loose;
  }

  function supportsGood(carrierId, goodId) {
    const carrier = LOAD_CARRIER_CATALOG[carrierId];
    const good = (window.HFV2GoodsCatalog || []).find(item => item.id === String(goodId));
    return Boolean(carrier && good && (!carrier.allowedGoodsGroups || carrier.allowedGoodsGroups.includes(good.category)));
  }

  function metrics(goodId, amountKg, strategy = 'default', options = {}) {
    const netKg = Math.max(0, Number(amountKg) || 0);
    const good = (window.HFV2GoodsCatalog || []).find(item => item.id === String(goodId));
    const profile = good?.packaging || {loadCarrier: 'loose'};
    const carrier = carrierFor(good, strategy);
    const maxNetKg = carrier.id === 'swap-body' ? Number(carrier.netCapacityKg) : Number(profile.maxNetKgPerCarrier || (strategy === 'pallet' ? 700 : 0));
    const incompatible = !supportsGood(carrier.id, goodId) && carrier.allowedGoodsGroups;
    const calculatedCount = carrier.id === 'loose' || !(maxNetKg > 0) || incompatible ? 0 : Math.ceil(netKg / maxNetKg);
    const carrierCount = options.deferCount === true && carrier.id === 'swap-body' ? 0 : calculatedCount;
    const tarePerCarrier = Number.isFinite(Number(profile.carrierTareKg)) ? Math.max(0, Number(profile.carrierTareKg)) : carrier.tareKg;
    const effectiveTare = carrier.id === 'swap-body' ? carrier.tareKg : tarePerCarrier;
    const tareKg = carrierCount * effectiveTare;
    const result = {loadCarrier: carrier.id, carrierCount, netKg, tareKg, grossKg: netKg + tareKg, stackable: carrier.id === 'swap-body' ? false : profile.stackable !== false};
    if (carrier.id === 'swap-body') Object.assign(result, {maxNetKgPerCarrier: maxNetKg, rentalCost: carrierCount * carrier.rentalPrice, compatibleGood: !incompatible});
    return result;
  }

  window.HFV2LoadCarrierCatalog = Object.freeze({LOAD_CARRIER_CATALOG, VISUAL_KINDS, metrics, supportsGood});
})();
