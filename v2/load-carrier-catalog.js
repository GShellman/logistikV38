(() => {
  'use strict';

  const LOAD_CARRIER_CATALOG = Object.freeze({
    loose: Object.freeze({id: 'loose', name: 'Lose Ware', tareKg: 0, footprintM2: 0, depositValue: 0}),
    'euro-pallet': Object.freeze({id: 'euro-pallet', name: 'Europalette', tareKg: 25, footprintM2: 0.96, depositValue: 25}),
    'industrial-pallet': Object.freeze({id: 'industrial-pallet', name: 'Industriepalette', tareKg: 30, footprintM2: 1.2, depositValue: 30}),
  });

  function metrics(goodId, amountKg) {
    const netKg = Math.max(0, Number(amountKg) || 0);
    const good = (window.HFV2GoodsCatalog || []).find(item => item.id === String(goodId));
    const profile = good?.packaging || {loadCarrier: 'loose'};
    const carrier = LOAD_CARRIER_CATALOG[profile.loadCarrier] || LOAD_CARRIER_CATALOG.loose;
    const maxNetKg = Number(profile.maxNetKgPerCarrier);
    const carrierCount = carrier.id === 'loose' || !(maxNetKg > 0) ? 0 : Math.ceil(netKg / maxNetKg);
    const tarePerCarrier = Number.isFinite(Number(profile.carrierTareKg)) ? Math.max(0, Number(profile.carrierTareKg)) : carrier.tareKg;
    const tareKg = carrierCount * tarePerCarrier;
    return {loadCarrier: carrier.id, carrierCount, netKg, tareKg, grossKg: netKg + tareKg, stackable: profile.stackable !== false};
  }

  window.HFV2LoadCarrierCatalog = Object.freeze({LOAD_CARRIER_CATALOG, metrics});
})();
