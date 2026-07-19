#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const orders = {
  orders: [{
    id: 'order-day1-0800',
    status: 'active',
    frequency: 'once',
    deliveryDay: 1,
    destinationCityId: 'bern',
    sourceCityId: 'zurich',
    goodId: 'cheese',
    quantityKg: 1000,
  }],
  deliveries: [],
  nextDeliveryId: 1,
};
const inventory = {zurich: {cheese: 1000}, bern: {cheese: 0}};
let dispatches = 0;
let cashChanges = 0;

global.window = global;
global.HFV2Orders = {getState: () => orders};
global.HFV2Time = {getState: () => ({day: 1, hour: 8, minute: 0})};
global.HFV2Save = {
  getState: () => ({orders, time: {day: 1, hour: 8, minute: 0}}),
  dispatchStateChanged: () => { dispatches += 1; },
  changeCash: amount => { cashChanges += amount; },
};
global.HFVehicleCatalog = {VEHICLE_CATALOG: {van: {load: 2, speed: 60, kmCost: 1, mode: 'road'}}};
global.HFFleet = {getCityFleet: cityId => (cityId === 'zurich' ? {van: 1} : {})};
global.HFNetwork = {findPath: () => ({reachable: true, nodes: ['zurich', 'bern'], edges: [], distance: 60, duration: 1})};
global.HFV2Goods = {
  getCityInventory: cityId => inventory[cityId] || {},
  removeFromInventory: (cityId, goodId, kg) => {
    const removedKg = Math.min(inventory[cityId][goodId] || 0, kg);
    inventory[cityId][goodId] -= removedKg;
    return {removedKg};
  },
  addToInventory: (cityId, goodId, kg) => {
    inventory[cityId][goodId] = (inventory[cityId][goodId] || 0) + kg;
    return {addedKg: kg};
  },
};

require(path.join(__dirname, '..', 'v2', 'transport-logic.js'));
window.HFV2Transport.configure();

const before = {day: 1, hour: 8, minute: 0};
const after = {day: 1, hour: 9, minute: 0};
const firstRun = window.HFV2Transport.processDueDeliveries(before, after);

assert.equal(firstRun.processed, 1, 'delivery scheduled exactly at the start minute should be processed');
assert.equal(orders.deliveries.length, 1, 'one planned delivery should be generated');
assert.equal(orders.deliveries[0].status, window.HFV2Transport.STATUS.COMPLETED, 'delivery should complete');
assert.equal(inventory.zurich.cheese, 0, 'source inventory should be decremented once');
assert.equal(inventory.bern.cheese, 1000, 'destination inventory should receive the delivery');

const secondRun = window.HFV2Transport.processDueDeliveries(before, after);
assert.equal(secondRun.processed, 0, 'completed deliveries must not be processed again');
assert.equal(inventory.zurich.cheese, 0, 'source inventory should not be decremented twice');
assert.equal(inventory.bern.cheese, 1000, 'destination inventory should not receive a duplicate delivery');
assert.ok(dispatches >= 1, 'processing should dispatch at least one update');
assert.equal(cashChanges, -62, 'transport cost should be booked only once');

console.log('transport due-start inclusive regression passed');
