#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

const context = {window: {}};
context.globalThis = context.window;
vm.createContext(context);

for (const file of ['scripts/hf-goods-database.js', 'scripts/hf-initial-state.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file});
}

const deprecatedGoods = new Set(context.window.HF_GOODS_DATABASE?.deprecations?.goods || []);
const cities = context.window.HF_INITIAL_STATE_PACKAGE?.state?.cities || {};
const violations = [];

for (const [cityId, city] of Object.entries(cities)) {
  for (const goodId of Object.keys(city?.demands || {})) {
    if (deprecatedGoods.has(goodId)) violations.push(`${cityId}.demands.${goodId}`);
  }
  for (const goodId of Object.keys(city?.inventory || {})) {
    if (deprecatedGoods.has(goodId)) violations.push(`${cityId}.inventory.${goodId}`);
  }
}

if (violations.length) {
  console.error(`Deprecated goods found in initial state:\n${violations.join('\n')}`);
  process.exit(1);
}

console.log(`Initial state contains no deprecated goods (${[...deprecatedGoods].join(', ') || 'none'}).`);
