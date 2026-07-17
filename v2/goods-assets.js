(() => {
  'use strict';

  const GOOD_ASSETS = Object.freeze({
    aluminum: 'HF_ALUMINUM_ASSET_DATA_URI',
    aluminum_ore: 'HF_ORE_ASSET_DATA_URI',
    apples: 'HF_APPLES_ASSET_DATA_URI',
    canned_corn: 'HF_CANNED_CORN_ASSET_DATA_URI',
    canned_peas: 'HF_CANNED_PEAS_ASSET_DATA_URI',
    cans: 'HF_CANS_ASSET_DATA_URI',
    chemicals: 'HF_CHEMICALS_ASSET_DATA_URI',
    cherries: 'HF_CHERRIES_ASSET_DATA_URI',
    clothing: 'HF_CLOTHING_ASSET_DATA_URI',
    corn: 'HF_CORN_ASSET_DATA_URI',
    electronics: 'HF_ELECTRONICS_ASSET_DATA_URI',
    fish: 'HF_FISH_ASSET_DATA_URI',
    food: 'HF_FOOD_ASSET_DATA_URI',
    furniture: 'HF_FURNITURE_ASSET_DATA_URI',
    grain: 'HF_GRAIN_ASSET_DATA_URI',
    medicine: 'HF_MEDICINE_ASSET_DATA_URI',
    ore: 'HF_ORE_ASSET_DATA_URI',
    pears: 'HF_PEARS_ASSET_DATA_URI',
    peas: 'HF_PEAS_ASSET_DATA_URI',
    pigs: 'HF_PIGS_ASSET_DATA_URI',
    pork: 'HF_PORK_ASSET_DATA_URI',
    potatoes: 'HF_POTATOES_ASSET_DATA_URI',
    ravioli_meat: 'HF_RAVIOLI_MEAT_ASSET_DATA_URI',
    ravioli_veg: 'HF_RAVIOLI_VEG_ASSET_DATA_URI',
    tomato_cans: 'HF_TOMATO_CANS_ASSET_DATA_URI',
    tomatoes: 'HF_TOMATO_ASSET_DATA_URI',
    tools: 'HF_TOOLS_ASSET_DATA_URI',
    wood: 'HF_WOOD_ASSET_DATA_URI',
    zucchini: 'HF_ZUCCHINI_ASSET_DATA_URI',
  });

  function goodImage(goodId) {
    const assetGlobal = GOOD_ASSETS[String(goodId || '').trim()];
    return assetGlobal ? window[assetGlobal] || '' : '';
  }

  window.HFV2GoodsAssets = Object.freeze({goodImage});
})();
