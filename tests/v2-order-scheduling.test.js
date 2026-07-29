const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function load(file, window) {
  vm.runInContext(readFileSync(file, 'utf8'), vm.createContext({window, console, Blob: undefined, File: undefined, CustomEvent: class {}}), {filename: file});
}

function logisticsHarness({capacity = true, vehicles = [{id: 1, vehicleType: 'van', currentCityId: 'a', availableAbsMinute: 0}], stock = 10000, localDemand = 100, localReserve = 0} = {}) {
  const time = {day: 1, hour: 0, minute: 0};
  const inventory = {a: {food: stock}, b: {food: 0}, c: {food: 0}};
  const path = (from, to) => ({reachable: true, distance: 60, duration: 1, nodes: [from, to], edges: []});
  const window = {
    HFV2Time: {getState: () => time},
    HFV2Save: {getState: () => ({time}), dispatchStateChanged: () => {}},
    HFVehicleCatalog: {VEHICLE_CATALOG: {van: {mode: 'road', load: 1, speed: 60}}},
    HFFleet: {
      getState: () => ({vehicles}),
      getAvailableVehicles: ({cityId, vehicleType, atAbsMinute}) => vehicles.filter(v => v.vehicleType === vehicleType && v.currentCityId === cityId && v.availableAbsMinute <= atAbsMinute),
      assignVehicles: ({cityId, vehicleType, count}) => vehicles.filter(v => v.vehicleType === vehicleType && v.currentCityId === cityId).slice(0, count),
      releaseAssignment: () => {},
    },
    HFNetwork: {
      findPath: path,
      pathCapacityStatus: () => ({ok: capacity}),
      reservePathCapacity: (_path, options) => ({ok: capacity, reservationId: options.reservationId}),
      releaseCapacityReservation: () => {},
      cleanupCapacityReservations: () => {},
    },
    HFV2Goods: {
      getCityInventory: cityId => inventory[cityId] || {},
      getCityDailyDemandMap: () => ({food: localDemand}),
      getExportableStockKg: (cityId, goodId) => Math.max(0, (Number(inventory[cityId]?.[goodId]) || 0) - localReserve),
      removeFromInventory: (cityId, goodId, amountKg) => {
        const removedKg = Math.min(Number(inventory[cityId]?.[goodId]) || 0, amountKg);
        inventory[cityId][goodId] -= removedKg;
        return {ok: removedKg === amountKg, removedKg};
      },
      addToInventory: (cityId, goodId, amountKg) => {
        inventory[cityId][goodId] = (inventory[cityId][goodId] || 0) + amountKg;
        return {ok: true, addedKg: amountKg};
      },
    },
  };
  load('v2/logistics-logic.js', window);
  const state = window.HFV2Logistics.createLogisticsState();
  window.HFV2Logistics.configure({state, citiesById: {a: {id: 'a'}, b: {id: 'b'}, c: {id: 'c'}}});
  return {window, state, time, inventory};
}

function dueOrder(id, amountKg, toCityId = 'b') {
  return {id, fromCityId: 'a', toCityId, goodId: 'food', frequency: 'daily', departureHour: 0, departureMinute: 0, vehicleType: 'van', amountKg, enabled: true, lastDispatchedDay: null};
}

test('Goods-API zieht den lokalen Tagesbedarf zentral vom Exportbestand ab', () => {
  const window = {
    HFV2GoodsCatalog: [{id: 'food', category: 'processed_food', price: 1, demand: {enabled: true}}],
    HF_GOODS_DATABASE: {goods: {food: {demand: {enabled: true}}}},
    HF_GAME_MECHANICS: {makeDemandsV2: () => ({food: {need: 100, dailyRate: 1}})},
  };
  load('v2/goods-logic.js', window);
  window.HFV2Goods.configure({state: window.HFV2Goods.createGoodsState({cityInventories: {a: {food: 140}}}), cities: [{id: 'a'}]});

  assert.equal(window.HFV2Goods.getLocalReserveKg('a', 'food'), 100);
  assert.equal(window.HFV2Goods.getExportableStockKg('a', 'food'), 40);
});

test('alle sieben Wochentage werden normalisiert und nur am gewählten Tag fällig', () => {
  const {window} = logisticsHarness();
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const order = {enabled: true, frequency: 'weekly', weekday, departureHour: 0, departureMinute: 0, lastDispatchedDay: null};
    for (let day = 1; day <= 7; day += 1) assert.equal(window.HFV2Logistics.orderDueToday(order, {day, hour: 0, minute: 0}), day - 1 === weekday);
  }
});

test('Kühlwaren können nicht mit einem normalen Fahrzeug disponiert werden', () => {
  const {window} = logisticsHarness();
  window.HFV2GoodsCatalog = [{id: 'food', properties: {requiresRefrigeration: true}}];

  assert.throws(
    () => window.HFV2Logistics.createOrder({fromCityId: 'a', toCityId: 'b', goodId: 'food', frequency: 'daily', vehicleType: 'van'}),
    error => error?.reason === 'refrigeration-required',
  );
});

test('Kühlwaren können mit einem als gekühlt markierten Fahrzeug disponiert werden', () => {
  const vehicles = [{id: 2, vehicleType: 'refrigerated-van', currentCityId: 'a', availableAbsMinute: 0}];
  const {window} = logisticsHarness({vehicles});
  window.HFV2GoodsCatalog = [{id: 'food', properties: {requiresRefrigeration: true}}];
  window.HFVehicleCatalog.VEHICLE_CATALOG['refrigerated-van'] = {mode: 'road', refrigerated: true, load: 1.7, speed: 80};

  const order = window.HFV2Logistics.createOrder({fromCityId: 'a', toCityId: 'b', goodId: 'food', frequency: 'daily', vehicleType: 'refrigerated-van'});
  assert.equal(order.vehicleType, 'refrigerated-van');
});

test('tägliche und wöchentliche Folgetermine überschreiten Tages- und Wochengrenzen', () => {
  const {window} = logisticsHarness();
  assert.equal(window.HFV2Logistics.nextOrderDueAbsMinute({enabled: true, frequency: 'daily', departureHour: 23, departureMinute: 55, lastDispatchedDay: null}, {day: 1, hour: 23, minute: 56}), 2875);
  assert.equal(window.HFV2Logistics.nextOrderDueAbsMinute({enabled: true, frequency: 'weekly', weekday: 0, departureHour: 8, departureMinute: 0, lastDispatchedDay: 1}, {day: 1, hour: 8, minute: 0}), 10560);
});

test('Terminfindung wählt ein freies Zeitfenster und berücksichtigt Repositionierung', () => {
  const {window} = logisticsHarness({vehicles: [{id: 4, vehicleType: 'van', currentCityId: 'c', availableAbsMinute: 0}]});
  const result = window.HFV2Logistics.findOrderSchedule({fromCityId: 'a', toCityId: 'b', goodId: 'food', frequency: 'daily', vehicleType: 'van'});
  assert.equal(result.ok, true);
  assert.deepEqual(result.vehicleIds, [4]);
  assert.ok(result.arrivalAbsMinute > result.departureAbsMinute);
});

test('alle passenden Fahrzeuge dürfen heute unterwegs sein und morgen rechtzeitig frei werden', () => {
  const {window, state} = logisticsHarness({stock: 1000, localDemand: 1500, vehicles: [
    {id: 4, vehicleType: 'van', status: 'assigned', activeAssignmentId: 'shipment-4', currentCityId: 'c', routeSegment: {fromCityId: 'c', toCityId: 'b'}, availableAbsMinute: 1200},
    {id: 5, vehicleType: 'van', status: 'returning', activeAssignmentId: 'shipment-5', currentCityId: 'c', routeSegment: {fromCityId: 'c', toCityId: 'a'}, availableAbsMinute: 1350},
  ]});

  const schedule = window.HFV2Logistics.findOrderSchedule({fromCityId: 'a', toCityId: 'b', goodId: 'food', frequency: 'daily', vehicleType: 'van', amountKg: 1500});
  assert.equal(schedule.ok, true);
  assert.ok(schedule.departureAbsMinute >= 1440);
  assert.deepEqual(new Set(schedule.vehicleIds), new Set([4, 5]));

  const order = window.HFV2Logistics.createOrder({fromCityId: 'a', toCityId: 'b', goodId: 'food', frequency: 'daily', vehicleType: 'van'});
  assert.equal(state.orders[0], order);
  assert.ok(order.plannedDepartureAbsMinute >= 1350);
});

test('Bestell-UI zeigt Fuhrpark-Zeitlinien, Bestand und nächste Produktion', () => {
  const vehicles = [
    {id: 1, vehicleType: 'van', status: 'assigned', activeAssignmentId: 'trip-1', currentCityId: 'b', routeSegment: {toCityId: 'a'}, availableAbsMinute: 1200},
    {id: 2, vehicleType: 'truck', status: 'available', activeAssignmentId: null, currentCityId: 'a', availableAbsMinute: 0},
  ];
  const window = {
    HFV2Time: {getState: () => ({day: 1, hour: 8, minute: 0})},
    HFV2CitiesById: {a: {id: 'a', name: 'Quelle'}, b: {id: 'b', name: 'Ziel'}},
    HFV2IsCityUnlocked: () => true,
    HFVehicleCatalog: {VEHICLE_CATALOG: {
      van: {name: 'Lieferwagen', icon: 'V', mode: 'road', load: 1},
      truck: {name: 'Lastwagen', icon: 'L', mode: 'road', load: 2},
    }},
    HFFleet: {getState: () => ({vehicles})},
    HFNetwork: {findPath: (from, to) => ({reachable: from !== to || true, distance: 10, duration: 1})},
    HFV2Goods: {
      getCityInventory: () => ({food: 75}),
      getExportableStockKg: () => 25,
      getCityDailyDemandMap: () => ({food: 100}),
    },
    HFV2Logistics: {
      vehicleCapacityKg: type => type === 'truck' ? 2000 : 1000,
      plannedOrderAmountKg: () => 100,
      findOrderSchedule: () => ({ok: true, departureAbsMinute: 1440, arrivalAbsMinute: 1500, vehicleCount: 1, path: {reachable: true, distance: 10, duration: 1}, stockProducedBeforeDeparture: true}),
    },
  };
  load('v2/city-action-menu.js', window);

  const options = window.HFV2CityOrderUI.vehicleOptions('a');
  assert.deepEqual(Array.from(options, item => [item.type, item.nowCount, item.totalCount]), [['truck', 1, 1], ['van', 0, 1]]);
  const modal = window.HFV2CityOrderUI.orderModalBody({id: 'b', name: 'Ziel'});
  assert.match(modal, /jetzt 0 verfügbar · insgesamt\/voraussichtlich 1 verfügbar/);

  const preview = {innerHTML: ''};
  const error = {hidden: true, textContent: ''};
  const vehicleSelect = {value: 'van', innerHTML: ''};
  const form = {
    dataset: {targetId: 'b'},
    elements: {fromCityId: {value: 'a'}, goodId: {value: 'food'}, frequency: {value: 'daily'}, weekday: {value: '0', disabled: false}, vehicleType: vehicleSelect},
    querySelector: selector => selector === '#hfV2OrderPreview' ? preview : selector === '#hfV2OrderError' ? error : selector === '#hfV2OrderWeekday' ? {hidden: false} : null,
  };
  window.HFV2CityOrderUI.previewOrder(form);
  assert.match(preview.innerHTML, /Bestand Quelle[\s\S]*75 kg/);
  assert.match(preview.innerHTML, /Tatsächlich exportierbar[\s\S]*25 kg/);
  assert.match(preview.innerHTML, /Fehlende 75 kg werden erst beim nächsten Produktionszyklus hergestellt/);
});

test('fehlender aktueller Bestand wird durch den nächsten Produktionszyklus eingeplant', () => {
  const {window, state} = logisticsHarness({stock: 0});
  const result = window.HFV2Logistics.findOrderSchedule({fromCityId: 'a', toCityId: 'b', goodId: 'food', frequency: 'daily', vehicleType: 'van'});
  assert.equal(result.ok, true);
  assert.equal(result.stockProducedBeforeDeparture, true);
  assert.ok(result.departureAbsMinute >= 1440);
  const order = window.HFV2Logistics.createOrder({fromCityId: 'a', toCityId: 'b', goodId: 'food', frequency: 'daily', vehicleType: 'van'});
  assert.equal(state.orders[0], order);
  assert.ok(order.plannedDepartureAbsMinute >= 1440);
});

test('Terminfindung lehnt Straßenüberlastung und fehlende Termine ab', () => {
  const {window} = logisticsHarness({capacity: false});
  const result = window.HFV2Logistics.findOrderSchedule({fromCityId: 'a', toCityId: 'b', goodId: 'food', frequency: 'daily', vehicleType: 'van', horizonDays: 1});
  assert.deepEqual({ok: result.ok, reason: result.reason}, {ok: false, reason: 'no-feasible-slot'});
  assert.throws(() => window.HFV2Logistics.createOrder({fromCityId: 'a', toCityId: 'b', goodId: 'food', frequency: 'daily', vehicleType: 'van', horizonDays: 1}), /no-feasible-slot/);
});

test('alte wöchentliche Bestellungen migrieren stabil auf Montag und Plan-Caches werden verworfen', () => {
  const window = {dispatchEvent: () => {}};
  load('v2/save-logic.js', window);
  const logistics = window.HFV2Save.hydrateState({state: {logistics: {orders: [{id: 1, frequency: 'weekly', departureHour: 8, departureMinute: 30}], dispatchPlan: {legs: [1]}}}}).state.logistics;
  assert.equal(logistics.orders[0].weekday, 0);
  assert.equal(logistics.orders[0].plannedDepartureAbsMinute, 510);
  assert.equal(logistics.dispatchPlan, null);
  assert.equal(logistics.schemaVersion, 3);
});

test('Bestand unter Bestellmenge erzeugt eine Teillieferung und bucht nur die Liefermenge ab', () => {
  const {window, state, inventory} = logisticsHarness({stock: 40});
  state.orders = [dueOrder(1, 100)];
  window.HFV2Logistics.configure({state});

  const created = window.HFV2Logistics.tick();

  assert.equal(created.length, 1);
  assert.equal(created[0].amountKg, 40);
  assert.equal(created[0].vehicleCount, 1);
  assert.equal(inventory.a.food, 0);
  assert.equal(state.orders[0].lastDispatchResult, 'partial-delivery');
});

test('bei exakt null Bestand bleibt stock-limited und es entsteht kein Shipment', () => {
  const {window, state, inventory} = logisticsHarness({stock: 0});
  state.orders = [dueOrder(1, 100)];
  window.HFV2Logistics.configure({state});

  const created = window.HFV2Logistics.tick();

  assert.equal(created.length, 0);
  assert.equal(state.shipments.length, 0);
  assert.equal(inventory.a.food, 0);
  assert.equal(state.orders[0].lastDispatchResult, 'stock-limited');
});

test('konkurrierende Bestellungen reduzieren denselben Restbestand fortlaufend', () => {
  const {window, state, inventory} = logisticsHarness({stock: 150});
  state.orders = [dueOrder(1, 100, 'b'), dueOrder(2, 100, 'c')];
  window.HFV2Logistics.configure({state});

  const created = window.HFV2Logistics.tick();

  assert.equal(created.length, 1);
  assert.equal(created[0].amountKg, 150);
  assert.deepEqual(Array.from(created[0].stops, stop => stop.amountKg).sort((a, b) => b - a), [100, 50]);
  assert.equal(inventory.a.food, 0);
  assert.deepEqual(state.orders.map(order => order.lastDispatchResult), ['created', 'partial-delivery']);
});

test('lokaler Tagesbedarf bleibt bei einzelnen und konkurrierenden Exportaufträgen reserviert', () => {
  const {window, state, inventory} = logisticsHarness({stock: 140, localDemand: 100, localReserve: 100});
  state.orders = [dueOrder(1, 30, 'b'), dueOrder(2, 30, 'c')];
  window.HFV2Logistics.configure({state});

  const created = window.HFV2Logistics.tick();

  assert.equal(created.length, 1);
  assert.equal(created[0].amountKg, 40);
  assert.deepEqual(Array.from(created[0].stops, stop => stop.amountKg), [30, 10]);
  assert.equal(inventory.a.food, 100);
});

test('nur zusätzlich produzierter Überschuss wird für einen späteren Export verfügbar', () => {
  const {window, state, inventory, time} = logisticsHarness({stock: 140, localDemand: 100, localReserve: 100});
  state.orders = [dueOrder(1, 100)];
  window.HFV2Logistics.configure({state});

  assert.equal(window.HFV2Logistics.tick()[0].amountKg, 40);
  assert.equal(inventory.a.food, 100);
  inventory.a.food += 25;
  time.day = 2;
  const second = window.HFV2Logistics.tick();

  assert.equal(second[0].amountKg, 25);
  assert.equal(inventory.a.food, 100);
});

test('Dispatch-Plan teilt nur den Exportüberschuss auf mehrere Aufträge auf', () => {
  const {window, state} = logisticsHarness({stock: 140, localDemand: 100, localReserve: 100, vehicles: [
    {id: 1, vehicleType: 'van', currentCityId: 'a', availableAbsMinute: 0},
    {id: 2, vehicleType: 'van', currentCityId: 'a', availableAbsMinute: 0},
  ]});
  state.orders = [dueOrder(1, 30, 'b'), dueOrder(2, 30, 'c')];
  window.HFV2Logistics.configure({state});
  load('v2/fleet-dispatch-logic.js', window);

  const plan = window.HFV2FleetDispatch.buildPlan({state, horizonDays: 3});
  const firstDayKg = plan.legs
    .filter(leg => leg.type === 'shipment' && leg.departureAbsMinute < 1440)
    .reduce((sum, leg) => sum + leg.amountKg, 0);
  assert.equal(firstDayKg, 40);
});

test('Dispatch-Plan speichert und reserviert die reduzierte Liefermenge', () => {
  const {window, state} = logisticsHarness({stock: 40});
  state.orders = [dueOrder(1, 1500)];
  window.HFV2Logistics.configure({state});
  load('v2/fleet-dispatch-logic.js', window);
  window.HFV2FleetDispatch.configure({state});

  const plan = window.HFV2FleetDispatch.buildPlan({state, horizonDays: 3});
  const leg = plan.legs.find(entry => entry.type === 'shipment');

  assert.equal(leg.amountKg, 40);
  assert.equal(leg.vehicleIds.length, 1);
  assert.ok(plan.unplanned.some(entry => entry.reason === 'stock-limited'));
});

test('Dispatch-Plan reserviert die Rückfahrt und führt die Fahrzeug-Zeitleiste zum Ausgangsort zurück', () => {
  const reservations = [];
  const {window, state} = logisticsHarness({stock: 100});
  window.HFNetwork.reservePathCapacity = (_path, options) => { reservations.push(options); return {ok: true}; };
  state.orders = [dueOrder(1, 100)];
  window.HFV2Logistics.configure({state});
  load('v2/fleet-dispatch-logic.js', window);
  const plan = window.HFV2FleetDispatch.buildPlan({state, horizonDays: 3});
  const shipmentLeg = plan.legs.find(leg => leg.type === 'shipment');
  const returnLeg = plan.legs.find(leg => leg.type === 'return');
  assert.ok(returnLeg);
  assert.equal(returnLeg.tripId, shipmentLeg.tripId);
  assert.equal(returnLeg.outboundLegId, shipmentLeg.id);
  assert.equal(returnLeg.fromCityId, 'b');
  assert.equal(returnLeg.toCityId, 'a');
  assert.ok(reservations.some(item => item.reservationId.includes('-return-')));
});

test('Bestellvorschau erzeugt Lieferung und Rückfahrt ohne Spielstand oder Reservierungen zu verändern', () => {
  const {window, state} = logisticsHarness({stock: 100});
  state.orders = [];
  window.HFV2Logistics.configure({state});
  let reservations = 0;
  window.HFNetwork.reservePathCapacity = () => { reservations += 1; return {ok: true}; };
  load('v2/fleet-dispatch-logic.js', window);
  const before = JSON.stringify(state);
  const plan = window.HFV2FleetDispatch.previewOrder({...dueOrder('preview', 100), plannedDepartureAbsMinute: 60}, {state, fromAbsMinute: 0, horizonDays: 3});
  assert.ok(plan.legs.some(leg => leg.type === 'shipment'));
  assert.ok(plan.legs.some(leg => leg.type === 'return'));
  assert.equal(JSON.stringify(state), before);
  assert.equal(reservations, 0);
});
