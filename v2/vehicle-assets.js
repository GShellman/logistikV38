(() => {
  'use strict';

  const VEHICLE_ASSETS = Object.freeze({
    van: 'HF_VAN_VEHICLE_ASSET_DATA_URI',
    'large-van': 'HF_LARGE_VAN_VEHICLE_ASSET_DATA_URI',
    'light-truck': 'HF_LIGHT_TRUCK_VEHICLE_ASSET_DATA_URI',
    'heavy-truck': 'HF_HEAVY_TRUCK_VEHICLE_ASSET_DATA_URI',
    artic: 'HF_ARTIC_VEHICLE_ASSET_DATA_URI',
    reefer: 'HF_REEFER_VEHICLE_ASSET_DATA_URI',
    tipper: 'HF_TIPPER_VEHICLE_ASSET_DATA_URI',
    freightTrain: 'HF_FREIGHT_TRAIN_VEHICLE_ASSET_DATA_URI',
  });

  const VEHICLE_PNG_ASSETS = Object.freeze({
    van: 'assets/vehicles/van.png',
    'large-van': 'assets/vehicles/large-van.png',
    'fluto-gianco': 'assets/vehicles/fluto-gianco.png',
    'light-truck': 'assets/vehicles/light-truck.png',
    'heavy-truck': 'assets/vehicles/heavy-truck.png',
    artic: 'assets/vehicles/artic.png',
    reefer: 'assets/vehicles/reefer.png',
    tipper: 'assets/vehicles/tipper.png',
    freightTrain: 'assets/vehicles/freight_train.png',
  });

  const VEHICLE_ROAD_PNG_ASSETS = Object.freeze({
    'large-van': 'assets/vehicles/large-van-road.png',
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
