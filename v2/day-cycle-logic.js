(() => {
  'use strict';

  const roundMoney = value => Math.round((Number(value) || 0) * 100) / 100;
  const roundKg = value => Math.round((Number(value) || 0) * 1000) / 1000;
  const emptySalesSummary = () => ({revenue: 0, soldKg: 0});
  const emptyProductionSummary = () => ({madeKg: 0, blocked: 0});

  function entriesForDay(day) {
    return (window.HFV2Save?.getState?.().finance?.journal || []).filter(entry => Number(entry.day) === day);
  }

  function sumCategory(entries, categories) {
    const wanted = new Set(categories);
    return roundMoney(entries.filter(entry => wanted.has(entry.category)).reduce((sum, entry) => sum + Math.abs(Number(entry.amount) || 0), 0));
  }

  function summaryForDay(day, sales = emptySalesSummary(), production = emptyProductionSummary()) {
    const entries = entriesForDay(day);
    const revenue = roundMoney(entries.filter(entry => entry.category === 'sales').reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0));
    const network = sumCategory(entries, ['network-maintenance']);
    const factories = sumCategory(entries, ['factory-operation']);
    const fleet = sumCategory(entries, ['fleet-daily']);
    const transport = sumCategory(entries, ['shipment-distance', 'repositioning-distance']);
    const total = roundMoney(network + factories + fleet + transport);
    const investments = roundMoney(-entries.filter(entry => ['vehicle-purchase', 'vehicle-sale', 'factory-build', 'factory-upgrade', 'network-build'].includes(entry.category)).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0));
    const cashChange = roundMoney(entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0));
    return {day, revenue: {sales: revenue}, costs: {network, factories, fleet, transport, total}, operatingResult: roundMoney(revenue - total), investments, cashChange, closingCash: roundMoney(window.HFV2Save?.getCash?.()), sales: {...sales, revenue}, production};
  }

  function bookDailyCosts(day) {
    const state = window.HFV2Save?.getState?.() || {};
    const absMinute = day * 1440 - 1;
    const network = (state.network?.connections || []).reduce((sum, connection) => sum + Math.max(0, Number(connection.maintenance) || 0), 0);
    if (network) window.HFV2Save?.changeCash?.(-network, 'network-maintenance', {bookingId: `daily:${day}:network`, absMinute});

    for (const [cityId, factoryIds] of Object.entries(state.factories?.cityFactories || {})) {
      (factoryIds || []).forEach((factoryId, index) => {
        const factory = (window.HFV2Factories?.FACTORIES || window.HFV2FactoryCatalog || []).find(item => item.id === factoryId);
        const level = Math.max(1, Math.trunc(Number(state.factories?.factoryUpgrades?.[cityId]?.[String(index)]) || 1));
        const cost = Math.max(0, Number(window.HFV2Factories?.operatingCostForFactory?.(factory, level)) || 0);
        if (cost) window.HFV2Save?.changeCash?.(-cost, 'factory-operation', {bookingId: `daily:${day}:factory:${cityId}:${index}`, absMinute, reference: {factoryId, cityId, factoryIndex: index}});
      });
    }

    for (const vehicle of state.fleet?.vehicles || []) {
      const daily = Math.max(0, Number(window.HFVehicleCatalog?.VEHICLE_CATALOG?.[vehicle.vehicleType]?.daily) || 0);
      if (daily) window.HFV2Save?.changeCash?.(-daily, 'fleet-daily', {bookingId: `daily:${day}:vehicle:${vehicle.id}`, absMinute, reference: {vehicleId: vehicle.id}});
    }
  }

  function runDailyCycle(options = {}) {
    const state = window.HFV2Save?.getState?.() || {};
    state.finance ||= {journal: [], nextEntryId: 1, lastClosedDay: 0};
    const currentDay = Math.max(1, Math.trunc(Number(state.time?.day) || 1));
    const day = Math.max(1, Math.trunc(Number(options.day) || currentDay - 1 || 1));
    if (state.finance.lastClosedDay >= day) return summaryForDay(day);
    const absMinute = day * 1440 - 1;
    const sales = window.HFV2Goods?.runDailySales?.({day, absMinute}) || emptySalesSummary();
    const production = window.HFV2Goods?.runDailyProduction?.() || emptyProductionSummary();
    bookDailyCosts(day);
    state.finance.lastClosedDay = day;
    // Sales and production change the stock available to tomorrow's orders.
    // Rebuild now, while midnight is processed, instead of waiting for a menu
    // render or a later logistics tick to lazily complete the calendar.
    const newDayStartAbsMinute = (currentDay - 1) * 1440;
    window.HFV2FleetDispatch?.invalidate?.('daily-cycle-complete', newDayStartAbsMinute);
    window.HFV2FleetDispatch?.buildPlan?.({fromAbsMinute: newDayStartAbsMinute});
    return summaryForDay(day, sales, production);
  }

  function normalizeDailyCycleSummary(summary = {}) { return summary; }
  function aggregateDailyCycleSummaries(summaries = []) {
    const valid = summaries.filter(Boolean);
    if (!valid.length) return null;
    if (valid.length === 1) return valid[0];
    const result = {
      days: valid.map(summary => summary.day),
      revenue: {sales: 0}, costs: {network: 0, factories: 0, fleet: 0, transport: 0, total: 0},
      operatingResult: 0, investments: 0, cashChange: 0, closingCash: valid[valid.length - 1].closingCash,
      sales: emptySalesSummary(), production: emptyProductionSummary(),
    };
    for (const summary of valid) {
      result.revenue.sales += Number(summary.revenue?.sales) || 0;
      for (const key of Object.keys(result.costs)) result.costs[key] += Number(summary.costs?.[key]) || 0;
      result.operatingResult += Number(summary.operatingResult) || 0;
      result.investments += Number(summary.investments) || 0;
      result.cashChange += Number(summary.cashChange) || 0;
      result.sales.revenue += Number(summary.sales?.revenue) || 0;
      result.sales.soldKg += Number(summary.sales?.soldKg) || 0;
      result.production.madeKg += Number(summary.production?.madeKg) || 0;
      result.production.blocked += Number(summary.production?.blocked) || 0;
    }
    return JSON.parse(JSON.stringify(result), (_key, value) => typeof value === 'number' ? roundMoney(value) : value);
  }

  window.HFV2DayCycle = {runDailyCycle, aggregateDailyCycleSummaries, normalizeDailyCycleSummary, summaryForDay};
})();
