#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Helvetic_Freight_v1.1.38_CleanApp.html'), 'utf8');
const supply = fs.readFileSync(path.join(root, 'scripts/hf-supply-contracts.js'), 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error(`City composer smoke failed: ${message}`);
    process.exitCode = 1;
  }
}
assert(/function\s+renderCityBase\s*\(\s*root\s*,\s*cityId/.test(html), 'renderCityBase(root, cityId) is missing');
assert(/function\s+renderCity\s*\(\s*root\s*\)\s*\{[\s\S]*renderCityBase\(root,cityId\)[\s\S]*HF_CITY_SECTIONS/.test(html), 'renderCity must call the base renderer and registered city sections');
assert(/HF_CITY_SECTIONS\s*=\s*window\.HF_CITY_SECTIONS\s*\|\|\s*\[\]/.test(html), 'HF_CITY_SECTIONS registry is missing');
assert(/registerCitySection/.test(html), 'registerCitySection API is missing from the app shell');
assert(/registerCitySection/.test(supply), 'supply contracts must register a city section');
assert(!/renderCity\s*=\s*function/.test(html + supply), 'legacy renderCity=function reassignment remains');
for (const text of ['Warenversorgung', 'Bezugsquellen und Lieferrhythmus', 'Ausgehende Logistik']) {
  assert(supply.includes(text), `supply city section text missing: ${text}`);
}
if (process.exitCode) process.exit(process.exitCode);
console.log('City composer smoke passed: supply and outgoing logistics sections are registered together.');
