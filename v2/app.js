(() => {
  'use strict';

  const SWISS_BOUNDS = [[45.72, 5.72], [47.88, 10.72]];
  const MAP_CENTER = [46.82, 8.25];
  const MARKER_SIZE = {normal: 30, small: 22};

  let selectedId = null;
  let map = null;
  let networkState = null;
  let citiesById = {};
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

  function selectedClass(city) {
    return selectedId === city.id ? ' selected' : '';
  }

  function cityLabel(city) {
    if (city.tier >= 3) return '◆';
    if (city.tier === 2) return '●';
    return '•';
  }

  function cityIcon(city) {
    const small = city.tier === 1;
    const size = small ? MARKER_SIZE.small : MARKER_SIZE.normal;
    const anchor = Math.round(size / 2);
    const classes = [
      'city-marker',
      'unlocked',
      small ? 'small-town' : '',
      city.id === 'zurich' ? 'hub' : '',
      selectedClass(city).trim(),
    ].filter(Boolean).join(' ');

    return L.divIcon({
      className: '',
      html: `<div id="mk-${city.id}" class="${classes}">${cityLabel(city)}</div>`,
      iconSize: [size, size],
      iconAnchor: [anchor, anchor],
    });
  }

  function bindCityTooltip(marker, city) {
    marker.unbindTooltip();
    marker.bindTooltip(city.name, {
      permanent: city.tier >= 3 || city.id === selectedId,
      direction: 'top',
      offset: [0, -13],
      className: 'city-label',
    });
  }

  function refreshMarkers(cities) {
    for (const city of cities) {
      const marker = markerById.get(city.id);
      if (!marker) continue;
      marker.setIcon(cityIcon(city));
      bindCityTooltip(marker, city);
    }
  }

  function selectCity(city, cities) {
    selectedId = city.id;
    refreshMarkers(cities);

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

  function renderMarkers(cities) {
    markerById.clear();
    for (const city of cities) {
      const marker = L.marker([city.lat, city.lng], {
        icon: cityIcon(city),
        keyboard: true,
        title: city.name,
        zIndexOffset: city.id === 'zurich' ? 500 : (city.tier === 1 ? 120 : 0),
      }).addTo(map);
      marker.on('click', () => selectCity(city, cities));
      marker.on('keypress', event => {
        if (event.originalEvent?.key === 'Enter' || event.originalEvent?.key === ' ') {
          selectCity(city, cities);
        }
      });
      bindCityTooltip(marker, city);
      markerById.set(city.id, marker);
    }
  }

  function bootMap(cities) {
    const mapError = document.getElementById('hfV2MapError');
    if (!window.L) {
      mapError.hidden = false;
      return false;
    }

    const bounds = L.latLngBounds(SWISS_BOUNDS);
    map = L.map('hfV2Map', {
      zoomControl: true,
      minZoom: 7,
      maxZoom: 13,
      preferCanvas: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
      maxBounds: bounds.pad(.08),
      maxBoundsViscosity: 1,
    }).setView(MAP_CENTER, 8);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      minZoom: 7,
      maxZoom: 13,
      maxNativeZoom: 18,
      noWrap: true,
      bounds,
      keepBuffer: 0,
      updateWhenIdle: true,
      updateWhenZooming: false,
      detectRetina: false,
      attribution: '© OpenStreetMap-Mitwirkende',
    }).addTo(map);

    renderMarkers(cities);
    if (window.HFNetwork && networkState) {
      window.HFNetwork.renderNetworkLines(map, networkState, citiesById);
    }
    map.fitBounds(bounds, {padding: [16, 16], animate: false});
    return true;
  }

  function boot() {
    const cities = loadCities();
    citiesById = Object.fromEntries(cities.map(city => [city.id, city]));
    networkState = window.HFNetwork?.configure({
      state: window.HFNetwork.createNetworkState({networkOriginNode: 'zurich', selected: 'zurich'}),
      cities,
      citiesById,
    });
    document.getElementById('hfV2CityCount').textContent = `${cities.length.toLocaleString('de-CH')} Orte`;
    if (!bootMap(cities)) return;
    const zurich = cities.find(city => city.id === 'zurich');
    if (zurich) selectCity(zurich, cities);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once: true});
  } else {
    boot();
  }
})();
