(() => {
  'use strict';

  const KG_UNIT = Object.freeze({unit: 'kg', kgPerUnit: 1, step: 1});
  const TON_UNIT = Object.freeze({unit: 't', kgPerUnit: 1000, step: 0.1});
  const LITER_CHEMICAL_UNIT = Object.freeze({unit: 'L', kgPerUnit: 1.1, step: 10});
  const PIECE_40KG_UNIT = Object.freeze({unit: 'Stk.', kgPerUnit: 40, step: 1});
  const PIECE_5KG_UNIT = Object.freeze({unit: 'Stk.', kgPerUnit: 5, step: 1});
  const CAN_UNIT = Object.freeze({unit: 'Stk.', kgPerUnit: 0.08, step: 10});
  const RAVIOLI_MEAT_UNIT = Object.freeze({unit: 'Stk.', kgPerUnit: 0.45, step: 10});
  const RAVIOLI_VEG_UNIT = Object.freeze({unit: 'Stk.', kgPerUnit: 0.455, step: 10});

  const RAW = Object.freeze({rawMaterial: true, perishable: false, refrigeratedRequired: false});
  const DEFAULT_PROPERTIES = Object.freeze({rawMaterial: false, perishable: false, refrigeratedRequired: false});

  const GOODS_CATALOG = Object.freeze([
    good('grain', 'Getreide', '🌾', 'industrial_material', TON_UNIT, 0, RAW, ['bulk'], 'HF_GRAIN_ASSET_DATA_URI'),
    good('wood', 'Holz', '🪵', 'industrial_material', TON_UNIT, 0, RAW, ['general'], 'HF_WOOD_ASSET_DATA_URI'),
    good('ore', 'Erz', '⛏️', 'industrial_material', TON_UNIT, 0, RAW, ['bulk'], 'HF_ORE_ASSET_DATA_URI'),
    good('chemicals', 'Chemikalien', '⚗️', 'industrial_material', LITER_CHEMICAL_UNIT, 0, RAW, ['general'], 'HF_CHEMICALS_ASSET_DATA_URI'),
    good('aluminum_ore', 'Aluminiumerz', '⛏️', 'industrial_material', TON_UNIT, 0, RAW, ['bulk'], 'HF_ORE_ASSET_DATA_URI'),
    good('aluminum', 'Aluminium', '🔩', 'industrial_material', KG_UNIT, 0, DEFAULT_PROPERTIES, ['general'], 'HF_ALUMINUM_ASSET_DATA_URI'),
    good('cans', 'Konservendosen', '🥫', 'industrial_material', CAN_UNIT, 0, DEFAULT_PROPERTIES, ['general'], 'HF_CANS_ASSET_DATA_URI'),

    good('tomatoes', 'Tomaten', '🍅', 'vegetable', KG_UNIT, 1.1, {rawMaterial: true, perishable: true, refrigeratedRequired: false}, ['general'], 'HF_TOMATO_ASSET_DATA_URI'),
    good('zucchini', 'Zucchini', '🥒', 'vegetable', KG_UNIT, 1, {rawMaterial: true, perishable: true, refrigeratedRequired: false}, ['general'], 'HF_ZUCCHINI_ASSET_DATA_URI'),
    good('potatoes', 'Kartoffeln', '🥔', 'vegetable', KG_UNIT, 0.8, RAW, ['bulk'], 'HF_POTATOES_ASSET_DATA_URI'),
    good('corn', 'Mais', '🌽', 'vegetable', KG_UNIT, 0.9, RAW, ['bulk'], 'HF_CORN_ASSET_DATA_URI'),
    good('peas', 'Erbsen', '🫛', 'vegetable', KG_UNIT, 0.9, RAW, ['bulk'], 'HF_PEAS_ASSET_DATA_URI'),

    good('apples', 'Äpfel', '🍎', 'fruit', KG_UNIT, 1.2, {rawMaterial: true, perishable: true, refrigeratedRequired: false}, ['general'], 'HF_APPLES_ASSET_DATA_URI'),
    good('pears', 'Birnen', '🍐', 'fruit', KG_UNIT, 1.2, {rawMaterial: true, perishable: true, refrigeratedRequired: false}, ['general'], 'HF_PEARS_ASSET_DATA_URI'),
    good('cherries', 'Kirschen', '🍒', 'fruit', KG_UNIT, 1.85, {rawMaterial: true, perishable: true, refrigeratedRequired: false}, ['general'], 'HF_CHERRIES_ASSET_DATA_URI'),

    good('fish', 'Fisch', '🐟', 'animal_products', KG_UNIT, 3.2, {rawMaterial: true, perishable: true, refrigeratedRequired: true}, ['refrigerated'], 'HF_FISH_ASSET_DATA_URI'),
    good('pigs', 'Schweine', '🐖', 'animal_products', KG_UNIT, 2.4, RAW, ['livestock'], 'HF_PIGS_ASSET_DATA_URI'),
    good('pork', 'Schweinefleisch', '🥩', 'animal_products', KG_UNIT, 4.1, {rawMaterial: false, perishable: true, refrigeratedRequired: true}, ['refrigerated'], 'HF_PORK_ASSET_DATA_URI'),

    good('tomato_cans', 'Tomatenkonserven', '🍅', 'processed_food', RAVIOLI_MEAT_UNIT, 2.4, DEFAULT_PROPERTIES, ['general'], 'HF_TOMATO_CANS_ASSET_DATA_URI'),
    good('canned_corn', 'Maiskonserven', '🌽', 'processed_food', RAVIOLI_MEAT_UNIT, 2.4, DEFAULT_PROPERTIES, ['general'], 'HF_CANNED_CORN_ASSET_DATA_URI'),
    good('canned_peas', 'Erbsenkonserven', '🫛', 'processed_food', RAVIOLI_MEAT_UNIT, 2.4, DEFAULT_PROPERTIES, ['general'], 'HF_CANNED_PEAS_ASSET_DATA_URI'),
    good('ravioli_meat', 'Ravioli mit Fleisch', '🥩', 'processed_food', RAVIOLI_MEAT_UNIT, 3.2, {rawMaterial: false, perishable: false, refrigeratedRequired: true}, ['refrigerated'], 'HF_RAVIOLI_MEAT_ASSET_DATA_URI'),
    good('ravioli_veg', 'Ravioli ohne Fleisch', '🌿', 'processed_food', RAVIOLI_VEG_UNIT, 3, {rawMaterial: false, perishable: false, refrigeratedRequired: true}, ['refrigerated'], 'HF_RAVIOLI_VEG_ASSET_DATA_URI'),

    good('furniture', 'Möbel', '🪑', 'consumer_goods', PIECE_40KG_UNIT, 4300, DEFAULT_PROPERTIES, ['general'], 'HF_FURNITURE_ASSET_DATA_URI'),
    good('tools', 'Werkzeuge', '🔧', 'consumer_goods', KG_UNIT, 4700, DEFAULT_PROPERTIES, ['general'], 'HF_TOOLS_ASSET_DATA_URI'),
    good('electronics', 'Elektronik', '💻', 'consumer_goods', PIECE_5KG_UNIT, 6500, DEFAULT_PROPERTIES, ['general'], 'HF_ELECTRONICS_ASSET_DATA_URI'),
    good('medicine', 'Medizin', '💊', 'consumer_goods', KG_UNIT, 6900, DEFAULT_PROPERTIES, ['general'], 'HF_MEDICINE_ASSET_DATA_URI'),
  ]);

  function good(id, name, icon, category, unit, price, properties, allowedVehicleGroups, assetGlobal) {
    return Object.freeze({
      id,
      name,
      icon,
      category,
      unit,
      price,
      properties,
      transport: Object.freeze({allowedVehicleGroups: Object.freeze([...allowedVehicleGroups])}),
      assetGlobal,
    });
  }

  function goodImage(goodId) {
    const goodItem = GOODS_CATALOG.find((item) => item.id === goodId);
    return goodItem?.assetGlobal ? window[goodItem.assetGlobal] || '' : '';
  }

  window.HFV2GoodsCatalog = GOODS_CATALOG;
  window.HFV2GoodsAssets = Object.freeze({goodImage});
})();
