(function () {
  'use strict';

  const HFV2_BOOT_SCRIPTS = [
    '../scripts/hf-city-catalog.js',
    'city-catalog.js',
    '../scripts/hf-goods-database.js',
    '../scripts/hf-demand-database.js',
    '../scripts/hf-game-mechanics.js',
    { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', crossOrigin: '' },
    'goods-logic.js',
    'save-logic.js',
    'network-logic.js',
    'network-map-layer.js',
    'network-menu.js',
    'vehicle-catalog.js',
    'assets/vehicles/van.js',
    'assets/vehicles/large_van.js',
    'assets/vehicles/light_truck.js',
    'assets/vehicles/heavy_truck.js',
    'assets/vehicles/artic.js',
    'assets/vehicles/reefer.js',
    'assets/vehicles/tipper.js',
    'assets/vehicles/freight_train.js',
    'vehicle-assets.js',
    'assets/facilities/farm.js',
    'assets/facilities/pigfarm.js',
    'assets/facilities/tomatofarm.js',
    'assets/facilities/zucchinifarm.js',
    'assets/facilities/potatofarm.js',
    'assets/facilities/cornfarm.js',
    'assets/facilities/peafarm.js',
    'assets/facilities/appleorchard.js',
    'assets/facilities/pearorchard.js',
    'assets/facilities/cherryorchard.js',
    'assets/facilities/forestry.js',
    'assets/facilities/fishery.js',
    'assets/facilities/mine.js',
    'assets/facilities/aluminum_mine.js',
    'assets/facilities/slaughterhouse.js',
    'assets/facilities/cannery.js',
    'assets/facilities/canfactory.js',
    'assets/facilities/ravioli_meat_factory.js',
    'assets/facilities/ravioli_veg_factory.js',
    'assets/facilities/foodplant.js',
    'assets/facilities/aluminumworks.js',
    'assets/facilities/furniture.js',
    'assets/facilities/toolworks.js',
    'assets/facilities/textile.js',
    'assets/facilities/chemical.js',
    'assets/facilities/electronics.js',
    'assets/facilities/pharma.js',
    'factory-catalog.js',
    'assets/goods/aluminum.js',
    'assets/goods/apples.js',
    'assets/goods/canned_corn.js',
    'assets/goods/canned_peas.js',
    'assets/goods/cans.js',
    'assets/goods/chemicals.js',
    'assets/goods/cherries.js',
    'assets/goods/clothing.js',
    'assets/goods/corn.js',
    'assets/goods/electronics.js',
    'assets/goods/fish.js',
    'assets/goods/food.js',
    'assets/goods/furniture.js',
    'assets/goods/grain.js',
    'assets/goods/medicine.js',
    'assets/goods/ore.js',
    'assets/goods/pears.js',
    'assets/goods/peas.js',
    'assets/goods/pigs.js',
    'assets/goods/pork.js',
    'assets/goods/potatoes.js',
    'assets/goods/ravioli_meat.js',
    'assets/goods/ravioli_veg.js',
    'assets/goods/tomato_cans.js',
    'assets/goods/tomatoes.js',
    'assets/goods/tools.js',
    'assets/goods/wood.js',
    'assets/goods/zucchini.js',
    'goods-assets.js',
    'goods-catalog.js',
    'factory-logic.js',
    'factory-menu.js',
    'fleet-logic.js',
    'logistics-logic.js',
    'logistics-map-layer.js',
    'fleet-menu.js',
    'city-action-assets.js',
    'city-action-menu.js',
    'modal.js',
    'hf-v2-api.js',
    'day-cycle-logic.js',
    'time-logic.js',
    'app.js',
  ];

  function loadScript(entry) {
    return new Promise(function (resolve, reject) {
      const scriptConfig = typeof entry === 'string' ? { src: entry } : entry;
      const script = document.createElement('script');

      script.src = scriptConfig.src;
      script.async = false;

      if (Object.prototype.hasOwnProperty.call(scriptConfig, 'crossOrigin')) {
        script.crossOrigin = scriptConfig.crossOrigin;
      }

      script.onload = resolve;
      script.onerror = function () {
        reject(new Error('HF V2 Boot-Skript konnte nicht geladen werden: ' + scriptConfig.src));
      };

      document.body.appendChild(script);
    });
  }

  function showBootError(error) {
    const mapError = document.getElementById('hfV2MapError');

    if (mapError) {
      mapError.textContent = error.message;
      mapError.hidden = false;
    }

    throw error;
  }

  window.HFV2_BOOT_SCRIPTS = HFV2_BOOT_SCRIPTS;

  HFV2_BOOT_SCRIPTS.reduce(function (chain, entry) {
    return chain.then(function () {
      return loadScript(entry);
    });
  }, Promise.resolve()).catch(showBootError);
}());
