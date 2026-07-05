'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const STADIA_STYLE = 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json';

const REGIONS = [
  { id: 'hongkong', label: '香港', center: [114.1694, 22.3193], zoom: 12 },
  { id: 'macau', label: '澳門', center: [113.5439, 22.1987], zoom: 13 },
  { id: 'taiwan', label: '台灣', center: [121.0, 23.7], zoom: 8 },
  { id: 'china', label: '中國大陸', center: [116.4074, 39.9042], zoom: 5 },
  { id: 'japan', label: '日本', center: [138.2529, 36.2048], zoom: 6 },
];

export default function RailwayMap() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeRegion, setActiveRegion] = useState('');
  const [zoomLevel, setZoomLevel] = useState(5);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: STADIA_STYLE,
      center: [121.5, 24.5],
      zoom: 5,
      minZoom: 3,
      maxZoom: 18,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-right');

    map.on('load', () => setMapReady(true));
    map.on('zoom', () => setZoomLevel(Math.round(map.getZoom() * 10) / 10));

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const flyToRegion = (regionId) => {
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
  };

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
                Stadia 向量底圖 · 即時渲染 · 無需預載資料
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
        </div>
      </div>
    </div>
  );
}
