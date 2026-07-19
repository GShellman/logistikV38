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

  function isUnlockedCity(cityId) {
    return cityId === 'zurich' || window.HFNetwork?.getState?.().cities?.[cityId]?.unlocked === true;
  }

  function renderExistingBadges(state, cityId) {
    const badges = [];
    const isOnline = isUnlockedCity(cityId);
    badges.push(`<span class="hf-v2-network-badge${isOnline ? ' hf-v2-network-badge--online' : ''}">${isOnline ? 'Am Netz' : 'Noch nicht angebunden'}</span>`);
    if (state.road) badges.push('<span class="hf-v2-network-badge hf-v2-network-badge--disabled">Straße besteht</span>');
    if (state.rail) badges.push('<span class="hf-v2-network-badge hf-v2-network-badge--disabled">Bahn besteht</span>');
    if (!state.road && !state.rail) badges.push('<span class="hf-v2-network-badge">Bebaubar</span>');
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
          <span class="hf-v2-network-badges">${renderExistingBadges(state, target.id)}</span>
        </button>`;
    }).join('') : '<p class="hf-v2-network-empty">Keine potenziellen Zielstädte in Reichweite.</p>';

    return `
      <div class="hf-v2-network-menu" data-network-origin="${escapeHtml(originId)}">
        <p class="hf-v2-network-eyebrow">Ursprung</p>
        <h3>${escapeHtml(origin?.name || originId)}</h3>
        <p class="hf-v2-network-hint">Wähle eine Zielstadt aus dem Stadtkatalog. Bereits angebundene Städte und bestehende Verbindungen sind markiert; vollständig verbundene Ziele sind deaktiviert.</p>
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
    const statusLabel = exists ? 'Besteht' : canAfford ? 'Planbar' : 'Nicht leistbar';
    const statusClass = exists || !canAfford ? ' hf-v2-network-badge--disabled' : '';
    return `
      <button class="hf-v2-network-option${disabled ? ' is-disabled' : ''}" type="button" data-action="plan-connection" data-origin="${escapeHtml(origin.id)}" data-target="${escapeHtml(target.id)}" data-type="${escapeHtml(type)}" ${disabled ? 'disabled' : ''}>
        <span class="hf-v2-network-option__header">
          <span class="hf-v2-network-icon" aria-hidden="true">${escapeHtml(spec.icon)}</span>
          <span class="hf-v2-network-option__title">
            <strong>${escapeHtml(DISPLAY_NAMES[type] || spec.name)}</strong>
            <small>${escapeHtml(spec.mode === 'rail' ? 'Schienentrasse' : 'Straßenverbindung')}</small>
          </span>
          <span class="hf-v2-network-badge${statusClass}">${statusLabel}</span>
        </span>
        <span class="hf-v2-network-option__rows">
          <span><em>Distanz</em><strong>${formatKm(distance)}</strong></span>
          <span><em>Baukosten</em><strong>${formatMoney(quote?.cost || 0)}</strong></span>
          <span><em>Unterhalt</em><strong>${formatMoney(quote?.maintenance || 0)}/Tag</strong></span>
          <span><em>Status</em><strong>${statusLabel}</strong></span>
        </span>
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
        <p class="hf-v2-network-eyebrow">Netzwerkplanung</p>
        <h3>Verbindung ${escapeHtml(origin.name)} → ${escapeHtml(target.name)}</h3>
        ${renderCashBadge()}
        <div class="hf-v2-network-grid">${BUILD_TYPES.map(type => renderBuildOption(origin, target, type)).join('')}</div>
        <p class="hf-v2-network-hint">Nach Auswahl wird das Projekt mit Kosten, Distanz und Route in der Netzwerklogik vorgemerkt.</p>
      </div>`;
  }

  function setBody(html) {
    window.HFV2Modal?.setModalBody?.(html);
  }

  function showNetworkBody(originId, html) {
    const origin = cityById(originId);
    window.HFV2Modal?.openModal?.({
      className: 'hf-v2-network-modal',
      title: 'Netzwerkplanung',
      subtitle: origin?.name || originId || '',
      bodyHtml: html,
    });
    if (!window.HFV2Modal?.openModal) setBody(html);
  }

  function renderBuildSuccess(project, edge) {
    const origin = cityById(project.a);
    const target = cityById(project.b);
    const typeLabel = DISPLAY_NAMES[project.type] || network()?.TRANSPORT_TYPES?.[project.type]?.name || project.type;
    const builtDistance = edge?.distance || project.distance;
    return `
      <div class="hf-v2-network-menu">
        <p class="hf-v2-network-eyebrow">Verbindung gebaut</p>
        <h3>${escapeHtml(origin?.name || project.a)} → ${escapeHtml(target?.name || project.b)}</h3>
        ${renderCashBadge()}
        <p class="hf-v2-network-hint">${escapeHtml(typeLabel)} · ${formatKm(builtDistance)} · Baukosten ${formatMoney(project.cost)} · Unterhalt ${formatMoney(project.maintenance)}/Tag</p>
      </div>
      ${renderTargetPicker(project.a)}`;
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
    const edge = window.HF_V2?.confirmProject?.();
    if (!edge) {
      setBody(`
        <div class="hf-v2-network-menu">
          <p class="hf-v2-network-eyebrow">Projekt nicht gebaut</p>
          <h3>Verbindung konnte nicht gebaut werden</h3>
          ${renderCashBadge()}
          <p class="hf-v2-network-hint">Bitte prüfe Budget und Zielstatus und wähle die Option erneut.</p>
          <button class="hf-v2-network-back" type="button" data-action="back-to-build-options">Weitere Option wählen</button>
        </div>`);
      return;
    }
    showNetworkBody(project.a, renderBuildSuccess(project, edge));
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
      title: 'Netzwerkplanung',
      subtitle: origin.name,
      bodyHtml: renderTargetPicker(cityId),
    });
  }

  bindNetworkMenuEvents();

  window.HFNetworkMenu = {openNetworkMenuForCity, renderTargetPicker, renderBuildOptions};
})();
