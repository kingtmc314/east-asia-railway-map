'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

const ZOOM_DETAIL_THRESHOLD = 0.8;
const DIM_OPACITY = 0.15;
const HALO = { stroke: '#111115', strokeWidth: 3, paintOrder: 'stroke' };

function label(station, locale) {
  return locale === 'en' ? station.name_en || station.name : station.name;
}

function lineLabel(line, locale) {
  return locale === 'en' ? line.name_en || line.name : line.name;
}

function regionLabel(region, locale) {
  return locale === 'en' ? region.name_en || region.name : region.name;
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function orthPath(ax, ay, bx, by) {
  if (ax === bx || ay === by) return `M ${ax} ${ay} L ${bx} ${by}`;
  const mx = (ax + bx) / 2;
  return `M ${ax} ${ay} L ${mx} ${ay} L ${mx} ${by} L ${bx} ${by}`;
}

function buildSegmentPaths(line, stationMap) {
  return line.path
    .map(([fromId, toId]) => {
      const a = stationMap.get(fromId);
      const b = stationMap.get(toId);
      if (!a || !b) return null;
      return {
        d: orthPath(a.x, a.y, b.x, b.y),
        mid: midpoint(a, b),
        fromId,
        toId,
      };
    })
    .filter(Boolean);
}

function StationNode({ station, locale, opacity, onClick, showLabel }) {
  const { x, y, type, tier } = station;
  const isInterchange = type === 'interchange';
  const isGateway = type === 'gateway';
  const isHub = tier === 'hub' || tier === 'major';
  const r = isHub ? 10 : isInterchange ? 8 : 5;

  if (isInterchange) {
    return (
      <g opacity={opacity} style={{ cursor: 'pointer' }} onClick={() => onClick(station)}>
        <rect
          x={x - r - 2}
          y={y - r / 2 - 2}
          width={(r + 2) * 2}
          height={r + 4}
          rx={r}
          fill="#1a1a22"
          stroke="#f8fafc"
          strokeWidth={2}
        />
        <circle cx={x} cy={y} r={r * 0.45} fill="#0a0a0f" stroke="#f8fafc" strokeWidth={1.5} />
        {showLabel && (
          <text x={x} y={y - r - 8} textAnchor="middle" fill="#f8fafc" fontSize={13} fontWeight={600} {...HALO}>
            {label(station, locale)}
          </text>
        )}
      </g>
    );
  }

  return (
    <g opacity={opacity} style={{ cursor: 'pointer' }} onClick={() => onClick(station)}>
      {isGateway && (
        <circle cx={x} cy={y} r={r + 6} fill="none" stroke="#FFD700" strokeWidth={2} className="gateway-ring" />
      )}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={isGateway ? '#FFD700' : isHub ? '#f8fafc' : '#94a3b8'}
        stroke="#111115"
        strokeWidth={2}
      />
      {isHub && <circle cx={x} cy={y} r={r * 0.4} fill="#0a0a0f" />}
      {showLabel && (
        <text
          x={x}
          y={y - r - (isHub ? 10 : 6)}
          textAnchor="middle"
          fill="#f8fafc"
          fontSize={isHub ? 14 : 11}
          fontWeight={isHub ? 700 : 500}
          {...HALO}
        >
          {label(station, locale)}
        </text>
      )}
    </g>
  );
}

function GatewayBadge({ station, locale, onFocus }) {
  if (!station.gateway) return null;
  const { x, y } = station;
  const text = locale === 'en' ? station.gateway.label_en : station.gateway.label_zh;

  return (
    <g
      className="gateway-badge"
      transform={`translate(${x + 18}, ${y - 12})`}
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation();
        onFocus(station.gateway.targetRegion);
      }}
    >
      <rect x={0} y={-14} width={text.length * 7.5 + 24} height={28} rx={14} fill="#1c1910" stroke="#FFD700" strokeWidth={1.5} />
      <polygon className="gateway-pulse-arrow" points="8,0 16,-5 16,5" fill="#FFD700" />
      <text x={20} y={5} fill="#FFD700" fontSize={12} fontWeight={600} {...HALO}>
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
  const [scale, setScale] = useState(0.12);
  const [focusRegion, setFocusRegion] = useState(null);
  const [viewport, setViewport] = useState({ w: 1200, h: 800 });

  useEffect(() => {
    fetch('/data/railway_topology.json')
      .then((r) => r.json())
      .then(setTopology)
      .catch((err) => console.error('Failed to load topology:', err));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      setViewport({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stationMap = useMemo(() => {
    if (!topology) return new Map();
    return new Map(topology.stations.map((s) => [s.id, s]));
  }, [topology]);

  const regionMap = useMemo(() => {
    if (!topology) return new Map();
    return new Map(topology.regions.map((r) => [r.id, r]));
  }, [topology]);

  const isDetailView = scale >= ZOOM_DETAIL_THRESHOLD || focusRegion !== null;

  const stationVisible = useCallback(
    (station) => {
      if (!isDetailView) {
        return station.tier === 'hub' || station.type === 'gateway';
      }
      if (focusRegion) return station.region === focusRegion || station.type === 'gateway';
      return true;
    },
    [isDetailView, focusRegion],
  );

  const lineVisible = useCallback(
    (line) => {
      if (!isDetailView) return line.tier === 'backbone' || line.tier === 'crossborder';
      if (focusRegion) return line.region === focusRegion || line.tier === 'crossborder';
      return true;
    },
    [isDetailView, focusRegion],
  );

  const regionOpacity = useCallback(
    (regionId) => {
      if (!focusRegion || focusRegion === regionId) return 1;
      return DIM_OPACITY;
    },
    [focusRegion],
  );

  const focusOnRegion = useCallback(
    (regionId) => {
      const region = regionMap.get(regionId);
      if (!region || !transformRef.current || !topology) return;

      setFocusRegion(regionId);
      const { minX, minY, maxX, maxY } = region.bounds;
      const rw = maxX - minX;
      const rh = maxY - minY;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const padding = 1.15;
      const targetScale = Math.min(viewport.w / (rw * padding), viewport.h / (rh * padding));
      const clamped = Math.max(0.15, Math.min(2.5, targetScale));
      const posX = viewport.w / 2 - cx * clamped;
      const posY = viewport.h / 2 - cy * clamped;
      transformRef.current.setTransform(posX, posY, clamped, 400);
    },
    [regionMap, topology, viewport],
  );

  const resetView = useCallback(() => {
    setFocusRegion(null);
    transformRef.current?.resetTransform(400);
  }, []);

  /**
   * Future Interceptor — station click handler
   * -------------------------------------------------------
   * This hook point is reserved for advanced passenger-facing features:
   *   1. Slide-over panel with station metadata (lines, region, interchange graph)
   *   2. Per-country timetable API (CN 12306, JP JR, TW THSR, HK MTR) via edge functions
   *   3. Transfer flow visualisation — highlight connecting lines & walking interchanges
   *   4. Deep-link to /station/[id] for shareable views
   * Mount a <StationDetailDrawer station={station} onClose={...} /> here when ready.
   */
  const handleStationClick = useCallback((station) => {
    if (process.env.NODE_ENV === 'development') {
      console.info('[RailwayMap] station intercept:', station.id, station.name);
    }
    focusOnRegion(station.region);
  }, [focusOnRegion]);

  const lineGeometries = useMemo(() => {
    if (!topology) return [];
    return topology.lines
      .filter(lineVisible)
      .map((line) => ({
        line,
        segments: buildSegmentPaths(line, stationMap),
        opacity: regionOpacity(line.region),
      }));
  }, [topology, lineVisible, stationMap, regionOpacity]);

  const gatewayStations = useMemo(
    () => (topology ? topology.stations.filter((s) => s.gateway) : []),
    [topology],
  );

  if (!topology) {
    return (
      <div ref={containerRef} className="flex h-full w-full items-center justify-center bg-[#0a0a0f] text-slate-400">
        載入東亞鐵路拓撲矩陣…
      </div>
    );
  }

  const { canvas } = topology;
  const vbW = canvas.maxX - canvas.minX;
  const vbH = canvas.maxY - canvas.minY;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[#0a0a0f]">
      <style>{`
        @keyframes gateway-pulse {
          0%, 100% { opacity: 1; transform: translateX(0); }
          50% { opacity: 0.45; transform: translateX(4px); }
        }
        @keyframes gateway-ring-pulse {
          0%, 100% { opacity: 0.9; r: 16; }
          50% { opacity: 0.35; }
        }
        .gateway-pulse-arrow { animation: gateway-pulse 1.6s ease-in-out infinite; }
        .gateway-badge:hover rect { filter: brightness(1.25); }
        .gateway-ring { animation: gateway-ring-pulse 2s ease-in-out infinite; }
      `}</style>

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
        <div className="pointer-events-auto rounded-lg border border-slate-700/80 bg-[#111115]/90 px-4 py-2 backdrop-blur-sm">
          <h1 className="text-sm font-bold text-slate-100">
            {locale === 'en' ? 'East Asia Railway Grid' : '東亞鐵路非比例拓撲矩陣'}
          </h1>
          <p className="text-xs text-slate-400">
            {locale === 'en'
              ? `${topology.stations.length} stations · ${topology.lines.length} lines`
              : `${topology.stations.length} 站 · ${topology.lines.length} 線`}
          </p>
        </div>

        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={() => setLocale((l) => (l === 'zh' ? 'en' : 'zh'))}
            className="rounded-md border border-slate-600 bg-[#111115]/90 px-3 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur-sm hover:border-amber-400 hover:text-amber-300"
          >
            {locale === 'zh' ? '繁中 / EN' : 'EN / 繁中'}
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-md border border-slate-600 bg-[#111115]/90 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-sm hover:border-slate-400"
          >
            {locale === 'en' ? 'Reset view' : '全圖重置'}
          </button>
        </div>
      </div>

      {/* Region focus chips */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 flex flex-wrap justify-center gap-1.5">
        {topology.regions.map((region) => (
          <button
            key={region.id}
            type="button"
            onClick={() => focusOnRegion(region.id)}
            className={`pointer-events-auto rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm transition ${
              focusRegion === region.id
                ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                : 'border-slate-600 bg-[#111115]/85 text-slate-300 hover:border-slate-400'
            }`}
          >
            {regionLabel(region, locale)}
          </button>
        ))}
      </div>

      {/* Zoom hint */}
      <div className="pointer-events-none absolute bottom-14 right-3 z-20 rounded border border-slate-700/60 bg-[#111115]/75 px-2 py-1 text-[10px] text-slate-500">
        {isDetailView
          ? locale === 'en'
            ? 'Detail layer active'
            : '細節圖層已啟用'
          : locale === 'en'
            ? 'Overview — zoom in for metro'
            : '全景 — 放大顯示地鐵網'}
        {' · '}
        {(scale * 100).toFixed(0)}%
      </div>

      <TransformWrapper
        ref={transformRef}
        initialScale={0.12}
        minScale={0.04}
        maxScale={4}
        limitToBounds={false}
        centerOnInit
        wheel={{ step: 0.08 }}
        pinch={{ step: 5 }}
        onTransformed={(_ref, state) => setScale(state.scale)}
      >
        <TransformComponent
          wrapperClass="!h-full !w-full"
          contentClass="!h-full !w-full"
        >
          <svg
            viewBox={`${canvas.minX} ${canvas.minY} ${vbW} ${vbH}`}
            className="h-full w-full"
            style={{ touchAction: 'none' }}
          >
            <rect x={canvas.minX} y={canvas.minY} width={vbW} height={vbH} fill="#0a0a0f" />

            {/* Lines */}
            <g id="railway-lines">
              {lineGeometries.map(({ line, segments, opacity }) =>
                segments.map((seg, i) => (
                  <g key={`${line.id}-${i}`} opacity={opacity}>
                    <path
                      d={seg.d}
                      fill="none"
                      stroke={line.color}
                      strokeWidth={line.tier === 'backbone' ? 5 : line.tier === 'crossborder' ? 4 : 3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={line.tier === 'metro' ? 0.85 : 1}
                    />
                    {i === 0 && isDetailView && (
                      <text
                        x={seg.mid.x}
                        y={seg.mid.y - 10}
                        textAnchor="middle"
                        fill={line.color}
                        fontSize={12}
                        fontWeight={600}
                        {...HALO}
                      >
                        {lineLabel(line, locale)}
                      </text>
                    )}
                  </g>
                )),
              )}
            </g>

            {/* Stations */}
            <g id="railway-stations">
              {topology.stations
                .filter(stationVisible)
                .map((station) => (
                  <StationNode
                    key={station.id}
                    station={station}
                    locale={locale}
                    opacity={regionOpacity(station.region)}
                    onClick={handleStationClick}
                    showLabel={isDetailView || station.tier === 'hub'}
                  />
                ))}
            </g>

            {/* Gateway extension indicators */}
            <g id="gateway-indicators">
              {gatewayStations.map((station) => (
                <GatewayBadge
                  key={`gw-${station.id}`}
                  station={station}
                  locale={locale}
                  onFocus={focusOnRegion}
                />
              ))}
            </g>
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
