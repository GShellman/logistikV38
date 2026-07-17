var HF_ASSET_REGISTRY={goods:{},facilities:{},vehicles:{}};
var ASSETS={goods:{},facilities:{},vehicles:{}};

(function initHfAssetRegistry(global){
  const definitions={
    goods:{
      grain:'HF_GRAIN_ASSET_DATA_URI',wood:'HF_WOOD_ASSET_DATA_URI',ore:'HF_ORE_ASSET_DATA_URI',chemicals:'HF_CHEMICALS_ASSET_DATA_URI',food:'HF_FOOD_ASSET_DATA_URI',corn:'HF_CORN_ASSET_DATA_URI',pears:'HF_PEARS_ASSET_DATA_URI',peas:'HF_PEAS_ASSET_DATA_URI',canned_corn:'HF_CANNED_CORN_ASSET_DATA_URI',canned_peas:'HF_CANNED_PEAS_ASSET_DATA_URI',tools:'HF_TOOLS_ASSET_DATA_URI',furniture:'HF_FURNITURE_ASSET_DATA_URI',electronics:'HF_ELECTRONICS_ASSET_DATA_URI',medicine:'HF_MEDICINE_ASSET_DATA_URI',aluminum:'HF_ALUMINUM_ASSET_DATA_URI',aluminum_ore:'HF_ORE_ASSET_DATA_URI',fish:'HF_FISH_ASSET_DATA_URI',pigs:'HF_PIGS_ASSET_DATA_URI',pork:'HF_PORK_ASSET_DATA_URI',tomatoes:'HF_TOMATO_ASSET_DATA_URI',cans:'HF_CANS_ASSET_DATA_URI',ravioli_meat:'HF_RAVIOLI_MEAT_ASSET_DATA_URI',ravioli_veg:'HF_RAVIOLI_VEG_ASSET_DATA_URI',zucchini:'HF_ZUCCHINI_ASSET_DATA_URI',apples:'HF_APPLES_ASSET_DATA_URI',potatoes:'HF_POTATOES_ASSET_DATA_URI',tomato_cans:'HF_TOMATO_CANS_ASSET_DATA_URI',cherries:'HF_CHERRIES_ASSET_DATA_URI'
    },
    facilities:{
      farm:'HF_FARM_FACILITY_ASSET_DATA_URI',forestry:'HF_FORESTRY_FACILITY_ASSET_DATA_URI',mine:'HF_MINE_FACILITY_ASSET_DATA_URI',aluminum_mine:'HF_ALUMINUM_MINE_FACILITY_ASSET_DATA_URI',chemical:'HF_CHEMICAL_FACILITY_ASSET_DATA_URI',furniture:'HF_FURNITURE_FACILITY_ASSET_DATA_URI',toolworks:'HF_TOOLWORKS_FACILITY_ASSET_DATA_URI',electronics:'HF_ELECTRONICS_FACILITY_ASSET_DATA_URI',pharma:'HF_PHARMA_FACILITY_ASSET_DATA_URI',pearorchard:'HF_PEARORCHARD_FACILITY_ASSET_DATA_URI',cornfarm:'HF_CORNFARM_FACILITY_ASSET_DATA_URI',peafarm:'HF_PEAFARM_FACILITY_ASSET_DATA_URI',aluminumworks:'HF_ALUMINUMWORKS_FACILITY_ASSET_DATA_URI',fishery:'HF_FISHERY_FACILITY_ASSET_DATA_URI',pigfarm:'HF_PIGFARM_FACILITY_ASSET_DATA_URI',slaughterhouse:'HF_SLAUGHTERHOUSE_FACILITY_ASSET_DATA_URI',tomatofarm:'HF_TOMATOFARM_FACILITY_ASSET_DATA_URI',cannery:'HF_CANNERY_FACILITY_ASSET_DATA_URI',canfactory:'HF_CANFACTORY_FACILITY_ASSET_DATA_URI',foodfactory:'HF_RAVIOLI_MEAT_FACTORY_FACILITY_ASSET_DATA_URI',ravioli_meat_factory:'HF_RAVIOLI_MEAT_FACTORY_FACILITY_ASSET_DATA_URI',ravioli_veg_factory:'HF_RAVIOLI_VEG_FACTORY_FACILITY_ASSET_DATA_URI',zucchinifarm:'HF_ZUCCHINIFARM_FACILITY_ASSET_DATA_URI',appleorchard:'HF_APPLEORCHARD_FACILITY_ASSET_DATA_URI',potatofarm:'HF_POTATOFARM_FACILITY_ASSET_DATA_URI',cherryorchard:'HF_CHERRYORCHARD_FACILITY_ASSET_DATA_URI'
    },
    vehicles:{van:'HF_VAN_VEHICLE_ASSET_DATA_URI',lightTruck:'HF_LIGHT_TRUCK_VEHICLE_ASSET_DATA_URI',heavyTruck:'HF_HEAVY_TRUCK_VEHICLE_ASSET_DATA_URI',artic:'HF_ARTIC_VEHICLE_ASSET_DATA_URI',freightTrain:'HF_FREIGHT_TRAIN_VEHICLE_ASSET_DATA_URI',reefer:'HF_REEFER_VEHICLE_ASSET_DATA_URI',tipper:'HF_TIPPER_VEHICLE_ASSET_DATA_URI'}
  };
  for(const [type,bucket] of Object.entries(definitions)){
    for(const [key,globalName] of Object.entries(bucket)){
      const value=global[globalName];
      if(value)HF_ASSET_REGISTRY[type][key]=value;
    }
  }
  global.HF_ASSET_REGISTRY=HF_ASSET_REGISTRY;
  global.ASSETS=ASSETS;
})(window);

function hfSyncAssetRegistry(){for(const type of ['goods','facilities','vehicles']){ASSETS[type]=ASSETS[type]||{};for(const [key,value]of Object.entries(HF_ASSET_REGISTRY[type]||{}))if(value&&!ASSETS[type][key])ASSETS[type][key]=value}}
function hfAssetFor(type,assetKey,...fallbackKeys){const bucket=HF_ASSET_REGISTRY[type]||{},legacy=ASSETS[type]||{};for(const key of [assetKey,...fallbackKeys].filter(Boolean)){const value=bucket[key]||legacy[key];if(value)return value}return ''}
hfSyncAssetRegistry();
