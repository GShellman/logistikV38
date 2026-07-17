(() => {
  'use strict';

  let map = null;
  let onNetworkClick = null;
  let onFleetClick = null;
  let onFactoryClick = null;
  let actionPopup = null;
  let activeCity = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    }[char]));
  }

  function stopLeafletPropagation(element) {
    if (!window.L?.DomEvent || !element) return;
    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);
  }

  function hideCityActionMenu() {
    if (actionPopup && map) map.closePopup(actionPopup);
    actionPopup = null;
    activeCity = null;
  }

  function handleMapClick() {
    hideCityActionMenu();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') hideCityActionMenu();
  }

  function bindPopupEvents() {
    const element = actionPopup?.getElement?.();
    const buttons = element?.querySelectorAll?.('.hf-v2-city-action-button');
    if (!element || !buttons?.length) return;

    stopLeafletPropagation(element);
    buttons.forEach(button => {
      button.addEventListener('click', event => {
        L.DomEvent.stopPropagation(event);
        event.preventDefault();
        let callback = onNetworkClick;
        if (button.dataset.action === 'fleet') callback = onFleetClick;
        if (button.dataset.action === 'factory') callback = onFactoryClick;
        callback?.(activeCity);
      });
    });
  }

  function showCityActionMenu(city) {
    if (!map || !window.L || !city) return;

    hideCityActionMenu();
    activeCity = city;
    actionPopup = L.popup({
      className: 'hf-v2-city-action',
      closeButton: false,
      autoClose: false,
      closeOnClick: false,
      offset: [0, -10],
    })
      .setLatLng([city.lat, city.lng])
      .setContent(`
        <div class="hf-v2-city-action-panel" data-city-id="${escapeHtml(city.id)}">
          <button class="hf-v2-city-action-button hf-v2-city-action-button--network" type="button" data-action="network" aria-label="Netzwerkoptionen für ${escapeHtml(city.name)} öffnen">
            <span aria-hidden="true">🛣️</span>
          </button>
          <button class="hf-v2-city-action-button hf-v2-city-action-button--fleet" type="button" data-action="fleet" aria-label="Fuhrpark für ${escapeHtml(city.name)} öffnen">
            <span aria-hidden="true">🚚</span>
          </button>
          <button class="hf-v2-city-action-button hf-v2-city-action-button--factory" type="button" data-action="factory" aria-label="Betriebe für ${escapeHtml(city.name)} öffnen">
            <span aria-hidden="true">🏭</span>
          </button>
        </div>`)
      .openOn(map);

    bindPopupEvents();
  }

  function initCityActionMenu(options) {
    map = options?.map || null;
    onNetworkClick = typeof options?.onNetworkClick === 'function' ? options.onNetworkClick : null;
    onFleetClick = typeof options?.onFleetClick === 'function' ? options.onFleetClick : null;
    onFactoryClick = typeof options?.onFactoryClick === 'function' ? options.onFactoryClick : null;
    hideCityActionMenu();

    if (!map) return;
    map.off('click', handleMapClick);
    map.on('click', handleMapClick);
    document.removeEventListener('keydown', handleKeydown);
    document.addEventListener('keydown', handleKeydown);
  }

  window.initCityActionMenu = initCityActionMenu;
  window.showCityActionMenu = showCityActionMenu;
  window.hideCityActionMenu = hideCityActionMenu;
})();
