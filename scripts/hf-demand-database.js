// Central demand database for Helvetic Freight.
// Contains only demand/profile data. Calculation logic lives in the content registry.
(function initHfDemandDatabase(global) {
  'use strict';

  const SCHEMA_VERSION = 1;

  const demandProfiles = Object.freeze({
    industrial: {id: 'industrial', name: 'Industrieware', enabled: false, dailyRate: 0},
    staple_crop: {id: 'staple_crop', name: 'Grundnahrungsmittel', enabled: true, ratio: 1, referenceGoods: ['food'], minDailyKg: 5, dailyRate: 1},
    common_vegetable: {id: 'common_vegetable', name: 'Gängiges Gemüse', enabled: true, ratio: 1, referenceGoods: ['zucchini', 'tomatoes'], minDailyKg: 5, dailyRate: 1},
    common_fruit: {id: 'common_fruit', name: 'Gängiges Obst', enabled: true, ratio: 1, referenceGoods: ['apples', 'pears'], minDailyKg: 5, dailyRate: 1},
    niche_fruit: {id: 'niche_fruit', name: 'Saisonales Obst', enabled: true, ratio: 0.4, referenceGoods: ['apples', 'pears'], capReferenceGood: 'zucchini', capRatio: 0.75, minDailyKg: 5, dailyRate: 1},
    canned_food: {id: 'canned_food', name: 'Konserven', enabled: true, ratio: 0.14, referenceGoods: ['food'], minDailyKg: 1, dailyRate: 0.14},
    fresh_food: {id: 'fresh_food', name: 'Frische Lebensmittel', enabled: true, ratio: 1, referenceGoods: ['fish'], minDailyKg: 5, dailyRate: 1},
    consumer_good: {id: 'consumer_good', name: 'Konsumgut', enabled: true, ratio: 1, referenceGoods: [], minDailyKg: 1, dailyRate: 0.22}
  });


  const demandProfileFactors = Object.freeze({
    metropolis: {consumer_goods: 1.12, processed_food: 1.06, fruit: 1.08, vegetable: 1.04},
    tourism: {processed_food: 1.12, fresh_food: 1.1, animal_products: 1.08, fruit: 1.08},
    industrial: {consumer_goods: 1.06, industrial_material: 1.12, processed_food: 0.98},
    alpine: {staple_crop: 1.08, vegetable: 0.94, fruit: 0.96, processed_food: 1.08},
    rural: {staple_crop: 1.1, vegetable: 1.03, consumer_goods: 0.9, processed_food: 1.04},
    border: {consumer_goods: 1.08, processed_food: 1.06},
    logistics: {processed_food: 1.08, consumer_goods: 1.04}
  });

  const cityDemandProfiles = Object.freeze({
    sissach: Object.freeze({
      id: 'sissach',
      cityId: 'sissach',
      profile: 'small_town_plus',
      schema: 137,
      goods: Object.freeze({
        pork: {max: 46, mult: 1.08, dailyRate: 0.22},
        fish: {max: 20, mult: 1.12, dailyRate: 1},
        tomatoes: {max: 38, mult: 1.05, dailyRate: 1},
        zucchini: {max: 36, mult: 1.02, dailyRate: 1},
        apples: {max: 64, mult: 1.04, dailyRate: 1},
        pears: {max: 60, mult: 1.04, dailyRate: 1},
        cherries: {max: 24, mult: 1.08, dailyRate: 1},
        potatoes: {max: 62, mult: 1, dailyRate: 1},
        corn: {max: 46, mult: 1.03, dailyRate: 1},
        ravioli_meat: {max: 18, mult: 1.17, dailyRate: 0.22},
        ravioli_veg: {max: 20, mult: 1.14, dailyRate: 0.22},
        tomato_cans: {max: 14, mult: 1.08, dailyRate: 0.14},
        canned_corn: {max: 12, mult: 1.08, dailyRate: 0.14},
        canned_peas: {max: 12, mult: 1.08, dailyRate: 0.14}
      })
    })
  });

  const database = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    buildVersion: global.hfCurrentBuildVersion?.() || global.HF_BUILD_VERSION || '1.1.38',
    demandProfiles,
    demandProfileFactors,
    cityDemandProfiles
  });

  global.HF_DEMAND_DATABASE = database;
  global.HF_DEMAND_CONTENT_PACK = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    buildVersion: database.buildVersion,
    demandProfiles: Object.values(demandProfiles),
    demandProfileFactors,
    cityDemandProfiles: Object.values(cityDemandProfiles)
  });
})(window);
