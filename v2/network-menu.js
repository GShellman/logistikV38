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
  let manualNodeMode = false;
  let activeEditorMode = 'draw';

  function renderEditorTools(mode = activeEditorMode) {
    const tools = [['draw', 'Straße zeichnen'], ['node', 'Knoten setzen'], ['edit', 'Punkte bearbeiten']];
    return `<div class="hf-v2-editor-tools" role="toolbar" aria-label="Editorwerkzeug">
      ${tools.map(([value, label]) => `<button type="button" data-action="set-editor-mode" data-mode="${value}" class="${mode === value ? 'is-active' : ''}" aria-pressed="${mode === value}">${label}</button>`).join('')}
    </div>`;
  }

  function renderEditorActions({canUndo = false, canRedo = false, valid = false} = {}) {
    return `<div class="hf-v2-route-editor__actions">
      <button type="button" data-action="undo-point" ${canUndo ? '' : 'disabled'}>Letzten Punkt rückgängig</button>
      <button type="button" data-action="redo-point" ${canRedo ? '' : 'disabled'}>Wiederholen</button>
      <button type="button" data-action="clear-route">Trasse löschen</button>
      <button type="button" data-action="cancel-planning">Abbrechen <kbd>Esc</kbd></button>
      <button type="button" data-action="confirm-project" class="hf-v2-network-build" ${valid ? '' : 'disabled'}>Bauen</button>
    </div>`;
  }

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

  function targetSortValue(origin, target) {
    return origin ? estimatedDistanceForType(origin, target, 'mainroad') : 0;
  }

  function renderTargetFilterBar() {
    const filters = [
      ['all', 'Alle'],
      ['online', 'Am Netz'],
      ['new', 'Neu'],
      ['missing-road', 'Straße fehlt'],
      ['missing-rail', 'Bahn fehlt'],
    ];

    return `
      <div class="hf-v2-network-filterbar" role="toolbar" aria-label="Zielstädte filtern">
        ${filters.map(([filter, label], index) => `
          <button class="hf-v2-network-filter${index === 0 ? ' is-active' : ''}" type="button" data-action="filter-targets" data-network-filter="${escapeHtml(filter)}" aria-pressed="${index === 0 ? 'true' : 'false'}">${escapeHtml(label)}</button>
        `).join('')}
      </div>`;
  }

  function renderTargetCard(originId, origin, target) {
    const state = connectionState(originId, target.id);
    const fullyConnected = state.road && state.rail;
    const distance = targetSortValue(origin, target);
    const unlocked = isUnlockedCity(target.id);
    return `
      <button class="hf-v2-network-target${fullyConnected ? ' is-disabled' : ''}" type="button" data-action="select-target" data-target="${escapeHtml(target.id)}" data-network-status="${fullyConnected ? 'complete' : unlocked ? 'online' : 'new'}" data-unlocked="${unlocked ? 'true' : 'false'}" data-has-road="${state.road ? 'true' : 'false'}" data-has-rail="${state.rail ? 'true' : 'false'}" ${fullyConnected ? 'disabled' : ''}>
        <span>
          <strong>${escapeHtml(target.name)}</strong>
          <small>${formatKm(distance)} · Stufe ${escapeHtml(target.tier)}</small>
        </span>
        <span class="hf-v2-network-badges">${renderExistingBadges(state, target.id)}</span>
      </button>`;
  }

  function targetMatchesFilter(targetButton, filter) {
    if (filter === 'online') return targetButton.dataset.unlocked === 'true';
    if (filter === 'new') return targetButton.dataset.unlocked !== 'true';
    if (filter === 'missing-road') return targetButton.dataset.hasRoad !== 'true';
    if (filter === 'missing-rail') return targetButton.dataset.hasRail !== 'true';
    return true;
  }

  function applyTargetFilter(menu, filter) {
    if (!menu) return;
    const activeFilter = filter || 'all';
    menu.querySelectorAll('.hf-v2-network-filter').forEach(button => {
      const isActive = button.dataset.networkFilter === activeFilter;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    menu.querySelectorAll('.hf-v2-network-target').forEach(targetButton => {
      targetButton.hidden = !targetMatchesFilter(targetButton, activeFilter);
    });

    menu.querySelectorAll('.hf-v2-network-section').forEach(section => {
      const visibleTargets = section.querySelectorAll('.hf-v2-network-target:not([hidden])').length;
      section.hidden = visibleTargets === 0;
    });
  }

  function renderTargetPicker(originId) {
    activeOriginId = originId;
    activeTargetId = null;

    const origin = cityById(originId);
    const targets = candidateTargets(originId)
      .map(target => ({
        target,
        state: connectionState(originId, target.id),
        distance: targetSortValue(origin, target),
        unlocked: isUnlockedCity(target.id),
      }))
      .sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || a.distance - b.distance);
    const openTargets = targets.filter(entry => !entry.state.road || !entry.state.rail);
    const completeTargets = targets.filter(entry => entry.state.road && entry.state.rail);
    const rows = targets.length ? `
      ${openTargets.length ? `
        <div class="hf-v2-network-section" data-network-section="open">
          <div class="hf-v2-network-grid">${openTargets.map(({target}) => renderTargetCard(originId, origin, target)).join('')}</div>
        </div>` : ''}
      ${completeTargets.length ? `
        <div class="hf-v2-network-section hf-v2-network-section--complete" data-network-section="complete">
          <p class="hf-v2-network-section-title">Bereits vollständig verbunden</p>
          <div class="hf-v2-network-grid">${completeTargets.map(({target}) => renderTargetCard(originId, origin, target)).join('')}</div>
        </div>` : ''}` : '<p class="hf-v2-network-empty">Keine potenziellen Zielstädte in Reichweite.</p>';

    return `
      <div class="hf-v2-network-menu" data-network-origin="${escapeHtml(originId)}">
        <p class="hf-v2-network-eyebrow">Ursprung</p>
        <h3>${escapeHtml(origin?.name || originId)}</h3>
        <p class="hf-v2-network-hint">Wähle eine Zielstadt aus dem Stadtkatalog. Bereits angebundene Städte und bestehende Verbindungen sind markiert; vollständig verbundene Ziele sind deaktiviert.</p>
        ${targets.length ? renderTargetFilterBar() : ''}
        ${rows}
      </div>`;
  }

  function renderRoadTypePicker(originId) {
    activeOriginId = originId;
    activeTargetId = null;
    const origin = cityById(originId);
    const specs = network()?.TRANSPORT_TYPES || {};
    return `<div class="hf-v2-network-menu" data-network-origin="${escapeHtml(originId)}">
      <p class="hf-v2-network-eyebrow">Straßenbau</p>
      <h3>Ab ${escapeHtml(origin?.name || originId)} zeichnen</h3>
      ${renderCashBadge()}
      <p class="hf-v2-network-hint">Wähle zuerst den Straßentyp. Setze danach auf der Karte beliebig viele Stützpunkte und klicke zum Abschluss auf eine zulässige Zielstadt.</p>
      <div class="hf-v2-network-grid">${ROAD_TYPES.map(type => {
        const spec = specs[type];
        if (!spec) return '';
        return `<button class="hf-v2-network-option" type="button" data-action="start-road-drawing" data-origin="${escapeHtml(originId)}" data-type="${escapeHtml(type)}">
          <span class="hf-v2-network-option__header"><span class="hf-v2-network-icon" aria-hidden="true">${escapeHtml(spec.icon)}</span><span class="hf-v2-network-option__title"><strong>${escapeHtml(DISPLAY_NAMES[type] || spec.name)}</strong><small>${formatMoney(spec.buildKm)} je km · ${escapeHtml(spec.speed)} km/h</small></span></span>
          <span class="hf-v2-network-option__desc">${escapeHtml(spec.desc || '')}</span>
        </button>`;
      }).join('')}</div>
    </div>`;
  }

  function renderDrawingPhase(originId, type, pointCount = 1) {
    const origin = cityById(originId);
    const spec = network()?.TRANSPORT_TYPES?.[type];
    return `<div class="hf-v2-network-menu hf-v2-route-editor" data-network-origin="${escapeHtml(originId)}">
      <p class="hf-v2-network-eyebrow">Zeichenmodus</p>
      <h3>${escapeHtml(DISPLAY_NAMES[type] || spec?.name)} ab ${escapeHtml(origin?.name || originId)}</h3>
      ${renderEditorTools('draw')}
      <p class="hf-v2-network-hint">Nächster Schritt: Setze einen Stützpunkt auf der Karte oder wähle eine zulässige Zielstadt. Punkte lassen sich auswählen und mit <kbd>Delete</kbd> löschen.</p>
      <p><strong>${Math.max(0, pointCount - 1)} Stützpunkte gesetzt</strong></p>
      ${renderEditorActions({canUndo: pointCount > 1, valid: false})}
    </div>`;
  }

  function currentCash() {
    return window.HFV2Save?.getCash?.() ?? 0;
  }

  function renderCashBadge() {
    return `<div class="hf-v2-fleet-cash" aria-label="Verfügbares Kapital"><span>Kapital</span><strong>${formatMoney(currentCash())}</strong></div>`;
  }

  function renderRoutePreview(origin, target) {
    return `<section class="hf-v2-route-preview" aria-label="Kartenvorschau von ${escapeHtml(origin.name)} nach ${escapeHtml(target.name)}"><div class="hf-v2-route-preview__grid" aria-hidden="true"></div><span class="hf-v2-route-city is-origin"><i></i><b>${escapeHtml(origin.name)}</b><small>Ursprung</small></span><span class="hf-v2-route-line" aria-hidden="true"><i></i></span><span class="hf-v2-route-city is-target"><i></i><b>${escapeHtml(target.name)}</b><small>Ziel</small></span><strong class="hf-v2-route-distance">${formatKm(estimatedDistanceForType(origin, target, 'mainroad'))}</strong></section>`;
  }

  function recommendationForBuildOption(origin, target, type) {
    const hfNetwork = network();
    const specs = hfNetwork?.TRANSPORT_TYPES || {};
    const available = BUILD_TYPES.map(entryType => {
      const entrySpec = specs[entryType];
      if (!entrySpec) return null;
      const distance = estimatedDistanceForType(origin, target, entryType);
      const quote = hfNetwork.buildQuote?.(entryType, distance);
      const exists = hfNetwork.connectionExists?.(origin.id, target.id, entrySpec.mode);
      const canAfford = !!quote && currentCash() >= quote.cost;
      return {type: entryType, spec: entrySpec, quote, exists, canAfford};
    }).filter(entry => entry && entry.quote && entry.canAfford && !entry.exists);

    const cheapestRoad = available
      .filter(entry => entry.spec.mode === 'road')
      .sort((a, b) => a.quote.cost - b.quote.cost)[0];
    const fastest = available
      .filter(entry => entry.spec.mode === 'road')
      .sort((a, b) => (b.spec.speed || 0) - (a.spec.speed || 0))[0];

    if (type === 'rail') return 'Für Güterzüge';
    if (cheapestRoad?.type === type) return 'Empfohlen für Start';
    if (fastest?.type === type) return 'Schnellste Option';
    return '';
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
    const statusLabel = exists ? 'Bereits gebaut' : canAfford ? 'Planbar' : 'Budget fehlt';
    const recommendation = recommendationForBuildOption(origin, target, type);
    const ctaLabel = exists ? 'Verbindung besteht' : canAfford ? `Für ${formatMoney(quote.cost)} bauen` : `${formatMoney(quote?.cost || 0)} benötigt`;
    const buildTime = quote?.buildDays ?? quote?.days ?? Math.max(1, Math.ceil(distance / Math.max(1, Number(spec.speed) || 1) / 8));
    const badgeClass = disabled ? ' hf-v2-network-badge--disabled' : ' hf-v2-network-badge--primary';
    return `
      <button class="hf-v2-network-option${disabled ? ' is-disabled' : ''}" type="button" data-action="plan-connection" data-origin="${escapeHtml(origin.id)}" data-target="${escapeHtml(target.id)}" data-type="${escapeHtml(type)}" ${disabled ? 'disabled' : ''}>
        <span class="hf-v2-network-option__header">
          <span class="hf-v2-network-icon" aria-hidden="true">${escapeHtml(spec.icon)}</span>
          <span class="hf-v2-network-option__title">
            <strong>${escapeHtml(DISPLAY_NAMES[type] || spec.name)}</strong>
            <small>${escapeHtml(spec.mode === 'rail' ? 'Schienentrasse' : 'Straßenverbindung')}</small>
          </span>
          <span class="hf-v2-network-option__badges">
            ${recommendation ? `<span class="hf-v2-network-badge hf-v2-network-badge--primary">${escapeHtml(recommendation)}</span>` : ''}
            <span class="hf-v2-network-badge${badgeClass}">${escapeHtml(ctaLabel)}</span>
          </span>
        </span>
        <span class="hf-v2-network-option__desc">${escapeHtml(spec.desc || '')}</span>
        <span class="hf-v2-network-option__rows hf-v2-network-comparison">
          <span><em>Kosten</em><strong>${formatMoney(quote?.cost || 0)}</strong></span>
          <span><em>Bauzeit</em><strong>${buildTime} Tag${buildTime === 1 ? '' : 'e'}</strong></span>
          <span><em>Tempo</em><strong>${escapeHtml(spec.speed)} km/h</strong></span>
          <span><em>Kapazität</em><strong>${escapeHtml(spec.capacity)} ${escapeHtml(spec.capacityUnit || 'Einheiten')}</strong></span>
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
        ${renderRoutePreview(origin, target)}
        <div class="hf-v2-network-grid">${BUILD_TYPES.map(type => renderBuildOption(origin, target, type)).join('')}</div>
        <p class="hf-v2-network-hint">Nach Auswahl wird das Projekt mit Kosten, Distanz und Route in der Netzwerklogik vorgemerkt.</p>
      </div>`;
  }

  function setBody(html) {
    window.HFV2Modal?.setModalBody?.(html);
  }

  function renderBuildFailure() {
    return `
      <div class="hf-v2-network-menu">
        <p class="hf-v2-network-eyebrow">Projekt nicht gebaut</p>
        <h3>Projekt konnte nicht gebaut werden</h3>
        ${renderCashBadge()}
        <p class="hf-v2-network-hint">Projekt konnte nicht gebaut werden – Kapital oder Projektstatus prüfen.</p>
        <button class="hf-v2-network-back" type="button" data-action="back-to-build-options">Weitere Option wählen</button>
      </div>`;
  }

  function renderPlanningPhase(project, busy = false) {
    const enabledConnections = (project.manualJunctions || []).length;
    return `<div class="hf-v2-network-menu hf-v2-route-editor" data-network-origin="${escapeHtml(project.a)}" data-network-target-id="${escapeHtml(project.b)}">
      <p class="hf-v2-network-eyebrow">Planungsphase</p>
      <h3>Route auf Karte bearbeiten</h3>
      ${renderEditorTools(activeEditorMode)}
      <p class="hf-v2-network-hint">Nächster Schritt: ${activeEditorMode === 'node' ? 'Klicke auf die Trasse, um ausdrücklich einen Knoten zu setzen.' : 'Wähle einen Punkt aus und ziehe ihn oder lösche ihn mit Delete.'}</p>
      <div class="hf-v2-network-comparison">
        <span><em>Distanz</em><strong>${formatKm(project.distance)}</strong></span>
        <span><em>Baukosten</em><strong>${formatMoney(project.cost)}</strong></span>
        <span><em>Unterhalt</em><strong>${formatMoney(project.maintenance)}</strong></span>
        <span><em>Anschlussknoten</em><strong>${enabledConnections}</strong></span>
      </div>
      ${renderEditorActions({canUndo: (project.waypoints || []).length > 0, valid: !!(project.a && project.b && project.geometry?.length >= 2 && project.ok !== false && !busy)})}
    </div>`;
  }

  function showProject(project, busy = false) {
    if (!project) return;
    setBody(renderPlanningPhase(project, busy));
    window.HFNetworkLayer?.renderProjectPreview?.(project, {
      onAddWaypoint: point => changeWaypoints([...(project.waypoints || []), point]),
      onMoveWaypoint: (index, point) => changeWaypoints((project.waypoints || []).map((old, i) => i === index ? {lat: point.lat, lng: point.lng} : old)),
      onRemoveWaypoint: index => changeWaypoints((project.waypoints || []).filter((_, i) => i !== index)),
      onAddManualJunction: point => addManualJunction(point),
      onMoveManualJunction: (index, point) => moveManualJunction(index, point),
      onRemoveManualJunction: index => removeManualJunction(index),
      onCancel: cancelPlanning,
    });
    window.HFNetworkLayer?.setEditorMode?.(activeEditorMode);
  }

  async function changeWaypoints(waypoints) {
    const old = network()?.getState?.().pendingProject;
    if (!old) return;
    const start = cityById(old.a);
    const target = cityById(old.b);
    const geometry = [[start.lat, start.lng], ...waypoints.map(point => [point.lat, point.lng]), [target.lat, target.lng]];
    const project = await window.HF_V2?.planConnection?.(old.a, old.b, old.type, {geometry, manualJunctions: old.manualJunctions});
    if (project) showProject(project);
  }

  function addManualJunction(point) {
    const project = network()?.getState?.().pendingProject;
    if (!project) return false;
    const result = network()?.createManualJunction?.(project, point);
    if (!result?.ok) return result || false;
    showProject(project);
    return result;
  }

  function cancelPlanning() {
    manualNodeMode = false;
    activeEditorMode = 'draw';
    const state = network()?.getState?.();
    if (state) state.pendingProject = null;
    window.HFNetworkLayer?.clearProjectPreview?.();
    setBody(renderRoadTypePicker(activeOriginId));
  }

  function moveManualJunction(index, point) {
    const project = network()?.getState?.().pendingProject;
    const previous = project?.manualJunctions?.[index];
    if (!project || !previous) return;
    project.manualJunctions.splice(index, 1);
    const result = network()?.createManualJunction?.(project, point);
    if (!result?.ok) project.manualJunctions.splice(index, 0, previous);
    showProject(project);
  }

  function removeManualJunction(index) {
    const project = network()?.getState?.().pendingProject;
    if (!project) return;
    project.manualJunctions = (project.manualJunctions || []).filter((_, itemIndex) => itemIndex !== index);
    showProject(project);
  }

  async function handleBuild(type, originId = activeOriginId, targetId = activeTargetId, buildButton = null) {
    activeOriginId = originId;
    activeTargetId = targetId;
    const previousLabel = buildButton?.querySelector?.('.hf-v2-network-option__badges')?.innerHTML;
    if (buildButton) {
      buildButton.disabled = true;
      buildButton.setAttribute?.('aria-busy', 'true');
    }
    try {
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
      showProject(project);
    } catch (error) {
      console.error('Netzwerkprojekt konnte nicht gebaut werden', error);
      setBody(renderBuildFailure());
    } finally {
      if (buildButton?.isConnected) {
        buildButton.disabled = false;
        buildButton.removeAttribute?.('aria-busy');
        const badges = buildButton.querySelector?.('.hf-v2-network-option__badges');
        if (badges && previousLabel !== undefined) badges.innerHTML = previousLabel;
      }
    }
  }

  function startRoadDrawing(originId, type) {
    activeOriginId = originId;
    activeTargetId = null;
    const allowedTargetIds = candidateTargets(originId)
      .filter(city => !connectionState(originId, city.id).road)
      .map(city => city.id);
    setBody(renderDrawingPhase(originId, type));
    const started = window.HFNetworkLayer?.beginRoadDrawing?.({
      originId,
      type,
      allowedTargetIds,
      onChange: geometry => setBody(renderDrawingPhase(originId, type, geometry.length)),
      onComplete: async ({targetId, geometry}) => {
        activeTargetId = targetId;
        const project = await window.HF_V2?.planConnection?.(originId, targetId, type, {geometry});
        if (project?.ok === false) {
          setBody(project.reason === 'not-enough-cash' ? `<div class="hf-v2-network-menu"><h3>Nicht genug Kapital</h3><p>Benötigt ${formatMoney(project.cost)}, verfügbar ${formatMoney(project.cash)}.</p><button type="button" data-action="cancel-planning">Zurück</button></div>` : renderBuildFailure());
          return;
        }
        if (project) showProject(project);
      },
      onCancel: cancelPlanning,
    });
    if (!started) setBody(renderBuildFailure());
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

      if (action === 'start-road-drawing') {
        startRoadDrawing(origin, type);
        return;
      }

      if (action === 'filter-targets') {
        const menu = actionButton.closest('.hf-v2-network-menu');
        applyTargetFilter(menu, actionButton.dataset.networkFilter);
        return;
      }

      if (action === 'plan-connection') {
        handleBuild(type, origin, target, actionButton);
        return;
      }

      if (action === 'show-target-picker') {
        setBody(renderTargetPicker(activeOriginId));
        return;
      }

      if (action === 'back-to-build-options') {
        setBody(activeTargetId ? renderBuildOptions(activeOriginId, activeTargetId) : renderTargetPicker(activeOriginId));
        return;
      }

      if (action === 'add-waypoint') {
        const project = network()?.getState?.().pendingProject;
        const geometry = project?.geometry || [];
        const middle = geometry[Math.floor(geometry.length / 2)];
        if (middle) changeWaypoints([...(project.waypoints || []), {lat: middle[0], lng: middle[1]}]);
        return;
      }

      if (action === 'remove-waypoint') {
        const project = network()?.getState?.().pendingProject;
        changeWaypoints((project?.waypoints || []).slice(0, -1));
        return;
      }

      if (action === 'set-connection') {
        manualNodeMode = !manualNodeMode;
        const project = network()?.getState?.().pendingProject;
        if (project) showProject(project);
        return;
      }

      if (action === 'set-editor-mode') {
        activeEditorMode = actionButton.dataset.mode || 'edit';
        manualNodeMode = activeEditorMode === 'node';
        window.HFNetworkLayer?.setEditorMode?.(activeEditorMode);
        const project = network()?.getState?.().pendingProject;
        if (project) showProject(project);
        else actionButton.closest?.('.hf-v2-editor-tools')?.querySelectorAll?.('button').forEach(button => {
          const active = button.dataset.mode === activeEditorMode;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        });
        return;
      }

      if (action === 'undo-point') {
        if (!window.HFNetworkLayer?.undoDrawingPoint?.()) {
          const project = network()?.getState?.().pendingProject;
          if (project?.waypoints?.length) changeWaypoints(project.waypoints.slice(0, -1));
        }
        return;
      }

      if (action === 'redo-point') {
        window.HFNetworkLayer?.redoDrawingPoint?.();
        return;
      }

      if (action === 'clear-route') {
        if (!window.HFNetworkLayer?.clearDrawingRoute?.()) {
          const project = network()?.getState?.().pendingProject;
          if (project) {
            project.geometry = [];
            project.waypoints = [];
            project.ok = false;
            showProject(project);
          }
        }
        return;
      }

      if (action === 'cancel-planning') {
        cancelPlanning();
        return;
      }

      if (action === 'confirm-project') {
        const edge = window.HF_V2?.confirmProject?.();
        if (edge) {
          window.HFNetworkLayer?.clearProjectPreview?.();
          window.HFV2Modal?.closeModal?.();
        } else setBody(renderBuildFailure());
        return;
      }

      if (action === 'close-network-modal') {
        window.HF_V2?.closeModal?.();
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
      bodyHtml: renderRoadTypePicker(cityId),
      movable: true,
      modeless: true,
    });
  }

  bindNetworkMenuEvents();

  window.HFNetworkMenu = {openNetworkMenuForCity, renderTargetPicker, renderRoadTypePicker, renderBuildOptions, renderPlanningPhase, handleBuild, startRoadDrawing};
})();
