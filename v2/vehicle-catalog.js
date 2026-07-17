(() => {
  'use strict';

  const VEHICLE_CATALOG = {
    van: {
      id: 'van',
      name: 'Lieferwagen',
      icon: '🚐',
      mode: 'road',
      load: 2,
      speed: 80,
      cost: 28000,
      daily: 180,
      kmCost: 4.2,
      desc: 'Klein, flexibel und auf jeder Straße einsetzbar.',
    },
    lightTruck: {
      id: 'lightTruck',
      name: 'Leicht-LKW',
      icon: '🚚',
      mode: 'road',
      load: 5,
      speed: 85,
      cost: 65000,
      daily: 420,
      kmCost: 6.2,
      desc: 'Flexibler LKW, der auf allen Straßen eingesetzt werden kann.',
    },
    heavyTruck: {
      id: 'heavyTruck',
      name: 'Schwer-LKW',
      icon: '🚛',
      mode: 'road',
      load: 9,
      speed: 80,
      cost: 115000,
      daily: 760,
      kmCost: 8.8,
      desc: 'Hohe Nutzlast und auf allen Straßen einsetzbar.',
    },
    artic: {
      id: 'artic',
      name: 'Sattelzug',
      icon: '🚛',
      mode: 'road',
      load: 14,
      speed: 78,
      cost: 175000,
      daily: 1180,
      kmCost: 11.8,
      desc: 'Effizient für große Mengen und auf allen Straßen einsetzbar.',
    },
    reefer: {
      id: 'reefer',
      name: 'Kühl-LKW',
      icon: '🧊',
      mode: 'road',
      load: 8,
      speed: 82,
      cost: 118000,
      daily: 2100,
      kmCost: 8.8,
      desc: 'Für Fisch und andere Kühlwaren. Hält die Kühlkette ein und fährt auf allen Straßen.',
    },
    tipper: {
      id: 'tipper',
      name: 'Kipplaster',
      icon: '🚛',
      mode: 'road',
      load: 16000,
      speed: 72,
      cost: 152000,
      daily: 940,
      kmCost: 9.6,
      desc: 'Spezialfahrzeug für Schüttgut wie Getreide, Erz und Aluminiumerz. Auf allen Straßen einsetzbar.',
    },
  };

  const VEHICLE_TYPES = Object.freeze(Object.keys(VEHICLE_CATALOG));

  window.HFVehicleCatalog = Object.freeze({
    VEHICLE_CATALOG: Object.freeze(VEHICLE_CATALOG),
    VEHICLE_TYPES,
  });
})();
