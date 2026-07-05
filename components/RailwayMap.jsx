'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const STYLE_CARTO = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const STYLE_FALLBACK = 'https://tiles.openfreemap.org/styles/liberty';
const LABEL_FONTS = ['Noto Sans CJK JP Regular', 'Open Sans Regular'];

const LINES_SOURCE = 'railway-lines';
const STATIONS_SOURCE = 'railway-stations';
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

const TEXT_ZH = [
  'coalesce',
  ['get', 'name:zh-Hant'],
  ['get', 'name:zh-HK'],
  ['get', 'name:zh-TW'],
  ['get', 'name:zh'],
  ['get', 'name'],
];

const TEXT_EN = ['coalesce', ['get', 'name:en'], ['get', 'name']];

const TYPE_PROP = ['coalesce', ['get', 'railway_type'], ['get', 'rail_type'], 'rail'];

const LINE_COLOR = [
  'coalesce',
  ['get', 'color'],
  ['get', 'line_color'],
  ['get', 'colour'],
  [
    'match',
    ['get', 'macro_region'],
    'hongkong',
    ['match', TYPE_PROP, 'highspeed', '#FF3040', 'subway', '#00A040', 'tram', '#F7931E', '#971018'],
    'macau',
    ['match', TYPE_PROP, 'highspeed', '#E60012', 'subway', '#0099CC', 'tram', '#9B1096', '#003DA5'],
    'taiwan',
    ['match', TYPE_PROP, 'highspeed', '#FF3040', 'subway', '#007748', 'tram', '#FFD100', '#003366'],
    'china',
    ['match', TYPE_PROP, 'highspeed', '#FF3040', 'subway', '#00A550', 'tram', '#FF6600', '#003DA5'],
    'japan',
    ['match', TYPE_PROP, 'highspeed', '#FF3040', 'subway', '#009944', 'tram', '#FF8800', '#006633'],
    ['match', TYPE_PROP, 'highspeed', '#FF3040', 'rail', '#3B82F6', 'subway', '#22C55E', 'tram', '#F97316', '#888888'],
  ],
];

const RAIL_TYPES = [
  {
    id: 'highspeed',
    color: '#FF3040',
    minzoom: 3,
    lineWidth: ['interpolate', ['linear'], ['zoom'], 3, 2.5, 8, 3.5, 12, 5, 16, 6.5],
    filter: ['==', TYPE_PROP, 'highspeed'],
  },
  {
    id: 'rail',
    color: '#3B82F6',
    minzoom: 7,
    lineWidth: ['interpolate', ['linear'], ['zoom'], 7, 1.5, 10, 2.5, 14, 4, 18, 5.5],
    filter: ['==', TYPE_PROP, 'rail'],
  },
  {
    id: 'subway',
    color: '#22C55E',
    minzoom: 10,
    lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 2, 13, 3, 16, 4.5],
    filter: ['==', TYPE_PROP, 'subway'],
  },
  {
    id: 'tram',
    color: '#F97316',
    minzoom: 12.5,
    lineWidth: ['interpolate', ['linear'], ['zoom'], 12.5, 1.5, 14, 2.5, 18, 4],
    filter: ['==', TYPE_PROP, 'tram'],
  },
];

const REGIONS = [
  { id: 'hongkong', center: [114.1694, 22.3193], zoom: 10, cleanFile: '/data/hongkong_clean.json' },
  { id: 'macau', center: [113.5439, 22.1987], zoom: 11, cleanFile: '/data/macau_clean.json' },
  { id: 'taiwan', center: [121.0, 23.7], zoom: 8, cleanFile: '/data/taiwan_clean.json' },
  { id: 'china', center: [116.4074, 39.9042], zoom: 5, cleanMacro: 'china' },
  { id: 'japan', center: [138.2529, 36.2048], zoom: 6, cleanMacro: 'japan' },
];

const ALL_REGION_IDS = REGIONS.map((r) => r.id);
const ALL_TYPE_IDS = RAIL_TYPES.map((t) => t.id);
const LABEL_LAYER_IDS = RAIL_TYPES.flatMap((t) => [`labels-${t.id}`]);

const I18N = {
  zh: {
    title: '東亞鐵路 GIS',
    subtitle: 'Interactive GIS Matrix',
    locale: '語系',
    localeZh: '繁中',
    localeEn: 'EN',
    regions: '地區',
    selectAll: '全選',
    deselectAll: '取消全選',
    types: '鐵路類型',
    legend: '動態圖例',
    legendHint: '依勾選類型即時更新',
    zoom: '縮放',
    loading: '載入鐵路資料中…',
    ready: '資料就緒 · GPU 硬體加速',
    mapLoading: '載入底圖中…',
    regionLabels: {
      hongkong: '香港', macau: '澳門', taiwan: '台灣', china: '中國大陸', japan: '日本',
    },
    typeLabels: {
      highspeed: '高鐵 / 新幹線', rail: '普通鐵路 / 國鐵', subway: '地鐵 / 捷運', tram: '輕軌 / 路面電車',
    },
    typeDesc: {
      highspeed: 'Z3+ 全球長途骨幹', rail: 'Z7+ 城際幹線', subway: 'Z10+ 城市軌道', tram: 'Z12.5+ 社區細節',
    },
  },
  en: {
    title: 'East Asia Railway GIS',
    subtitle: 'Interactive GIS Matrix',
    locale: 'Language',
    localeZh: '繁中',
    localeEn: 'EN',
    regions: 'Regions',
    selectAll: 'Select all',
    deselectAll: 'Clear all',
    types: 'Railway types',
    legend: 'Live legend',
    legendHint: 'Updates with your selection',
    zoom: 'Zoom',
    loading: 'Loading railway data…',
    ready: 'Ready · GPU-accelerated',
    mapLoading: 'Loading basemap…',
    regionLabels: {
      hongkong: 'Hong Kong', macau: 'Macau', taiwan: 'Taiwan', china: 'Mainland China', japan: 'Japan',
    },
    typeLabels: {
      highspeed: 'High-speed / Shinkansen', rail: 'Conventional rail', subway: 'Metro / Subway', tram: 'Light rail / Tram',
    },
    typeDesc: {
      highspeed: 'Z3+ long-distance backbone', rail: 'Z7+ intercity lines', subway: 'Z10+ urban metro', tram: 'Z12.5+ neighbourhood detail',
    },
  },
};

function normalizeType(raw) {
  if (!raw || raw === 'hsr') return 'highspeed';
  if (ALL_TYPE_IDS.includes(raw)) return raw;
  return 'rail';
}

function decodeRaw(raw, macroRegion) {
  let lines = [];
  let stations = [];

  if (Array.isArray(raw.lines)) lines = raw.lines;
  if (Array.isArray(raw.stations)) stations = raw.stations;
  if (Array.isArray(raw.features)) {
    for (const f of raw.features) {
      const t = f.geometry?.type;
      if (t === 'LineString' || t === 'MultiLineString') lines.push(f);
      else if (t === 'Point') stations.push(f);
    }
  }

  const normLine = (f) => {
    const railway_type = normalizeType(f.properties?.railway_type || f.properties?.rail_type);
    const color = f.properties?.color || f.properties?.line_color || f.properties?.colour;
    return {
      ...f,
      properties: {
        ...f.properties,
        macro_region: f.properties?.macro_region || macroRegion,
        railway_type,
        color,
        line_name: f.properties?.line_name || f.properties?.name,
      },
    };
  };

  const normStation = (f) => {
    const railway_type = normalizeType(f.properties?.railway_type || f.properties?.rail_type);
    return {
      ...f,
      properties: { ...f.properties, macro_region: f.properties?.macro_region || macroRegion, railway_type },
    };
  };

  return {
    lines: lines.flatMap((f) => {
      if (f.geometry?.type === 'MultiLineString') {
        return f.geometry.coordinates.map((seg) => normLine({
          ...f,
          geometry: { type: 'LineString', coordinates: seg },
        }));
      }
      return [normLine(f)];
    }),
    stations: stations.map(normStation),
  };
}

function mergeFeatures(existing, incoming) {
  const seen = new Set(existing.map((f) => `${f.properties?.osm_type}/${f.properties?.osm_id}`));
  const out = [...existing];
  for (const f of incoming) {
    const key = `${f.properties?.osm_type}/${f.properties?.osm_id}`;
    if (!seen.has(key)) { seen.add(key); out.push(f); }
  }
  return out;
}

async function fetchCleanJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function buildRegionFilter(selected) {
  if (!selected.length) return ['==', ['get', 'macro_region'], '__none__'];
  return ['in', ['get', 'macro_region'], ['literal', selected]];
}

function buildLayerFilter(typeFilter, selectedRegions) {
  return ['all', typeFilter, buildRegionFilter(selectedRegions)];
}

function labelLayout(minzoom) {
  const dense = minzoom >= 12.5;
  return {
    'symbol-placement': 'point',
    'text-font': LABEL_FONTS,
    'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 11, 11, 14, 13, 18, 15],
    'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
    'text-radial-offset': 0.55,
    'text-justify': 'auto',
    'text-max-width': 12,
    'text-allow-overlap': dense,
    'text-ignore-placement': dense,
    'text-optional': !dense,
  };
}

function addRailLayers(map, textField) {
  for (const t of RAIL_TYPES) {
    const lineId = `lines-${t.id}`;
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: 'line',
        source: LINES_SOURCE,
        minzoom: t.minzoom,
        filter: t.filter,
        paint: {
          'line-color': LINE_COLOR,
          'line-opacity': 0.94,
          'line-cap': 'round',
          'line-join': 'round',
          'line-width': t.lineWidth,
        },
      });
    }

    const dotId = `dots-${t.id}`;
    if (!map.getLayer(dotId)) {
      map.addLayer({
        id: dotId,
        type: 'circle',
        source: STATIONS_SOURCE,
        minzoom: t.minzoom,
        filter: ['==', TYPE_PROP, t.id],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], t.minzoom, 3, 14, 5, 18, 7],
          'circle-color': '#FFFFFF',
          'circle-stroke-color': ['coalesce', ['get', 'color'], t.color],
          'circle-stroke-width': 2,
        },
      });
    }

    const labelId = `labels-${t.id}`;
    if (!map.getLayer(labelId)) {
      map.addLayer({
        id: labelId,
        type: 'symbol',
        source: STATIONS_SOURCE,
        minzoom: t.minzoom,
        filter: ['==', TYPE_PROP, t.id],
        layout: { ...labelLayout(t.minzoom), 'text-field': textField },
        paint: {
          'text-color': '#F8FAFC',
          'text-halo-color': '#0F172A',
          'text-halo-width': 1.8,
        },
      });
    }
  }
}

function initRailwayStack(map, textField) {
  if (!map.getSource(LINES_SOURCE)) {
    map.addSource(LINES_SOURCE, { type: 'geojson', data: EMPTY_FC, tolerance: 0.5, buffer: 64 });
  }
  if (!map.getSource(STATIONS_SOURCE)) {
    map.addSource(STATIONS_SOURCE, { type: 'geojson', data: EMPTY_FC, tolerance: 0, buffer: 0 });
  }
  addRailLayers(map, textField);
}

function TogglePill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150',
        active
          ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
          : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-slate-200',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function CheckChip({ checked, onChange, label, color }) {
  return (
    <label
      className={[
        'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all duration-150',
        checked
          ? 'border-slate-500/60 bg-slate-800/90 shadow-inner'
          : 'border-slate-700/40 bg-slate-900/40 hover:border-slate-600/50',
      ].join(' ')}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span
        className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/20"
        style={{ backgroundColor: checked ? color : '#334155' }}
      />
      <span className={`text-xs font-medium ${checked ? 'text-slate-100' : 'text-slate-400'}`}>{label}</span>
    </label>
  );
}

export default function RailwayMap() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const mapIsReadyRef = useRef(false);
  const layersReadyRef = useRef(false);
  const styleFallbackRef = useRef(false);
  const manifestRef = useRef(null);
  const dataRef = useRef({ lines: [], stations: [] });
  const loadedRef = useRef(new Set());
  const matrixRef = useRef({ regions: ['hongkong'], types: ALL_TYPE_IDS, locale: 'zh' });

  const [mapIsReady, setMapIsReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [locale, setLocale] = useState('zh');
  const [selectedRegions, setSelectedRegions] = useState(['hongkong']);
  const [selectedTypes, setSelectedTypes] = useState(ALL_TYPE_IDS);
  const [zoomLevel, setZoomLevel] = useState(10);

  const t = I18N[locale];
  matrixRef.current = { regions: selectedRegions, types: selectedTypes, locale };

  const canUseMap = useCallback(() => {
    const map = mapRef.current;
    return Boolean(map && mapIsReadyRef.current && layersReadyRef.current && map.isStyleLoaded());
  }, []);

  const applyLocale = useCallback((map, loc) => {
    if (!mapIsReadyRef.current || !layersReadyRef.current) return;
    const field = loc === 'en' ? TEXT_EN : TEXT_ZH;
    for (const id of LABEL_LAYER_IDS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'text-field', field);
    }
  }, []);

  const applyMatrix = useCallback((map, regions, types) => {
    if (!mapIsReadyRef.current || !layersReadyRef.current) return;
    for (const rt of RAIL_TYPES) {
      const active = types.includes(rt.id);
      for (const id of [`lines-${rt.id}`, `dots-${rt.id}`, `labels-${rt.id}`]) {
        if (!map.getLayer(id)) continue;
        map.setFilter(
          id,
          active ? buildLayerFilter(rt.filter, regions) : ['==', ['get', 'macro_region'], '__none__']
        );
      }
    }
  }, []);

  const pushDataToMap = useCallback(() => {
    if (!canUseMap()) return;
    const map = mapRef.current;
    const { lines, stations } = dataRef.current;
    map.getSource(LINES_SOURCE).setData({ type: 'FeatureCollection', features: lines });
    map.getSource(STATIONS_SOURCE).setData({ type: 'FeatureCollection', features: stations });
    applyMatrix(map, matrixRef.current.regions, matrixRef.current.types);
  }, [canUseMap, applyMatrix]);

  const setupLayersAfterStyleLoad = useCallback((map) => {
    const textField = matrixRef.current.locale === 'en' ? TEXT_EN : TEXT_ZH;
    initRailwayStack(map, textField);
    layersReadyRef.current = true;
    applyMatrix(map, matrixRef.current.regions, matrixRef.current.types);
    if (dataRef.current.lines.length) pushDataToMap();
  }, [applyMatrix, pushDataToMap]);

  const loadRegion = useCallback(async (regionId) => {
    const region = REGIONS.find((r) => r.id === regionId);
    if (!region) return;

    const manifest = manifestRef.current
      || await fetchCleanJson('/data/clean-manifest.json').then((m) => {
        manifestRef.current = m;
        return m;
      }).catch(() => null);

    const jobs = [];
    if (region.cleanFile) {
      if (!loadedRef.current.has(region.cleanFile)) {
        jobs.push({ url: region.cleanFile, key: region.cleanFile, macro: regionId });
      }
    } else if (region.cleanMacro && manifest?.files) {
      for (const entry of manifest.files.filter((f) => f.macro === region.cleanMacro)) {
        if (!loadedRef.current.has(entry.file)) {
          jobs.push({ url: entry.file, key: entry.file, macro: regionId });
        }
      }
    }
    if (!jobs.length) return;

    await Promise.all(
      jobs.map(async (job) => {
        loadedRef.current.add(job.key);
        try {
          const raw = await fetchCleanJson(job.url);
          const { lines, stations } = decodeRaw(raw, job.macro);
          dataRef.current.lines = mergeFeatures(dataRef.current.lines, lines);
          dataRef.current.stations = mergeFeatures(dataRef.current.stations, stations);
        } catch (err) {
          loadedRef.current.delete(job.key);
          console.warn(`skip ${job.url}:`, err.message);
        }
      })
    );
  }, []);

  const loadRegions = useCallback(async (regionIds) => {
    if (!regionIds.length) return;
    let done = 0;
    for (const id of regionIds) {
      await loadRegion(id);
      done += 1;
      setLoadProgress(Math.round((done / regionIds.length) * 100));
      if (canUseMap()) pushDataToMap();
    }
    setDataReady(dataRef.current.lines.length > 0 || dataRef.current.stations.length > 0);
    if (canUseMap()) pushDataToMap();
  }, [loadRegion, canUseMap, pushDataToMap]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: STYLE_CARTO,
      center: [114.1694, 22.3193],
      zoom: 10,
      minZoom: 2,
      maxZoom: 18,
      fadeDuration: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

    const onMapReady = () => {
      if (mapIsReadyRef.current) return;
      mapIsReadyRef.current = true;
      setMapIsReady(true);
      setupLayersAfterStyleLoad(map);
      fetchCleanJson('/data/clean-manifest.json').then((m) => { manifestRef.current = m; }).catch(() => {});
    };

    map.on('load', onMapReady);
    map.on('style.load', () => {
      if (!mapIsReadyRef.current) return;
      layersReadyRef.current = false;
      setupLayersAfterStyleLoad(map);
    });
    map.on('error', (e) => {
      const msg = e?.error?.message || '';
      if (!styleFallbackRef.current && /style|sprite|glyphs|fetch/i.test(msg)) {
        styleFallbackRef.current = true;
        map.setStyle(STYLE_FALLBACK);
      }
    });
    map.on('zoom', () => setZoomLevel(Math.round(map.getZoom() * 10) / 10));

    mapRef.current = map;
    fetch(STYLE_CARTO, { method: 'HEAD' }).catch(() => {
      if (!styleFallbackRef.current) {
        styleFallbackRef.current = true;
        map.setStyle(STYLE_FALLBACK);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      mapIsReadyRef.current = false;
      layersReadyRef.current = false;
      styleFallbackRef.current = false;
    };
  }, [setupLayersAfterStyleLoad]);

  useEffect(() => {
    if (!mapIsReady || !layersReadyRef.current) return;
    setLoadProgress(0);
    loadRegions(selectedRegions);
  }, [selectedRegions, mapIsReady, loadRegions]);

  useEffect(() => {
    if (!canUseMap()) return;
    applyLocale(mapRef.current, locale);
  }, [locale, canUseMap, applyLocale, dataReady]);

  useEffect(() => {
    if (!canUseMap()) return;
    applyMatrix(mapRef.current, selectedRegions, selectedTypes);
  }, [selectedRegions, selectedTypes, canUseMap, applyMatrix, dataReady]);

  const flyToRegion = useCallback((regionId) => {
    const map = mapRef.current;
    const region = REGIONS.find((r) => r.id === regionId);
    if (!map || !mapIsReadyRef.current || !region) return;
    map.flyTo({ center: region.center, zoom: region.zoom, duration: 1200, essential: true });
  }, []);

  const toggleRegion = (id) => {
    setSelectedRegions((prev) => {
      const next = prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id];
      if (!prev.includes(id)) flyToRegion(id);
      return next;
    });
  };

  const activeLegend = useMemo(
    () => RAIL_TYPES.filter((rt) => selectedTypes.includes(rt.id)),
    [selectedTypes]
  );

  return (
    <div className="relative flex h-full w-full bg-slate-950">
      <aside className="relative z-20 flex w-[min(100%,320px)] shrink-0 flex-col border-r border-slate-700/50 bg-slate-900/80 backdrop-blur-md">
        <div className="flex flex-col gap-5 overflow-y-auto p-4 sm:p-5">
          <header>
            <div className="mb-1 flex items-start justify-between gap-2">
              <div>
                <h1 className="text-base font-bold tracking-tight text-white">{t.title}</h1>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">{t.subtitle}</p>
              </div>
              <div className="text-right text-[10px] text-slate-500">
                {t.zoom}{' '}
                <span className="font-mono font-semibold text-sky-400">{zoomLevel}</span>
              </div>
            </div>
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.locale}</p>
              <div className="inline-flex rounded-xl bg-slate-800/90 p-1 ring-1 ring-slate-700/60">
                <TogglePill active={locale === 'zh'} onClick={() => setLocale('zh')}>{t.localeZh}</TogglePill>
                <TogglePill active={locale === 'en'} onClick={() => setLocale('en')}>{t.localeEn}</TogglePill>
              </div>
            </div>
          </header>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{t.regions}</h2>
              <div className="flex gap-1">
                <button type="button" onClick={() => setSelectedRegions(ALL_REGION_IDS)} className="rounded-md px-2 py-0.5 text-[10px] font-medium text-sky-400 hover:bg-slate-800">{t.selectAll}</button>
                <button type="button" onClick={() => setSelectedRegions([])} className="rounded-md px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-800">{t.deselectAll}</button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {REGIONS.map((r) => (
                <CheckChip key={r.id} checked={selectedRegions.includes(r.id)} onChange={() => toggleRegion(r.id)} label={t.regionLabels[r.id]} color="#38BDF8" />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{t.types}</h2>
              <div className="flex gap-1">
                <button type="button" onClick={() => setSelectedTypes(ALL_TYPE_IDS)} className="rounded-md px-2 py-0.5 text-[10px] font-medium text-sky-400 hover:bg-slate-800">{t.selectAll}</button>
                <button type="button" onClick={() => setSelectedTypes([])} className="rounded-md px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-800">{t.deselectAll}</button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {RAIL_TYPES.map((rt) => (
                <CheckChip
                  key={rt.id}
                  checked={selectedTypes.includes(rt.id)}
                  onChange={() => setSelectedTypes((prev) => (prev.includes(rt.id) ? prev.filter((x) => x !== rt.id) : [...prev, rt.id]))}
                  label={t.typeLabels[rt.id]}
                  color={rt.color}
                />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-700/50 bg-slate-950/60 p-3">
            <h2 className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-300">{t.legend}</h2>
            <p className="mb-3 text-[10px] text-slate-500">{t.legendHint}</p>
            {activeLegend.length === 0 ? (
              <p className="text-xs text-slate-600">—</p>
            ) : (
              <ul className="space-y-2.5">
                {activeLegend.map((rt) => (
                  <li key={rt.id} className="flex items-center gap-3">
                    <span
                      className="h-1 w-10 shrink-0 rounded-full"
                      style={{
                        backgroundColor: rt.color,
                        boxShadow: rt.id === 'highspeed' ? `0 0 8px ${rt.color}88` : undefined,
                      }}
                    />
                    <div>
                      <p className="text-xs font-medium text-slate-200">{t.typeLabels[rt.id]}</p>
                      <p className="text-[10px] text-slate-500">{t.typeDesc[rt.id]}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="mt-auto border-t border-slate-700/50 px-4 py-3">
          {!mapIsReady ? (
            <p className="text-[10px] text-slate-400">{t.mapLoading}</p>
          ) : !dataReady ? (
            <div>
              <p className="text-[10px] text-slate-400">{t.loading}</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-sky-500 transition-all duration-300" style={{ width: `${loadProgress}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-emerald-400/90">{t.ready}</p>
          )}
        </div>
      </aside>

      <div className="relative min-h-0 min-w-0 flex-1">
        <div ref={mapContainer} className="absolute inset-0 h-full w-full" />
        {!mapIsReady && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}
