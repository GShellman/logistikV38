(() => {
  'use strict';

  let actionPopup = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    }[char]));
  }

  function currentMap() {
    return window.HFV2Map || null;
  }

  function networkMenuForCity(cityId) {
    if (!window.HFNetwork?.openNetworkBuildMenu) return [];
    return window.HFNetwork.openNetworkBuildMenu(cityId) || [];
  }

  function availableConnectionLabel(entry) {
    const modes = [];
    if (!entry.hasRoad) modes.push('Straße');
    if (!entry.hasRail) modes.push('Bahn');
    return modes.length ? modes.join(' / ') : 'keine neue Verbindung';
  }

  function openNetworkPopupForCity(cityId) {
    const map = currentMap();
    const city = window.HFV2CitiesById?.[cityId];
    if (!map || !window.L || !city) return;

    const connections = networkMenuForCity(cityId);
    const connectionRows = connections.length
      ? connections.slice(0, 6).map(entry => `
          <li>
            <strong>${escapeHtml(entry.city.name)}</strong>
            <span>${Math.round(entry.roadDistance).toLocaleString('de-CH')} km · ${escapeHtml(availableConnectionLabel(entry))}</span>
          </li>`).join('')
      : '<li><span>Keine neuen Verbindungen in Reichweite.</span></li>';

    hideCityNetworkAction();
    actionPopup = L.popup({
      className: 'city-network-popup',
      closeButton: true,
      autoClose: true,
      closeOnClick: false,
      offset: [0, -10],
    })
      .setLatLng([city.lat, city.lng])
      .setContent(`
        <div class="city-network-menu">
          <p class="city-network-menu__eyebrow">Netzwerk bauen</p>
          <h3>${escapeHtml(city.name)}</h3>
          <ul>${connectionRows}</ul>
        </div>`)
      .openOn(map);
  }

  function hideCityNetworkAction() {
    const map = currentMap();
    if (actionPopup && map) map.closePopup(actionPopup);
    actionPopup = null;
  }

  function showCityNetworkAction(city) {
    const map = currentMap();
    if (!map || !window.L || !city) return;

    hideCityNetworkAction();
    actionPopup = L.popup({
      className: 'city-network-action-popup',
      closeButton: false,
      autoClose: true,
      closeOnClick: false,
      offset: [0, -10],
    })
      .setLatLng([city.lat, city.lng])
      .setContent(`
        <button class="city-network-action" type="button" data-city-id="${escapeHtml(city.id)}" aria-label="Netzwerkoptionen für ${escapeHtml(city.name)} öffnen">
          <span aria-hidden="true">🛣️</span>
        </button>`)
      .openOn(map);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('.city-network-action');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openNetworkPopupForCity(button.dataset.cityId);
  });

  window.showCityNetworkAction = showCityNetworkAction;
  window.hideCityNetworkAction = hideCityNetworkAction;
  window.openNetworkPopupForCity = openNetworkPopupForCity;
})();
