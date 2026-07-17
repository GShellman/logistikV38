(() => {
  'use strict';

  let map = null;
  let onNetworkClick = null;
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
    const button = element?.querySelector?.('.city-action-menu__network-button');
    if (!element || !button) return;

    stopLeafletPropagation(element);
    button.addEventListener('click', event => {
      L.DomEvent.stopPropagation(event);
      event.preventDefault();
      onNetworkClick?.(activeCity);
    });
  }

  function showCityActionMenu(city) {
    if (!map || !window.L || !city) return;

    hideCityActionMenu();
    activeCity = city;
    actionPopup = L.popup({
      className: 'city-action-menu-popup',
      closeButton: false,
      autoClose: false,
      closeOnClick: false,
      offset: [0, -10],
    })
      .setLatLng([city.lat, city.lng])
      .setContent(`
        <div class="city-action-menu" data-city-id="${escapeHtml(city.id)}">
          <button class="city-action-menu__network-button" type="button" aria-label="Netzwerkoptionen für ${escapeHtml(city.name)} öffnen">
            <span aria-hidden="true">🛣️</span>
          </button>
        </div>`)
      .openOn(map);

    bindPopupEvents();
  }

  function initCityActionMenu(options) {
    map = options?.map || null;
    onNetworkClick = typeof options?.onNetworkClick === 'function' ? options.onNetworkClick : null;
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
