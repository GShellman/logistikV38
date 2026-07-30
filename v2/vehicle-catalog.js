(() => {
  'use strict';

  const LOAD_REGION_KINDS = Object.freeze(['slot', 'bulk', 'liquid', 'container']);

  const VEHICLE_CATALOG = {
    'fluto-gianco': {
      id: 'fluto-gianco',
      brandId: 'fluto',
      brand: 'Fluto',
      model: 'Gianco',
      category: 'Transporter',
      name: 'Fluto Gianco',
      icon: '🚐',
      mode: 'road',
      load: 2,
      palletSlots: 4,
      euroPalletSlots: 4,
      containerSlots: 2,
      loadRegions: Object.freeze([{id: 'deck', label: 'Laderaum', visualKind: 'slot', capacityMode: 'discrete', slotCount: 4, capacityKg: 2000}]),
      supportedLoadCarriers: Object.freeze(['loose', 'euro-pallet', 'industrial-pallet']),
      speed: 82,
      cost: 32000,
      daily: 200,
      kmCost: 4.4,
      desc: 'Wendiger Transporter mit 2 t Nutzlast für schnelle Stadt- und Regionaltransporte.',
    },
    'fluto-gianco-fr': {
      id: 'fluto-gianco-fr',
      brandId: 'fluto',
      brand: 'Fluto',
      model: 'Gianco FR',
      category: 'Kühltransporter',
      name: 'Fluto Gianco FR',
      icon: '❄️',
      mode: 'road',
      refrigerated: true,
      load: 1.7,
      palletSlots: 3,
      euroPalletSlots: 3,
      containerSlots: 1,
      loadRegions: Object.freeze([{id: 'deck', label: 'Kühl-Laderaum', visualKind: 'slot', capacityMode: 'discrete', slotCount: 3, capacityKg: 1700}]),
      supportedLoadCarriers: Object.freeze(['loose', 'euro-pallet', 'industrial-pallet']),
      speed: 80,
      cost: 41000,
      daily: 310,
      kmCost: 5.2,
      desc: 'Kompakter Kühltransporter für temperaturempfindliche Waren und eine zuverlässige Kühlkette in Stadt und Region.',
    },
    'pcp-mr3': {
      id: 'pcp-mr3',
      brandId: 'pcp',
      brand: 'PCP',
      model: 'MR3',
      category: 'Transporter',
      name: 'PCP MR3',
      icon: '🚐',
      mode: 'road',
      load: 3.2,
      palletSlots: 6,
      euroPalletSlots: 6,
      containerSlots: 3,
      speed: 76,
      cost: 48000,
      daily: 280,
      kmCost: 5.8,
      supportedLoadCarriers: Object.freeze(['loose', 'euro-pallet', 'industrial-pallet']),
      loadRegions: Object.freeze([{id: 'deck', label: 'Laderaum', visualKind: 'slot', capacityMode: 'discrete', slotCount: 6, capacityKg: 3200}]),
      desc: 'Geräumiger Transporter mit 3,2 t Nutzlast für größere regionale Lieferungen und gebündelte Stadttransporte.',
    },
  };

  const VEHICLE_TYPES = Object.freeze(Object.keys(VEHICLE_CATALOG));

  window.HFVehicleCatalog = Object.freeze({
    VEHICLE_CATALOG: Object.freeze(VEHICLE_CATALOG),
    VEHICLE_TYPES,
    LOAD_REGION_KINDS,
  });
})();
