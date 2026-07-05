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
    '香港鐵路有限公司',
    '#CC0000',
    '台灣高鐵',
    '#FF6600',
    '台湾高铁',
    '#FF6600',
    'Taiwan High Speed Rail',
    '#FF6600',
    '台灣鐵路管理局',
    '#005B94',
    '台湾铁路管理局',
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
    'JR West',
    '#0078C9',
    '東京メトロ',
    '#009944',
    'Tokyo Metro',
    '#009944',
    '#888888',
  ],
];

const LINE_WIDTH = ['interpolate', ['linear'], ['zoom'], 8, 2, 10, 3, 14, 6, 18, 8];

const REGIONS = [
  {
    id: 'hongkong',
    label: '香港',
    center: [114.1694, 22.3193],
    zoom: 12,
    file: '/data/hongkong.json',
    fallbackFile: '/data/hongkong.topo.json',
  },
  {
    id: 'macau',
    label: '澳門',
    center: [113.5439, 22.1987],
    zoom: 13,
    file: '/data/macau.json',
    fallbackFile: '/data/macau.topo.json',
  },
  {
    id: 'taiwan',
    label: '台灣',
    center: [121.0, 23.7],
    zoom: 8,
    file: '/data/taiwan.json',
    fallbackFile: '/data/taiwan.topo.json',
  },
  {
    id: 'china',
    label: '中國大陸',
    center: [116.4074, 39.9042],
    zoom: 5,
    file: '/data/china.json',
  },
  {
    id: 'japan',
    label: '日本',
    center: [138.2529, 36.2048],
    zoom: 6,
    file: '/data/japan.json',
  },
];

function sourceId(regionId, kind) {
  return `railway-${regionId}-${kind}`;
}

function layerId(regionId, kind) {
  return `railway-${regionId}-${kind}-layer`;
}

function decodeGeoJson(raw) {
  if (raw?.type === 'Topology' && raw.objects) {
    const lines = raw.objects.lines
      ? feature(raw, raw.objects.lines)
      : { type: 'FeatureCollection', features: [] };
    const stations = raw.objects.stations
      ? feature(raw, raw.objects.stations)
      : { type: 'FeatureCollection', features: [] };
    return {
      lines: lines.features || [],
      stations: stations.features || [],
    };
  }
  const { lines, stations } = splitFeatures(raw);
  return { lines, stations };
}

async function fetchRegionGeo(region) {
  for (const url of [region.file, region.fallbackFile].filter(Boolean)) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const raw = await res.json();
      return decodeGeoJson(raw);
    } catch {
      /* try next */
    }
  }
  throw new Error(`no data at ${region.file}`);
}

function splitFeatures(geojson) {
  const lines = [];
  const stations = [];
  for (const f of geojson.features || []) {
    const t = f.geometry?.type;
    if (t === 'LineString' || t === 'MultiLineString') lines.push(f);
    else if (t === 'Point') stations.push(f);
  }
  return { lines, stations };
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
  const loadedRef = useRef(new Set());
  const loadingRef = useRef(new Set());

  const [mapReady, setMapReady] = useState(false);
  const [activeRegion, setActiveRegion] = useState('');
  const [zoomLevel, setZoomLevel] = useState(5);
  const [loadHint, setLoadHint] = useState(null);

  const addRegionLayers = useCallback((map, regionId, lines, stations) => {
    const lineSource = sourceId(regionId, 'lines');
    const stationSource = sourceId(regionId, 'stations');
    const lineLayer = layerId(regionId, 'lines');
    const circleLayer = layerId(regionId, 'circles');
    const labelLayer = layerId(regionId, 'labels');

    const lineData = { type: 'FeatureCollection', features: lines };
    const stationData = { type: 'FeatureCollection', features: stations };

    if (!map.getSource(lineSource)) {
      map.addSource(lineSource, {
        type: 'geojson',
        data: lineData,
        tolerance: 0.5,
        buffer: 64,
      });
    } else {
      map.getSource(lineSource).setData(lineData);
    }

    if (!map.getSource(stationSource)) {
      map.addSource(stationSource, {
        type: 'geojson',
        data: stationData,
        tolerance: 0.5,
        buffer: 64,
      });
    } else {
      map.getSource(stationSource).setData(stationData);
    }

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

    if (!map.getLayer(circleLayer)) {
      map.addLayer({
        id: circleLayer,
        type: 'circle',
        source: stationSource,
        minzoom: 11,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 14, 5, 18, 7],
          'circle-color': '#FFFFFF',
          'circle-stroke-color': '#111111',
          'circle-stroke-width': 1.5,
        },
      });
    }

    if (!map.getLayer(labelLayer)) {
      map.addLayer({
        id: labelLayer,
        type: 'symbol',
        source: stationSource,
        minzoom: 11,
        layout: {
          'text-field': STATION_NAME,
          'text-font': LABEL_FONTS,
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 14, 12, 18, 14],
          'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
          'text-radial-offset': 0.75,
          'text-justify': 'auto',
          'text-max-width': 12,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'text-color': '#F5F5F5',
          'text-halo-color': '#1a1a1a',
          'text-halo-width': 2,
        },
      });
    }
  }, []);

  const loadRegionData = useCallback(
    async (regionId) => {
      const map = mapRef.current;
      const region = REGIONS.find((r) => r.id === regionId);
      if (!map || !region) return;

      if (loadedRef.current.has(regionId) || loadingRef.current.has(regionId)) return;

      loadingRef.current.add(regionId);
      setLoadHint(`正在載入${region.label}鐵路資料…`);

      try {
        const { lines, stations } = await fetchRegionGeo(region);

        ensureGlyphs(map);
        addRegionLayers(map, regionId, lines, stations);
        loadedRef.current.add(regionId);
      } catch (err) {
        console.warn(`無法載入 ${region.label}:`, err.message);
        setLoadHint(`${region.label} 資料尚未就緒`);
        setTimeout(() => setLoadHint(null), 4000);
        return;
      } finally {
        loadingRef.current.delete(regionId);
        if (!loadingRef.current.size) setLoadHint(null);
      }
    },
    [addRegionLayers]
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

      if (map.isStyleLoaded()) {
        loadRegionData(regionId);
      } else {
        map.once('load', () => loadRegionData(regionId));
      }
    },
    [loadRegionData]
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
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-right');

    map.on('load', () => {
      ensureGlyphs(map);
      setMapReady(true);
    });
    map.on('zoom', () => setZoomLevel(Math.round(map.getZoom() * 10) / 10));

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current.clear();
      loadingRef.current.clear();
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
                CARTO 底圖 · 按需載入彩色鐵路 · Z11+ 繁中站名
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

          {loadHint && (
            <p className="mt-2 text-xs text-neutral-400">{loadHint}</p>
          )}
        </div>
      </div>
    </div>
  );
}
