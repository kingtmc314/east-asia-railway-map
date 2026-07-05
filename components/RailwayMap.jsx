'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/* ─── Map constants ─── */
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const GLYPHS_FALLBACK = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
const LABEL_FONTS = ['Noto Sans CJK JP Regular', 'Open Sans Regular'];
const SNAP_DEG = 0.004;

const LINES_SOURCE = 'railway-lines';
const STATIONS_SOURCE = 'railway-stations';

const TEXT_ZH = [
  'coalesce',
  ['get', 'name:zh-Hant'],
  ['get', 'name:zh-HK'],
  ['get', 'name:zh-TW'],
  ['get', 'name:zh'],
  ['get', 'label_zh'],
  ['get', 'name'],
];

const TEXT_EN = ['coalesce', ['get', 'name:en'], ['get', 'name']];

const LINE_PAINT = {
  'line-color': ['coalesce', ['get', 'line_color'], ['get', 'color'], ['get', 'colour'], '#888888'],
  'line-opacity': 0.94,
  'line-cap': 'round',
  'line-join': 'round',
};

/* ─── Railway type matrix (railsmaps-style palette) ─── */
const RAIL_TYPES = [
  {
    id: 'hsr',
    color: '#FF3040',
    minzoom: 3,
    lineWidth: ['interpolate', ['linear'], ['zoom'], 3, 2.5, 8, 3, 12, 4.5, 16, 6],
    filter: ['==', ['get', 'rail_type'], 'hsr'],
  },
  {
    id: 'rail',
    color: '#3B82F6',
    minzoom: 7,
    lineWidth: ['interpolate', ['linear'], ['zoom'], 7, 1.5, 10, 2.5, 14, 4, 18, 5.5],
    filter: ['==', ['get', 'rail_type'], 'rail'],
  },
  {
    id: 'subway',
    color: '#22C55E',
    minzoom: 10,
    lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 2, 13, 3, 16, 4.5],
    filter: ['==', ['get', 'rail_type'], 'subway'],
  },
  {
    id: 'tram',
    color: '#F97316',
    minzoom: 12.5,
    lineWidth: ['interpolate', ['linear'], ['zoom'], 12.5, 1.5, 14, 2.5, 18, 4],
    filter: ['==', ['get', 'rail_type'], 'tram'],
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
    regionLabels: {
      hongkong: '香港',
      macau: '澳門',
      taiwan: '台灣',
      china: '中國大陸',
      japan: '日本',
    },
    typeLabels: {
      hsr: '高鐵 / 新幹線',
      rail: '普通鐵路 / 國鐵',
      subway: '地鐵 / 捷運',
      tram: '輕軌 / 路面電車',
    },
    typeDesc: {
      hsr: 'Z3+ 全球長途骨幹',
      rail: 'Z7+ 城際幹線',
      subway: 'Z10+ 城市軌道',
      tram: 'Z12.5+ 社區細節',
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
    regionLabels: {
      hongkong: 'Hong Kong',
      macau: 'Macau',
      taiwan: 'Taiwan',
      china: 'Mainland China',
      japan: 'Japan',
    },
    typeLabels: {
      hsr: 'High-speed / Shinkansen',
      rail: 'Conventional rail',
      subway: 'Metro / Subway',
      tram: 'Light rail / Tram',
    },
    typeDesc: {
      hsr: 'Z3+ long-distance backbone',
      rail: 'Z7+ intercity lines',
      subway: 'Z10+ urban metro',
      tram: 'Z12.5+ neighbourhood detail',
    },
  },
};

const LABEL_LAYER_IDS = RAIL_TYPES.flatMap((t) => [`labels-${t.id}`]);

/* ─── Data helpers ─── */
function toMacroRegion(regionId) {
  if (!regionId) return 'other';
  if (regionId.startsWith('china-')) return 'china';
  if (regionId.startsWith('japan-')) return 'japan';
  return regionId;
}

function classifyLine(props) {
  const p = props || {};
  if (p.rail_type) return p.rail_type;
  if (p.line_tier === 'hsr' || p.is_hsr === 1 || p.highspeed === 'yes') return 'hsr';
  if (p.line_tier === 'tram' || p.railway === 'tram' || p.railway === 'light_rail') return 'tram';
  if (p.line_tier === 'metro' || p.railway === 'subway') return 'subway';
  return 'rail';
}

/** Parse pre-cleaned static JSON or legacy FeatureCollection */
function decodeRaw(raw, macroRegion) {
  let lines = [];
  let stations = [];

  if (Array.isArray(raw.lines)) lines = raw.lines;
  else if (raw?.type === 'FeatureCollection') {
    for (const f of raw.features || []) {
      const t = f.geometry?.type;
      if (t === 'LineString' || t === 'MultiLineString') lines.push(f);
      else if (t === 'Point') stations.push(f);
    }
  }

  if (Array.isArray(raw.stations)) stations = raw.stations;

  const tagLine = (f) => ({
    ...f,
    properties: {
      ...f.properties,
      macro_region: f.properties?.macro_region || macroRegion,
      rail_type: classifyLine(f.properties),
      line_color: f.properties?.line_color || f.properties?.color || f.properties?.colour,
    },
  });

  return {
    lines: lines.map(tagLine),
    stations: stations.map((f) => ({
      ...f,
      properties: { ...f.properties, macro_region: f.properties?.macro_region || macroRegion },
    })),
  };
}

function* iterLineCoords(geometry) {
  if (!geometry) return;
  if (geometry.type === 'LineString') yield geometry.coordinates;
  else if (geometry.type === 'MultiLineString') {
    for (const seg of geometry.coordinates) yield seg;
  }
}

function enrichStations(lines, stations) {
  const thresholdSq = SNAP_DEG * SNAP_DEG;
  return stations.map((raw) => {
    const coords = raw.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const [sx, sy] = coords;
    const types = new Set();
    for (const line of lines) {
      for (const seg of iterLineCoords(line.geometry)) {
        if (!seg?.length) continue;
        let hit = false;
        for (let i = 0; i < seg.length; i++) {
          const dx = seg[i][0] - sx;
          const dy = seg[i][1] - sy;
          if (dx * dx + dy * dy <= thresholdSq) { hit = true; break; }
        }
        if (hit) { types.add(line.properties?.rail_type || 'rail'); break; }
      }
    }
    const priority = ['hsr', 'rail', 'subway', 'tram'];
    let rail_type = 'rail';
    for (const p of priority) {
      if (types.has(p)) { rail_type = p; break; }
    }
    return {
      ...raw,
      geometry: { type: 'Point', coordinates: [coords[0], coords[1]] },
      properties: { ...raw.properties, rail_type },
    };
  }).filter(Boolean);
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

function ensureGlyphs(map) {
  const style = map.getStyle();
  if (style && !style.glyphs) map.setStyle({ ...style, glyphs: GLYPHS_FALLBACK });
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
        paint: { ...LINE_PAINT, 'line-width': t.lineWidth },
      });
    }

    const dotId = `dots-${t.id}`;
    if (!map.getLayer(dotId)) {
      map.addLayer({
        id: dotId,
        type: 'circle',
        source: STATIONS_SOURCE,
        minzoom: t.minzoom,
        filter: ['==', ['get', 'rail_type'], t.id],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], t.minzoom, 3, 14, 5, 18, 7],
          'circle-color': '#FFFFFF',
          'circle-stroke-color': t.color,
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
        filter: ['==', ['get', 'rail_type'], t.id],
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

/* ─── UI primitives ─── */
function TogglePill({ active, onClick, children, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150',
        active
          ? accent || 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
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
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/20"
        style={{ backgroundColor: checked ? color : '#334155' }}
      />
      <span className={`text-xs font-medium ${checked ? 'text-slate-100' : 'text-slate-400'}`}>
        {label}
      </span>
    </label>
  );
}

/* ─── Main component ─── */
export default function RailwayMap() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const manifestRef = useRef(null);
  const dataRef = useRef({ lines: [], stations: [] });
  const loadedRef = useRef(new Set());
  const layersReadyRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [locale, setLocale] = useState('zh');
  const [selectedRegions, setSelectedRegions] = useState(['hongkong']);
  const [selectedTypes, setSelectedTypes] = useState(ALL_TYPE_IDS);
  const [zoomLevel, setZoomLevel] = useState(5);

  const t = I18N[locale];

  const applyLocale = useCallback((map, loc) => {
    const field = loc === 'en' ? TEXT_EN : TEXT_ZH;
    for (const id of LABEL_LAYER_IDS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'text-field', field);
    }
  }, []);

  const applyMatrix = useCallback((map, regions, types) => {
    for (const rt of RAIL_TYPES) {
      const active = types.includes(rt.id);
      const ids = [`lines-${rt.id}`, `dots-${rt.id}`, `labels-${rt.id}`];
      for (const id of ids) {
        if (!map.getLayer(id)) continue;
        if (!active) {
          map.setFilter(id, ['==', ['get', 'macro_region'], '__none__']);
        } else {
          map.setFilter(id, buildLayerFilter(rt.filter, regions));
        }
      }
    }
  }, []);

  const pushDataToMap = useCallback((map) => {
    const { lines, stations } = dataRef.current;
    const enriched = enrichStations(lines, stations);
    const lineFC = { type: 'FeatureCollection', features: lines };
    const stationFC = { type: 'FeatureCollection', features: enriched };

    if (!map.getSource(LINES_SOURCE)) {
      map.addSource(LINES_SOURCE, { type: 'geojson', data: lineFC, tolerance: 0.5, buffer: 64 });
    } else {
      map.getSource(LINES_SOURCE).setData(lineFC);
    }

    if (!map.getSource(STATIONS_SOURCE)) {
      map.addSource(STATIONS_SOURCE, { type: 'geojson', data: stationFC, tolerance: 0, buffer: 0 });
    } else {
      map.getSource(STATIONS_SOURCE).setData(stationFC);
    }

    if (!layersReadyRef.current) {
      addRailLayers(map, locale === 'en' ? TEXT_EN : TEXT_ZH);
      layersReadyRef.current = true;
    }
  }, [locale]);

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

  const loadRegions = useCallback(
    async (regionIds) => {
      const needsLoad = regionIds.some((id) => {
        const region = REGIONS.find((r) => r.id === id);
        if (!region) return false;
        if (region.cleanFile) return !loadedRef.current.has(region.cleanFile);
        if (region.cleanMacro && manifestRef.current?.files) {
          return manifestRef.current.files
            .filter((f) => f.macro === region.cleanMacro)
            .some((f) => !loadedRef.current.has(f.file));
        }
        return true;
      });

      if (!needsLoad && !regionIds.length) return;

      let done = 0;
      const total = regionIds.length;
      for (const id of regionIds) {
        try {
          await loadRegion(id);
        } catch {
          /* logged */
        }
        done += 1;
        setLoadProgress(Math.round((done / Math.max(total, 1)) * 100));
        const map = mapRef.current;
        if (map?.isStyleLoaded()) pushDataToMap(map);
      }

      setDataReady(loadedRef.current.size > 0);
      const map = mapRef.current;
      if (map?.isStyleLoaded()) {
        pushDataToMap(map);
        applyMatrix(map, selectedRegions, selectedTypes);
      }
    },
    [loadRegion, pushDataToMap, applyMatrix, selectedRegions, selectedTypes]
  );

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: [114.1694, 22.3193],
      zoom: 10,
      minZoom: 2,
      maxZoom: 18,
      fadeDuration: 0,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      ensureGlyphs(map);
      fetchCleanJson('/data/clean-manifest.json')
        .then((m) => { manifestRef.current = m; })
        .catch(() => {});
      setMapReady(true);
    });
    map.on('zoom', () => setZoomLevel(Math.round(map.getZoom() * 10) / 10));

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layersReadyRef.current = false;
    };
  }, []);

  /* Load clean JSON for each selected region (lazy, static files only) */
  useEffect(() => {
    if (!mapReady) return;
    setLoadProgress(0);
    loadRegions(selectedRegions);
  }, [selectedRegions, mapReady, loadRegions]);

  /* Fly to region when first selected */
  const flyToRegion = useCallback((regionId) => {
    const map = mapRef.current;
    const region = REGIONS.find((r) => r.id === regionId);
    if (!map || !region) return;
    map.flyTo({ center: region.center, zoom: region.zoom, duration: 1200, essential: true });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    applyLocale(map, locale);
  }, [locale, applyLocale, dataReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    applyMatrix(map, selectedRegions, selectedTypes);
  }, [selectedRegions, selectedTypes, applyMatrix, dataReady]);

  const toggleRegion = (id) => {
    setSelectedRegions((prev) => {
      const next = prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id];
      if (!prev.includes(id)) flyToRegion(id);
      return next;
    });
  };

  const toggleType = (id) => {
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const activeLegend = useMemo(
    () => RAIL_TYPES.filter((rt) => selectedTypes.includes(rt.id)),
    [selectedTypes]
  );

  return (
    <div className="relative flex h-full w-full bg-slate-950">
      {/* ── Sidebar (railsmaps-inspired) ── */}
      <aside className="relative z-20 flex w-[min(100%,320px)] shrink-0 flex-col border-r border-slate-700/50 bg-slate-900/80 backdrop-blur-md">
        <div className="flex flex-col gap-5 overflow-y-auto p-4 sm:p-5">
          {/* Header + bilingual toggle */}
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
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                {t.locale}
              </p>
              <div className="inline-flex rounded-xl bg-slate-800/90 p-1 ring-1 ring-slate-700/60">
                <TogglePill active={locale === 'zh'} onClick={() => setLocale('zh')}>
                  {t.localeZh}
                </TogglePill>
                <TogglePill active={locale === 'en'} onClick={() => setLocale('en')}>
                  {t.localeEn}
                </TogglePill>
              </div>
            </div>
          </header>

          {/* Regions matrix */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {t.regions}
              </h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedRegions(ALL_REGION_IDS)}
                  className="rounded-md px-2 py-0.5 text-[10px] font-medium text-sky-400 hover:bg-slate-800"
                >
                  {t.selectAll}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRegions([])}
                  className="rounded-md px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-800"
                >
                  {t.deselectAll}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {REGIONS.map((r) => (
                <CheckChip
                  key={r.id}
                  checked={selectedRegions.includes(r.id)}
                  onChange={() => toggleRegion(r.id)}
                  label={t.regionLabels[r.id]}
                  color="#38BDF8"
                />
              ))}
            </div>
          </section>

          {/* Railway types matrix */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {t.types}
              </h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedTypes(ALL_TYPE_IDS)}
                  className="rounded-md px-2 py-0.5 text-[10px] font-medium text-sky-400 hover:bg-slate-800"
                >
                  {t.selectAll}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTypes([])}
                  className="rounded-md px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-800"
                >
                  {t.deselectAll}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {RAIL_TYPES.map((rt) => (
                <CheckChip
                  key={rt.id}
                  checked={selectedTypes.includes(rt.id)}
                  onChange={() => toggleType(rt.id)}
                  label={t.typeLabels[rt.id]}
                  color={rt.color}
                />
              ))}
            </div>
          </section>

          {/* Dynamic legend */}
          <section className="rounded-xl border border-slate-700/50 bg-slate-950/60 p-3">
            <h2 className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
              {t.legend}
            </h2>
            <p className="mb-3 text-[10px] text-slate-500">{t.legendHint}</p>
            {activeLegend.length === 0 ? (
              <p className="text-xs text-slate-600">—</p>
            ) : (
              <ul className="space-y-2.5">
                {activeLegend.map((rt) => (
                  <li key={rt.id} className="flex items-center gap-3">
                    <span
                      className="h-1 w-10 shrink-0 rounded-full shadow-sm"
                      style={{
                        backgroundColor: rt.color,
                        boxShadow: rt.id === 'hsr' ? `0 0 8px ${rt.color}88` : undefined,
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

        {/* Status bar */}
        <div className="mt-auto border-t border-slate-700/50 px-4 py-3">
          {!dataReady ? (
            <div>
              <p className="text-[10px] text-slate-400">{t.loading}</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-300"
                  style={{ width: `${loadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-emerald-400/90">{t.ready}</p>
          )}
        </div>
      </aside>

      {/* ── Map canvas ── */}
      <div className="relative min-w-0 flex-1">
        <div ref={mapContainer} className="absolute inset-0" />
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}
