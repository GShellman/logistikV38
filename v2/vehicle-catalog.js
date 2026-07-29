(() => {
  'use strict';

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
      speed: 80,
      cost: 41000,
      daily: 310,
      kmCost: 5.2,
      desc: 'Kompakter Kühltransporter für temperaturempfindliche Waren und eine zuverlässige Kühlkette in Stadt und Region.',
    },
  };

  const VEHICLE_TYPES = Object.freeze(Object.keys(VEHICLE_CATALOG));

  window.HFVehicleCatalog = Object.freeze({
    VEHICLE_CATALOG: Object.freeze(VEHICLE_CATALOG),
    VEHICLE_TYPES,
  });
})();
