#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Helvetic_Freight_v1.1.38_CleanApp.html'), 'utf8');
const supply = fs.readFileSync(path.join(root, 'scripts/hf-supply-contracts.js'), 'utf8');
function assert(condition, message) {
  if (!condition) {
    console.error(`HF v1.1.38 supply tour smoke failed: ${message}`);
    process.exitCode = 1;
  }
}
const completeMatch = html.match(/completeShipmentLeg=function\(sh\)\{([\s\S]*?)\n\s*function hfV131CreateRoute/);
assert(completeMatch, 'multi-stop completeShipmentLeg override is missing');
const complete = completeMatch?.[1] || '';
assert(/if\(!sh\?\.isMultiStop\)return hfV131BaseCompleteShipmentLeg\(sh\)/.test(complete), 'regular shipments must still use the base completeShipmentLeg path');
assert(/if\(sh\.phase==='tour_outbound'\)/.test(complete), 'tour_outbound branch must run before the normal outbound state machine');
assert(/const stop=sh\.tourStops\[sh\.tourStopIndex\]/.test(complete), 'tour_outbound branch must read the current stop by tourStopIndex');
assert(/hfV131UnloadAtStop\(sh,stop\)/.test(complete), 'tour_outbound branch must unload the current stop');
assert(/sh\.tourStopIndex\+\+/.test(complete), 'tour_outbound branch must advance tourStopIndex');
assert(/if\(!hfV131SetLeg\(sh,arrived,next,'tour_outbound'\)\)return false/.test(complete), 'next stop leg setup must use hfV131SetLeg and stay queued/waiting consistently on failure');
assert(/hfV131TryStartTourReturn\(sh\)/.test(complete), 'last stop must trigger the tour return path');
const unloadMatch = html.match(/function hfV131UnloadAtStop\(sh,stop\)\{([\s\S]*?)\n\s*function hfV131TryStartTourReturn/);
assert(unloadMatch, 'hfV131UnloadAtStop is missing');
const unload = unloadMatch?.[1] || '';
assert(/state\.cities\[stop\.cityId\]/.test(unload), 'unload must resolve the destination city from stop.cityId');
assert(/city\.inventory\[x\.good\]=roundCargo\(\(city\.inventory\[x\.good\]\|\|0\)\+qty\)/.test(unload), 'unload must add delivered goods to the stop city inventory');
assert(/x\.amount=roundCargo\(x\.amount-qty\)/.test(unload), 'unload must reduce transported cargo consistently');
assert(/sh\.cargo=hfV131NormalizeCargo\(remaining\)/.test(unload), 'shipment cargo must be normalized after unloading');
const supplyComplete = supply.match(/completeShipmentLeg=function\(sh\)\{([\s\S]*?)return done\};/);
assert(supplyComplete, 'supply contracts completeShipmentLeg wrapper is missing');
assert(/c\.lastDeliveryDay=state\.day/.test(supplyComplete?.[1] || ''), 'supply contract deliveries must update lastDeliveryDay');
assert(/c\.lastDelivered=round\(\(Number\(c\.lastDelivered\)\|\|0\)\+\(Number\(item\.amount\)\|\|0\)\)/.test(supplyComplete?.[1] || ''), 'supply contract deliveries must accumulate lastDelivered');
assert(/row\)row\.status='Erledigt'/.test(supplyComplete?.[1] || ''), 'completed supply rows must be marked Erledigt');
assert(/hfV1138TestSetup\(spec=\{\}\)/.test(supply), 'hfV1138TestSetup test hook is missing');
assert(/hfV1138DispatchRow:id=>/.test(supply), 'hfV1138DispatchRow test hook is missing');
assert(/hfV1138AdvanceMinutes:n=>advanceMinutes\(n,\{quiet:true,live:false\}\)/.test(supply), 'hfV1138AdvanceMinutes time-advance hook is missing');

assert(/function rescheduleOverdueSupplyRows\(rows,now\)/.test(supply), 'overdue planned rows must be rescheduled on the same day');
assert(/if\(!force&&state\.hfSupplyWeekPlan\.generatedDay===state\.day\)\{const now=typeof minuteOfDay==='function'\?minuteOfDay\(\):0;if\(\(Number\(state\.hfSupplyWeekPlan\.generatedMinute\)\|\|0\)<now\)\{rescheduleOverdueSupplyRows/.test(supply), 'replanSupply(false) must catch up stale same-day generated plans');
assert(/row\.absoluteDay!==state\.day\|\|row\.status!=='Geplant'\|\|row\.shipmentId\|\|row\.startMinute>=now/.test(supply), 'overdue rescheduler must preserve status/shipmentId guards');
assert(/row\.reason=`Nachgeholt um \$\{clock\(next\)\}`/.test(supply), 'overdue rescheduler must leave an auditable catch-up reason');
assert(/row\.absoluteDay!==state\.day\|\|row\.startMinute>now\|\|row\.status!=='Geplant'\|\|row\.shipmentId/.test(supply), 'run-now dispatch must include overdue rows while preserving dispatch guards');
assert(/generatedDay!==state\.day\)replanSupply\(true\);else if\(\(Number\(state\.hfSupplyWeekPlan\.generatedMinute\)\|\|0\)<now\)rescheduleOverdueSupplyRows/.test(supply), 'run-now must catch up stale same-day plans generated before the current minute');
assert(!/row\.absoluteDay!==state\.day\|\|row\.startMinute!==now\|\|row\.status!=='Geplant'/.test(supply), 'run-now must not require exact startMinute equality');
if (process.exitCode) process.exit(process.exitCode);
console.log('HF v1.1.38 supply tour smoke passed: multi-stop tour delivery state machine and supply-contract completion hooks are present.');
