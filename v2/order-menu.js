(() => {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[char]));
  }

  function goodById(goodId) {
    return (window.HFV2GoodsCatalog || []).find(good => good.id === goodId) || {id: goodId, name: goodId, icon: '📦'};
  }

  function formatWeightKg(value) {
    const kg = Math.max(0, Number(value) || 0);
    if (kg >= 1000) return `${(kg / 1000).toLocaleString('de-CH', {maximumFractionDigits: 1})} t`;
    return `${kg.toLocaleString('de-CH', {maximumFractionDigits: kg >= 10 ? 0 : 1})} kg`;
  }

  function formatGoodAmount(goodId, kg) {
    const good = goodById(goodId);
    const unit = good.unit || {unit: 'kg', kgPerUnit: 1};
    const amount = (Number(kg) || 0) / Math.max(Number(unit.kgPerUnit) || 1, 0.000001);
    if (unit.unit === 'kg') return formatWeightKg(kg);
    if (unit.unit === 't') return `${amount.toLocaleString('de-CH', {maximumFractionDigits: 1})} t`;
    return `${amount.toLocaleString('de-CH', {maximumFractionDigits: amount >= 10 ? 0 : 1})} ${unit.unit}`;
  }

  function goodIcon(good) {
    const src = window.HFV2GoodsAssets?.goodImage?.(good.id);
    return src ? `<img src="${escapeHtml(src)}" alt="" aria-hidden="true">` : `<span aria-hidden="true">${escapeHtml(good.icon || '📦')}</span>`;
  }

  function currentDeliveryDay(leadTime) {
    const time = window.HFV2Time?.getState?.() || window.HFV2Save?.getState?.().time || {day: 1};
    const offset = leadTime === 'two-days' ? 2 : 1;
    return Math.max(1, Math.trunc(Number(time.day) || 1) + offset);
  }

  function renderOrderWeekdayOptions() {
    return ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'].map((label, value) => `<option value="${value}">${label}</option>`).join('');
  }

  function deliveryMinuteFromTime(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return 8 * 60;
    const hour = Math.min(23, Math.max(0, Number(match[1]) || 0));
    const minute = Math.min(59, Math.max(0, Number(match[2]) || 0));
    return hour * 60 + minute;
  }

  function updateWeekdayVisibility(form) {
    const isWeekly = form.querySelector('input[name="hfV2OrderFrequency"]:checked')?.value === 'weekly';
    const weekdayField = form.querySelector('[data-hf-v2-weekday-field]');
    if (weekdayField) weekdayField.hidden = !isWeekly;
  }


  function transportPlanningDependencies() {
    const missing = [];
    if (typeof window.HFV2Transport?.generatePlannedDeliveries !== 'function') missing.push('Transportplanung');
    if (typeof window.HFNetwork?.findPath !== 'function') missing.push('Netzwerk-Routenfinder');
    if (typeof window.HFFleet?.getCityFleet !== 'function') missing.push('Flottenverwaltung');
    const catalog = window.HFVehicleCatalog?.VEHICLE_CATALOG;
    if (!catalog || !Object.keys(catalog).length) missing.push('Fahrzeugkatalog');
    return {ready: missing.length === 0, missing};
  }

  function setOrderStatus(form, message) {
    const status = form.querySelector('[data-hf-v2-order-status]');
    if (status) status.textContent = message;
  }

  function renderOrderModal(city, good) {
    const demandMap = window.HFV2Goods?.getCityDailyDemandMap?.(city.id) || {};
    const dailyKg = Math.max(0, Number(demandMap[good.id]) || 0);
    const sources = window.HFV2Orders?.sourceCandidates?.(city.id, good.id) || [];
    const sourceOptions = sources.length ? sources.map((source, index) => {
      const checked = index === 0 && source.transportReady ? 'checked' : '';
      const disabled = source.transportReady ? '' : 'disabled';
      const productionLabel = source.estimatedProductionKg > 0 ? ` · ca. ${formatGoodAmount(good.id, source.estimatedProductionKg)}/Tag` : '';
      const sourceStatus = source.transportReady ? 'transportbereit' : (source.reachable ? 'keine Ware in der Quelle' : 'nicht verbunden');
      return `<label class="hf-v2-order-source${source.transportReady ? '' : ' hf-v2-order-source--unreachable'}"><input type="radio" name="hfV2OrderSource" value="${escapeHtml(source.city.id)}" ${checked} ${disabled}><span><b>${escapeHtml(source.city.name)}</b><small>${sourceStatus} · Produktion verfügbar${productionLabel} · ${formatGoodAmount(good.id, source.inventoryKg)} im Lager</small></span></label>`;
    }).join('') : '<p class="hf-v2-muted">Keine passende Quelle mit Produktion, Lagerbestand und erreichbarer Transportverbindung gefunden.</p>';
    return `<form class="hf-v2-order-modal" data-order-city-id="${escapeHtml(city.id)}" data-order-good-id="${escapeHtml(good.id)}"><div class="hf-v2-order-hero"><div class="hf-v2-demand-icon">${goodIcon(good)}</div><div><p class="hf-v2-kicker">Nachfrageware bestellen</p><h3>${escapeHtml(good.name)}</h3><p>${escapeHtml(city.name)}</p></div></div><div class="hf-v2-order-stats"><span><small>Tagesbedarf</small><b>${formatGoodAmount(good.id, dailyKg)}</b></span><span><small>Ziel täglich</small><b>${formatGoodAmount(good.id, dailyKg)}</b></span><span><small>Ziel wöchentlich</small><b>${formatGoodAmount(good.id, dailyKg * 7)}</b></span></div><section><h4>Quelle wählen</h4><div class="hf-v2-order-source-list">${sourceOptions}</div></section><section><h4>Frequenz</h4><div class="hf-v2-order-frequency"><label><input type="radio" name="hfV2OrderFrequency" value="daily" checked> Täglich · ${formatGoodAmount(good.id, dailyKg)}</label><label><input type="radio" name="hfV2OrderFrequency" value="weekly"> Wöchentlich · ${formatGoodAmount(good.id, dailyKg * 7)}</label></div></section><label class="hf-v2-order-field"><span>Lieferzeit</span><select name="hfV2OrderLeadTime"><option value="next-day">Nächster Tag</option><option value="two-days">2 Tage</option></select></label><label class="hf-v2-order-field"><span>Uhrzeit</span><input type="time" name="hfV2OrderTime" value="08:00"></label><label class="hf-v2-order-field" data-hf-v2-weekday-field hidden><span>Wochentag</span><select name="hfV2OrderWeekday">${renderOrderWeekdayOptions()}</select></label><p class="hf-v2-muted" data-hf-v2-order-status role="status" aria-live="polite"></p><div class="hf-v2-modal-actions"><button class="hf-v2-button hf-v2-button--primary" type="submit">Versorgung speichern</button></div></form>`;
  }

  function openOrderModal(cityId, goodId) {
    const city = window.HFV2CitiesById?.[cityId];
    const good = goodById(goodId);
    if (!city || !good || !window.HFV2Modal?.openModal) return false;
    window.HFV2Modal.openModal({className: 'hf-v2-order-modal-shell', title: `${good.name} bestellen`, subtitle: city.name, bodyHtml: renderOrderModal(city, good)});
    return true;
  }

  document.addEventListener('change', event => {
    const form = event.target.closest?.('.hf-v2-order-modal');
    if (!form || event.target.name !== 'hfV2OrderFrequency') return;
    updateWeekdayVisibility(form);
  });

  document.addEventListener('submit', event => {
    const form = event.target.closest?.('.hf-v2-order-modal');
    if (!form) return;
    event.preventDefault();
    const sourceId = form.querySelector('input[name="hfV2OrderSource"]:checked')?.value || '';
    if (!sourceId) {
      setOrderStatus(form, 'Bitte zuerst eine transportbereite Quelle wählen. Es wurde keine Lieferung gespeichert.');
      return;
    }
    const dependencies = transportPlanningDependencies();
    if (!dependencies.ready) {
      setOrderStatus(form, `Transportplanung nicht verfügbar: ${dependencies.missing.join(', ')} fehlt. Die Versorgung wurde nicht gespeichert.`);
      return;
    }
    const frequency = form.querySelector('input[name="hfV2OrderFrequency"]:checked')?.value === 'weekly' ? 'weekly' : 'daily';
    const cityId = form.dataset.orderCityId;
    const goodId = form.dataset.orderGoodId;
    const dailyDemandKg = Math.max(0, Number(window.HFV2Goods?.getCityDailyDemandMap?.(cityId)?.[goodId]) || 0);
    const deliveryDay = currentDeliveryDay(form.querySelector('[name="hfV2OrderLeadTime"]')?.value);
    const deliveryMinute = deliveryMinuteFromTime(form.querySelector('[name="hfV2OrderTime"]')?.value);
    const weekday = Math.min(6, Math.max(0, Number(form.querySelector('[name="hfV2OrderWeekday"]')?.value) || 0));
    const orderPayload = {destinationCityId: cityId, goodId, sourceType: 'city', sourceId, primarySource: {type: 'city', id: sourceId}, frequency, dailyDemandKg, quantityKg: frequency === 'weekly' ? dailyDemandKg * 7 : dailyDemandKg, deliveryDay, deliveryMinute, scheduleLegacyDelivery: false};
    if (frequency === 'weekly') Object.assign(orderPayload, {deliveryWeekday: weekday, weekday});
    const order = window.HFV2Orders?.createOrder?.(orderPayload);
    window.HFV2Transport.generatePlannedDeliveries();
    window.HFV2Save?.dispatchStateChanged?.('order-created');
    window.HFV2Modal?.closeModal?.();
    window.dispatchEvent(new CustomEvent('hf:v2:order-created', {detail: {order}}));
  });

  window.HFV2OrderMenu = {openOrderModal, renderOrderModal};
})();
