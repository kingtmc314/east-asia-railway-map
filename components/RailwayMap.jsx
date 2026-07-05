'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/** ÖPNVKarte / memomaps — 全球彩色客運、鐵路、地鐵專用圖磚（含官方線色與站名） */
const TRANSIT_STYLE = {
  version: 8,
  sources: {
    'osm-transit': {
      type: 'raster',
      tiles: ['https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://memomaps.de/">ÖPNVKarte</a>',
    },
  },
  layers: [
    {
      id: 'osm-transit-layer',
      type: 'raster',
      source: 'osm-transit',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

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

  const flyToRegion = useCallback((regionId) => {
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
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: TRANSIT_STYLE,
      center: [121.5, 24.5],
      zoom: 5,
      minZoom: 0,
      maxZoom: 19,
      fadeDuration: 0,
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

  return (
    <div className="relative h-full w-full bg-neutral-100">
      <div ref={mapContainer} className="h-full w-full" />

      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-center p-3 sm:p-4">
        <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-black/10 bg-white/80 p-3 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h1 className="text-sm font-bold tracking-tight text-neutral-900 sm:text-base">
                東亞鐵路地圖
              </h1>
              <p className="text-[10px] text-neutral-500 sm:text-[11px]">
                ÖPNVKarte 雲端底圖 · 彩色鐵路 · 全站名稱
              </p>
            </div>
            <div className="text-right text-[10px] text-neutral-500">
              <span className="font-semibold text-neutral-700">Zoom {zoomLevel}</span>
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
                      ? 'bg-neutral-900 text-white shadow-lg ring-2 ring-neutral-900/20'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
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
