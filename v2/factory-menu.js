(() => {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    }[char]));
  }

  function formatMoney(value) {
    return `CHF ${Math.round(Number(value) || 0).toLocaleString('de-CH')}`;
  }

  function citiesById() {
    return window.HFV2CitiesById || {};
  }

  function cityById(cityId) {
    return citiesById()[cityId] || null;
  }

  function factoryApi() {
    return window.HFV2Factories || null;
  }

  function factoryCatalog() {
    return Array.isArray(window.HFV2FactoryCatalog) ? window.HFV2FactoryCatalog : [];
  }

  function factoryGroups() {
    return window.HFV2FactoryGroups || {};
  }

  function factoryImage(factoryId) {
    return window.HFV2FactoryAssets?.factoryImage?.(factoryId) || '';
  }

  function factoryVisual(factoryId, factory) {
    const image = factoryImage(factoryId);
    if (!image) return `<span class="hf-v2-fleet-card__emoji">${escapeHtml(factory.icon || '🏭')}</span>`;
    return `<img class="hf-v2-fleet-card__image" src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">`;
  }

  function factoryById(factoryId) {
    return factoryCatalog().find(factory => factory.id === factoryId) || null;
  }

  function renderBuiltFactories(cityId) {
    const builtFactories = factoryApi()?.getCityFactories?.(cityId) || [];
    if (!builtFactories.length) return '<p class="hf-v2-fleet-empty">In dieser Stadt wurden noch keine Betriebe gebaut.</p>';

    return `
      <div class="hf-v2-fleet-grid" aria-label="Bereits gebaute Betriebe">
        ${builtFactories.map(factoryId => {
          const factory = factoryById(factoryId);
          return `
            <article class="hf-v2-fleet-card">
              <div class="hf-v2-fleet-card__icon" aria-hidden="true">${factoryVisual(factoryId, factory || {icon: '🏭'})}</div>
              <div class="hf-v2-fleet-card__main">
                <div class="hf-v2-fleet-card__head">
                  <span>
                    <small>Gebauter Betrieb</small>
                    <h4>${escapeHtml(factory?.name || factoryId)}</h4>
                  </span>
                  <span class="hf-v2-fleet-owned">Aktiv</span>
                </div>
                <p>${escapeHtml(factory?.desc || 'Bereits gebauter Betrieb in dieser Stadt.')}</p>
              </div>
            </article>`;
        }).join('')}
      </div>`;
  }

  function builtFactoryCounts(cityId) {
    const counts = new Map();
    const builtFactories = factoryApi()?.getCityFactories?.(cityId) || [];
    builtFactories.forEach(factoryId => counts.set(factoryId, (counts.get(factoryId) || 0) + 1));
    return counts;
  }

  function buildDisabledTitle(result) {
    if (result?.ok) return '';
    const reasons = {
      'unknown-city': 'Stadt nicht gefunden',
      'unknown-factory': 'Betrieb nicht gefunden',
      'city-locked': 'Stadt ist noch nicht ans Netz angebunden',
      'no-free-slots': 'Keine freien Bauplätze',
      'not-enough-cash': 'Nicht genug Kapital',
      'tier-too-low': `Stadt benötigt mindestens Stufe ${Number(result?.minTier) || 1}`,
    };
    return reasons[result?.reason] || 'Bau nicht möglich';
  }

  function groupEntries() {
    const grouped = new Map();
    factoryCatalog().forEach(factory => {
      const groupId = factory.group || 'misc';
      if (!grouped.has(groupId)) grouped.set(groupId, []);
      grouped.get(groupId).push(factory);
    });
    return grouped;
  }

  function factoryCard(cityId, factory, ownedCount) {
    const result = factoryApi()?.canBuildFactory?.(cityId, factory.id) || {ok: false, reason: 'unavailable'};
    const disabledText = result.ok ? '' : ` disabled aria-disabled="true" title="${escapeHtml(buildDisabledTitle(result))}"`;
    const ownedLabel = ownedCount > 0 ? `${ownedCount.toLocaleString('de-CH')} gebaut` : 'Noch nicht gebaut';

    return `
      <article class="hf-v2-fleet-card${result.ok ? '' : ' is-disabled'}">
        <div class="hf-v2-fleet-card__icon" aria-hidden="true">${factoryVisual(factory.id, factory)}</div>
        <div class="hf-v2-fleet-card__main">
          <div class="hf-v2-fleet-card__head">
            <span>
              <small>Betrieb</small>
              <h4>${escapeHtml(factory.name || factory.id)}</h4>
            </span>
            <span class="hf-v2-fleet-owned">${escapeHtml(ownedLabel)}</span>
          </div>
          <p>${escapeHtml(factory.desc || 'Baubarer Betrieb für diese Stadt.')}</p>
          <dl class="hf-v2-fleet-stats">
            <div><dt>Kosten</dt><dd>${formatMoney(factory.cost)}</dd></div>
            <div><dt>Status</dt><dd>${escapeHtml(ownedLabel)}</dd></div>
          </dl>
        </div>
        <button class="hf-v2-fleet-buy" type="button" data-action="build-factory" data-city-id="${escapeHtml(cityId)}" data-factory-id="${escapeHtml(factory.id)}"${disabledText}><span>Bauen</span><strong>${formatMoney(factory.cost)}</strong></button>
      </article>`;
  }

  function renderFactoryGroups(cityId) {
    const api = factoryApi();
    if (!api) return '<p class="hf-v2-fleet-empty">Die Betriebslogik ist nicht geladen.</p>';

    const grouped = groupEntries();
    if (!grouped.size) return '<p class="hf-v2-fleet-empty">Keine baubaren Betriebe verfügbar.</p>';

    const groups = factoryGroups();
    const ownedCounts = builtFactoryCounts(cityId);
    return Object.values(groups).map(group => {
      const factories = grouped.get(group.id) || [];
      if (!factories.length) return '';
      return `
        <section class="hf-v2-factory-group" aria-label="${escapeHtml(group.name)}">
          <div class="hf-v2-fleet-card__head">
            <span>
              <small>${escapeHtml(group.icon || '🏭')} Kategorie</small>
              <h4>${escapeHtml(group.name || group.id)}</h4>
            </span>
            <span class="hf-v2-fleet-owned">${factories.length.toLocaleString('de-CH')} Betriebe</span>
          </div>
          <p class="hf-v2-fleet-hint">${escapeHtml(group.desc || '')}</p>
          <div class="hf-v2-fleet-grid">${factories.map(factory => factoryCard(cityId, factory, ownedCounts.get(factory.id) || 0)).join('')}</div>
        </section>`;
    }).join('');
  }

  function renderFactoryMenu(cityId) {
    const city = cityById(cityId);
    if (!city) return '<p class="hf-v2-fleet-empty">Stadt nicht gefunden.</p>';

    const cash = window.HFV2Save?.getCash?.() ?? 0;
    const slots = Math.max(0, Math.floor(Number(city.slots) || 0));
    const usedSlots = factoryApi()?.getUsedSlots?.(city.id) ?? 0;

    return `
      <div class="hf-v2-fleet-menu hf-v2-factory-menu" data-factory-city-id="${escapeHtml(city.id)}">
        <p class="hf-v2-fleet-eyebrow">Betriebe bauen</p>
        <h3>Betriebe für ${escapeHtml(city.name)}</h3>
        <div class="hf-v2-fleet-cash" aria-label="Stadtübersicht">
          <span>Kapital</span><strong>${formatMoney(cash)}</strong>
          <span>Bauplätze</span><strong>${usedSlots.toLocaleString('de-CH')} / ${slots.toLocaleString('de-CH')}</strong>
        </div>
        <p class="hf-v2-fleet-hint">Wähle einen Betrieb aus dem Katalog. Betriebe können erst nach dem Netzanschluss der Stadt gebaut werden; Baukosten werden vom gemeinsamen V2-Kapital abgezogen.</p>
        <section class="hf-v2-factory-group" aria-label="Bereits gebaute Betriebe">
          <div class="hf-v2-fleet-card__head">
            <span>
              <small>Bestand</small>
              <h4>Bereits gebaute Betriebe</h4>
            </span>
            <span class="hf-v2-fleet-owned">${usedSlots.toLocaleString('de-CH')} / ${slots.toLocaleString('de-CH')} Bauplätze</span>
          </div>
          ${renderBuiltFactories(city.id)}
        </section>
        ${renderFactoryGroups(city.id)}
      </div>`;
  }

  function refreshFactoryMenu(cityId) {
    window.HFV2Modal?.setModalBody?.(renderFactoryMenu(cityId));
  }

  function bindFactoryMenuEvents() {
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-action="build-factory"]');
      if (!button) return;

      const modalBody = document.getElementById('hfV2ModalBody');
      if (modalBody && !modalBody.contains(button)) return;

      event.preventDefault();
      const {cityId, factoryId} = button.dataset;
      const result = factoryApi()?.buildFactory?.(cityId, factoryId);
      if (result?.ok) refreshFactoryMenu(cityId);
    });
  }

  function openFactoryMenuForCity(cityId) {
    const city = cityById(cityId);
    if (!city || !window.HFV2Modal?.openModal) return;
    window.HFV2Modal.openModal({
      className: 'hf-v2-factory-modal',
      title: 'Betriebe bauen',
      subtitle: city.name,
      bodyHtml: renderFactoryMenu(city.id),
    });
  }

  bindFactoryMenuEvents();

  window.HFV2FactoryMenu = {openFactoryMenuForCity, renderFactoryMenu};
})();
