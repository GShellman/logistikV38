#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const orders = {
  orders: [],
  deliveries: [{
    id: 'existing-two-trip-delivery',
    status: 'planned',
    vehicleType: 'van',
    tripCount: 2,
    scheduledDay: 1,
    scheduledMinute: 8 * 60,
    roundTripMinutes: 120,
  }],
  nextDeliveryId: 1,
};

const inventory = {zurich: {cheese: 1000}, bern: {cheese: 0}};

global.window = global;
global.HFV2Orders = {getState: () => orders};
global.HFV2Time = {getState: () => ({day: 1, hour: 8, minute: 0})};
global.HFV2Save = {
  getState: () => ({orders, time: {day: 1, hour: 8, minute: 0}}),
  dispatchStateChanged: () => {},
};
global.HFVehicleCatalog = {VEHICLE_CATALOG: {van: {load: 2, speed: 60, kmCost: 1, mode: 'road'}}};
global.HFFleet = {getCityFleet: cityId => (cityId === 'zurich' ? {van: 1} : {})};
global.HFNetwork = {findPath: () => ({reachable: true, nodes: ['zurich', 'bern'], edges: [], distance: 60, duration: 1})};
global.HFV2Goods = {getCityInventory: cityId => inventory[cityId] || {}};

require(path.join(__dirname, '..', 'v2', 'transport-logic.js'));
window.HFV2Transport.configure();

const chosen = window.HFV2Transport.chooseVehicle('zurich', 'bern', 1000, 1, 8 * 60);
assert.equal(chosen, null, 'one van already reserved for two overlapping trips must not accept another parallel delivery');

orders.deliveries = [];
const twoTripDelivery = window.HFV2Transport.chooseVehicle('zurich', 'bern', 3000, 1, 10 * 60);
assert.equal(twoTripDelivery, null, 'one van must not accept a delivery that requires two simultaneous trips');

const chosenWithoutOverlap = window.HFV2Transport.chooseVehicle('zurich', 'bern', 1000, 1, 10 * 60);
assert.ok(chosenWithoutOverlap, 'same delivery should be schedulable when no planned delivery overlaps');
assert.equal(chosenWithoutOverlap.trips, 1, 'control delivery needs one trip');

console.log('transport trip capacity regression passed');
