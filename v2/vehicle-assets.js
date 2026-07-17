(() => {
  'use strict';

  const VEHICLE_ASSETS = Object.freeze({
    van: 'HF_VAN_VEHICLE_ASSET_DATA_URI',
    largeVan: 'HF_LARGE_VAN_VEHICLE_ASSET_DATA_URI',
    lightTruck: 'HF_LIGHT_TRUCK_VEHICLE_ASSET_DATA_URI',
    heavyTruck: 'HF_HEAVY_TRUCK_VEHICLE_ASSET_DATA_URI',
    artic: 'HF_ARTIC_VEHICLE_ASSET_DATA_URI',
    reefer: 'HF_REEFER_VEHICLE_ASSET_DATA_URI',
    tipper: 'HF_TIPPER_VEHICLE_ASSET_DATA_URI',
    freightTrain: 'HF_FREIGHT_TRAIN_VEHICLE_ASSET_DATA_URI',
  });

  function vehicleImage(vehicleId) {
    const assetGlobal = VEHICLE_ASSETS[String(vehicleId || '').trim()];
    return assetGlobal ? window[assetGlobal] || '' : '';
  }

  window.HFV2VehicleAssets = Object.freeze({vehicleImage});
})();
