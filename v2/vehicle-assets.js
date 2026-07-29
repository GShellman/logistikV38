(() => {
  'use strict';

  const VEHICLE_ASSETS = Object.freeze({
    freightTrain: 'HF_FREIGHT_TRAIN_VEHICLE_ASSET_DATA_URI',
  });

  const VEHICLE_PNG_ASSETS = Object.freeze({
    'fluto-gianco': 'assets/vehicles/fluto-gianco.png',
    // The refrigerated derivative reuses the Gianco artwork. Keeping the
    // mapping explicit still gives the model a stable main-asset lookup.
    'fluto-gianco-fr': 'assets/vehicles/fluto-gianco.png',
    freightTrain: 'assets/vehicles/freight_train.png',
  });

  const VEHICLE_ROAD_PNG_ASSETS = Object.freeze({
    'fluto-gianco': 'assets/vehicles/fluto-gianco-road.png',
  });

  function normalizeVehicleId(vehicleId) {
    return String(vehicleId || '').trim();
  }

  function embeddedVehicleImage(vehicleId) {
    const assetGlobal = VEHICLE_ASSETS[normalizeVehicleId(vehicleId)];
    return assetGlobal ? window[assetGlobal] || '' : '';
  }

  function vehicleImage(vehicleId) {
    const pngAsset = VEHICLE_PNG_ASSETS[normalizeVehicleId(vehicleId)];
    return pngAsset || embeddedVehicleImage(vehicleId);
  }

  function roadVehicleImage(vehicleId) {
    const roadAsset = VEHICLE_ROAD_PNG_ASSETS[normalizeVehicleId(vehicleId)];
    return roadAsset || vehicleImage(vehicleId);
  }

  window.HFV2VehicleAssets = Object.freeze({vehicleImage, roadVehicleImage, embeddedVehicleImage});
})();
