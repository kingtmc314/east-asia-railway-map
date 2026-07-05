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
  ['get', 'name:en'],
  ['get', 'name'],
];

/** GeoJSON source 效能參數 — 網格快取 + 簡化容差 */
export const GEOJSON_SOURCE_OPTS = {
  tolerance: 0.6,
  buffer: 64,
  lineMetrics: false,
};

/** 車站 Symbol 圖層 layout — 可變錨點避免碰撞隱藏 */
export const STATION_LABEL_LAYOUT = {
  'text-field': STATION_LABEL_FIELD,
  'text-font': STATION_LABEL_FONTS,
  'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9, 14, 11, 16, 13, 18, 15],
  'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
  'text-radial-offset': 0.85,
  'text-justify': 'auto',
  'text-max-width': 10,
  'text-padding': 2,
  'text-allow-overlap': false,
  'text-ignore-placement': false,
  'text-optional': true,
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
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 4, 10, 6],
    'circle-color': '#FFFFFF',
    'circle-stroke-color': '#111111',
    'circle-stroke-width': 2,
  },
  stationsAll: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 13, 5],
    'circle-color': '#FFFFFF',
    'circle-stroke-color': '#333333',
    'circle-stroke-width': 1.5,
  },
  stationsDetail: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 5, 15, 7, 17, 9],
    'circle-color': '#FFFFFF',
    'circle-stroke-color': '#000000',
    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 2.5],
  },
  stationSelected: {
    'circle-radius': 12,
    'circle-color': '#FFFFFF',
    'circle-stroke-color': '#E60012',
    'circle-stroke-width': 3,
  },
  stationLabelsHub: {
    'text-color': '#111111',
    'text-halo-color': '#FFFFFF',
    'text-halo-width': 2.5,
    'text-opacity': ['interpolate', ['linear'], ['zoom'], 6.9, 0, 7, 1, 11.4, 1, 11.5, 0],
  },
  stationLabels: {
    'text-color': '#1A1A1A',
    'text-halo-color': '#FFFFFF',
    'text-halo-width': 2,
    'text-opacity': ['interpolate', ['linear'], ['zoom'], 11.9, 0, 12, 0.85, 14, 1],
  },
  stationLabelsDense: {
    'text-color': '#1A1A1A',
    'text-halo-color': '#FFFFFF',
    'text-halo-width': 1.5,
    'text-opacity': 0.95,
  },
};

export const LAYER_FILTERS = {
  hsr: ['==', ['get', 'line_tier'], 'hsr'],
  intercity: ['==', ['get', 'line_tier'], 'intercity'],
  metro: ['==', ['get', 'line_tier'], 'metro'],
  tram: ['==', ['get', 'line_tier'], 'tram'],
  stationsMajor: ['>=', ['get', 'transfer_count'], 2],
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
  /** Z7–11.5：僅核心樞紐大站（高轉乘或已知樞紐關鍵字） */
  stationsHubLabels: [
    'all',
    [
      'any',
      ['has', 'name:zh-Hant'],
      ['has', 'name:zh-HK'],
      ['has', 'name:zh-TW'],
      ['has', 'name:zh'],
      ['has', 'name:ja'],
      ['has', 'name'],
    ],
    [
      'any',
      ['>=', ['get', 'transfer_count'], 3],
      [
        'in',
        ['coalesce', ['get', 'name:zh'], ['get', 'name:ja'], ['get', 'name']],
        [
          'literal',
          [
            '東京',
            '東京駅',
            '東京站',
            '台北',
            '台北車站',
            '臺北',
            '臺北車站',
            '香港西九龍',
            '西九龍',
            '北京南',
            '北京南站',
            '上海虹橋',
            '上海虹桥',
            '廣州南',
            '广州南',
            '大阪',
            '名古屋',
            '新宿',
            '渋谷',
            '涩谷',
          ],
        ],
      ],
    ],
  ],
};

/** Z7–11.5：樞紐站名，可變錨點 */
export const STATION_LABEL_LAYOUT_HUB = {
  ...STATION_LABEL_LAYOUT,
  'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 10, 12, 11.5, 13],
  'text-optional': false,
  'text-max-width': 8,
};

/** Z12+：一般站名，可變錨點 + optional 減少碰撞計算 */
export const STATION_LABEL_LAYOUT_STANDARD = {
  ...STATION_LABEL_LAYOUT,
  'text-optional': true,
};

/** Z15+：密集區域允許重疊 */
export const STATION_LABEL_LAYOUT_DENSE = {
  ...STATION_LABEL_LAYOUT,
  'text-allow-overlap': true,
  'text-optional': true,
  'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 18, 13],
};

/** 所有可切換圖層 ID */
export const ALL_LINE_LAYER_IDS = [
  'lines-hsr',
  'lines-hsr-mid',
  'lines-intercity',
  'lines-hsr-local',
  'lines-intercity-local',
  'lines-metro',
  'lines-tram',
];

export const ALL_STATION_LAYER_IDS = [
  'stations-major',
  'stations-all',
  'stations-detail',
];

export const ALL_LABEL_LAYER_IDS = [
  'station-labels-hub',
  'station-labels',
  'station-labels-dense',
];

/** 分區 TAB 對應可見圖層 */
export const TIER_LAYER_VISIBILITY = {
  hsr: {
    lines: ['lines-hsr', 'lines-hsr-mid', 'lines-hsr-local'],
    stations: [],
    labels: ['station-labels-hub'],
    targetZoom: 5.5,
  },
  intercity: {
    lines: ['lines-hsr', 'lines-hsr-mid', 'lines-intercity', 'lines-hsr-local', 'lines-intercity-local'],
    stations: ['stations-major'],
    labels: ['station-labels-hub'],
    targetZoom: 8.5,
  },
  metro: {
    lines: ALL_LINE_LAYER_IDS,
    stations: ALL_STATION_LAYER_IDS,
    labels: ALL_LABEL_LAYER_IDS,
    targetZoom: 12.5,
  },
};
