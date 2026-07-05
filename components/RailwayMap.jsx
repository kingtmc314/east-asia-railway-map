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

export default function RailwayMap() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const stationMetaRef = useRef(new Map());
  const manifestRef = useRef(null);
  const loadedRegionsRef = useRef(new Set());
  const allLinesRef = useRef([]);
  const allStationsRef = useRef([]);
  const loadingRegionsRef = useRef(new Set());

  const [sidebar, setSidebar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadStatus, setLoadStatus] = useState('初始化拓撲地圖...');
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

  const loadRegion = useCallback(
    async (region) => {
      if (loadedRegionsRef.current.has(region.id)) return;
      if (loadingRegionsRef.current.has(region.id)) return;

      loadingRegionsRef.current.add(region.id);
      setLoadStatus(`載入 ${region.label}...`);

      try {
        const res = await fetch(region.file);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const topology = await res.json();
        const { lines, stations } = decodeTopology(topology);

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
      } catch (err) {
        console.warn(`無法載入 ${region.id}:`, err.message);
      } finally {
        loadingRegionsRef.current.delete(region.id);
      }
    },
    [refreshMapData]
  );

  const loadVisibleRegions = useCallback(async () => {
    const map = mapRef.current;
    const manifest = manifestRef.current;
    if (!map || !manifest) return;

    const viewBbox = getMapBbox(map);
    const zoom = map.getZoom();

    const toLoad = manifest.regions.filter((r) => {
      if (loadedRegionsRef.current.has(r.id)) return false;
      if (!bboxIntersects(viewBbox, r.bbox)) return false;
      // 大區域縮放時，中國僅預載東部 HSR 走廊省份
      if (zoom <= 6 && r.id.startsWith('china-')) {
        const hsrCorridor = new Set([
          'china-beijing', 'china-shanghai', 'china-guangdong',
          'china-jiangsu', 'china-zhejiang', 'china-hebei-north', 'china-hebei-south',
        ]);
        if (!hsrCorridor.has(r.id)) return false;
      }
      return true;
    });

    await Promise.all(toLoad.map((r) => loadRegion(r)));
  }, [loadRegion]);

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

    const lineLayers = [
      'lines-hsr',
      'lines-intercity',
      'lines-metro',
      'lines-tram',
    ];
    const stationLayers = [
      'stations-major',
      'stations-all',
      'stations-detail',
    ];
    const labelLayers = ['station-labels', 'station-labels-dense'];

    map.on('load', async () => {
      try {
        map.addSource(SOURCE_LINES, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          tolerance: 0.5,
        });
        map.addSource(SOURCE_STATIONS, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        // ── Z4-6 高鐵/新幹線 ──
        map.addLayer({
          id: 'lines-hsr',
          type: 'line',
          source: SOURCE_LINES,
          minzoom: 4,
          maxzoom: 6.99,
          filter: LAYER_FILTERS.hsr,
          paint: TOPO_PAINT.hsr,
        });

        // ── Z7-10 城際普鐵（HSR 持續顯示） ──
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

        // ── Z11+ 全部路線 ──
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

        // ── 車站：Z7-10 轉乘站 ──
        map.addLayer({
          id: 'stations-major',
          type: 'circle',
          source: SOURCE_STATIONS,
          minzoom: 7,
          maxzoom: 10.99,
          filter: LAYER_FILTERS.stationsMajor,
          paint: TOPO_PAINT.stationsMajor,
        });

        // ── 車站：Z11-12 ──
        map.addLayer({
          id: 'stations-all',
          type: 'circle',
          source: SOURCE_STATIONS,
          minzoom: 11,
          maxzoom: 12.99,
          paint: TOPO_PAINT.stationsAll,
        });

        // ── 車站：Z13+ 日本地鐵圖風格 ──
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

        // ── 車站文字標籤 Z11+（可變錨點，繁中優先） ──
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

        // ── Z16+ 密集區域：強制顯示所有站名（地鐵/私鐵） ──
        map.addLayer({
          id: 'station-labels-dense',
          type: 'symbol',
          source: SOURCE_STATIONS,
          minzoom: 16,
          filter: LAYER_FILTERS.hasLabel,
          layout: STATION_LABEL_LAYOUT_DENSE,
          paint: TOPO_PAINT.stationLabelsDense,
        });

        [...lineLayers, 'lines-hsr-mid', 'lines-hsr-local', 'lines-intercity-local'].forEach((id) => {
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
            layers: [
              ...lineLayers,
              'lines-hsr-mid',
              'lines-hsr-local',
              'lines-intercity-local',
              ...stationLayers,
              ...labelLayers,
            ],
          });
          if (!hits.length) closeSidebar();
        });

        // 載入 manifest
        setLoadStatus('讀取區域索引...');
        const manifestRes = await fetch('/data/manifest.json');
        manifestRef.current = await manifestRes.json();

        // 初始載入：台灣、香港、澳門 + 可見中國省份
        await loadVisibleRegions();
        setLoading(false);

        map.on('moveend', () => loadVisibleRegions());
      } catch (err) {
        console.error(err);
        setLoadStatus(`載入失敗: ${err.message}`);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [closeSidebar, loadRegion, loadVisibleRegions, showLineSidebar, showStationSidebar]);

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

      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4">
        <div className="pointer-events-auto rounded-lg border border-neutral-200 bg-white/95 px-4 py-3 shadow-sm">
          <h1 className="text-base font-bold tracking-tight text-neutral-900">
            東亞鐵路拓撲圖
          </h1>
          <p className="text-[11px] text-neutral-500">台灣 · 香港 · 澳門 · 中國 · 日本</p>
        </div>

        <div className="pointer-events-auto rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-right shadow-sm">
          <div className="text-[11px] font-semibold text-neutral-700">Zoom {zoomLevel}</div>
          <div className="text-[10px] text-neutral-400">{zoomHint}</div>
          <div className="text-[10px] text-neutral-400">{loadedCount} 區域已載入</div>
        </div>
      </div>

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

      {loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#F5F3EF]/90">
          <div className="rounded-xl border border-neutral-200 bg-white px-8 py-6 text-center shadow-lg">
            <div className="mb-1 text-2xl">🚂</div>
            <div className="font-semibold text-neutral-800">東亞鐵路拓撲圖</div>
            <div className="mt-2 text-sm text-neutral-500">{loadStatus}</div>
          </div>
        </div>
      )}
    </div>
  );
}
