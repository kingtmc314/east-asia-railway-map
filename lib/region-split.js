/**
 * 區域拆分工具 — 以質心單一歸屬，避免跨區重複
 */

export function getFeatureCentroid(feature) {
  const geom = feature.geometry;
  if (!geom) return null;

  if (geom.type === 'Point') return geom.coordinates;

  if (geom.type === 'LineString' && geom.coordinates.length) {
    const coords = geom.coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    return mid;
  }

  return null;
}

export function bboxArea(bbox) {
  const [s, w, n, e] = bbox;
  return (n - s) * (e - w);
}

export function pointInBbox(lng, lat, bbox) {
  const [s, w, n, e] = bbox;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

/**
 * 將 feature 分配至唯一區域（小區域優先）
 * @param {object} feature
 * @param {Array<{id:string,bbox:number[]}>} regions
 * @returns {string|null}
 */
export function assignFeatureToSingleRegion(feature, regions) {
  const centroid = getFeatureCentroid(feature);
  if (!centroid) return null;

  const [lng, lat] = centroid;
  const sorted = [...regions].sort((a, b) => bboxArea(a.bbox) - bboxArea(b.bbox));

  for (const region of sorted) {
    if (pointInBbox(lng, lat, region.bbox)) return region.id;
  }

  return null;
}

/**
 * 將 features 分桶至各區域
 */
export function bucketFeaturesByRegion(features, regions, fallbackId = 'other') {
  const buckets = new Map();
  for (const r of regions) buckets.set(r.id, []);
  buckets.set(fallbackId, []);

  for (const f of features) {
    const id = assignFeatureToSingleRegion(f, regions) || fallbackId;
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(f);
  }

  return buckets;
}
