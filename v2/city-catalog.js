(() => {
  'use strict';

  if (Array.isArray(window.HF_CITY_CATALOG) && window.HF_CITY_CATALOG.length) return;

  const city = (id, name, lat, lng, tier, slots, population, wealthFactor = 1, demandProfile = 'standard') => Object.freeze({
    id,
    name,
    coordinates: Object.freeze({lat, lng}),
    lat,
    lng,
    tier,
    slots,
    population,
    wealthFactor,
    demandProfile,
  });

  window.HF_CITY_CATALOG = Object.freeze([
    city('zurich', 'Zürich', 47.3769, 8.5417, 3, 8, 421878, 1.28, 'metropole'),
    city('geneva', 'Genf', 46.2044, 6.1432, 3, 7, 203951, 1.24, 'metropole'),
    city('basel', 'Basel', 47.5596, 7.5886, 3, 7, 177595, 1.2, 'industrial'),
    city('bern', 'Bern', 46.948, 7.4474, 3, 7, 134591, 1.15, 'administrative'),
    city('lausanne', 'Lausanne', 46.5197, 6.6323, 3, 6, 140202, 1.16, 'metropole'),
    city('winterthur', 'Winterthur', 47.4999, 8.7376, 2, 5, 116906, 1.05, 'industrial'),
    city('lucerne', 'Luzern', 47.0502, 8.3093, 2, 5, 82566, 1.12, 'standard'),
    city('st_gallen', 'St. Gallen', 47.4245, 9.3767, 2, 5, 75833, 1.04, 'industrial'),
    city('lugano', 'Lugano', 46.0037, 8.9511, 2, 5, 62315, 1.13, 'standard'),
    city('biel', 'Biel/Bienne', 47.1368, 7.2468, 2, 4, 55159, 1.02, 'industrial'),
    city('thun', 'Thun', 46.7512, 7.6217, 2, 4, 43850, 1.02, 'standard'),
    city('koeniz', 'Köniz', 46.9244, 7.4146, 2, 4, 42388, 1.04, 'standard'),
    city('la_chaux_de_fonds', 'La Chaux-de-Fonds', 47.1035, 6.8328, 2, 4, 36748, 0.98, 'industrial'),
    city('schaffhausen', 'Schaffhausen', 47.6973, 8.6349, 2, 4, 36604, 1.01, 'industrial'),
    city('fribourg', 'Fribourg', 46.8065, 7.1619, 2, 4, 38365, 1.04, 'standard'),
    city('chur', 'Chur', 46.8508, 9.532, 2, 4, 35608, 1.0, 'standard'),
    city('neuchatel', 'Neuchâtel', 46.9929, 6.931, 2, 4, 33515, 1.06, 'standard'),
    city('zug', 'Zug', 47.1662, 8.5155, 2, 4, 30934, 1.35, 'metropole'),
    city('sion', 'Sion', 46.2331, 7.3606, 2, 4, 34978, 1.0, 'standard'),
    city('aarau', 'Aarau', 47.3904, 8.0457, 2, 4, 21773, 1.06, 'standard'),
    city('solothurn', 'Solothurn', 47.2088, 7.5323, 1, 3, 16777, 1.0, 'standard'),
    city('olten', 'Olten', 47.3499, 7.9033, 1, 3, 19053, 1.0, 'industrial'),
    city('baden', 'Baden', 47.4733, 8.3059, 1, 3, 19547, 1.08, 'industrial'),
    city('rapperswil', 'Rapperswil-Jona', 47.2267, 8.8186, 1, 3, 27277, 1.08, 'standard'),
    city('bellinzona', 'Bellinzona', 46.1956, 9.0238, 1, 3, 43899, 1.0, 'standard'),
    city('locarno', 'Locarno', 46.1695, 8.7954, 1, 3, 15776, 1.03, 'standard'),
    city('interlaken', 'Interlaken', 46.6863, 7.8632, 1, 3, 5610, 1.08, 'standard'),
    city('brig', 'Brig-Glis', 46.3167, 7.9833, 1, 3, 13331, 1.0, 'standard'),
    city('davos', 'Davos', 46.8027, 9.8352, 1, 3, 10732, 1.1, 'standard'),
    city('st_moritz', 'St. Moritz', 46.4983, 9.839, 1, 3, 4928, 1.18, 'standard'),
  ]);
})();
