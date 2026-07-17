(() => {
  'use strict';

  const ROAD_TYPES = ['localroad', 'regional', 'mainroad', 'expressway', 'motorway'];
  const BUILD_TYPES = [...ROAD_TYPES, 'rail'];
  const DISPLAY_NAMES = {
    localroad: 'Lokalstraße',
    regional: 'Regionalstraße',
    mainroad: 'Hauptstraße',
    expressway: 'Schnellstraße',
    motorway: 'Autobahn',
    rail: 'Bahnstrecke',
  };

  let activeOriginId = null;
  let activeTargetId = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    }[char]));
  }

  function formatKm(value) {
    return `${Math.round(value).toLocaleString('de-CH')} km`;
  }

  function formatMoney(value) {
    return `CHF ${Math.round(value).toLocaleString('de-CH')}`;
  }

  function citiesById() {
    return window.HFV2CitiesById || {};
  }

  function cityById(cityId) {
    return citiesById()[cityId] || null;
  }

  function network() {
    return window.HFNetwork || null;
  }

  function directDistance(origin, target) {
    return network()?.dist?.(origin, target) || 0;
  }

  function estimatedDistanceForType(origin, target, type) {
    const distance = directDistance(origin, target);
    const spec = network()?.TRANSPORT_TYPES?.[type];
    if (spec?.mode === 'road') return network()?.estimateRoadDistance?.(distance) || distance;
    return distance;
  }

  function candidateTargets(originId) {
    const hfNetwork = network();
    if (!hfNetwork) return [];
    const targets = hfNetwork.getCandidateTargets?.(originId) || hfNetwork.getAvailableConnections?.(originId) || [];
    return targets.map(entry => entry.city || entry).filter(Boolean);
  }

  function connectionState(originId, targetId) {
    const hfNetwork = network();
    return {
      road: !!hfNetwork?.connectionExists?.(originId, targetId, 'road'),
      rail: !!hfNetwork?.connectionExists?.(originId, targetId, 'rail'),
    };
  }

  function renderExistingBadges(state) {
    const badges = [];
    if (state.road) badges.push('<span class="network-menu__badge network-menu__badge--disabled">Straße besteht</span>');
    if (state.rail) badges.push('<span class="network-menu__badge network-menu__badge--disabled">Bahn besteht</span>');
    if (!badges.length) badges.push('<span class="network-menu__badge">Bebaubar</span>');
    return badges.join('');
  }

  function renderTargetPicker(originId) {
    activeOriginId = originId;
    activeTargetId = null;

    const origin = cityById(originId);
    const targets = candidateTargets(originId);
    const rows = targets.length ? targets.map(target => {
      const state = connectionState(originId, target.id);
      const fullyConnected = state.road && state.rail;
      const distance = origin ? estimatedDistanceForType(origin, target, 'mainroad') : 0;
      return `
        <button class="network-menu__target${fullyConnected ? ' is-disabled' : ''}" type="button" data-network-target="${escapeHtml(target.id)}" ${fullyConnected ? 'disabled' : ''}>
          <span>
            <strong>${escapeHtml(target.name)}</strong>
            <small>${formatKm(distance)} · Stufe ${escapeHtml(target.tier)}</small>
          </span>
          <span class="network-menu__badges">${renderExistingBadges(state)}</span>
        </button>`;
    }).join('') : '<p class="network-menu__empty">Keine potenziellen Zielstädte in Reichweite.</p>';

    return `
      <div class="network-menu" data-network-origin="${escapeHtml(originId)}">
        <p class="network-menu__eyebrow">Ursprung</p>
        <h3>${escapeHtml(origin?.name || originId)}</h3>
        <p class="network-menu__hint">Wähle eine Zielstadt aus dem Stadtkatalog. Bereits vorhandene Verbindungen sind markiert; vollständig verbundene Ziele sind deaktiviert.</p>
        <div class="network-menu__targets">${rows}</div>
      </div>`;
  }

  function renderBuildOption(origin, target, type) {
    const hfNetwork = network();
    const spec = hfNetwork?.TRANSPORT_TYPES?.[type];
    if (!spec) return '';
    const exists = hfNetwork.connectionExists?.(origin.id, target.id, spec.mode);
    const distance = estimatedDistanceForType(origin, target, type);
    const quote = hfNetwork.buildQuote?.(type, distance);
    const disabled = exists || !quote;
    return `
      <button class="network-menu__build-option${disabled ? ' is-disabled' : ''}" type="button" data-network-build="${escapeHtml(type)}" ${disabled ? 'disabled' : ''}>
        <span class="network-menu__build-icon" aria-hidden="true">${escapeHtml(spec.icon)}</span>
        <span>
          <strong>${escapeHtml(DISPLAY_NAMES[type] || spec.name)}</strong>
          <small>${formatKm(distance)} · ${formatMoney(quote?.cost || 0)} · Unterhalt ${formatMoney(quote?.maintenance || 0)}/Tag</small>
        </span>
        ${exists ? '<span class="network-menu__badge network-menu__badge--disabled">besteht</span>' : '<span class="network-menu__badge">planen</span>'}
      </button>`;
  }

  function renderBuildOptions(originId, targetId) {
    activeOriginId = originId;
    activeTargetId = targetId;
    const origin = cityById(originId);
    const target = cityById(targetId);
    if (!origin || !target) return renderTargetPicker(originId);

    return `
      <div class="network-menu" data-network-origin="${escapeHtml(originId)}" data-network-target-id="${escapeHtml(targetId)}">
        <button class="network-menu__back" type="button" data-network-target-picker>← Ziel ändern</button>
        <p class="network-menu__eyebrow">Bauoptionen</p>
        <h3>${escapeHtml(origin.name)} → ${escapeHtml(target.name)}</h3>
        <div class="network-menu__build-options">${BUILD_TYPES.map(type => renderBuildOption(origin, target, type)).join('')}</div>
        <p class="network-menu__hint">Nach Auswahl wird das Projekt mit Kosten, Distanz und Route in der Netzwerklogik vorgemerkt.</p>
      </div>`;
  }

  function setBody(html) {
    window.HFV2Modal?.setModalBody?.(html);
  }

  async function handleBuild(type) {
    const project = await network()?.planConnection?.(activeOriginId, activeTargetId, type);
    if (!project) return;
    const origin = cityById(project.a);
    const target = cityById(project.b);
    setBody(`
      <div class="network-menu">
        <p class="network-menu__eyebrow">Projekt geplant</p>
        <h3>${escapeHtml(origin?.name || project.a)} → ${escapeHtml(target?.name || project.b)}</h3>
        <p class="network-menu__hint">${escapeHtml(DISPLAY_NAMES[project.type] || network()?.TRANSPORT_TYPES?.[project.type]?.name || project.type)} · ${formatKm(project.distance)} · Baukosten ${formatMoney(project.cost)} · Unterhalt ${formatMoney(project.maintenance)}/Tag</p>
        <button class="network-menu__back" type="button" data-network-back>Weitere Option wählen</button>
      </div>`);
  }

  function bindNetworkMenuEvents() {
    document.addEventListener('click', event => {
      const targetButton = event.target.closest?.('[data-network-target]');
      if (targetButton) {
        event.preventDefault();
        setBody(renderBuildOptions(activeOriginId, targetButton.dataset.networkTarget));
        return;
      }

      const buildButton = event.target.closest?.('[data-network-build]');
      if (buildButton) {
        event.preventDefault();
        handleBuild(buildButton.dataset.networkBuild);
        return;
      }

      if (event.target.closest?.('[data-network-target-picker]')) {
        event.preventDefault();
        setBody(renderTargetPicker(activeOriginId));
        return;
      }

      if (event.target.closest?.('[data-network-back]')) {
        event.preventDefault();
        setBody(activeTargetId ? renderBuildOptions(activeOriginId, activeTargetId) : renderTargetPicker(activeOriginId));
      }
    });
  }

  function openNetworkMenuForCity(cityId) {
    const origin = cityById(cityId);
    if (!origin || !window.HFV2Modal?.openModal) return;
    window.HFV2Modal.openModal({
      className: 'city-network-modal',
      title: origin.name,
      subtitle: 'Netzwerk bauen',
      bodyHtml: renderTargetPicker(cityId),
    });
  }

  bindNetworkMenuEvents();

  window.openNetworkMenuForCity = openNetworkMenuForCity;
  window.HFNetworkMenu = {openNetworkMenuForCity, renderTargetPicker, renderBuildOptions};
})();
