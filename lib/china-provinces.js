/**
 * 中國大陸省級/區域 bbox 定義
 * bbox 格式: [south, west, north, east]
 */
import { assignFeatureToSingleRegion, bucketFeaturesByRegion } from './region-split.js';

export { assignFeatureToSingleRegion, bucketFeaturesByRegion };

export const CHINA_PROVINCES = [
  { id: 'heilongjiang', label: '黑龙江', bbox: [43.2, 121.0, 53.6, 135.1] },
  { id: 'jilin', label: '吉林', bbox: [40.5, 121.8, 46.3, 131.3] },
  { id: 'liaoning', label: '辽宁', bbox: [38.7, 118.5, 43.5, 125.5] },
  { id: 'inner-mongolia-ne', label: '内蒙古东北', bbox: [42.0, 117.0, 50.0, 126.0] },
  { id: 'inner-mongolia-nw', label: '内蒙古西北', bbox: [42.0, 108.0, 50.0, 117.0] },
  { id: 'inner-mongolia-central', label: '内蒙古中部', bbox: [38.0, 111.0, 43.0, 119.0] },
  { id: 'inner-mongolia-south', label: '内蒙古南部', bbox: [37.0, 108.0, 42.0, 115.0] },
  { id: 'inner-mongolia-west', label: '内蒙古西', bbox: [37.0, 97.0, 50.0, 108.0] },
  { id: 'beijing', label: '北京', bbox: [39.4, 115.4, 41.1, 117.5] },
  { id: 'tianjin', label: '天津', bbox: [38.5, 116.7, 40.3, 118.1] },
  { id: 'hebei-north', label: '河北北', bbox: [39.0, 113.4, 42.6, 119.9] },
  { id: 'hebei-south', label: '河北南', bbox: [36.0, 113.4, 39.0, 119.9] },
  { id: 'shanxi', label: '山西', bbox: [34.5, 110.2, 40.7, 114.6] },
  { id: 'shandong', label: '山东', bbox: [34.4, 114.8, 38.4, 122.7] },
  { id: 'henan', label: '河南', bbox: [31.4, 110.3, 36.4, 116.7] },
  { id: 'shaanxi', label: '陕西', bbox: [31.7, 105.5, 39.6, 111.3] },
  { id: 'gansu', label: '甘肃', bbox: [32.6, 92.3, 42.8, 108.7] },
  { id: 'ningxia', label: '宁夏', bbox: [35.2, 104.2, 39.4, 107.6] },
  { id: 'qinghai', label: '青海', bbox: [31.6, 89.4, 39.2, 103.0] },
  { id: 'xinjiang', label: '新疆', bbox: [34.3, 73.5, 49.2, 96.4] },
  { id: 'tibet', label: '西藏', bbox: [26.8, 78.4, 36.5, 99.1] },
  { id: 'sichuan', label: '四川', bbox: [26.0, 97.3, 34.3, 108.5] },
  { id: 'chongqing', label: '重庆', bbox: [28.1, 105.3, 32.2, 110.2] },
  { id: 'yunnan', label: '云南', bbox: [21.1, 97.5, 29.2, 106.2] },
  { id: 'guizhou', label: '贵州', bbox: [24.6, 103.6, 29.2, 109.6] },
  { id: 'guangxi', label: '广西', bbox: [20.9, 104.4, 26.4, 112.1] },
  { id: 'hainan', label: '海南', bbox: [18.1, 108.6, 20.2, 111.1] },
  { id: 'guangdong', label: '广东', bbox: [20.2, 109.6, 25.5, 117.3] },
  { id: 'hunan', label: '湖南', bbox: [24.6, 108.8, 30.1, 114.3] },
  { id: 'hubei', label: '湖北', bbox: [29.0, 108.3, 33.3, 116.1] },
  { id: 'jiangxi', label: '江西', bbox: [24.5, 113.6, 30.1, 118.5] },
  { id: 'anhui', label: '安徽', bbox: [29.4, 114.9, 34.7, 119.7] },
  { id: 'jiangsu', label: '江苏', bbox: [30.7, 116.4, 35.1, 121.9] },
  { id: 'shanghai', label: '上海', bbox: [30.7, 120.8, 31.9, 122.0] },
  { id: 'zhejiang', label: '浙江', bbox: [27.0, 118.0, 31.2, 123.0] },
  { id: 'fujian', label: '福建', bbox: [23.5, 116.0, 28.3, 120.5] },
];

export function getFeatureBbox(feature) {
  const coords = [];
  const geom = feature.geometry;
  if (geom.type === 'Point') {
    coords.push(geom.coordinates);
  } else if (geom.type === 'LineString') {
    coords.push(...geom.coordinates);
  }
  if (!coords.length) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

export function assignFeatureToProvinces(feature) {
  const id = assignFeatureToSingleRegion(feature, CHINA_PROVINCES);
  return id ? [id] : ['other'];
}

export function manifestBbox(province) {
  const [s, w, n, e] = province.bbox;
  return [w, s, e, n];
}
