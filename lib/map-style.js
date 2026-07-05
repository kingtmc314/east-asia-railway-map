/** 極簡拓撲底圖樣式 — 無街道干擾 */
export const TOPOLOGY_STYLE = {
  version: 8,
  name: 'Railway Topology',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#F5F3EF' },
    },
    {
      id: 'water',
      type: 'background',
      paint: { 'background-color': '#F5F3EF' },
    },
  ],
};

export const SOURCE_LINES = 'railway-lines';
export const SOURCE_STATIONS = 'railway-stations';

/** 依視窗 bbox 判斷是否需要載入區域 */
export function bboxIntersects(a, b) {
  const [aw, as, ae, an] = a;
  const [bw, bs, be, bn] = b;
  return !(ae < bw || aw > be || an < bs || as > bn);
}

export function getMapBbox(map) {
  const b = map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

/** 圖層 Paint — 大阪官方拓撲風格 */
export const TOPO_PAINT = {
  /** Z4-6 高鐵/新幹線 */
  hsr: {
    'line-color': ['coalesce', ['get', 'line_color'], '#E60012'],
    'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3, 7, 4, 10, 5],
    'line-opacity': 1,
    'line-cap': 'round',
    'line-join': 'round',
  },
  /** Z7-10 城際/普鐵 */
  intercity: {
    'line-color': ['coalesce', ['get', 'line_color'], '#003DA5'],
    'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 9, 3, 11, 4, 13, 5],
    'line-opacity': 0.95,
    'line-cap': 'round',
    'line-join': 'round',
  },
  /** Z11+ 地鐵/私鐵 */
  metro: {
    'line-color': ['coalesce', ['get', 'line_color'], '#7C3AED'],
    'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 13, 4, 16, 6],
    'line-opacity': 1,
    'line-cap': 'round',
    'line-join': 'round',
  },
  /** Z11+ 輕軌 */
  tram: {
    'line-color': ['coalesce', ['get', 'line_color'], '#059669'],
    'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 13, 3.5, 16, 5],
    'line-opacity': 0.9,
    'line-dasharray': [3, 2],
    'line-cap': 'round',
  },
  highlight: {
    'line-color': '#FFB800',
    'line-width': ['interpolate', ['linear'], ['zoom'], 4, 5, 13, 10],
    'line-opacity': 1,
  },
  /** Z7-10 主要轉乘站 */
  stationsMajor: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 5, 10, 8],
    'circle-color': '#FFFFFF',
    'circle-stroke-color': '#111111',
    'circle-stroke-width': 2,
  },
  /** Z11-12 一般車站 */
  stationsAll: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 12, 5],
    'circle-color': '#FFFFFF',
    'circle-stroke-color': '#333333',
    'circle-stroke-width': 1.5,
  },
  /** Z13+ 日本地鐵圖風格 */
  stationsDetail: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 6, 15, 9, 17, 12],
    'circle-color': '#FFFFFF',
    'circle-stroke-color': '#000000',
    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 3],
  },
  stationSelected: {
    'circle-radius': 14,
    'circle-color': '#FFFFFF',
    'circle-stroke-color': '#E60012',
    'circle-stroke-width': 4,
  },
  stationLabels: {
    'text-color': '#1A1A1A',
    'text-halo-color': '#FFFFFF',
    'text-halo-width': 2.5,
    'text-opacity': ['interpolate', ['linear'], ['zoom'], 11.9, 0, 12, 1],
  },
};

export const LAYER_FILTERS = {
  hsr: ['==', ['get', 'line_tier'], 'hsr'],
  intercity: ['==', ['get', 'line_tier'], 'intercity'],
  metro: ['==', ['get', 'line_tier'], 'metro'],
  tram: ['==', ['get', 'line_tier'], 'tram'],
  stationsMajor: ['>=', ['get', 'transfer_count'], 2],
};
