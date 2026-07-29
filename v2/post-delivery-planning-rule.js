(() => {
  'use strict';

  // This is deliberately a policy-only rule.  Timing and capacity are supplied by
  // the planner; execution must consume the resulting, persisted action verbatim.
  function decide({originCityId, destinationCityId} = {}) {
    return originCityId != null && destinationCityId != null && originCityId !== destinationCityId
      ? 'return'
      : 'stay';
  }

  window.HFV2PostDeliveryPlanning = {decide};
})();
