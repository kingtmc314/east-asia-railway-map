'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapControlPanel from '@/components/MapControlPanel';
import {
  TOPOLOGY_STYLE,
  SOURCE_LINES,
  SOURCE_STATIONS,
  TOPO_PAINT,
  LAYER_FILTERS,
  GEOJSON_SOURCE_OPTS,
  STATION_LABEL_LAYOUT_HUB,
  STATION_LABEL_LAYOUT_STANDARD,
  STATION_LABEL_LAYOUT_DENSE,
  ALL_LINE_LAYER_IDS,
  ALL_STATION_LAYER_IDS,
  ALL_LABEL_LAYER_IDS,
  TIER_LAYER_VISIBILITY,
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

const MACRO_REGIONS = [
  { id: 'hongkong', label: '香港', center: [114.17, 22.32], zoom: 11 },
  { id: 'macau', label: '澳門', center: [113.57, 22.16], zoom: 13.5 },
  { id: 'taiwan', label: '台灣', center: [120.95, 23.6], zoom: 7.5 },
  { id: 'china', label: '中國大陸', center: [104.5, 35.5], zoom: 4.2 },
  { id: 'japan', label: '日本', center: [138.0, 36.2], zoom: 5.2 },
];

const TIER_LOAD_LABEL = {
  hsr: '高鐵/新幹線',
  intercity: '城際/普鐵',
  metro: '都市地鐵/私鐵',
};

const LOAD_CONCURRENCY = 3;
const REFRESH_DEBOUNCE_MS = 200;
const MOVEEND_DEBOUNCE_MS = 350;

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

function applyTierVisibility(map, tierId) {
  const cfg = TIER_LAYER_VISIBILITY[tierId];
  if (!cfg) return;

  const visibleLines = new Set(cfg.lines);
  const visibleStations = new Set(cfg.stations);
  const visibleLabels = new Set(cfg.labels);

  ALL_LINE_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visibleLines.has(id) ? 'visible' : 'none');
    }
  });
  ALL_STATION_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visibleStations.has(id) ? 'visible' : 'none');
    }
  });
  ALL_LABEL_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visibleLabels.has(id) ? 'visible' : 'none');
    }
  });
  if (map.getLayer('line-highlight')) map.setLayoutProperty('line-highlight', 'visibility', 'visible');
  if (map.getLayer('station-selected')) map.setLayoutProperty('station-selected', 'visibility', 'visible');
}

function setupRailwayLayers(map, tierId, { showLineSidebar, showStationSidebar, closeSidebar }) {
  if (map.getSource(SOURCE_LINES)) return;

  map.addSource(SOURCE_LINES, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    ...GEOJSON_SOURCE_OPTS,
  });
  map.addSource(SOURCE_STATIONS, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    tolerance: GEOJSON_SOURCE_OPTS.tolerance,
    buffer: GEOJSON_SOURCE_OPTS.buffer,
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

  // Z7–11.5：僅核心樞紐大站文字
  map.addLayer({
    id: 'station-labels-hub',
    type: 'symbol',
    source: SOURCE_STATIONS,
    minzoom: 7,
    maxzoom: 11.5,
    filter: LAYER_FILTERS.stationsHubLabels,
    layout: STATION_LABEL_LAYOUT_HUB,
    paint: TOPO_PAINT.stationLabelsHub,
  });
  // Z12+：一般站名（可變錨點 + text-optional）
  map.addLayer({
    id: 'station-labels',
    type: 'symbol',
    source: SOURCE_STATIONS,
    minzoom: 12,
    maxzoom: 14.99,
    filter: LAYER_FILTERS.hasLabel,
    layout: STATION_LABEL_LAYOUT_STANDARD,
    paint: TOPO_PAINT.stationLabels,
  });
  // Z15+：密集區域
  map.addLayer({
    id: 'station-labels-dense',
    type: 'symbol',
    source: SOURCE_STATIONS,
    minzoom: 15,
    filter: LAYER_FILTERS.hasLabel,
    layout: STATION_LABEL_LAYOUT_DENSE,
    paint: TOPO_PAINT.stationLabelsDense,
  });

  applyTierVisibility(map, tierId);

  const interactiveLayers = [
    ...ALL_LINE_LAYER_IDS,
    ...ALL_STATION_LAYER_IDS,
    ...ALL_LABEL_LAYER_IDS,
  ];

  interactiveLayers.forEach((id) => {
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
  });

  ALL_LINE_LAYER_IDS.forEach((id) => {
    map.on('click', id, (e) => {
      if (e.features?.length) showLineSidebar(e.features[0].properties);
    });
  });

  [...ALL_STATION_LAYER_IDS, ...ALL_LABEL_LAYER_IDS].forEach((id) => {
    map.on('click', id, (e) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      showStationSidebar(f.properties, f.geometry.coordinates);
    });
  });

  map.on('click', (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: interactiveLayers });
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
  const activeTierRef = useRef('hsr');
  const loadTokenRef = useRef(0);
  const refreshTimerRef = useRef(null);
  const moveEndTimerRef = useRef(null);
  const pendingRefreshRef = useRef(false);

  const [sidebar, setSidebar] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeMacro, setActiveMacro] = useState('');
  const [activeTier, setActiveTier] = useState('hsr');
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
        duration: 1000,
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
    pendingRefreshRef.current = false;
  }, []);

  const scheduleRefresh = useCallback(
    (immediate = false) => {
      pendingRefreshRef.current = true;
      clearTimeout(refreshTimerRef.current);
      if (immediate) {
        refreshMapData();
        return;
      }
      refreshTimerRef.current = setTimeout(() => {
        if (pendingRefreshRef.current) refreshMapData();
      }, REFRESH_DEBOUNCE_MS);
    },
    [refreshMapData]
  );

  const ensureLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || layersReadyRef.current) return;
    setupRailwayLayers(map, activeTierRef.current, {
      showLineSidebar,
      showStationSidebar,
      closeSidebar,
    });
    layersReadyRef.current = true;
  }, [closeSidebar, showLineSidebar, showStationSidebar]);

  const applyTier = useCallback((tierId, { fly = true } = {}) => {
    const map = mapRef.current;
    if (!map) return;

    activeTierRef.current = tierId;
    setActiveTier(tierId);

    if (layersReadyRef.current) {
      applyTierVisibility(map, tierId);
    }

    if (!fly) return;

    const cfg = TIER_LAYER_VISIBILITY[tierId];
    const macro = MACRO_REGIONS.find((m) => m.id === activeMacroRef.current);
    const center = macro ? macro.center : map.getCenter().toArray();
    const targetZoom = cfg?.targetZoom ?? map.getZoom();

    map.flyTo({
      center,
      zoom: macro ? Math.max(targetZoom, macro.zoom * 0.85) : targetZoom,
      duration: 1200,
      essential: true,
    });
  }, []);

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
        scheduleRefresh();
        return true;
      } catch (err) {
        console.warn(`無法載入 ${region.id}:`, err.message);
        return false;
      } finally {
        loadingRegionsRef.current.delete(region.id);
      }
    },
    [ensureLayers, scheduleRefresh]
  );

  const loadMacroRegionData = useCallback(
    async (macroId, { visibleOnly = false, tierId = activeTierRef.current } = {}) => {
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
      const tierLabel = TIER_LOAD_LABEL[tierId] || '鐵路';

      setRegionLoading({
        label: macro.label,
        message: `正在載入${macro.label}${tierLabel}…`,
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
                  ? `正在載入${macro.label}${tierLabel} (${done}/${total})…`
                  : `正在載入${macro.label}${tierLabel}…`,
              done,
              total,
            });
          }
        }
      });

      await Promise.all(workers);
      scheduleRefresh(true);

      if (loadTokenRef.current === token) {
        setRegionLoading(null);
      }
    },
    [loadRegionFile, scheduleRefresh]
  );

  const selectMacroRegion = useCallback(
    (macroId) => {
      const map = mapRef.current;
      const macro = MACRO_REGIONS.find((m) => m.id === macroId);
      if (!map || !macro) return;

      setActiveMacro(macroId);
      activeMacroRef.current = macroId;
      closeSidebar();

      const tierCfg = TIER_LAYER_VISIBILITY[activeTierRef.current];
      map.flyTo({
        center: macro.center,
        zoom: Math.max(tierCfg?.targetZoom ?? macro.zoom, macro.zoom),
        duration: 1400,
        essential: true,
      });

      loadMacroRegionData(macroId, { tierId: activeTierRef.current });
    },
    [closeSidebar, loadMacroRegionData]
  );

  const handleTierChange = useCallback(
    (tierId) => {
      applyTier(tierId, { fly: true });
      if (activeMacroRef.current) {
        loadMacroRegionData(activeMacroRef.current, { tierId });
      }
    },
    [applyTier, loadMacroRegionData]
  );

  const loadVisibleForActiveMacro = useCallback(() => {
    const macroId = activeMacroRef.current;
    if (!macroId || !['china', 'japan'].includes(macroId)) return;
    loadMacroRegionData(macroId, { visibleOnly: true, tierId: activeTierRef.current });
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
      fadeDuration: 0,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-right');

    let zoomRaf = null;
    map.on('zoom', () => {
      if (zoomRaf) return;
      zoomRaf = requestAnimationFrame(() => {
        setZoomLevel(Math.round(map.getZoom() * 10) / 10);
        zoomRaf = null;
      });
    });

    mapRef.current = map;

    map.on('load', () => {
      setMapReady(true);
      fetchManifest()
        .then((m) => { manifestRef.current = m; })
        .catch((err) => console.warn('manifest 預載失敗:', err.message));
    });

    map.on('moveend', () => {
      clearTimeout(moveEndTimerRef.current);
      moveEndTimerRef.current = setTimeout(loadVisibleForActiveMacro, MOVEEND_DEBOUNCE_MS);
    });

    return () => {
      loadTokenRef.current += 1;
      clearTimeout(refreshTimerRef.current);
      clearTimeout(moveEndTimerRef.current);
      if (zoomRaf) cancelAnimationFrame(zoomRaf);
      map.remove();
      mapRef.current = null;
      layersReadyRef.current = false;
    };
  }, [loadVisibleForActiveMacro]);

  const zoomHint =
    activeTier === 'hsr'
      ? '高鐵/新幹線幹線 · 樞紐站名'
      : activeTier === 'intercity'
        ? '城際普鐵 + 轉乘站'
        : zoomLevel < 12
          ? '地鐵/私鐵路線 · 站名 Z12+ 顯示'
          : zoomLevel < 15
            ? '全部車站標籤（可變錨點）'
            : '密集區域全站名';

  const tierLabel = (tier) => {
    if (tier === 'hsr') return '高速鐵路';
    if (tier === 'metro') return '地鐵/私鐵';
    if (tier === 'tram') return '輕軌';
    return '城際鐵路';
  };

  return (
    <div className="relative h-full w-full bg-[#F5F3EF]">
      <div ref={mapContainer} className="h-full w-full" />

      <MapControlPanel
        mapReady={mapReady}
        activeTier={activeTier}
        onTierChange={handleTierChange}
        regions={MACRO_REGIONS}
        activeRegion={activeMacro}
        onRegionSelect={selectMacroRegion}
        regionLoading={regionLoading}
        zoomLevel={zoomLevel}
        zoomHint={zoomHint}
        loadedCount={loadedCount}
      />

      {sidebar && (
        <aside className="absolute bottom-0 left-0 top-0 z-20 flex w-80 flex-col border-r border-neutral-200/80 bg-white/95 shadow-xl backdrop-blur-md">
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
