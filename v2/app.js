(() => {
  'use strict';

  const SWISS_BOUNDS = {
    minLat: 45.72,
    maxLat: 47.88,
    minLng: 5.72,
    maxLng: 10.72,
  };
  const MAP = {width: 1000, height: 620, padX: 82, padY: 70};

  let selectedId = null;
  const markerById = new Map();

  function normaliseCity(raw) {
    const coordinates = raw.coordinates || {};
    return {
      id: String(raw.id || '').trim(),
      name: String(raw.name || raw.id || 'Unbekannter Ort'),
      lat: Number(raw.lat ?? coordinates.lat),
      lng: Number(raw.lng ?? coordinates.lng),
      tier: Number(raw.tier) || 1,
      slots: Number(raw.slots) || 0,
      population: Number(raw.population) || 0,
      wealthFactor: Number(raw.wealthFactor) || 1,
      demandProfile: String(raw.demandProfile || 'standard'),
    };
  }

  function loadCities() {
    return (window.HF_CITY_CATALOG || [])
      .map(normaliseCity)
      .filter(city => city.id && Number.isFinite(city.lat) && Number.isFinite(city.lng))
      .sort((a, b) => a.name.localeCompare(b.name, 'de-CH'));
  }

  function project(city) {
    const usableWidth = MAP.width - MAP.padX * 2;
    const usableHeight = MAP.height - MAP.padY * 2;
    const x = MAP.padX + ((city.lng - SWISS_BOUNDS.minLng) / (SWISS_BOUNDS.maxLng - SWISS_BOUNDS.minLng)) * usableWidth;
    const y = MAP.padY + ((SWISS_BOUNDS.maxLat - city.lat) / (SWISS_BOUNDS.maxLat - SWISS_BOUNDS.minLat)) * usableHeight;
    return {
      x: Math.max(MAP.padX, Math.min(MAP.width - MAP.padX, x)),
      y: Math.max(MAP.padY, Math.min(MAP.height - MAP.padY, y)),
    };
  }

  function formatPopulation(value) {
    return value ? value.toLocaleString('de-CH') : 'nicht angegeben';
  }

  function tierLabel(tier) {
    if (tier >= 3) return 'Stufe 3 · Zentrum';
    if (tier === 2) return 'Stufe 2 · Regionalort';
    return 'Stufe 1 · kleiner Ort';
  }

  function fact(label, value) {
    return `<div class="hf-v2-fact"><dt>${label}</dt><dd>${value}</dd></div>`;
  }

  function selectCity(city) {
    selectedId = city.id;
    for (const [id, marker] of markerById.entries()) {
      marker.classList.toggle('is-selected', id === selectedId);
      marker.setAttribute('aria-pressed', id === selectedId ? 'true' : 'false');
    }

    document.getElementById('hfV2SelectedName').textContent = city.name;
    document.getElementById('hfV2SelectedIntro').textContent = 'Basisdaten aus dem bestehenden Ortskatalog. In V2.1 gibt es bewusst noch keine Wirtschaftssimulation.';
    document.getElementById('hfV2Facts').innerHTML = [
      fact('ID', city.id),
      fact('Kategorie', tierLabel(city.tier)),
      fact('Bevölkerung', formatPopulation(city.population)),
      fact('Bauplätze', city.slots.toLocaleString('de-CH')),
      fact('Wohlstandsfaktor', city.wealthFactor.toFixed(2)),
      fact('Nachfrageprofil', city.demandProfile),
      fact('Koordinaten', `${city.lat.toFixed(4)}, ${city.lng.toFixed(4)}`),
    ].join('');
  }

  function markerRadius(city) {
    if (city.tier >= 3) return 9;
    if (city.tier === 2) return 7;
    return 5;
  }

  function renderMarkers(cities) {
    const root = document.getElementById('hfV2Markers');
    root.innerHTML = '';
    markerById.clear();

    for (const city of cities) {
      const point = project(city);
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.classList.add('hf-v2-marker', `is-tier-${Math.min(city.tier, 3)}`);
      group.setAttribute('transform', `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      group.setAttribute('aria-label', `${city.name} auswählen`);
      group.setAttribute('aria-pressed', 'false');

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', String(markerRadius(city)));

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', '10');
      label.setAttribute('y', '-8');
      label.textContent = city.name;

      group.append(circle, label);
      group.addEventListener('click', () => selectCity(city));
      group.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectCity(city);
        }
      });

      root.append(group);
      markerById.set(city.id, group);
    }
  }

  function boot() {
    const cities = loadCities();
    document.getElementById('hfV2CityCount').textContent = `${cities.length.toLocaleString('de-CH')} Orte`;
    renderMarkers(cities);
    const zurich = cities.find(city => city.id === 'zurich');
    if (zurich) selectCity(zurich);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once: true});
  } else {
    boot();
  }
})();
