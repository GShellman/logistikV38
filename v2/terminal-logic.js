(() => {
  'use strict';

  const DEFAULT_LOGISTICS_LEVEL = Object.freeze({loadingBays: 1, handlingSpeedMultiplier: 1, containerHandlingEnabled: false});
  const UPGRADES = Object.freeze({
    'second-bay': {label: 'Zweite Rampe', cost: 45000},
    forklift: {label: 'Gabelstapler', cost: 25000},
    'container-terminal': {label: 'Containerterminal', cost: 90000},
  });
  let state = null;

  function configure(options = {}) {
    state = options.state || state || window.HFV2Save?.getState?.().network;
    if (!state) return null;
    state.cities = state.cities && typeof state.cities === 'object' ? state.cities : {};
    state.terminalReservations = state.terminalReservations && typeof state.terminalReservations === 'object' ? state.terminalReservations : {};
    return state;
  }

  function logisticsLevel(cityId) {
    const target = configure();
    const city = target.cities[cityId] = target.cities[cityId] || {};
    city.logistics = {...DEFAULT_LOGISTICS_LEVEL, ...(city.logistics || {})};
    city.logistics.loadingBays = Math.max(1, Math.trunc(Number(city.logistics.loadingBays) || 1));
    city.logistics.handlingSpeedMultiplier = Math.max(.1, Number(city.logistics.handlingSpeedMultiplier) || 1);
    city.logistics.containerHandlingEnabled = city.logistics.containerHandlingEnabled === true;
    return city.logistics;
  }

  function reservations(cityId) {
    const target = configure();
    return target.terminalReservations[cityId] = Array.isArray(target.terminalReservations[cityId]) ? target.terminalReservations[cityId] : [];
  }

  function findEarliestSlot(cityId, earliestStartAbsMinute, durationMinutes, options = {}) {
    const level = logisticsLevel(cityId);
    const earliest = Math.max(0, Math.ceil(Number(earliestStartAbsMinute) || 0));
    const duration = Math.max(1, Math.ceil((Number(durationMinutes) || 1) / level.handlingSpeedMultiplier));
    const units = Math.max(1, Math.trunc(Number(options.units) || 1));
    if (options.containerRequired && !level.containerHandlingEnabled) return {ok: false, reason: 'container-terminal-required', nextPossibleAbsMinute: null};
    if (units > level.loadingBays) return {ok: false, reason: 'loading-bay-capacity', nextPossibleAbsMinute: earliest};
    const latest = Number.isFinite(Number(options.latestEndAbsMinute)) ? Number(options.latestEndAbsMinute) : Infinity;
    const booked = reservations(cityId).filter(item => !options.excludeReservationId || item.id !== options.excludeReservationId);
    let start = earliest;
    while (start + duration <= latest) {
      const overlapping = booked.filter(item => item.startAbsMinute < start + duration && item.endAbsMinute > start);
      if (overlapping.reduce((sum, item) => sum + (Number(item.units) || 1), 0) + units <= level.loadingBays) {
        return {ok: true, cityId, startAbsMinute: start, endAbsMinute: start + duration, waitingMinutes: start - earliest, reason: start > earliest ? 'loading-bay-delayed' : null};
      }
      const next = Math.min(...overlapping.map(item => item.endAbsMinute).filter(value => value > start));
      if (!Number.isFinite(next)) break;
      start = next;
    }
    return {ok: false, reason: 'loading-bay-unavailable', nextPossibleAbsMinute: start};
  }

  function reserveSlot(cityId, slot, reservationId, options = {}) {
    if (!slot?.ok || !reservationId) return false;
    const check = findEarliestSlot(cityId, slot.startAbsMinute, slot.endAbsMinute - slot.startAbsMinute, {...options, latestEndAbsMinute: slot.endAbsMinute, excludeReservationId: reservationId});
    if (!check.ok || check.startAbsMinute !== slot.startAbsMinute) return false;
    releaseReservation(reservationId);
    reservations(cityId).push({id: String(reservationId), cityId, operation: options.operation || 'handling', units: Math.max(1, Number(options.units) || 1), startAbsMinute: slot.startAbsMinute, endAbsMinute: slot.endAbsMinute, requestedStartAbsMinute: Number(options.requestedStartAbsMinute ?? slot.startAbsMinute)});
    return true;
  }

  function releaseReservation(reservationId) {
    let removed = 0;
    const target = configure();
    for (const cityId of Object.keys(target.terminalReservations)) {
      const before = reservations(cityId).length;
      target.terminalReservations[cityId] = reservations(cityId).filter(item => item.id !== String(reservationId));
      removed += before - target.terminalReservations[cityId].length;
    }
    return removed;
  }

  function utilization(cityId, atAbsMinute = 0) {
    const level = logisticsLevel(cityId), booked = reservations(cityId);
    const occupiedBays = booked.filter(item => item.startAbsMinute <= atAbsMinute && item.endAbsMinute > atAbsMinute).reduce((sum, item) => sum + item.units, 0);
    const next = findEarliestSlot(cityId, atAbsMinute, 1);
    const waits = booked.map(item => Math.max(0, item.startAbsMinute - (item.requestedStartAbsMinute ?? item.startAbsMinute)));
    return {occupiedBays, loadingBays: level.loadingBays, nextFreeAbsMinute: next.ok ? next.startAbsMinute : next.nextPossibleAbsMinute, averageWaitingMinutes: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0, level};
  }

  function applyUpgrade(cityId, upgradeId) {
    const upgrade = UPGRADES[upgradeId];
    if (!upgrade || Number(window.HFV2Save?.getCash?.()) < upgrade.cost) return {ok: false, reason: 'insufficient-funds'};
    const level = logisticsLevel(cityId);
    if (upgradeId === 'second-bay') level.loadingBays += 1;
    if (upgradeId === 'forklift') level.handlingSpeedMultiplier = Math.round((level.handlingSpeedMultiplier + .5) * 100) / 100;
    if (upgradeId === 'container-terminal') level.containerHandlingEnabled = true;
    window.HFV2Save?.changeCash?.(-upgrade.cost, 'terminal-upgraded', {reference: {cityId, upgradeId}});
    window.HFV2FleetDispatch?.invalidate?.('terminal-upgraded');
    return {ok: true, level};
  }

  window.HFV2Terminal = {DEFAULT_LOGISTICS_LEVEL, UPGRADES, configure, logisticsLevel, findEarliestSlot, reserveSlot, releaseReservation, utilization, applyUpgrade};
})();
