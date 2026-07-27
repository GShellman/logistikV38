(() => {
  'use strict';

  const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const MINUTES_PER_DAY = 1440;

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

  function absoluteMinute(time = getState()) {
    return (time.day - 1) * MINUTES_PER_DAY + time.hour * 60 + time.minute;
  }

  function setAbsoluteMinute(absMinute) {
    const time = getState();
    const value = Math.max(0, Math.trunc(Number(absMinute) || 0));
    time.day = Math.floor(value / MINUTES_PER_DAY) + 1;
    const minuteOfDay = value % MINUTES_PER_DAY;
    time.hour = Math.floor(minuteOfDay / 60);
    time.minute = minuteOfDay % 60;
    return time;
  }

  function addFutureEvent(events, value, after, through) {
    const minute = Number(value);
    if (Number.isFinite(minute) && minute > after && minute <= through) events.push(minute);
  }

  // The event list is rebuilt after every point because dispatching may create new
  // arrivals.  This is deliberately an absolute-minute timeline; day changes have
  // no special meaning for vehicles or reservations.
  function nextEventAbsMinute(after, through) {
    const logistics = window.HFV2Logistics?.getState?.() || {};
    const events = [through];
    const nextMidnight = (Math.floor(after / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY;
    addFutureEvent(events, nextMidnight, after, through);

    for (const shipment of logistics.shipments || []) {
      if (shipment.status === 'active') {
        addFutureEvent(events, shipment.arrivalAbsMinute, after, through);
        for (const stop of shipment.stops || []) {
          if (stop.status === 'pending' || !stop.status) addFutureEvent(events, stop.arrivalAbsMinute, after, through);
        }
      } else if (shipment.status === 'returning') {
        addFutureEvent(events, shipment.returnArrivalAbsMinute, after, through);
      }
    }
    for (const assignment of logistics.assignments || []) {
      if (assignment.status === 'planned') addFutureEvent(events, assignment.departureAbsMinute, after, through);
      if (assignment.status === 'planned' || assignment.status === 'active') addFutureEvent(events, assignment.arrivalAbsMinute, after, through);
    }
    const firstDay = Math.floor(after / MINUTES_PER_DAY) + 1;
    const lastDay = Math.floor(through / MINUTES_PER_DAY) + 1;
    for (const order of logistics.orders || []) {
      if (order.enabled === false) continue;
      for (let day = firstDay; day <= lastDay; day += 1) {
        if (order.frequency === 'weekly' && (day - 1) % 7 !== 0) continue;
        if (order.lastDispatchedDay === day) continue;
        addFutureEvent(events, (day - 1) * MINUTES_PER_DAY + Number(order.departureHour) * 60 + Number(order.departureMinute), after, through);
      }
    }
    return Math.min(...events);
  }

  function processCurrentMinute({dispatchOrders = true} = {}) {
    // Releases, arrivals and unloads must be visible before a due order asks the
    // dispatcher for a vehicle or capacity at this same minute.
    window.HFV2Logistics?.advanceShipments?.();
    if (dispatchOrders) window.HFV2Logistics?.tick?.();
  }

  function reconcileCurrentTime(options = {}) {
    processCurrentMinute({dispatchOrders: options.dispatchOrders !== false});
    return getState();
  }

  function advanceMinutes(minutes, options = {}) {
    const amount = Math.max(0, Math.trunc(Number(minutes) || 0));
    const time = getState();
    if (amount <= 0) return time;

    let cursor = absoluteMinute(time);
    const target = cursor + amount;
    while (cursor < target) {
      const eventMinute = nextEventAbsMinute(cursor, target);
      setAbsoluteMinute(eventMinute);
      window.HFV2Logistics?.advanceShipments?.();
      if (eventMinute % MINUTES_PER_DAY === 0) runMidnightCallbacks(1);
      window.HFV2Logistics?.tick?.();
      cursor = eventMinute;
    }
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

  window.HFV2Time = {configure, getState, formatClock, absoluteMinute, advanceMinutes, reconcileCurrentTime, nextHour, endDay};
})();
