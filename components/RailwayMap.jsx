'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const GLYPHS_FALLBACK = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
const LABEL_FONTS = ['Noto Sans CJK JP Regular', 'Open Sans Regular'];

const STATION_NAME = [
  'coalesce',
  ['get', 'name:zh-Hant'],
  ['get', 'name:zh-HK'],
  ['get', 'name:zh-TW'],
  ['get', 'name:zh'],
  ['get', 'label_zh'],
  ['get', 'name'],
];

const LINE_COLOR = [
  'coalesce',
  ['get', 'line_color'],
  ['get', 'color'],
  ['get', 'colour'],
  '#888888',
];

const LOAD_CONCURRENCY = 3;
const SNAP_DEG = 0.004;

/** 核心樞紐站關鍵字（低縮放僅顯示這些大站） */
const HUB_KEYWORDS = [
  '西九龍', '紅磡', '九龍', '香港', '金鐘', '中環', '尖沙咀',
  '台北車站', '台北站', '台中', '高雄', '左營',
  '東京', '新宿', '渋谷', '大阪', '名古屋', '京都',
  '北京南', '北京西', '北京', '上海虹桥', '上海虹橋', '上海', '广州南', '廣州南', '深圳北',
];

const REGIONS = [
  {
    id: 'hongkong',
    label: '香港',
    center: [114.1694, 22.3193],
    zoom: 10,
    files: ['/data/hongkong.topo.json', '/data/hongkong.json'],
  },
  {
    id: 'macau',
    label: '澳門',
    center: [113.5439, 22.1987],
    zoom: 11,
    files: ['/data/macau.topo.json', '/data/macau.json'],
  },
  {
    id: 'taiwan',
    label: '台灣',
    center: [121.0, 23.7],
    zoom: 8,
    files: ['/data/taiwan.topo.json', '/data/taiwan.json'],
  },
  {
    id: 'china',
    label: '中國大陸',
    center: [116.4074, 39.9042],
    zoom: 5,
    manifestPrefix: 'china-',
  },
  {
    id: 'japan',
    label: '日本',
    center: [138.2529, 36.2048],
    zoom: 6,
    manifestPrefix: 'japan-',
  },
];

/* ── 線路 filter（依 line_tier / OSM 屬性） ── */
const FILTER_LINE_HSR = [
  'any',
  ['==', ['get', 'line_tier'], 'hsr'],
  ['==', ['get', 'is_hsr'], 1],
  ['==', ['get', 'highspeed'], 'yes'],
];

const FILTER_LINE_MAIN = [
  'all',
  ['!=', ['get', 'line_tier'], 'tram'],
  ['!=', ['get', 'railway'], 'tram'],
  ['any',
    ['==', ['get', 'line_tier'], 'intercity'],
    ['==', ['get', 'line_tier'], 'metro'],
    ['all', ['==', ['get', 'railway'], 'rail'], ['!=', ['get', 'line_tier'], 'hsr']],
  ],
];

const FILTER_LINE_DETAIL = [
  'any',
  ['==', ['get', 'line_tier'], 'tram'],
  ['==', ['get', 'railway'], 'tram'],
  ['in', ['get', 'service'], ['literal', ['siding', 'spur', 'yard']]],
];

/* ── 站名 filter（依預處理 label_tier） ── */
const FILTER_LABEL_HUB = ['==', ['get', 'label_tier'], 'hub'];
const FILTER_LABEL_REGULAR = ['==', ['get', 'label_tier'], 'regular'];
const FILTER_LABEL_LOCAL = ['==', ['get', 'label_tier'], 'local'];

function linesSourceId(macroId) {
  return `railway-${macroId}-lines`;
}

function stationsSourceId(macroId) {
  return `railway-${macroId}-stations`;
}

function decodeRaw(raw) {
  if (raw?.type === 'Topology' && raw.objects) {
    const lines = raw.objects.lines
      ? feature(raw, raw.objects.lines)
      : { type: 'FeatureCollection', features: [] };
    const stations = raw.objects.stations
      ? feature(raw, raw.objects.stations)
      : { type: 'FeatureCollection', features: [] };
    return { lines: lines.features || [], stations: stations.features || [] };
  }
  const lines = [];
  const stations = [];
  for (const f of raw.features || []) {
    const t = f.geometry?.type;
    if (t === 'LineString' || t === 'MultiLineString') lines.push(f);
    else if (t === 'Point') stations.push(f);
  }
  return { lines, stations };
}

async function fetchFirstAvailable(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      return decodeRaw(await res.json());
    } catch {
      /* next */
    }
  }
  throw new Error('no data');
}

function validPoint(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return false;
  const [lon, lat] = coords;
  return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90;
}

function normalizeStationFeature(f) {
  if (!validPoint(f.geometry?.coordinates)) return null;
  return {
    ...f,
    geometry: {
      type: 'Point',
      coordinates: [f.geometry.coordinates[0], f.geometry.coordinates[1]],
    },
  };
}

function getLineKey(props) {
  return `${props.osm_type || 'way'}/${props.osm_id}`;
}

function* iterLineCoords(geometry) {
  if (!geometry) return;
  if (geometry.type === 'LineString') yield geometry.coordinates;
  else if (geometry.type === 'MultiLineString') {
    for (const seg of geometry.coordinates) yield seg;
  }
}

function stationDisplayName(props) {
  return (
    props['name:zh-Hant'] ||
    props['name:zh-HK'] ||
    props['name:zh-TW'] ||
    props['name:zh'] ||
    props.label_zh ||
    props.name ||
    ''
  );
}

function isHubName(name) {
  if (!name) return false;
  return HUB_KEYWORDS.some((kw) => name.includes(kw));
}

function lineTierOf(line) {
  return line.properties?.line_tier || 'other';
}

/** 標記 label_tier: hub | regular | local — 不修改座標 */
function enrichStationLabels(lines, stations) {
  const thresholdSq = SNAP_DEG * SNAP_DEG;
  return stations.map((raw) => {
    const station = normalizeStationFeature(raw);
    if (!station) return null;

    const [sx, sy] = station.geometry.coordinates;
    const seen = new Set();
    const matchedTiers = new Set();
    let transfer_count = 0;

    for (const line of lines) {
      let matched = false;
      for (const coords of iterLineCoords(line.geometry)) {
        if (!coords?.length) continue;
        for (let i = 0; i < coords.length; i++) {
          const dx = coords[i][0] - sx;
          const dy = coords[i][1] - sy;
          if (dx * dx + dy * dy <= thresholdSq) {
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      if (matched) {
        matchedTiers.add(lineTierOf(line));
        const key = getLineKey(line.properties || {});
        if (!seen.has(key)) {
          seen.add(key);
          transfer_count += 1;
        }
      }
    }

    const p = station.properties || {};
    const name = stationDisplayName(p);
    const tramOnly =
      matchedTiers.size > 0 &&
      [...matchedTiers].every((t) => t === 'tram');
    const onHsr = matchedTiers.has('hsr') || p.is_hsr === 1;

    let label_tier = 'regular';
    if (
      transfer_count >= 2 ||
      onHsr ||
      p.station === 'major' ||
      isHubName(name)
    ) {
      label_tier = 'hub';
    } else if (tramOnly || p.railway === 'tram' || matchedTiers.has('tram')) {
      label_tier = 'local';
    }

    return {
      ...station,
      properties: { ...p, transfer_count, label_tier },
    };
  }).filter(Boolean);
}

function mergeFeatures(existing, incoming) {
  const seen = new Set(
    existing.map((f) => `${f.properties?.osm_type}/${f.properties?.osm_id}`)
  );
  const merged = [...existing];
  for (const f of incoming) {
    const key = `${f.properties?.osm_type}/${f.properties?.osm_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(f);
    }
  }
  return merged;
}

function ensureGlyphs(map) {
  const style = map.getStyle();
  if (style && !style.glyphs) {
    map.setStyle({ ...style, glyphs: GLYPHS_FALLBACK });
  }
}

function labelLayout(allowOverlap) {
  return {
    'symbol-placement': 'point',
    'text-field': STATION_NAME,
    'text-font': LABEL_FONTS,
    'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 11.5, 11, 14, 13, 18, 15],
    'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
    'text-radial-offset': 0.55,
    'text-justify': 'auto',
    'text-max-width': 12,
    'text-allow-overlap': allowOverlap,
    'text-ignore-placement': allowOverlap,
    'text-optional': !allowOverlap,
  };
}

function addMacroLayers(map, macroId) {
  const lineSource = linesSourceId(macroId);
  const stationSource = stationsSourceId(macroId);
  const prefix = macroId;

  const lineDefs = [
    {
      id: `${prefix}-lines-hsr`,
      filter: FILTER_LINE_HSR,
      minzoom: 4,
      width: ['interpolate', ['linear'], ['zoom'], 4, 2, 10, 3, 14, 5],
    },
    {
      id: `${prefix}-lines-main`,
      filter: FILTER_LINE_MAIN,
      minzoom: 8.5,
      width: ['interpolate', ['linear'], ['zoom'], 8.5, 2, 11.5, 3, 14, 5, 18, 7],
    },
    {
      id: `${prefix}-lines-detail`,
      filter: FILTER_LINE_DETAIL,
      minzoom: 11.5,
      width: ['interpolate', ['linear'], ['zoom'], 11.5, 1.5, 14, 3, 18, 5],
    },
  ];

  for (const def of lineDefs) {
    if (map.getLayer(def.id)) continue;
    map.addLayer({
      id: def.id,
      type: 'line',
      source: lineSource,
      minzoom: def.minzoom,
      filter: def.filter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': LINE_COLOR,
        'line-width': def.width,
        'line-opacity': 0.92,
      },
    });
  }

  const circleDefs = [
    { id: `${prefix}-dots-hub`, filter: FILTER_LABEL_HUB, minzoom: 4, r: [4, 6, 8] },
    { id: `${prefix}-dots-regular`, filter: FILTER_LABEL_REGULAR, minzoom: 11.5, r: [3, 5, 7] },
    { id: `${prefix}-dots-local`, filter: FILTER_LABEL_LOCAL, minzoom: 13, r: [2.5, 4, 6] },
  ];

  for (const def of circleDefs) {
    if (map.getLayer(def.id)) continue;
    map.addLayer({
      id: def.id,
      type: 'circle',
      source: stationSource,
      minzoom: def.minzoom,
      filter: def.filter,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, def.r[0], 14, def.r[1], 18, def.r[2]],
        'circle-color': '#FFFFFF',
        'circle-stroke-color': '#111111',
        'circle-stroke-width': def.minzoom >= 13 ? 1 : 1.5,
      },
    });
  }

  const labelDefs = [
    { id: `${prefix}-labels-hub`, filter: FILTER_LABEL_HUB, minzoom: 4, maxzoom: 12.99, overlap: false },
    { id: `${prefix}-labels-regular`, filter: FILTER_LABEL_REGULAR, minzoom: 11.5, maxzoom: 12.99, overlap: false },
    { id: `${prefix}-labels-hub-dense`, filter: FILTER_LABEL_HUB, minzoom: 13, overlap: true },
    { id: `${prefix}-labels-regular-dense`, filter: FILTER_LABEL_REGULAR, minzoom: 13, overlap: true },
    { id: `${prefix}-labels-local-dense`, filter: FILTER_LABEL_LOCAL, minzoom: 13, overlap: true },
  ];

  for (const def of labelDefs) {
    if (map.getLayer(def.id)) continue;
    map.addLayer({
      id: def.id,
      type: 'symbol',
      source: stationSource,
      minzoom: def.minzoom,
      maxzoom: def.maxzoom,
      filter: def.filter,
      layout: labelLayout(def.overlap),
      paint: {
        'text-color': def.overlap ? '#F5F5F5' : '#FFFFFF',
        'text-halo-color': '#0a0a0a',
        'text-halo-width': def.overlap ? 1.2 : 2,
      },
    });
  }
}

const LAYER_SUFFIXES = [
  '-lines-hsr', '-lines-main', '-lines-detail',
  '-dots-hub', '-dots-regular', '-dots-local',
  '-labels-hub', '-labels-regular',
  '-labels-hub-dense', '-labels-regular-dense', '-labels-local-dense',
];

export default function RailwayMap() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const manifestRef = useRef(null);
  const loadedFilesRef = useRef(new Set());
  const macroDataRef = useRef(new Map());

  const [mapReady, setMapReady] = useState(false);
  const [activeRegion, setActiveRegion] = useState('');
  const [zoomLevel, setZoomLevel] = useState(5);
  const [loadHint, setLoadHint] = useState(null);

  const refreshMacroLayers = useCallback((map, macroId) => {
    const data = macroDataRef.current.get(macroId);
    if (!data) return;

    const lineSource = linesSourceId(macroId);
    const stationSource = stationsSourceId(macroId);
    const enriched = enrichStationLabels(data.lines, data.stations);

    const lineFC = { type: 'FeatureCollection', features: data.lines };
    const stationFC = { type: 'FeatureCollection', features: enriched };

    if (!map.getSource(lineSource)) {
      map.addSource(lineSource, {
        type: 'geojson',
        data: lineFC,
        tolerance: 0.5,
        buffer: 64,
      });
    } else {
      map.getSource(lineSource).setData(lineFC);
    }

    if (!map.getSource(stationSource)) {
      map.addSource(stationSource, {
        type: 'geojson',
        data: stationFC,
        tolerance: 0,
        buffer: 0,
      });
    } else {
      map.getSource(stationSource).setData(stationFC);
    }

    addMacroLayers(map, macroId);
  }, []);

  const setMacroVisibility = useCallback((map, activeId) => {
    for (const region of REGIONS) {
      const visible = region.id === activeId ? 'visible' : 'none';
      for (const suffix of LAYER_SUFFIXES) {
        const id = `${region.id}${suffix}`;
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible);
      }
    }
  }, []);

  const getFileList = useCallback(async (region) => {
    if (region.files) return region.files.map((file) => ({ file, id: file }));

    if (region.manifestPrefix) {
      if (!manifestRef.current) {
        const res = await fetch('/data/manifest.json');
        manifestRef.current = await res.json();
      }
      return manifestRef.current.regions
        .filter((r) => r.id.startsWith(region.manifestPrefix))
        .map((r) => ({ file: r.file, id: r.id }));
    }
    return [];
  }, []);

  const loadMacroRegion = useCallback(
    async (macroId) => {
      const map = mapRef.current;
      const region = REGIONS.find((r) => r.id === macroId);
      if (!map || !region) return;

      setMacroVisibility(map, macroId);

      const entries = await getFileList(region);
      const pending = entries.filter((e) => !loadedFilesRef.current.has(e.id));
      if (!pending.length) {
        refreshMacroLayers(map, macroId);
        return;
      }

      setLoadHint(`正在載入${region.label}鐵路資料 (0/${pending.length})…`);
      let done = 0;

      if (!macroDataRef.current.has(macroId)) {
        macroDataRef.current.set(macroId, { lines: [], stations: [] });
      }
      const store = macroDataRef.current.get(macroId);

      const queue = [...pending];
      const workers = Array.from({ length: Math.min(LOAD_CONCURRENCY, queue.length) }, async () => {
        while (queue.length) {
          const entry = queue.shift();
          if (!entry) break;
          try {
            const { lines, stations } = await fetchFirstAvailable([entry.file]);
            store.lines = mergeFeatures(store.lines, lines);
            store.stations = mergeFeatures(store.stations, stations);
            loadedFilesRef.current.add(entry.id);
          } catch (err) {
            console.warn(`skip ${entry.file}:`, err.message);
          }
          done += 1;
          setLoadHint(`正在載入${region.label}鐵路資料 (${done}/${pending.length})…`);
          refreshMacroLayers(map, macroId);
        }
      });

      await Promise.all(workers);
      refreshMacroLayers(map, macroId);
      setLoadHint(null);
    },
    [getFileList, refreshMacroLayers, setMacroVisibility]
  );

  const flyToRegion = useCallback(
    (regionId) => {
      const map = mapRef.current;
      const region = REGIONS.find((r) => r.id === regionId);
      if (!map || !region) return;

      setActiveRegion(regionId);
      map.flyTo({
        center: region.center,
        zoom: region.zoom,
        duration: 1400,
        essential: true,
      });

      const run = () => loadMacroRegion(regionId);
      if (map.isStyleLoaded()) run();
      else map.once('load', run);
    },
    [loadMacroRegion]
  );

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: [121.5, 24.5],
      zoom: 5,
      minZoom: 3,
      maxZoom: 18,
      fadeDuration: 0,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-right');

    map.on('load', () => {
      ensureGlyphs(map);
      setMapReady(true);
      fetch('/data/manifest.json')
        .then((r) => r.json())
        .then((m) => { manifestRef.current = m; })
        .catch(() => {});
    });
    map.on('zoom', () => setZoomLevel(Math.round(map.getZoom() * 10) / 10));

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      loadedFilesRef.current.clear();
      macroDataRef.current.clear();
    };
  }, []);

  const zoomHint =
    zoomLevel < 8.5
      ? '僅高鐵／新幹線'
      : zoomLevel < 11.5
        ? '幹線＋地鐵主線'
        : zoomLevel < 13
          ? '一般車站'
          : '全站詳細';

  return (
    <div className="relative h-full w-full bg-neutral-900">
      <div ref={mapContainer} className="h-full w-full" />

      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-center p-3 sm:p-4">
        <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-neutral-900/55 p-3 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white sm:text-base">
                東亞鐵路地圖
              </h1>
              <p className="text-[10px] text-neutral-400 sm:text-[11px]">
                CARTO 底圖 · 分層渲染 · {zoomHint}
              </p>
            </div>
            <div className="text-right text-[10px] text-neutral-400">
              <span className="font-semibold text-neutral-200">Zoom {zoomLevel}</span>
            </div>
          </div>

          <nav className="flex flex-wrap gap-1.5" role="tablist" aria-label="地區分區">
            {REGIONS.map((region) => {
              const active = activeRegion === region.id;
              return (
                <button
                  key={region.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={!mapReady}
                  onClick={() => flyToRegion(region.id)}
                  className={[
                    'flex-1 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 sm:text-sm',
                    active
                      ? 'bg-white text-neutral-900 shadow-lg ring-2 ring-white/30'
                      : 'bg-white/10 text-neutral-200 hover:bg-white/20 hover:text-white',
                    !mapReady ? 'cursor-wait opacity-50' : 'cursor-pointer',
                  ].join(' ')}
                >
                  {region.label}
                </button>
              );
            })}
          </nav>

          {loadHint && <p className="mt-2 text-xs text-neutral-400">{loadHint}</p>}
        </div>
      </div>
    </div>
  );
}
