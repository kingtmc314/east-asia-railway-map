/** CJK 字型 glyphs（MapLibre 開源） */
export const GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

/** 車站標籤字型堆疊 — CJK 優先，Latin 備用 */
export const STATION_LABEL_FONTS = ['Noto Sans CJK JP Regular', 'Open Sans Regular'];

/**
 * 繁體中文優先站名表達式
 * 香港 → 台灣 → 通用中文 → 日文 → 預設 name
 */
export const STATION_LABEL_FIELD = [
  'coalesce',
  ['get', 'name:zh-Hant'],
  ['get', 'name:zh-HK'],
  ['get', 'name:zh-TW'],
  ['get', 'name:zh'],
  ['get', 'name:ja'],
  ['get', 'name'],
];

/** 車站 Symbol 圖層 layout — 可變錨點避免碰撞隱藏 */
export const STATION_LABEL_LAYOUT = {
  'text-field': STATION_LABEL_FIELD,
  'text-font': STATION_LABEL_FONTS,
  'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9, 13, 11, 15, 13, 17, 15, 18, 16],
  'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
  'text-radial-offset': 0.85,
  'text-justify': 'auto',
  'text-max-width': 12,
  'text-padding': 2,
  'text-allow-overlap': false,
  'text-ignore-placement': false,
  'text-optional': false,
  'symbol-sort-key': ['-', ['get', 'transfer_count']],
};

/** 極簡拓撲底圖樣式 — 無街道干擾 */
export const TOPOLOGY_STYLE = {
  version: 8,
  name: 'Railway Topology',
  glyphs: GLYPHS_URL,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#F5F3EF' },
    },
  ],
};

export const SOURCE_LINES = 'railway-lines';
export const SOURCE_STATIONS = 'railway-stations';

export function bboxIntersects(a, b) {
  const [aw, as, ae, an] = a;
  const [bw, bs, be, bn] = b;
  return !(ae < bw || aw > be || an < bs || as > bn);
}

export function getMapBbox(map) {
  const b = map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

export const TOPO_PAINT = {
  hsr: {
    'line-color': ['coalesce', ['get', 'line_color'], '#E60012'],
    'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3, 7, 4, 10, 5],
    'line-opacity': 1,
    'line-cap': 'round',
    'line-join': 'round',
  },
  intercity: {
    'line-color': ['coalesce', ['get', 'line_color'], '#003DA5'],
    'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 9, 3, 11, 4, 13, 5],
    'line-opacity': 0.95,
    'line-cap': 'round',
    'line-join': 'round',
  },
  metro: {
    'line-color': ['coalesce', ['get', 'line_color'], '#7C3AED'],
    'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 13, 4, 16, 6],
    'line-opacity': 1,
    'line-cap': 'round',
    'line-join': 'round',
  },
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
  stationsMajor: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 5, 10, 8],
    'circle-color': '#FFFFFF',
    'circle-stroke-color': '#111111',
    'circle-stroke-width': 2,
  },
  stationsAll: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 12, 5],
    'circle-color': '#FFFFFF',
    'circle-stroke-color': '#333333',
    'circle-stroke-width': 1.5,
  },
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
    'text-opacity': ['interpolate', ['linear'], ['zoom'], 10.9, 0, 11, 1],
  },
  /** Z16+ 密集區域：允許重疊以確保 100% 顯示 */
  stationLabelsDense: {
    'text-color': '#1A1A1A',
    'text-halo-color': '#FFFFFF',
    'text-halo-width': 2,
    'text-opacity': 1,
  },
};

export const LAYER_FILTERS = {
  hsr: ['==', ['get', 'line_tier'], 'hsr'],
  intercity: ['==', ['get', 'line_tier'], 'intercity'],
  metro: ['==', ['get', 'line_tier'], 'metro'],
  tram: ['==', ['get', 'line_tier'], 'tram'],
  stationsMajor: ['>=', ['get', 'transfer_count'], 2],
  /** 僅顯示有站名的節點 */
  hasLabel: [
    'any',
    ['has', 'name:zh-Hant'],
    ['has', 'name:zh-HK'],
    ['has', 'name:zh-TW'],
    ['has', 'name:zh'],
    ['has', 'name:ja'],
    ['has', 'name'],
    ['has', 'label_zh'],
  ],
};

/** Z11–15：可變錨點，避免重疊 */
export const STATION_LABEL_LAYOUT_STANDARD = STATION_LABEL_LAYOUT;

/** Z16+：密集地鐵/私鐵區，強制顯示所有站名 */
export const STATION_LABEL_LAYOUT_DENSE = {
  ...STATION_LABEL_LAYOUT,
  'text-allow-overlap': true,
  'text-size': ['interpolate', ['linear'], ['zoom'], 16, 12, 18, 14],
};
