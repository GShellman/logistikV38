(() => {
  'use strict';

  const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  let state = null;

  function defaultTimeState() {
    return window.HFV2Save?.defaultTimeState?.() || {day: 1, hour: 8, minute: 0};
  }

  function normalizeTimeUnit(value, fallback, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const integer = Math.trunc(numeric);
    return integer >= min && integer <= max ? integer : fallback;
  }

  function normalizeTimeState(time = {}) {
    const defaults = defaultTimeState();
    return {
      day: normalizeTimeUnit(time.day, defaults.day, 1, Number.MAX_SAFE_INTEGER),
      hour: normalizeTimeUnit(time.hour, defaults.hour, 0, 23),
      minute: normalizeTimeUnit(time.minute, defaults.minute, 0, 59),
    };
  }

  function configure(options = {}) {
    const saveTime = window.HFV2Save?.getState?.().time;
    const source = options.state || state || saveTime || defaultTimeState();
    const normalized = normalizeTimeState(source);
    Object.assign(source, normalized);
    state = source;
    if (window.HFV2Save?.getState?.().time && window.HFV2Save.getState().time !== state) {
      window.HFV2Save.getState().time = state;
    }
    return state;
  }

  function getState() {
    return configure();
  }

  function formatClock() {
    const time = getState();
    const weekday = WEEKDAYS[(time.day - 1) % 7];
    const clock = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
    return `${weekday} · Tag ${time.day} · ${clock}`;
  }

  function dispatchTimeAdvanced(options = {}) {
    const reason = options.reason || 'time-advanced';
    window.HFV2Save?.dispatchStateChanged?.(reason);
  }

  function runMidnightCallbacks(days) {
    const count = Math.max(0, Math.trunc(Number(days) || 0));
    const summaries = [];
    for (let index = 0; index < count; index += 1) {
      if (window.HFV2DayCycle?.runDailyCycle) summaries.push(window.HFV2DayCycle.runDailyCycle());
      else {
        const sales = window.HFV2Goods?.runDailySales?.() || {revenue: 0, soldKg: 0};
        const production = window.HFV2Goods?.runDailyProduction?.() || {madeKg: 0, blocked: 0};
        summaries.push({sales, production, maintenance: 0});
      }
    }
    return window.HFV2DayCycle?.aggregateDailyCycleSummaries?.(summaries) || summaries[summaries.length - 1] || null;
  }

  function advanceMinutes(minutes, options = {}) {
    const amount = Math.max(0, Math.trunc(Number(minutes) || 0));
    const time = getState();
    if (amount <= 0) return time;

    const before = {...time};
    const totalMinutes = time.hour * 60 + time.minute + amount;
    const elapsedDays = Math.floor(totalMinutes / 1440);
    const dayMinute = totalMinutes % 1440;

    time.day += elapsedDays;
    time.hour = Math.floor(dayMinute / 60);
    time.minute = dayMinute % 60;

    if (elapsedDays > 0) runMidnightCallbacks(elapsedDays);
    window.HFV2Transport?.processDueDeliveries?.(before, {...time});
    dispatchTimeAdvanced(options);
    return time;
  }

  function nextHour() {
    return advanceMinutes(60);
  }

  function endDay() {
    const time = getState();
    const minutesElapsedToday = time.hour * 60 + time.minute;
    const remainingMinutes = minutesElapsedToday === 0 ? 1440 : 1440 - minutesElapsedToday;
    return advanceMinutes(remainingMinutes);
  }

  window.HFV2Time = {configure, getState, formatClock, advanceMinutes, nextHour, endDay};
})();
