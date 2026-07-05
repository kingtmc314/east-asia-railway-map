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
  ['get', 'name'],
];

const LINE_COLOR = [
  'coalesce',
  ['get', 'color'],
  ['get', 'colour'],
  ['get', 'line_color'],
  [
    'match',
    ['get', 'operator'],
    'MTR',
    '#0070BD',
    'Mass Transit Railway',
    '#0070BD',
    '港鐵',
    '#CC0000',
    '台灣高鐵',
    '#FF6600',
    '台湾高铁',
    '#FF6600',
    'Taiwan High Speed Rail',
    '#FF6600',
    '台灣鐵路管理局',
    '#005B94',
    '中国铁路',
    '#E60012',
    '中國鐵路',
    '#E60012',
    'JR東日本',
    '#008000',
    'JR East',
    '#008000',
    'JR西日本',
    '#0078C9',
    '東京メトロ',
    '#009944',
    'Tokyo Metro',
    '#009944',
    '#888888',
  ],
];

const LINE_WIDTH = ['interpolate', ['linear'], ['zoom'], 8, 2, 10, 3, 14, 6, 18, 8];

const STATION_LABEL_LAYOUT = {
  'symbol-placement': 'point',
  'text-field': STATION_NAME,
  'text-font': LABEL_FONTS,
  'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 14, 15],
  'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
  'text-radial-offset': 0.6,
  'text-justify': 'auto',
  'text-max-width': 14,
  'text-allow-overlap': true,
  'text-ignore-placement': true,
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
  'text-optional': false,
  'icon-optional': false,
};

const FILTER_MAJOR = ['==', ['get', 'station_tier'], 'major'];
const FILTER_LOCAL = ['==', ['get', 'station_tier'], 'local'];

const REGIONS = [
  {
    id: 'hongkong',
    label: '香港',
    center: [114.1694, 22.3193],
    zoom: 12,
    files: ['/data/hongkong.topo.json', '/data/hongkong.json'],
  },
  {
    id: 'macau',
    label: '澳門',
    center: [113.5439, 22.1987],
    zoom: 13,
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

const LOAD_CONCURRENCY = 3;
const SNAP_DEG = 0.004;

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

/** 計算轉乘數並標記 major / local — 不修改座標 */
function enrichAndTierStations(lines, stations) {
  const thresholdSq = SNAP_DEG * SNAP_DEG;
  return stations.map((raw) => {
    const station = normalizeStationFeature(raw);
    if (!station) return null;

    const [sx, sy] = station.geometry.coordinates;
    const seen = new Set();
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
        const key = getLineKey(line.properties || {});
        if (!seen.has(key)) {
          seen.add(key);
          transfer_count += 1;
        }
      }
    }

    const p = station.properties || {};
    const isMajor =
      transfer_count >= 2 ||
      p.is_hsr === 1 ||
      p.line_tier === 'hsr' ||
      p.railway === 'station' && (p.usage === 'main' || p.station === 'major');

    return {
      ...station,
      properties: {
        ...p,
        transfer_count,
        station_tier: isMajor ? 'major' : 'local',
      },
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

export default function RailwayMap() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const manifestRef = useRef(null);
  const loadedFilesRef = useRef(new Set());
  const macroDataRef = useRef(new Map());
  const loadingRef = useRef(new Set());
  const activeMacroRef = useRef('');

  const [mapReady, setMapReady] = useState(false);
  const [activeRegion, setActiveRegion] = useState('');
  const [zoomLevel, setZoomLevel] = useState(5);
  const [loadHint, setLoadHint] = useState(null);

  const refreshMacroLayers = useCallback((map, macroId) => {
    const data = macroDataRef.current.get(macroId);
    if (!data) return;

    const lineSource = linesSourceId(macroId);
    const stationSource = stationsSourceId(macroId);
    const enriched = enrichAndTierStations(data.lines, data.stations);

    const lineFC = { type: 'FeatureCollection', features: data.lines };
    const stationFC = { type: 'FeatureCollection', features: enriched };

    if (!map.getSource(lineSource)) {
      map.addSource(lineSource, {
        type: 'geojson',
        data: lineFC,
        tolerance: 0.5,
        buffer: 64,
        lineMetrics: false,
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
        generateId: false,
      });
    } else {
      map.getSource(stationSource).setData(stationFC);
    }

    const lineLayer = `${macroId}-lines`;
    const circleMajor = `${macroId}-stations-major`;
    const circleLocal = `${macroId}-stations-local`;
    const labelMajor = `${macroId}-labels-major`;
    const labelLocal = `${macroId}-labels-local`;

    if (!map.getLayer(lineLayer)) {
      map.addLayer({
        id: lineLayer,
        type: 'line',
        source: lineSource,
        minzoom: 4,
        paint: {
          'line-color': LINE_COLOR,
          'line-width': LINE_WIDTH,
          'line-opacity': 0.95,
          'line-cap': 'round',
          'line-join': 'round',
        },
      });
    }

    if (!map.getLayer(circleMajor)) {
      map.addLayer({
        id: circleMajor,
        type: 'circle',
        source: stationSource,
        minzoom: 10,
        filter: FILTER_MAJOR,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6, 18, 8],
          'circle-color': '#FFFFFF',
          'circle-stroke-color': '#111111',
          'circle-stroke-width': 2,
        },
      });
    }

    if (!map.getLayer(circleLocal)) {
      map.addLayer({
        id: circleLocal,
        type: 'circle',
        source: stationSource,
        minzoom: 11.5,
        filter: FILTER_LOCAL,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11.5, 3, 14, 5, 18, 7],
          'circle-color': '#FFFFFF',
          'circle-stroke-color': '#333333',
          'circle-stroke-width': 1.5,
        },
      });
    }

    if (!map.getLayer(labelMajor)) {
      map.addLayer({
        id: labelMajor,
        type: 'symbol',
        source: stationSource,
        minzoom: 10,
        filter: FILTER_MAJOR,
        layout: STATION_LABEL_LAYOUT,
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': '#0a0a0a',
          'text-halo-width': 2,
        },
      });
    }

    if (!map.getLayer(labelLocal)) {
      map.addLayer({
        id: labelLocal,
        type: 'symbol',
        source: stationSource,
        minzoom: 11.5,
        filter: FILTER_LOCAL,
        layout: STATION_LABEL_LAYOUT,
        paint: {
          'text-color': '#E8E8E8',
          'text-halo-color': '#0a0a0a',
          'text-halo-width': 1.5,
        },
      });
    }
  }, []);

  const setMacroVisibility = useCallback((map, activeId) => {
    for (const region of REGIONS) {
      const visible = region.id === activeId ? 'visible' : 'none';
      const layers = [
        `${region.id}-lines`,
        `${region.id}-stations-major`,
        `${region.id}-stations-local`,
        `${region.id}-labels-major`,
        `${region.id}-labels-local`,
      ];
      for (const id of layers) {
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

      activeMacroRef.current = macroId;
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
                CARTO 底圖 · Z10 樞紐站 · Z11.5+ 全站顯示
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
