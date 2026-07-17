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
    if (state.road) badges.push('<span class="hf-v2-network-badge hf-v2-network-badge--disabled">Straße besteht</span>');
    if (state.rail) badges.push('<span class="hf-v2-network-badge hf-v2-network-badge--disabled">Bahn besteht</span>');
    if (!badges.length) badges.push('<span class="hf-v2-network-badge">Bebaubar</span>');
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
        <button class="hf-v2-network-target${fullyConnected ? ' is-disabled' : ''}" type="button" data-action="select-target" data-target="${escapeHtml(target.id)}" ${fullyConnected ? 'disabled' : ''}>
          <span>
            <strong>${escapeHtml(target.name)}</strong>
            <small>${formatKm(distance)} · Stufe ${escapeHtml(target.tier)}</small>
          </span>
          <span class="hf-v2-network-badges">${renderExistingBadges(state)}</span>
        </button>`;
    }).join('') : '<p class="hf-v2-network-empty">Keine potenziellen Zielstädte in Reichweite.</p>';

    return `
      <div class="hf-v2-network-menu" data-network-origin="${escapeHtml(originId)}">
        <p class="hf-v2-network-eyebrow">Ursprung</p>
        <h3>${escapeHtml(origin?.name || originId)}</h3>
        <p class="hf-v2-network-hint">Wähle eine Zielstadt aus dem Stadtkatalog. Bereits vorhandene Verbindungen sind markiert; vollständig verbundene Ziele sind deaktiviert.</p>
        <div class="hf-v2-network-grid">${rows}</div>
      </div>`;
  }

  function currentCash() {
    return window.HFV2Save?.getCash?.() ?? 0;
  }

  function renderCashBadge() {
    return `<div class="hf-v2-fleet-cash" aria-label="Verfügbares Kapital"><span>Kapital</span><strong>${formatMoney(currentCash())}</strong></div>`;
  }

  function renderBuildOption(origin, target, type) {
    const hfNetwork = network();
    const spec = hfNetwork?.TRANSPORT_TYPES?.[type];
    if (!spec) return '';
    const exists = hfNetwork.connectionExists?.(origin.id, target.id, spec.mode);
    const distance = estimatedDistanceForType(origin, target, type);
    const quote = hfNetwork.buildQuote?.(type, distance);
    const canAfford = !!quote && currentCash() >= quote.cost;
    const disabled = exists || !quote || !canAfford;
    return `
      <button class="hf-v2-network-option${disabled ? ' is-disabled' : ''}" type="button" data-action="plan-connection" data-origin="${escapeHtml(origin.id)}" data-target="${escapeHtml(target.id)}" data-type="${escapeHtml(type)}" ${disabled ? 'disabled' : ''}>
        <span class="hf-v2-network-icon" aria-hidden="true">${escapeHtml(spec.icon)}</span>
        <span>
          <strong>${escapeHtml(DISPLAY_NAMES[type] || spec.name)}</strong>
          <small>${formatKm(distance)} · ${formatMoney(quote?.cost || 0)} · Unterhalt ${formatMoney(quote?.maintenance || 0)}/Tag</small>
        </span>
        ${exists ? '<span class="hf-v2-network-badge hf-v2-network-badge--disabled">besteht</span>' : canAfford ? '<span class="hf-v2-network-badge">planen</span>' : '<span class="hf-v2-network-badge hf-v2-network-badge--disabled">zu teuer</span>'}
      </button>`;
  }

  function renderBuildOptions(originId, targetId) {
    activeOriginId = originId;
    activeTargetId = targetId;
    const origin = cityById(originId);
    const target = cityById(targetId);
    if (!origin || !target) return renderTargetPicker(originId);

    return `
      <div class="hf-v2-network-menu" data-network-origin="${escapeHtml(originId)}" data-network-target-id="${escapeHtml(targetId)}">
        <button class="hf-v2-network-back" type="button" data-action="show-target-picker">← Ziel ändern</button>
        <p class="hf-v2-network-eyebrow">Bauoptionen</p>
        <h3>${escapeHtml(origin.name)} → ${escapeHtml(target.name)}</h3>
        ${renderCashBadge()}
        <div class="hf-v2-network-grid">${BUILD_TYPES.map(type => renderBuildOption(origin, target, type)).join('')}</div>
        <p class="hf-v2-network-hint">Nach Auswahl wird das Projekt mit Kosten, Distanz und Route in der Netzwerklogik vorgemerkt.</p>
      </div>`;
  }

  function setBody(html) {
    window.HFV2Modal?.setModalBody?.(html);
  }

  async function handleBuild(type, originId = activeOriginId, targetId = activeTargetId) {
    activeOriginId = originId;
    activeTargetId = targetId;
    const project = await window.HF_V2?.planConnection?.(originId, targetId, type);
    if (!project) return;
    if (project.ok === false && project.reason === 'not-enough-cash') {
      setBody(`
        <div class="hf-v2-network-menu">
          <p class="hf-v2-network-eyebrow">Nicht genug Kapital</p>
          <h3>Projekt nicht planbar</h3>
          ${renderCashBadge()}
          <p class="hf-v2-network-hint">Benötigt ${formatMoney(project.cost)}, verfügbar ${formatMoney(project.cash)}.</p>
          <button class="hf-v2-network-back" type="button" data-action="back-to-build-options">Weitere Option wählen</button>
        </div>`);
      return;
    }
    const origin = cityById(project.a);
    const target = cityById(project.b);
    setBody(`
      <div class="hf-v2-network-menu">
        <p class="hf-v2-network-eyebrow">Projekt geplant</p>
        <h3>${escapeHtml(origin?.name || project.a)} → ${escapeHtml(target?.name || project.b)}</h3>
        ${renderCashBadge()}
        <p class="hf-v2-network-hint">${escapeHtml(DISPLAY_NAMES[project.type] || network()?.TRANSPORT_TYPES?.[project.type]?.name || project.type)} · ${formatKm(project.distance)} · Baukosten ${formatMoney(project.cost)} · Unterhalt ${formatMoney(project.maintenance)}/Tag</p>
        <button class="hf-v2-network-back" type="button" data-action="confirm-project">Bauen</button>
        <button class="hf-v2-network-back" type="button" data-action="back-to-build-options">Weitere Option wählen</button>
      </div>`);
  }

  function bindNetworkMenuEvents() {
    document.addEventListener('click', event => {
      const actionButton = event.target.closest?.('[data-action]');
      if (!actionButton) return;

      const modalBody = document.getElementById('hfV2ModalBody');
      if (modalBody && !modalBody.contains(actionButton)) return;

      const {action, origin, target, type} = actionButton.dataset;
      if (!action) return;

      event.preventDefault();

      if (action === 'select-target') {
        setBody(renderBuildOptions(activeOriginId, target));
        return;
      }

      if (action === 'plan-connection') {
        handleBuild(type, origin, target);
        return;
      }

      if (action === 'show-target-picker') {
        setBody(renderTargetPicker(activeOriginId));
        return;
      }

      if (action === 'confirm-project') {
        window.HF_V2?.confirmProject?.();
        return;
      }

      if (action === 'back-to-build-options') {
        setBody(activeTargetId ? renderBuildOptions(activeOriginId, activeTargetId) : renderTargetPicker(activeOriginId));
      }
    });
  }

  function openNetworkMenuForCity(cityId) {
    const origin = cityById(cityId);
    if (!origin || !window.HFV2Modal?.openModal) return;
    window.HFV2Modal.openModal({
      className: 'hf-v2-network-modal',
      title: origin.name,
      subtitle: 'Netzwerk bauen',
      bodyHtml: renderTargetPicker(cityId),
    });
  }

  bindNetworkMenuEvents();

  window.HFNetworkMenu = {openNetworkMenuForCity, renderTargetPicker, renderBuildOptions};
})();
