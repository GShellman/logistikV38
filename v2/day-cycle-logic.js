(() => {
  'use strict';

  function emptySalesSummary() {
    return {revenue: 0, soldKg: 0};
  }

  function emptyProductionSummary() {
    return {madeKg: 0, blocked: 0};
  }

  function emptyDailyCycleSummary() {
    return {sales: emptySalesSummary(), production: emptyProductionSummary(), maintenance: 0};
  }

  function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function roundKg(value) {
    return Math.round((Number(value) || 0) * 1000) / 1000;
  }

  function normalizeDailyCycleSummary(summary = {}) {
    const sales = summary.sales || {};
    const production = summary.production || {};
    return {
      sales: {
        revenue: roundMoney(sales.revenue),
        soldKg: roundKg(sales.soldKg),
      },
      production: {
        madeKg: roundKg(production.madeKg),
        blocked: Math.max(0, Math.trunc(Number(production.blocked) || 0)),
      },
      maintenance: roundMoney(summary.maintenance),
    };
  }

  function aggregateDailyCycleSummaries(summaries = []) {
    const aggregate = emptyDailyCycleSummary();
    for (const rawSummary of summaries) {
      const summary = normalizeDailyCycleSummary(rawSummary);
      aggregate.sales.revenue += summary.sales.revenue;
      aggregate.sales.soldKg += summary.sales.soldKg;
      aggregate.production.madeKg += summary.production.madeKg;
      aggregate.production.blocked += summary.production.blocked;
      aggregate.maintenance += summary.maintenance;
    }
    return normalizeDailyCycleSummary(aggregate);
  }

  function runDailyCycle() {
    const sales = window.HFV2Goods?.runDailySales?.() || emptySalesSummary();
    const production = window.HFV2Goods?.runDailyProduction?.() || emptyProductionSummary();
    return normalizeDailyCycleSummary({sales, production, maintenance: 0});
  }

  window.HFV2DayCycle = {runDailyCycle, aggregateDailyCycleSummaries, normalizeDailyCycleSummary};
})();
