'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  TOPOLOGY_STYLE,
  SOURCE_LINES,
  SOURCE_STATIONS,
  TOPO_PAINT,
  LAYER_FILTERS,
  STATION_LABEL_LAYOUT_STANDARD,
  STATION_LABEL_LAYOUT_DENSE,
} from '@/lib/map-style';
import {
  applyDataToMap,
  bboxIntersects,
  decodeTopology,
  enrichStations,
  getDisplayName,
  getEnglishName,
  getMapBbox,
  mergeCollections,
} from '@/lib/data-loader';

/** 五大宏觀地區 — 點擊後 flyTo 並按需載入 */
const MACRO_REGIONS = [
  {
    id: 'hongkong',
    label: '香港',
    short: 'HK',
    center: [114.17, 22.32],
    zoom: 11,
    accent: 'from-red-500 to-rose-600',
    ring: 'ring-red-400',
  },
  {
    id: 'macau',
    label: '澳門',
    short: 'MO',
    center: [113.57, 22.16],
    zoom: 13.5,
    accent: 'from-emerald-500 to-teal-600',
    ring: 'ring-emerald-400',
  },
  {
    id: 'taiwan',
    label: '台灣',
    short: 'TW',
    center: [120.95, 23.6],
    zoom: 7.5,
    accent: 'from-blue-500 to-indigo-600',
    ring: 'ring-blue-400',
  },
  {
    id: 'china',
    label: '中國',
    short: 'CN',
    center: [104.5, 35.5],
    zoom: 4.2,
    accent: 'from-amber-500 to-orange-600',
    ring: 'ring-amber-400',
  },
  {
    id: 'japan',
    label: '日本',
    short: 'JP',
    center: [138.0, 36.2],
    zoom: 5.2,
    accent: 'from-fuchsia-500 to-pink-600',
    ring: 'ring-fuchsia-400',
  },
];

const LOAD_CONCURRENCY = 4;

function getSubRegions(macroId, manifest) {
  if (!manifest?.regions) return [];
  switch (macroId) {
    case 'hongkong':
      return manifest.regions.filter((r) => r.id === 'hongkong');
    case 'macau':
      return manifest.regions.filter((r) => r.id === 'macau');
    case 'taiwan':
      return manifest.regions.filter((r) => r.id === 'taiwan');
    case 'china':
      return manifest.regions.filter((r) => r.id.startsWith('china-'));
    case 'japan':
      return manifest.regions.filter((r) => r.id.startsWith('japan-'));
    default:
      return [];
  }
}

function setupRailwayLayers(map, { showLineSidebar, showStationSidebar, closeSidebar }) {
  if (map.getSource(SOURCE_LINES)) return;

  map.addSource(SOURCE_LINES, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    tolerance: 0.5,
  });
  map.addSource(SOURCE_STATIONS, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: 'lines-hsr',
    type: 'line',
    source: SOURCE_LINES,
    minzoom: 4,
    maxzoom: 6.99,
    filter: LAYER_FILTERS.hsr,
    paint: TOPO_PAINT.hsr,
  });
  map.addLayer({
    id: 'lines-hsr-mid',
    type: 'line',
    source: SOURCE_LINES,
    minzoom: 7,
    maxzoom: 10.99,
    filter: LAYER_FILTERS.hsr,
    paint: TOPO_PAINT.hsr,
  });
  map.addLayer({
    id: 'lines-intercity',
    type: 'line',
    source: SOURCE_LINES,
    minzoom: 7,
    maxzoom: 10.99,
    filter: LAYER_FILTERS.intercity,
    paint: TOPO_PAINT.intercity,
  });
  map.addLayer({
    id: 'lines-hsr-local',
    type: 'line',
    source: SOURCE_LINES,
    minzoom: 11,
    filter: LAYER_FILTERS.hsr,
    paint: TOPO_PAINT.hsr,
  });
  map.addLayer({
    id: 'lines-intercity-local',
    type: 'line',
    source: SOURCE_LINES,
    minzoom: 11,
    filter: LAYER_FILTERS.intercity,
    paint: TOPO_PAINT.intercity,
  });
  map.addLayer({
    id: 'lines-metro',
    type: 'line',
    source: SOURCE_LINES,
    minzoom: 11,
    filter: LAYER_FILTERS.metro,
    paint: TOPO_PAINT.metro,
  });
  map.addLayer({
    id: 'lines-tram',
    type: 'line',
    source: SOURCE_LINES,
    minzoom: 11,
    filter: LAYER_FILTERS.tram,
    paint: TOPO_PAINT.tram,
  });
  map.addLayer({
    id: 'line-highlight',
    type: 'line',
    source: SOURCE_LINES,
    filter: ['==', ['get', 'osm_id'], -1],
    paint: TOPO_PAINT.highlight,
  });
  map.addLayer({
    id: 'stations-major',
    type: 'circle',
    source: SOURCE_STATIONS,
    minzoom: 7,
    maxzoom: 10.99,
    filter: LAYER_FILTERS.stationsMajor,
    paint: TOPO_PAINT.stationsMajor,
  });
  map.addLayer({
    id: 'stations-all',
    type: 'circle',
    source: SOURCE_STATIONS,
    minzoom: 11,
    maxzoom: 12.99,
    paint: TOPO_PAINT.stationsAll,
  });
  map.addLayer({
    id: 'stations-detail',
    type: 'circle',
    source: SOURCE_STATIONS,
    minzoom: 13,
    paint: TOPO_PAINT.stationsDetail,
  });
  map.addLayer({
    id: 'station-selected',
    type: 'circle',
    source: SOURCE_STATIONS,
    filter: ['==', ['get', 'osm_id'], -1],
    paint: TOPO_PAINT.stationSelected,
  });
  map.addLayer({
    id: 'station-labels',
    type: 'symbol',
    source: SOURCE_STATIONS,
    minzoom: 11,
    maxzoom: 15.99,
    filter: LAYER_FILTERS.hasLabel,
    layout: STATION_LABEL_LAYOUT_STANDARD,
    paint: TOPO_PAINT.stationLabels,
  });
  map.addLayer({
    id: 'station-labels-dense',
    type: 'symbol',
    source: SOURCE_STATIONS,
    minzoom: 16,
    filter: LAYER_FILTERS.hasLabel,
    layout: STATION_LABEL_LAYOUT_DENSE,
    paint: TOPO_PAINT.stationLabelsDense,
  });

  const lineLayers = [
    'lines-hsr',
    'lines-hsr-mid',
    'lines-hsr-local',
    'lines-intercity',
    'lines-intercity-local',
    'lines-metro',
    'lines-tram',
  ];
  const stationLayers = ['stations-major', 'stations-all', 'stations-detail'];
  const labelLayers = ['station-labels', 'station-labels-dense'];

  lineLayers.forEach((id) => {
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    map.on('click', id, (e) => {
      if (e.features?.length) showLineSidebar(e.features[0].properties);
    });
  });

  [...stationLayers, ...labelLayers].forEach((id) => {
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    map.on('click', id, (e) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      showStationSidebar(f.properties, f.geometry.coordinates);
    });
  });

  map.on('click', (e) => {
    const hits = map.queryRenderedFeatures(e.point, {
      layers: [...lineLayers, ...stationLayers, ...labelLayers],
    });
    if (!hits.length) closeSidebar();
  });
}

async function fetchManifest() {
  const res = await fetch('/data/manifest.json');
  if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
  return res.json();
}

export default function RailwayMap() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const stationMetaRef = useRef(new Map());
  const manifestRef = useRef(null);
  const loadedRegionsRef = useRef(new Set());
  const allLinesRef = useRef([]);
  const allStationsRef = useRef([]);
  const loadingRegionsRef = useRef(new Set());
  const layersReadyRef = useRef(false);
  const activeMacroRef = useRef(null);
  const loadTokenRef = useRef(0);

  const [sidebar, setSidebar] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeMacro, setActiveMacro] = useState(null);
  const [regionLoading, setRegionLoading] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(4);
  const [loadedCount, setLoadedCount] = useState(0);

  const clearHighlight = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getLayer('line-highlight')) return;
    map.setFilter('line-highlight', ['==', ['get', 'osm_id'], -1]);
    map.setFilter('station-selected', ['==', ['get', 'osm_id'], -1]);
  }, []);

  const showLineSidebar = useCallback(
    (props) => {
      clearHighlight();
      const map = mapRef.current;
      if (map) {
        map.setFilter('line-highlight', ['==', ['get', 'osm_id'], Number(props.osm_id)]);
      }
      setSidebar({
        type: 'line',
        name: getDisplayName(props),
        nameEn: getEnglishName(props),
        operator: props.operator || '—',
        network: props.network || '—',
        railway: props.railway,
        lineColor: props.line_color || '#64748B',
        lineTier: props.line_tier,
        region: props.region,
      });
    },
    [clearHighlight]
  );

  const showStationSidebar = useCallback(
    (props, coordinates) => {
      const map = mapRef.current;
      if (!map) return;

      clearHighlight();
      const meta = stationMetaRef.current.get(Number(props.osm_id)) || {
        connectedLines: [],
        connected_line_ids: [],
        transfer_count: 0,
      };

      map.flyTo({
        center: coordinates,
        zoom: Math.max(map.getZoom(), 13),
        duration: 1200,
        essential: true,
      });

      if (meta.connected_line_ids.length > 0) {
        map.setFilter('line-highlight', [
          'in',
          ['get', 'osm_id'],
          ['literal', meta.connected_line_ids],
        ]);
      }
      map.setFilter('station-selected', ['==', ['get', 'osm_id'], Number(props.osm_id)]);

      setSidebar({
        type: 'station',
        name: getDisplayName(props),
        nameEn: getEnglishName(props),
        operator: props.operator || '—',
        network: props.network || '—',
        transferCount: meta.transfer_count,
        connectedLines: meta.connectedLines,
        region: props.region,
      });
    },
    [clearHighlight]
  );

  const closeSidebar = useCallback(() => {
    clearHighlight();
    setSidebar(null);
  }, [clearHighlight]);

  const refreshMapData = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getSource(SOURCE_LINES)) return;
    const enriched = enrichStations(allLinesRef.current, allStationsRef.current);
    applyDataToMap(map, allLinesRef.current, enriched, stationMetaRef);
  }, []);

  const ensureLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || layersReadyRef.current) return;
    setupRailwayLayers(map, { showLineSidebar, showStationSidebar, closeSidebar });
    layersReadyRef.current = true;
  }, [closeSidebar, showLineSidebar, showStationSidebar]);

  const loadRegionFile = useCallback(
    async (region) => {
      if (loadedRegionsRef.current.has(region.id)) return true;
      if (loadingRegionsRef.current.has(region.id)) return false;

      loadingRegionsRef.current.add(region.id);

      try {
        const res = await fetch(region.file);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const topology = await res.json();
        const { lines, stations } = decodeTopology(topology);

        ensureLayers();

        allLinesRef.current = mergeCollections(
          { type: 'FeatureCollection', features: allLinesRef.current },
          lines
        ).features;
        allStationsRef.current = mergeCollections(
          { type: 'FeatureCollection', features: allStationsRef.current },
          stations
        ).features;

        loadedRegionsRef.current.add(region.id);
        setLoadedCount(loadedRegionsRef.current.size);
        refreshMapData();
        return true;
      } catch (err) {
        console.warn(`無法載入 ${region.id}:`, err.message);
        return false;
      } finally {
        loadingRegionsRef.current.delete(region.id);
      }
    },
    [ensureLayers, refreshMapData]
  );

  const loadMacroRegionData = useCallback(
    async (macroId, { visibleOnly = false } = {}) => {
      const map = mapRef.current;
      if (!map) return;

      if (!manifestRef.current) {
        try {
          manifestRef.current = await fetchManifest();
        } catch (err) {
          console.error('manifest 載入失敗:', err);
          return;
        }
      }

      const macro = MACRO_REGIONS.find((m) => m.id === macroId);
      if (!macro) return;

      let subRegions = getSubRegions(macroId, manifestRef.current);
      if (visibleOnly && subRegions.length > 1) {
        const viewBbox = getMapBbox(map);
        subRegions = subRegions.filter((r) => bboxIntersects(viewBbox, r.bbox));
      }

      const pending = subRegions.filter(
        (r) => !loadedRegionsRef.current.has(r.id) && !loadingRegionsRef.current.has(r.id)
      );
      if (pending.length === 0) return;

      const token = ++loadTokenRef.current;
      let done = 0;
      const total = pending.length;

      setRegionLoading({
        label: macro.label,
        message: `正在載入${macro.label}鐵路資料...`,
        done: 0,
        total,
      });

      const queue = [...pending];
      const workers = Array.from({ length: Math.min(LOAD_CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) {
          if (loadTokenRef.current !== token) return;
          const region = queue.shift();
          if (!region) break;
          await loadRegionFile(region);
          done += 1;
          if (loadTokenRef.current === token) {
            setRegionLoading({
              label: macro.label,
              message:
                total > 1
                  ? `正在載入${macro.label}鐵路資料 (${done}/${total})...`
                  : `正在載入${macro.label}鐵路資料...`,
              done,
              total,
            });
          }
        }
      });

      await Promise.all(workers);

      if (loadTokenRef.current === token) {
        setRegionLoading(null);
      }
    },
    [loadRegionFile]
  );

  const selectMacroRegion = useCallback(
    (macroId) => {
      const map = mapRef.current;
      const macro = MACRO_REGIONS.find((m) => m.id === macroId);
      if (!map || !macro) return;

      setActiveMacro(macroId);
      activeMacroRef.current = macroId;
      closeSidebar();

      map.flyTo({
        center: macro.center,
        zoom: macro.zoom,
        duration: 1400,
        essential: true,
      });

      loadMacroRegionData(macroId);
    },
    [closeSidebar, loadMacroRegionData]
  );

  const loadVisibleForActiveMacro = useCallback(() => {
    const macroId = activeMacroRef.current;
    if (!macroId || !['china', 'japan'].includes(macroId)) return;
    loadMacroRegionData(macroId, { visibleOnly: true });
  }, [loadMacroRegionData]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: TOPOLOGY_STYLE,
      center: [125, 30],
      zoom: 4,
      minZoom: 3,
      maxZoom: 18,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-right');

    map.on('zoom', () => setZoomLevel(Math.round(map.getZoom() * 10) / 10));
    mapRef.current = map;

    map.on('load', () => {
      setMapReady(true);
      fetchManifest()
        .then((m) => { manifestRef.current = m; })
        .catch((err) => console.warn('manifest 預載失敗（將於選擇地區時重試）:', err.message));
    });

    map.on('moveend', () => {
      loadVisibleForActiveMacro();
    });

    return () => {
      loadTokenRef.current += 1;
      map.remove();
      mapRef.current = null;
      layersReadyRef.current = false;
    };
  }, [loadVisibleForActiveMacro]);

  const zoomHint =
    zoomLevel < 7
      ? '大區域：高鐵/新幹線幹線'
      : zoomLevel < 11
        ? '中區域：城際鐵路 + 轉乘站'
        : zoomLevel < 13
          ? '小區域：地鐵/私鐵/輕軌'
          : zoomLevel < 16
            ? '詳細：全部車站標籤（可變錨點）'
            : '最大：100% 顯示所有站名';

  const tierLabel = (tier) => {
    if (tier === 'hsr') return '高速鐵路';
    if (tier === 'metro') return '地鐵/私鐵';
    if (tier === 'tram') return '輕軌';
    return '城際鐵路';
  };

  return (
    <div className="relative h-full w-full bg-[#F5F3EF]">
      <div ref={mapContainer} className="h-full w-full" />

      {/* 頂部標題 + 地區導覽 Tabs */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto rounded-xl border border-neutral-200/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm">
            <h1 className="text-base font-bold tracking-tight text-neutral-900">
              東亞鐵路拓撲圖
            </h1>
            <p className="text-[11px] text-neutral-500">
              選擇地區以載入鐵路資料 · 按需載入
            </p>
          </div>

          <div className="pointer-events-auto rounded-xl border border-neutral-200/80 bg-white/95 px-3 py-2 text-right shadow-sm backdrop-blur-sm">
            <div className="text-[11px] font-semibold text-neutral-700">Zoom {zoomLevel}</div>
            <div className="text-[10px] text-neutral-400">{zoomHint}</div>
            {loadedCount > 0 && (
              <div className="text-[10px] text-neutral-400">{loadedCount} 區域已快取</div>
            )}
          </div>
        </div>

        <nav
          className="pointer-events-auto mx-auto flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-neutral-200/80 bg-white/95 p-1.5 shadow-md backdrop-blur-sm"
          aria-label="地區快速切換"
        >
          {MACRO_REGIONS.map((macro) => {
            const isActive = activeMacro === macro.id;
            return (
              <button
                key={macro.id}
                type="button"
                onClick={() => selectMacroRegion(macro.id)}
                disabled={!mapReady}
                className={[
                  'group relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200',
                  isActive
                    ? `bg-gradient-to-r ${macro.accent} text-white shadow-md ring-2 ${macro.ring} ring-offset-1`
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                  !mapReady ? 'cursor-wait opacity-60' : 'cursor-pointer',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold',
                    isActive ? 'bg-white/25 text-white' : 'bg-neutral-100 text-neutral-500 group-hover:bg-neutral-200',
                  ].join(' ')}
                >
                  {macro.short}
                </span>
                {macro.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 局部 Loading — 右下角，不遮擋地圖 */}
      {regionLoading && (
        <div className="pointer-events-none absolute bottom-6 right-4 z-20">
          <div className="flex items-center gap-3 rounded-full border border-neutral-200/80 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-sm">
            <svg
              className="h-4 w-4 animate-spin text-neutral-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-sm font-medium text-neutral-700">{regionLoading.message}</span>
            {regionLoading.total > 1 && (
              <span className="text-xs text-neutral-400">
                {regionLoading.done}/{regionLoading.total}
              </span>
            )}
          </div>
        </div>
      )}

      {sidebar && (
        <aside className="absolute bottom-0 left-0 top-0 z-20 flex w-80 flex-col border-r border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <span className="text-sm font-semibold text-neutral-800">
              {sidebar.type === 'line' ? '路線' : '車站'}
            </span>
            <button
              type="button"
              onClick={closeSidebar}
              className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-100"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {sidebar.type === 'line' && sidebar.lineColor && (
              <div
                className="mb-3 h-1.5 w-full rounded-full"
                style={{ backgroundColor: sidebar.lineColor }}
              />
            )}
            <h2 className="text-xl font-bold text-neutral-900">{sidebar.name}</h2>
            {sidebar.nameEn && sidebar.nameEn !== sidebar.name && (
              <p className="mt-1 text-sm text-neutral-500">{sidebar.nameEn}</p>
            )}

            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">地區</dt>
                <dd className="text-neutral-700">{sidebar.region}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">營運商</dt>
                <dd className="text-neutral-700">{sidebar.operator}</dd>
              </div>
              {sidebar.network && sidebar.network !== '—' && (
                <div>
                  <dt className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">路網</dt>
                  <dd className="text-neutral-700">{sidebar.network}</dd>
                </div>
              )}
              {sidebar.type === 'line' && (
                <div>
                  <dt className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">類型</dt>
                  <dd className="text-neutral-700">{tierLabel(sidebar.lineTier)}</dd>
                </div>
              )}
            </dl>

            {sidebar.type === 'station' && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-semibold text-neutral-800">
                  交會路線 ({sidebar.transferCount})
                </h3>
                {sidebar.connectedLines.length === 0 ? (
                  <p className="text-sm text-neutral-400">未偵測到交會路線</p>
                ) : (
                  <ul className="space-y-2">
                    {sidebar.connectedLines.map((line) => (
                      <li
                        key={line.osm_id}
                        className="rounded-lg border border-neutral-200 px-3 py-2"
                        style={{ borderLeftWidth: 4, borderLeftColor: line.line_color || '#FFB800' }}
                      >
                        <div className="font-medium text-neutral-800">{line.name}</div>
                        {line.operator && (
                          <div className="mt-0.5 text-xs text-neutral-500">{line.operator}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
