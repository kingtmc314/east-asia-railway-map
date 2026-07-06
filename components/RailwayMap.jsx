'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';

const TEXT_HALO = {
  stroke: '#111115',
  strokeWidth: 4,
  strokeLinejoin: 'round',
  paintOrder: 'stroke',
};

const KEY_STATION_IDS = new Set([
  'CN_BeijingSouth',
  'CN_GuangzhouSouth',
  'CN_NanningEast',
  'HK_Admiralty',
  'JP_Tokyo',
  'JP_Shinjuku',
]);

const FOCUS_PRESETS = [
  { id: 'global', labels: { zh: '全圖', en: 'Global' }, regions: [] },
  { id: 'hongkong', labels: { zh: '香港', en: 'Hong Kong' }, regions: ['hongkong', 'macau', 'china_south'] },
  { id: 'japan', labels: { zh: '東京 / 日本', en: 'Tokyo / Japan' }, regions: ['japan_tokyo', 'japan_south', 'japan_north'] },
  { id: 'south_china', labels: { zh: '廣西 / 華南', en: 'Guangxi / South China' }, regions: ['guangxi', 'china_south', 'hongkong', 'macau'] },
];

function stationLabel(station, locale) {
  return locale === 'en' ? station.name_en || station.name : station.name;
}

function lineLabel(line, locale) {
  return locale === 'en' ? line.name_en || line.name : line.name;
}

function getMergedBounds(regions, regionIds) {
  const targets = regionIds.length > 0 ? regions.filter((region) => regionIds.includes(region.id)) : regions;
  if (targets.length === 0) return null;

  return targets.reduce(
    (acc, region) => ({
      minX: Math.min(acc.minX, region.bounds.minX),
      minY: Math.min(acc.minY, region.bounds.minY),
      maxX: Math.max(acc.maxX, region.bounds.maxX),
      maxY: Math.max(acc.maxY, region.bounds.maxY),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function getStationOpacity(station, focusedRegions) {
  if (!focusedRegions || focusedRegions.size === 0) return 1;
  return focusedRegions.has(station.region) ? 1 : 0.15;
}

function getLineOpacity(line, focusedRegions) {
  if (!focusedRegions || focusedRegions.size === 0) return 1;
  return focusedRegions.has(line.region) ? 1 : 0.15;
}

function getLineStrokeWidth(line) {
  if (line.tier === 'crossborder') return 8;
  if (line.tier === 'backbone') return 6;
  if (line.tier === 'metro') return 4;
  return 3;
}

function GatewayIndicator({ station, locale, opacity, onJump, fontSize }) {
  if (!station.gateway) return null;

  const text = locale === 'en' ? station.gateway.label_en : station.gateway.label_zh;
  const width = Math.max(220, text.length * Math.max(8.6, fontSize * 0.56) + 60);
  const x = station.x + 26;
  const y = station.y - 24;

  return (
    <g
      transform={`translate(${x}, ${y})`}
      opacity={opacity}
      style={{ cursor: 'pointer' }}
      onClick={(event) => {
        event.stopPropagation();
        onJump(station.gateway.targetRegion);
      }}
    >
      <circle className="gateway-pulse-ring" cx={20} cy={20} r={20} />
      <polygon className="gateway-pulse-arrow" points="6,20 26,10 26,30" />
      <rect x={34} y={2} width={width} height={36} rx={18} fill="#1e1b0f" stroke="#ffd43b" strokeWidth={2.2} />
      <text x={52} y={26} fill="#ffe066" fontSize={Math.max(14, fontSize * 0.82)} fontWeight={800} {...TEXT_HALO}>
        {text}
      </text>
    </g>
  );
}

export default function RailwayMap() {
  const transformRef = useRef(null);
  const containerRef = useRef(null);

  const [topology, setTopology] = useState(null);
  const [locale, setLocale] = useState('zh');
  const [currentScale, setCurrentScale] = useState(0.12);
  const [focusPresetId, setFocusPresetId] = useState('global');
  const [hoveredStationId, setHoveredStationId] = useState(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 820 });

  useEffect(() => {
    let cancelled = false;
    fetch('/data/railway_topology.json')
      .then((response) => response.json())
      .then((json) => {
        if (!cancelled) setTopology(json);
      })
      .catch((error) => {
        console.error('[RailwayMap] Failed to load topology', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const stationMap = useMemo(() => {
    if (!topology) return new Map();
    return new Map(topology.stations.map((station) => [station.id, station]));
  }, [topology]);

  const focusPreset = useMemo(
    () => FOCUS_PRESETS.find((preset) => preset.id === focusPresetId) || FOCUS_PRESETS[0],
    [focusPresetId],
  );

  const focusedRegions = useMemo(
    () => (focusPreset.regions.length ? new Set(focusPreset.regions) : null),
    [focusPreset.regions],
  );

  const lineGeometry = useMemo(() => {
    if (!topology) return [];

    return topology.lines.map((line) => {
      const segments = line.path
        .map(([fromId, toId]) => {
          const fromStation = stationMap.get(fromId);
          const toStation = stationMap.get(toId);
          if (!fromStation || !toStation) return null;

          return {
            x1: fromStation.x,
            y1: fromStation.y,
            x2: toStation.x,
            y2: toStation.y,
            midX: (fromStation.x + toStation.x) / 2,
            midY: (fromStation.y + toStation.y) / 2,
          };
        })
        .filter(Boolean);

      const labelIndex = Math.floor(Math.max(0, segments.length - 1) / 2);
      const labelAnchor = segments[labelIndex] || null;

      return { line, segments, labelAnchor };
    });
  }, [topology, stationMap]);

  const isDetailView = currentScale >= 0.85 || focusPresetId !== 'global';
  const scalableFontSize = Math.max(14, 24 / currentScale);
  const hubLabelSize = scalableFontSize + 4;
  const lineLabelSize = Math.max(14, 22 / currentScale);

  const visibleStations = useMemo(() => {
    if (!topology) return [];
    return topology.stations.filter((station) => {
      if (isDetailView) return true;
      return station.tier === 'hub' || station.tier === 'major' || station.type === 'gateway' || KEY_STATION_IDS.has(station.id);
    });
  }, [topology, isDetailView]);

  const flyToRegionSet = useCallback(
    (regionIds, presetId) => {
      if (!topology || !transformRef.current) return;

      if (presetId === 'global') {
        setFocusPresetId('global');
        transformRef.current.resetTransform(420);
        return;
      }

      const merged = getMergedBounds(topology.regions, regionIds);
      if (!merged) return;

      const contentWidth = merged.maxX - merged.minX;
      const contentHeight = merged.maxY - merged.minY;
      const centerX = (merged.minX + merged.maxX) / 2;
      const centerY = (merged.minY + merged.maxY) / 2;
      const padding = 1.22;
      const targetScale = Math.min(
        viewport.width / (contentWidth * padding),
        viewport.height / (contentHeight * padding),
      );
      const clampedScale = Math.max(0.08, Math.min(3.2, targetScale));
      const targetX = viewport.width / 2 - centerX * clampedScale;
      const targetY = viewport.height / 2 - centerY * clampedScale;

      setFocusPresetId(presetId);
      transformRef.current.setTransform(targetX, targetY, clampedScale, 520);
    },
    [topology, viewport.height, viewport.width],
  );

  const handleGatewayJump = useCallback(
    (targetRegion) => {
      const presetForRegion = FOCUS_PRESETS.find((preset) => preset.regions.includes(targetRegion));
      if (presetForRegion) {
        flyToRegionSet(presetForRegion.regions, presetForRegion.id);
        return;
      }
      flyToRegionSet([targetRegion], targetRegion);
    },
    [flyToRegionSet],
  );

  /**
   * Future Interceptor: station node interaction bridge.
   * ----------------------------------------------------
   * This handler is intentionally designed as a stable extension point so the next
   * phase can plug in passenger-grade interactions without rewriting the map layer.
   *
   * Planned integrations:
   * 1) Open station detail drawer: operating agencies, platform topology, exits.
   * 2) Query timetable APIs (MTR/JR/CR/THSR) and render near-real-time departures.
   * 3) Compute transfer walk paths + inter-line flow overlays across the same canvas.
   * 4) Attach station-level ridership and operation metrics panel for analytics mode.
   */
  const handleStationClick = useCallback(
    (station) => {
      if (station.gateway?.targetRegion) {
        handleGatewayJump(station.gateway.targetRegion);
      }
      if (process.env.NODE_ENV === 'development') {
        console.info('[RailwayMap] Station clicked:', station.id, station.name);
      }
    },
    [handleGatewayJump],
  );

  if (!topology) {
    return (
      <div ref={containerRef} className="flex h-full w-full items-center justify-center bg-[#090b11] text-slate-300">
        正在載入官方拓撲示意圖...
      </div>
    );
  }

  const { canvas } = topology;
  const viewBoxWidth = canvas.maxX - canvas.minX;
  const viewBoxHeight = canvas.maxY - canvas.minY;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[#090b11]">
      <style>{`
        @keyframes gatewayPulse {
          0% { transform: scale(0.9); opacity: 0.9; }
          70% { transform: scale(1.22); opacity: 0.18; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        @keyframes gatewayArrow {
          0%, 100% { transform: translateX(0); opacity: 1; }
          50% { transform: translateX(6px); opacity: 0.55; }
        }
        .gateway-pulse-ring {
          fill: rgba(255, 212, 59, 0.25);
          stroke: #ffd43b;
          stroke-width: 1.6;
          transform-origin: center;
          animation: gatewayPulse 2s ease-out infinite;
        }
        .gateway-pulse-arrow {
          fill: #ffd43b;
          transform-origin: center;
          animation: gatewayArrow 1.35s ease-in-out infinite;
        }
      `}</style>

      <div className="pointer-events-none absolute left-3 top-3 z-20 flex w-[236px] flex-col gap-2 rounded-xl border border-slate-700/80 bg-[#121826]/88 p-3 shadow-lg backdrop-blur-sm">
        <div className="pointer-events-auto">
          <h2 className="text-sm font-extrabold text-slate-100">
            {locale === 'zh' ? '東亞官方經典鐵路圖' : 'East Asia Official Railway Schematic'}
          </h2>
          <p className="text-[11px] text-slate-400">
            {locale === 'zh'
              ? '點選聚焦區域，非焦點路網保持暗色連續顯示'
              : 'Focus a region while keeping the entire network connected in dim context'}
          </p>
        </div>

        <div className="pointer-events-auto flex flex-col gap-1.5">
          {FOCUS_PRESETS.map((preset) => {
            const active = focusPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => flyToRegionSet(preset.regions, preset.id)}
                className={`rounded-md border px-3 py-1.5 text-left text-xs font-semibold transition ${
                  active
                    ? 'border-yellow-300 bg-yellow-400/20 text-yellow-100'
                    : 'border-slate-600 bg-slate-900/55 text-slate-200 hover:border-slate-400'
                }`}
              >
                {preset.labels[locale]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 z-20 flex gap-2">
        <button
          type="button"
          onClick={() => setLocale((prev) => (prev === 'zh' ? 'en' : 'zh'))}
          className="pointer-events-auto rounded-md border border-slate-600 bg-[#121826]/88 px-3 py-1.5 text-xs font-bold text-slate-100 backdrop-blur-sm hover:border-yellow-300"
        >
          {locale === 'zh' ? '繁中 / EN' : 'EN / 繁中'}
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-md border border-slate-700/70 bg-[#121826]/80 px-2 py-1 text-[11px] text-slate-300 backdrop-blur-sm">
        {locale === 'zh' ? '縮放倍率' : 'Zoom'} {(currentScale * 100).toFixed(0)}%
      </div>

      <TransformWrapper
        ref={transformRef}
        initialScale={0.12}
        minScale={0.05}
        maxScale={4}
        limitToBounds={false}
        centerOnInit
        wheel={{ step: 0.07 }}
        pinch={{ step: 6 }}
        doubleClick={{ disabled: true }}
        onTransformed={(_instance, state) => setCurrentScale(state.scale)}
      >
        <TransformComponent wrapperClass="!h-full !w-full" contentClass="!h-full !w-full">
          <svg viewBox={`${canvas.minX} ${canvas.minY} ${viewBoxWidth} ${viewBoxHeight}`} className="h-full w-full">
            <rect x={canvas.minX} y={canvas.minY} width={viewBoxWidth} height={viewBoxHeight} fill="#090b11" />

            <g id="rail-lines">
              {lineGeometry.map(({ line, segments, labelAnchor }) => {
                const opacity = getLineOpacity(line, focusedRegions);
                const showLineLabel = isDetailView || line.tier === 'backbone' || line.tier === 'crossborder';

                return (
                  <g key={line.id} opacity={opacity}>
                    {segments.map((segment, index) => (
                      <line
                        key={`${line.id}-${index}`}
                        x1={segment.x1}
                        y1={segment.y1}
                        x2={segment.x2}
                        y2={segment.y2}
                        stroke={line.color}
                        strokeWidth={getLineStrokeWidth(line)}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    {showLineLabel && labelAnchor && (
                      <text
                        x={labelAnchor.midX}
                        y={labelAnchor.midY - 14}
                        fill={line.color}
                        textAnchor="middle"
                        fontSize={lineLabelSize}
                        fontWeight={800}
                        {...TEXT_HALO}
                      >
                        {lineLabel(line, locale)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            <g id="station-nodes">
              {visibleStations.map((station) => {
                const opacity = getStationOpacity(station, focusedRegions);
                const isHub = station.tier === 'hub' || station.tier === 'major' || KEY_STATION_IDS.has(station.id);
                const showLabel = isHub || isDetailView;
                const hover = hoveredStationId === station.id;
                const baseRadius = isHub ? 11 : 7;
                const radius = hover ? baseRadius + 1.5 : baseRadius;

                return (
                  <g
                    key={station.id}
                    opacity={opacity}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleStationClick(station)}
                    onMouseEnter={() => setHoveredStationId(station.id)}
                    onMouseLeave={() => setHoveredStationId(null)}
                  >
                    {station.marker === 'capsule' && (
                      <>
                        <rect
                          x={station.x - radius * 1.6}
                          y={station.y - radius * 0.72}
                          width={radius * 3.2}
                          height={radius * 1.45}
                          rx={radius * 0.82}
                          fill="#ffffff"
                          stroke="#121826"
                          strokeWidth={2.4}
                        />
                        <line
                          x1={station.x - radius * 0.95}
                          y1={station.y}
                          x2={station.x + radius * 0.95}
                          y2={station.y}
                          stroke="#121826"
                          strokeWidth={1.6}
                        />
                      </>
                    )}

                    {station.marker === 'red_ring' && (
                      <>
                        <circle cx={station.x} cy={station.y} r={radius + 5} fill="#ffffff" stroke="#d90429" strokeWidth={4} />
                        <circle cx={station.x} cy={station.y} r={radius - 1} fill="#ffffff" stroke="#121826" strokeWidth={2.2} />
                        <circle cx={station.x} cy={station.y} r={radius * 0.34} fill="#111115" />
                      </>
                    )}

                    {!station.marker && (
                      <circle cx={station.x} cy={station.y} r={radius} fill="#ffffff" stroke="#121826" strokeWidth={2.2} />
                    )}

                    {station.type === 'gateway' && (
                      <circle
                        cx={station.x}
                        cy={station.y}
                        r={radius + 9}
                        fill="none"
                        stroke="#ffd43b"
                        strokeWidth={2}
                        strokeDasharray="4 6"
                      />
                    )}

                    {showLabel && (
                      <text
                        x={station.x}
                        y={station.y - (isHub ? 18 : 14)}
                        textAnchor="middle"
                        fill="#f8fafc"
                        fontSize={isHub ? hubLabelSize : scalableFontSize}
                        fontWeight={isHub ? 900 : 750}
                        {...TEXT_HALO}
                      >
                        {stationLabel(station, locale)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            <g id="gateway-indicators">
              {topology.stations
                .filter((station) => station.gateway)
                .map((station) => (
                  <GatewayIndicator
                    key={`gateway-${station.id}`}
                    station={station}
                    locale={locale}
                    opacity={getStationOpacity(station, focusedRegions)}
                    onJump={handleGatewayJump}
                    fontSize={scalableFontSize}
                  />
                ))}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
