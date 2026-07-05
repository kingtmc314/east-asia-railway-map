/**
 * 日本區域 bbox 定義
 * bbox 格式: [south, west, north, east]
 */
export const JAPAN_REGIONS = [
  { id: 'hokkaido', label: '北海道', bbox: [41.0, 139.0, 45.9, 146.0] },
  { id: 'tohoku', label: '東北', bbox: [36.0, 137.0, 41.5, 141.5] },
  { id: 'kanto-chubu', label: '關東・中部', bbox: [34.5, 136.0, 37.5, 141.0] },
  { id: 'kansai-chugoku', label: '關西・中國', bbox: [33.5, 131.0, 36.0, 137.5] },
  { id: 'shikoku', label: '四國', bbox: [32.5, 132.0, 34.5, 134.5] },
  { id: 'kyushu-okinawa', label: '九州・沖繩', bbox: [24.0, 124.0, 34.0, 132.5] },
];

export function manifestBboxFromRegion(region) {
  const [s, w, n, e] = region.bbox;
  return [w, s, e, n];
}
