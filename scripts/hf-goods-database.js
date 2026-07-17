// Central goods database for Helvetic Freight.
//
// The HTML bootstrap consumes this data through window.HF_CONTENT.applyContentPack(...)
// after its legacy content registry has been initialized.
(function initHfGoodsDatabase(global) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const KG_UNIT = Object.freeze({unit: 'kg', kgPerUnit: 1, step: 1});
  const TON_UNIT = Object.freeze({unit: 't', kgPerUnit: 1000, step: 0.1});
  const LITER_CHEMICAL_UNIT = Object.freeze({unit: 'L', kgPerUnit: 1.1, step: 10});
  const PIECE_40KG_UNIT = Object.freeze({unit: 'Stk.', kgPerUnit: 40, step: 1});
  const PIECE_5KG_UNIT = Object.freeze({unit: 'Stk.', kgPerUnit: 5, step: 1});
  const CAN_UNIT = Object.freeze({unit: 'Stk.', kgPerUnit: 0.08, step: 10});
  const RAVIOLI_MEAT_UNIT = Object.freeze({unit: 'Stk.', kgPerUnit: 0.45, step: 10});
  const RAVIOLI_VEG_UNIT = Object.freeze({unit: 'Stk.', kgPerUnit: 0.455, step: 10});

  const unitByGood = Object.freeze({
    grain: TON_UNIT,
    wood: TON_UNIT,
    ore: TON_UNIT,
    aluminum_ore: TON_UNIT,
    chemicals: LITER_CHEMICAL_UNIT,
    furniture: PIECE_40KG_UNIT,
    electronics: PIECE_5KG_UNIT,
    cans: CAN_UNIT,
    ravioli_meat: RAVIOLI_MEAT_UNIT,
    ravioli_veg: RAVIOLI_VEG_UNIT,
    tomato_cans: RAVIOLI_MEAT_UNIT,
    canned_corn: RAVIOLI_MEAT_UNIT,
    canned_peas: RAVIOLI_MEAT_UNIT
  });

  const vehicleGroups = Object.freeze({
    general: {id: 'general', name: 'Stückgut', vehicles: ['van', 'lightTruck', 'heavyTruck', 'artic', 'freightTrain']},
    refrigerated: {id: 'refrigerated', name: 'Kühltransport', vehicles: ['reefer', 'freightTrain']},
    bulk: {id: 'bulk', name: 'Schüttgut', vehicles: ['tipper', 'freightTrain']},
    livestock: {id: 'livestock', name: 'Tiertransport', vehicles: ['lightTruck', 'heavyTruck', 'artic', 'freightTrain']},
    rail: {id: 'rail', name: 'Bahn', vehicles: ['freightTrain']}
  });

  const goods = Object.freeze({
    grain: good('grain', 'Getreide', '🌾', 'industrial_material', {rawMaterial: true}, demandOff(), ['bulk']),
    wood: good('wood', 'Holz', '🪵', 'industrial_material', {rawMaterial: true}, demandOff(), ['general']),
    ore: good('ore', 'Erz', '⛏️', 'industrial_material', {rawMaterial: true}, demandOff(), ['bulk']),
    chemicals: good('chemicals', 'Chemikalien', '⚗️', 'industrial_material', {rawMaterial: true}, demandOff(), ['general']),
    aluminum_ore: good('aluminum_ore', 'Aluminiumerz', '⛏️', 'industrial_material', {rawMaterial: true}, demandOff(), ['bulk']),
    aluminum: good('aluminum', 'Aluminium', '🔩', 'industrial_material', {}, demandOff(), ['general']),
    cans: good('cans', 'Konservendosen', '🥫', 'industrial_material', {}, demandOff(), ['general']),

    tomatoes: good('tomatoes', 'Tomaten', '🍅', 'vegetable', {rawMaterial: true, perishable: true}, demandCanonical('common_vegetable', 1, ['zucchini'], 1, {baseDemandPer100kKg: 138, wealthElasticity: 0.1, priceWealthSensitivity: 0.15, regionalVariance: 0.12}), ['general'], 1.1),
    zucchini: good('zucchini', 'Zucchini', '🥒', 'vegetable', {rawMaterial: true, perishable: true}, demandCanonical('common_vegetable', 1, ['tomatoes'], 1, {baseDemandPer100kKg: 132, wealthElasticity: 0.08, priceWealthSensitivity: 0.12, regionalVariance: 0.12}), ['general'], 1),
    potatoes: good('potatoes', 'Kartoffeln', '🥔', 'vegetable', {rawMaterial: true}, demandCanonical('staple_crop', 1, ['food'], 1, {baseDemandPer100kKg: 240, wealthElasticity: -0.05, priceWealthSensitivity: 0.05, regionalVariance: 0.1}), ['bulk'], 0.8),
    corn: good('corn', 'Mais', '🌽', 'vegetable', {rawMaterial: true}, demandCanonical('common_vegetable', 1, ['zucchini', 'tomatoes'], 1, {baseDemandPer100kKg: 175, wealthElasticity: 0.05, priceWealthSensitivity: 0.08, regionalVariance: 0.12}), ['bulk'], 0.9),
    peas: good('peas', 'Erbsen', '🫛', 'vegetable', {rawMaterial: true}, demandOff(), ['bulk'], 0.9),

    apples: good('apples', 'Äpfel', '🍎', 'fruit', {rawMaterial: true, perishable: true}, demandCanonical('common_fruit', 1, ['pears'], 1, {baseDemandPer100kKg: 180, wealthElasticity: 0.12, priceWealthSensitivity: 0.18, regionalVariance: 0.14}), ['general'], 1.2),
    pears: good('pears', 'Birnen', '🍐', 'fruit', {rawMaterial: true, perishable: true}, demandCanonical('common_fruit', 1, ['apples'], 1, {baseDemandPer100kKg: 150, wealthElasticity: 0.12, priceWealthSensitivity: 0.18, regionalVariance: 0.14}), ['general'], 1.2),
    cherries: good('cherries', 'Kirschen', '🍒', 'fruit', {rawMaterial: true, perishable: true}, {
      enabled: true,
      profile: 'niche_fruit',
      canonical: true,
      referenceGoods: ['apples', 'pears'],
      ratio: 0.4,
      capReferenceGood: 'zucchini',
      capRatio: 0.75,
      minDailyKg: 5,
      dailyRate: 1,
      baseDemandPer100kKg: 45,
      wealthElasticity: 0.45,
      priceWealthSensitivity: 0.45,
      regionalVariance: 0.2
    }, ['general'], 1.85),

    fish: good('fish', 'Fisch', '🐟', 'animal_products', {rawMaterial: true, perishable: true, refrigeratedRequired: true}, demandCanonical('fresh_food', 1, [], 1, {baseDemandPer100kKg: 105, wealthElasticity: 0.25, priceWealthSensitivity: 0.25, regionalVariance: 0.16}), ['refrigerated'], 3.2),
    pigs: good('pigs', 'Schweine', '🐖', 'animal_products', {rawMaterial: true}, demandOff(), ['livestock'], 2.4),
    pork: good('pork', 'Schweinefleisch', '🥩', 'animal_products', {perishable: true, refrigeratedRequired: true}, demandCanonical('fresh_food', 0.22, ['fish'], 0.22, {baseDemandPer100kKg: 85, wealthElasticity: 0.18, priceWealthSensitivity: 0.25, regionalVariance: 0.14}), ['refrigerated'], 4.1),

    tomato_cans: good('tomato_cans', 'Tomatenkonserven', '🍅', 'processed_food', {}, demandCanonical('canned_food', 0.14, ['food'], 0.14, {baseDemandPer100kKg: 7, wealthElasticity: 0.05, priceWealthSensitivity: 0.08, regionalVariance: 0.16}), ['general'], 2.4),
    canned_corn: good('canned_corn', 'Maiskonserven', '🌽', 'processed_food', {}, demandCanonical('canned_food', 0.14, ['food'], 0.14, {baseDemandPer100kKg: 6, wealthElasticity: 0.03, priceWealthSensitivity: 0.06, regionalVariance: 0.16}), ['general'], 2.4),
    canned_peas: good('canned_peas', 'Erbsenkonserven', '🫛', 'processed_food', {}, demandCanonical('canned_food', 0.14, ['food'], 0.14, {baseDemandPer100kKg: 6, wealthElasticity: 0.03, priceWealthSensitivity: 0.06, regionalVariance: 0.16}), ['general'], 2.4),
    ravioli_meat: good('ravioli_meat', 'Ravioli mit Fleisch', '🥩', 'processed_food', {refrigeratedRequired: true}, demandCanonical('canned_food', 0.14, ['food'], 0.14, {baseDemandPer100kKg: 8, wealthElasticity: 0.22, priceWealthSensitivity: 0.25, regionalVariance: 0.16}), ['refrigerated'], 3.2),
    ravioli_veg: good('ravioli_veg', 'Ravioli ohne Fleisch', '🌿', 'processed_food', {refrigeratedRequired: true}, demandCanonical('canned_food', 0.14, ['food'], 0.14, {baseDemandPer100kKg: 9, wealthElasticity: 0.2, priceWealthSensitivity: 0.22, regionalVariance: 0.16}), ['refrigerated'], 3),

    furniture: good('furniture', 'Möbel', '🪑', 'consumer_goods', {}, demandConsumer('consumer_good', 18, 0.35, 0.35), ['general'], 4300),
    tools: good('tools', 'Werkzeuge', '🔧', 'consumer_goods', {}, demandConsumer('consumer_good', 16, 0.25, 0.25), ['general'], 4700),
    electronics: good('electronics', 'Elektronik', '💻', 'consumer_goods', {}, demandConsumer('consumer_good', 10, 0.8, 0.6), ['general'], 6500),
    medicine: good('medicine', 'Medizin', '💊', 'consumer_goods', {}, demandConsumer('consumer_good', 12, 0.35, 0.35), ['general'], 6900)
  });

  const facilities = Object.freeze({
    farm: facility('farm', 'Landwirtschaft', '🌾', 42000, 'agriculture', {}, {grain: 5}, true),
    forestry: facility('forestry', 'Forstbetrieb', '🌲', 48000, 'natural', {}, {wood: 5}, true),
    mine: facility('mine', 'Bergwerk', '⛏️', 65000, 'mines', {}, {ore: 4}, true),
    chemical: facility('chemical', 'Chemiewerk', '⚗️', 85000, 'tech', {}, {chemicals: 4}, true),
    aluminum_mine: facility('aluminum_mine', 'Aluminiummine', '⛏️', 76000, 'mines', {}, {aluminum_ore: 2800}, true),
    aluminumworks: facility('aluminumworks', 'Aluminiumwerk', '🔩', 118000, 'industry', {aluminum_ore: 2200}, {aluminum: 1600}),
    canfactory: facility('canfactory', 'Dosenfabrik', '🥫', 96000, 'industry', {aluminum: 1000}, {cans: 2400}),

    tomatofarm: facility('tomatofarm', 'Tomatenhof', '🍅', 52000, 'agriculture', {}, {tomatoes: 1400}, true),
    zucchinifarm: facility('zucchinifarm', 'Zucchinihof', '🥒', 52000, 'agriculture', {}, {zucchini: 1400}, true),
    potatofarm: facility('potatofarm', 'Kartoffelfeld', '🥔', 50000, 'agriculture', {}, {potatoes: 1800}, true),
    cornfarm: facility('cornfarm', 'Maisfeld', '🌽', 52000, 'agriculture', {}, {corn: 1600}, true),
    peafarm: facility('peafarm', 'Erbsenfeld', '🫛', 52000, 'agriculture', {}, {peas: 1600}, true),
    appleorchard: facility('appleorchard', 'Apfelplantage', '🍎', 68000, 'agriculture', {}, {apples: 2200}, true),
    pearorchard: facility('pearorchard', 'Birnenplantage', '🍐', 68000, 'agriculture', {}, {pears: 2200}, true),
    cherryorchard: facility('cherryorchard', 'Kirschplantage', '🍒', 74000, 'agriculture', {}, {cherries: 2600}, true),

    fishery: facility('fishery', 'Fischerei', '🐟', 68000, 'natural', {}, {fish: 900}, true),
    pigfarm: facility('pigfarm', 'Schweinezucht', '🐖', 72000, 'agriculture', {grain: 700}, {pigs: 900}, true),
    slaughterhouse: facility('slaughterhouse', 'Schlachthof', '🥩', 98000, 'food', {pigs: 900}, {pork: 650}),
    foodfactory: facility('foodfactory', 'Lebensmittelfabrik', '🥫', 135000, 'food', {}, {}),
    furniture: facility('furniture', 'Möbelfabrik', '🪑', 92000, 'industry', {wood: 3}, {furniture: 3}),
    toolworks: facility('toolworks', 'Werkzeugfabrik', '🔧', 105000, 'industry', {ore: 2, wood: 1}, {tools: 3}),
    electronics: facility('electronics', 'Elektronikwerk', '💻', 142000, 'tech', {ore: 2, chemicals: 1}, {electronics: 3}),
    pharma: facility('pharma', 'Pharmawerk', '💊', 155000, 'tech', {chemicals: 2}, {medicine: 3})
  });

  const recipes = Object.freeze({
    facility_farm: recipe('facility_farm', 'farm', 'Getreideproduktion', {}, {grain: 5}),
    facility_forestry: recipe('facility_forestry', 'forestry', 'Holzeinschlag', {}, {wood: 5}),
    facility_mine: recipe('facility_mine', 'mine', 'Erzabbau', {}, {ore: 4}),
    facility_chemical: recipe('facility_chemical', 'chemical', 'Chemikalienproduktion', {}, {chemicals: 4}),
    facility_aluminum_mine: recipe('facility_aluminum_mine', 'aluminum_mine', 'Aluminiumerzabbau', {}, {aluminum_ore: 2800}),
    facility_aluminumworks: recipe('facility_aluminumworks', 'aluminumworks', 'Aluminiumproduktion', {aluminum_ore: 2200}, {aluminum: 1600}),
    facility_canfactory: recipe('facility_canfactory', 'canfactory', 'Konservendosenproduktion', {aluminum: 1000}, {cans: 2400}),
    facility_tomatofarm: recipe('facility_tomatofarm', 'tomatofarm', 'Tomatenernte', {}, {tomatoes: 1400}),
    facility_zucchinifarm: recipe('facility_zucchinifarm', 'zucchinifarm', 'Zucchiniernte', {}, {zucchini: 1400}),
    facility_potatofarm: recipe('facility_potatofarm', 'potatofarm', 'Kartoffelernte', {}, {potatoes: 1800}),
    facility_cornfarm: recipe('facility_cornfarm', 'cornfarm', 'Maisernte', {}, {corn: 1600}),
    facility_peafarm: recipe('facility_peafarm', 'peafarm', 'Erbsenernte', {}, {peas: 1600}),
    facility_appleorchard: recipe('facility_appleorchard', 'appleorchard', 'Apfelernte', {}, {apples: 2200}),
    facility_pearorchard: recipe('facility_pearorchard', 'pearorchard', 'Birnenernte', {}, {pears: 2200}),
    facility_cherryorchard: recipe('facility_cherryorchard', 'cherryorchard', 'Kirschernte', {}, {cherries: 2600}),
    facility_fishery: recipe('facility_fishery', 'fishery', 'Fischfang', {}, {fish: 900}),
    facility_pigfarm: recipe('facility_pigfarm', 'pigfarm', 'Schweinezucht', {grain: 700}, {pigs: 900}),
    facility_slaughterhouse: recipe('facility_slaughterhouse', 'slaughterhouse', 'Fleischverarbeitung', {pigs: 900}, {pork: 650}),
    facility_furniture: recipe('facility_furniture', 'furniture', 'Möbelproduktion', {wood: 3}, {furniture: 3}),
    facility_toolworks: recipe('facility_toolworks', 'toolworks', 'Werkzeugproduktion', {ore: 2, wood: 1}, {tools: 3}),
    facility_electronics: recipe('facility_electronics', 'electronics', 'Elektronikproduktion', {ore: 2, chemicals: 1}, {electronics: 3}),
    facility_pharma: recipe('facility_pharma', 'pharma', 'Medizinproduktion', {chemicals: 2}, {medicine: 3}),

    foodfactory_meat: recipe('foodfactory_meat', 'foodfactory', 'Ravioli mit Fleisch', {pork: 900, tomatoes: 400, cans: 1700, grain: 165}, {ravioli_meat: 1700}, 'meatPct'),
    foodfactory_veg: recipe('foodfactory_veg', 'foodfactory', 'Ravioli ohne Fleisch', {tomatoes: 800, zucchini: 500, cans: 1700, grain: 180}, {ravioli_veg: 1700}, 'vegPct'),
    foodfactory_tomato: recipe('foodfactory_tomato', 'foodfactory', 'Tomatenkonserven', {tomatoes: 1350, cans: 400}, {tomato_cans: 1700}, 'tomatoPct'),
    foodfactory_corn: recipe('foodfactory_corn', 'foodfactory', 'Maiskonserven', {corn: 1350, cans: 400}, {canned_corn: 1700}, 'cornPct'),
    foodfactory_peas: recipe('foodfactory_peas', 'foodfactory', 'Erbsenkonserven', {peas: 1350, cans: 400}, {canned_peas: 1700}, 'peasPct')
  });

  const database = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    buildVersion: global.hfCurrentBuildVersion?.() || global.HF_BUILD_VERSION || '1.1.38',
    goods,
    facilities,
    recipes,
    vehicleGroups,
    deprecations: Object.freeze({goods: ['food', 'clothing'], facilities: ['textile']})
  });

  global.HF_GOODS_DATABASE = database;
  global.HF_GOODS_CONTENT_PACK = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    buildVersion: database.buildVersion,
    goods: Object.values(goods),
    facilities: Object.values(facilities),
    recipes: Object.values(recipes),
    vehicleGroups: Object.values(vehicleGroups),
    deprecations: database.deprecations
  });

  function good(id, name, icon, category, properties, demand, allowedVehicleGroups, price = 0) {
    return Object.freeze({
      id,
      name,
      icon,
      category,
      unit: unitByGood[id] || KG_UNIT,
      price,
      properties: {
        rawMaterial: false,
        perishable: false,
        refrigeratedRequired: false,
        ...properties
      },
      demand,
      transport: {allowedVehicleGroups},
      assetKey: id
    });
  }

  function demandOff() {
    return {enabled: false, profile: 'industrial', canonical: false, dailyRate: 0};
  }

  function demandConsumer(profile, baseDemandPer100kKg, wealthElasticity, priceWealthSensitivity) {
    return {enabled: true, profile, canonical: true, dailyRate: 0.22, baseDemandPer100kKg, wealthElasticity, priceWealthSensitivity, regionalVariance: 0.12};
  }

  function demandCanonical(profile, ratio, referenceGoods, dailyRate, extra = {}) {
    return {
      enabled: true,
      profile,
      canonical: true,
      referenceGoods,
      ratio,
      dailyRate,
      ...extra
    };
  }

  function facility(id, name, icon, cost, groupId, inputs, outputs, raw = false) {
    return Object.freeze({
      id,
      name,
      icon,
      cost,
      groupId,
      inputs,
      outputs,
      raw,
      allowedCities: [],
      allowedEverywhere: raw,
      assetKey: id
    });
  }

  function recipe(id, facilityId, name, inputs, outputs, mixField = null) {
    return Object.freeze({
      id,
      facilityId,
      name,
      inputs,
      outputs,
      mixField,
      maxSharePct: 100
    });
  }
})(globalThis);
