#!/usr/bin/env node
/**
 * East Asia Railway — Overpass fetch, clean, slice pipeline.
 * Dual-track query: route relations (colour inheritance) + standalone station nodes.
 *
 * Usage:
 *   node scripts/fetch-and-clean-transit.js
 *   node scripts/fetch-and-clean-transit.js --region=macau
 *   node scripts/fetch-and-clean-transit.js --bootstrap
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { feature } = require('topojson-client');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const USER_AGENT = 'east-asia-railway-map/3.0 (github.com/kingtmc314/east-asia-railway-map)';

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const ROUTE_TYPES = /^(train|subway|light_rail|tram|monorail)$/;
const STOP_ROLES = /^(stop|stop_entry_only|station|platform)$/;
const RAILWAY_WAYS = /^(rail|subway|tram|light_rail|monorail|narrow_gauge)$/;
const RAILWAY_STATIONS = /^(station|halt|tram_stop)$/;
const SKIP_SERVICE = new Set(['siding', 'yard', 'spur', 'crossover']);

const AREA_IDS = {
  hongkong: 3600913110,
  macau: 3601867188,
  taiwan: 3600449220,
};

const REGION_TOLERANCE = {
  hongkong: 0.00006,
  macau: 0.00005,
  taiwan: 0.0001,
  china: 0.002,
  japan: 0.0012,
  default: 0.00012,
};

const TYPE_COLOR = {
  highspeed: '#FF3040',
  rail: '#3B82F6',
  subway: '#22C55E',
  tram: '#F97316',
};

const REGION_COLOR = {
  hongkong: { highspeed: '#FF3040', rail: '#971018', subway: '#00A040', tram: '#F7931E' },
  macau: { highspeed: '#E60012', rail: '#003DA5', subway: '#0099CC', tram: '#9B1096' },
  taiwan: { highspeed: '#FF3040', rail: '#003366', subway: '#007748', tram: '#FFD100' },
  china: { highspeed: '#FF3040', rail: '#003DA5', subway: '#00A550', tram: '#FF6600' },
  japan: { highspeed: '#FF3040', rail: '#006633', subway: '#009944', tram: '#FF8800' },
};

const KEEP_TAGS = new Set([
  'name', 'name:en', 'name:zh', 'name:zh-Hant', 'name:zh-HK', 'name:zh-TW', 'name:ja',
  'railway', 'color', 'colour', 'highspeed', 'bullet_train', 'operator', 'network',
  'usage', 'service', 'route', 'station', 'subway', 'train',
]);

const REGIONS = {
  hongkong: {
    file: 'hongkong_clean.json',
    areaId: AREA_IDS.hongkong,
    bboxes: [[22.15, 113.83, 22.57, 114.45]],
    merged: true,
  },
  macau: {
    file: 'macau_clean.json',
    areaId: AREA_IDS.macau,
    bboxes: [[22.05, 113.51, 22.23, 113.65]],
    merged: true,
  },
  taiwan: {
    file: 'taiwan_clean.json',
    areaId: AREA_IDS.taiwan,
    bboxes: [[21.9, 119.3, 25.3, 122.0]],
    merged: true,
  },
  china: {
    merged: false,
    bboxes: [
      { slug: 'china-anhui', bbox: [29.0, 114.0, 35.0, 119.0] },
      { slug: 'china-beijing', bbox: [39.4, 115.4, 41.1, 117.5] },
      { slug: 'china-chongqing', bbox: [28.0, 105.0, 32.5, 110.5] },
      { slug: 'china-fujian', bbox: [23.5, 116.0, 28.5, 120.5] },
      { slug: 'china-gansu', bbox: [32.0, 92.0, 43.0, 109.0] },
      { slug: 'china-guangdong', bbox: [20.0, 109.0, 25.5, 117.5] },
      { slug: 'china-guangxi', bbox: [20.5, 104.0, 26.5, 112.0] },
      { slug: 'china-guizhou', bbox: [24.5, 103.5, 29.5, 109.5] },
      { slug: 'china-hainan', bbox: [18.0, 108.5, 20.5, 111.5] },
      { slug: 'china-hebei-north', bbox: [38.5, 113.5, 42.5, 119.5] },
      { slug: 'china-hebei-south', bbox: [36.0, 113.5, 39.0, 116.5] },
      { slug: 'china-heilongjiang', bbox: [43.0, 121.0, 53.5, 135.0] },
      { slug: 'china-henan', bbox: [31.5, 110.0, 36.5, 116.5] },
      { slug: 'china-hubei', bbox: [29.0, 108.5, 33.5, 116.5] },
      { slug: 'china-hunan', bbox: [24.5, 108.5, 30.5, 114.5] },
      { slug: 'china-inner-mongolia-central', bbox: [40.0, 106.0, 45.0, 112.0] },
      { slug: 'china-inner-mongolia-ne', bbox: [43.0, 115.0, 50.0, 126.0] },
      { slug: 'china-inner-mongolia-nw', bbox: [38.0, 97.0, 43.0, 106.0] },
      { slug: 'china-inner-mongolia-south', bbox: [37.0, 106.0, 42.0, 112.0] },
      { slug: 'china-inner-mongolia-west', bbox: [38.0, 106.0, 43.0, 115.0] },
      { slug: 'china-jiangsu', bbox: [30.5, 116.5, 35.5, 122.0] },
      { slug: 'china-jiangxi', bbox: [24.5, 113.5, 30.5, 118.5] },
      { slug: 'china-jilin', bbox: [40.5, 121.0, 46.5, 131.0] },
      { slug: 'china-liaoning', bbox: [38.5, 118.5, 43.5, 125.5] },
      { slug: 'china-ningxia', bbox: [35.0, 104.0, 39.5, 107.5] },
      { slug: 'china-qinghai', bbox: [31.5, 89.0, 39.5, 103.0] },
      { slug: 'china-shaanxi', bbox: [31.5, 105.5, 39.5, 111.5] },
      { slug: 'china-shandong', bbox: [34.5, 114.5, 38.5, 122.5] },
      { slug: 'china-shanghai', bbox: [30.5, 120.5, 31.9, 122.0] },
      { slug: 'china-shanxi', bbox: [34.5, 110.0, 40.5, 114.5] },
      { slug: 'china-sichuan', bbox: [26.0, 97.0, 34.5, 108.5] },
      { slug: 'china-tianjin', bbox: [38.5, 116.5, 40.5, 118.5] },
      { slug: 'china-tibet', bbox: [26.5, 78.0, 36.5, 99.0] },
      { slug: 'china-xinjiang', bbox: [34.0, 73.0, 49.5, 96.5] },
      { slug: 'china-yunnan', bbox: [21.0, 97.0, 29.5, 106.5] },
      { slug: 'china-zhejiang', bbox: [27.0, 118.0, 31.5, 123.0] },
    ],
  },
  japan: {
    merged: false,
    bboxes: [
      { slug: 'japan-hokkaido', bbox: [41.0, 139.0, 45.9, 146.0] },
      { slug: 'japan-tohoku', bbox: [36.0, 137.0, 41.5, 141.5] },
      { slug: 'japan-kanto-chubu', bbox: [34.5, 136.0, 37.5, 141.0] },
      { slug: 'japan-kansai-chugoku', bbox: [33.0, 130.0, 36.0, 137.0] },
      { slug: 'japan-shikoku', bbox: [33.0, 131.0, 35.5, 135.5] },
      { slug: 'japan-kyushu-okinawa', bbox: [24.0, 122.0, 32.0, 132.0] },
    ],
  },
};

/* ─── Geometry ─── */
function round5(n) {
  return Math.round(n * 1e5) / 1e5;
}

function roundCoords(coords) {
  return coords.map(([lon, lat]) => [round5(lon), round5(lat)]);
}

function sqDist(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function perpDist(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.sqrt(sqDist(point, a));
  const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy);
  return Math.sqrt(sqDist(point, [a[0] + t * dx, a[1] + t * dy]));
}

function douglasPeucker(coords, tolerance) {
  if (coords.length <= 2) return coords;
  let maxD = 0;
  let idx = 0;
  const end = coords.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpDist(coords[i], coords[0], coords[end]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > tolerance) {
    const left = douglasPeucker(coords.slice(0, idx + 1), tolerance);
    const right = douglasPeucker(coords.slice(idx), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [coords[0], coords[end]];
}

function simplifyLine(coords, tolerance) {
  if (coords.length <= 2) return roundCoords(coords);
  return roundCoords(douglasPeucker(coords, tolerance));
}

function lineLengthSq(coords) {
  let len = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    len += dx * dx + dy * dy;
  }
  return len;
}

function pickTags(tags) {
  const out = {};
  for (const [k, v] of Object.entries(tags || {})) {
    if (KEEP_TAGS.has(k)) out[k] = v;
  }
  return out;
}

function normalizeColor(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^#[0-9A-Fa-f]{3,8}$/.test(s)) return s;
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return `#${s}`;
  return s.startsWith('#') ? s : null;
}

function tagBlob(tags) {
  return `${tags.operator || ''}${tags.network || ''}${tags.name || ''}${tags.ref || ''}`.toLowerCase();
}

function isHighspeedTags(tags) {
  if (tags.highspeed === 'yes' || tags.bullet_train === 'yes') return true;
  const blob = tagBlob(tags);
  return /高铁|高鐵|shinkansen|新幹線|high.?speed|hsr|crh|台湾高铁|台灣高鐵|bullet/.test(blob);
}

function routeToType(routeTag, tags) {
  if (routeTag === 'subway') return 'subway';
  if (routeTag === 'light_rail' || routeTag === 'tram' || routeTag === 'monorail') return 'tram';
  if (routeTag === 'train') return isHighspeedTags(tags) ? 'highspeed' : 'rail';
  return 'rail';
}

function classifyStation(tags, macroRegion, inherited) {
  if (inherited) return inherited;
  const t = tags || {};
  if (isHighspeedTags(t)) return 'highspeed';
  if (t.railway === 'subway' || t.station === 'subway' || t.subway === 'yes') return 'subway';
  const blob = tagBlob(t);
  if (/subway|metro|mtr|地下鐵|地下铁|捷運|捷运|轨道交通|都営|東京メトロ|东京地下|toei|metro/.test(blob)) return 'subway';
  if (t.railway === 'tram' || t.railway === 'light_rail' || t.railway === 'monorail') return 'tram';
  if (/light.?rail|輕軌|轻轨|tram|路面電|路面电/.test(blob)) return 'tram';
  if (macroRegion === 'china' && /高铁站|高鐵站|火车站|客运/.test(`${t.name || ''}${t.railway || ''}`) && t.train === 'yes') {
    return isHighspeedTags(t) ? 'highspeed' : 'rail';
  }
  return 'rail';
}

function classifyWay(tags, inherited) {
  if (inherited) return inherited;
  const t = tags || {};
  if (t.railway === 'subway') return 'subway';
  if (t.railway === 'light_rail' || t.railway === 'tram' || t.railway === 'monorail') return 'tram';
  if (isHighspeedTags(t)) return 'highspeed';
  return 'rail';
}

function resolveColor(railwayType, macroRegion, tags, inherited) {
  return inherited
    || normalizeColor(tags?.colour || tags?.color)
    || REGION_COLOR[macroRegion]?.[railwayType]
    || TYPE_COLOR[railwayType]
    || '#888888';
}

function pickNames(tags, fallback) {
  const p = {};
  const name = tags.name || fallback;
  if (name) p.name = name;
  if (tags['name:en']) p['name:en'] = tags['name:en'];
  if (tags['name:zh-Hant']) p['name:zh-Hant'] = tags['name:zh-Hant'];
  else if (tags['name:zh']) p['name:zh'] = tags['name:zh'];
  if (tags['name:zh-HK']) p['name:zh-HK'] = tags['name:zh-HK'];
  if (tags['name:zh-TW']) p['name:zh-TW'] = tags['name:zh-TW'];
  if (tags['name:ja']) p['name:ja'] = tags['name:ja'];
  return p;
}

function shouldSkipWay(tags) {
  return SKIP_SERVICE.has(tags?.service);
}

function hasDisplayName(tags) {
  return !!(tags.name || tags['name:en'] || tags['name:zh'] || tags['name:zh-Hant']
    || tags['name:zh-HK'] || tags['name:zh-TW'] || tags['name:ja']);
}

function shouldKeepStation(tags, macroRegion, forced) {
  if (forced) return true;
  if (macroRegion === 'hongkong' || macroRegion === 'macau' || macroRegion === 'taiwan') return true;
  return hasDisplayName(tags);
}

function buildInheritanceMaps(relations) {
  const wayMeta = new Map();
  const nodeMeta = new Map();

  for (const rel of relations) {
    const route = rel.tags?.route;
    if (!route || !ROUTE_TYPES.test(route)) continue;

    const railway_type = routeToType(route, rel.tags);
    const color = normalizeColor(rel.tags.colour || rel.tags.color);
    const line_name = rel.tags.name || rel.tags['name:en'] || rel.tags.ref || null;

    for (const m of rel.members || []) {
      if (m.type === 'way') {
        const prev = wayMeta.get(m.ref);
        wayMeta.set(m.ref, {
          railway_type: prev?.railway_type || railway_type,
          color: prev?.color || color,
          line_name: prev?.line_name || line_name,
          relation_id: rel.id,
        });
      }
      if (m.type === 'node' && STOP_ROLES.test(m.role || 'stop')) {
        const prev = nodeMeta.get(m.ref);
        nodeMeta.set(m.ref, {
          railway_type: prev?.railway_type || railway_type,
          color: prev?.color || color,
          line_name: prev?.line_name || line_name,
          relation_id: rel.id,
        });
      }
    }
  }

  return { wayMeta, nodeMeta };
}

function lineProps(tags, macroRegion, el, meta) {
  const railway_type = classifyWay(tags, meta?.railway_type);
  const color = resolveColor(railway_type, macroRegion, tags, meta?.color);
  const line_name = meta?.line_name || tags.name || tags.ref || null;
  return {
    osm_id: el.id,
    osm_type: 'way',
    macro_region: macroRegion,
    railway_type,
    color,
    line_name,
    relation_id: meta?.relation_id || null,
    ...pickNames(tags, line_name),
  };
}

function stationProps(tags, macroRegion, el, meta) {
  const railway_type = classifyStation(tags, macroRegion, meta?.railway_type);
  const line_name = meta?.line_name || null;
  return {
    osm_id: el.id ?? el.properties?.osm_id,
    osm_type: 'node',
    macro_region: macroRegion,
    railway_type,
    ...(line_name ? { line_name } : {}),
    ...(meta?.color ? { color: meta.color } : {}),
    ...pickNames(tags),
  };
}

function osmToFeatures(elements, macroRegion) {
  const tol = REGION_TOLERANCE[macroRegion] || REGION_TOLERANCE.default;
  const relations = elements.filter((e) => e.type === 'relation');
  const { wayMeta, nodeMeta } = buildInheritanceMaps(relations);

  const lines = [];
  const stations = [];
  const seenWay = new Set();
  const seenNode = new Set();

  for (const el of elements) {
    if (el.type === 'way') {
      const meta = wayMeta.get(el.id);
      const tags = el.tags || {};
      const inRoute = !!meta;
      const hasRail = tags.railway && RAILWAY_WAYS.test(tags.railway);
      if (!inRoute && !hasRail) continue;
      if (shouldSkipWay(tags)) continue;
      if (!el.geometry?.length) continue;

      const coords = simplifyLine(el.geometry.map((g) => [g.lon, g.lat]), tol);
      if (coords.length < 2 || lineLengthSq(coords) < 1e-8) continue;
      if (seenWay.has(el.id)) continue;
      seenWay.add(el.id);

      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: lineProps(pickTags(tags), macroRegion, el, meta),
      });
    }

    if (el.type === 'node') {
      const meta = nodeMeta.get(el.id);
      const tags = el.tags || {};
      const fromRoute = !!meta;
      const isStation = tags.railway && RAILWAY_STATIONS.test(tags.railway);
      if (!fromRoute && !isStation) continue;
      if (!shouldKeepStation(tags, macroRegion, fromRoute)) continue;
      if (seenNode.has(el.id)) continue;
      seenNode.add(el.id);

      const lon = el.lon ?? el.geometry?.[0];
      const lat = el.lat ?? el.geometry?.[1];
      if (lon == null || lat == null) continue;

      stations.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [round5(lon), round5(lat)] },
        properties: stationProps(pickTags(tags), macroRegion, el, meta),
      });
    }
  }

  return { lines, stations };
}

function mergeDedup(features) {
  const seen = new Set();
  return features.filter((f) => {
    const key = `${f.properties.osm_type}/${f.properties.osm_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Dual-track Overpass: route relations + standalone station nodes */
function buildDualQuery({ areaId, bbox, useArea }) {
  const [south, west, north, east] = bbox;
  const scope = useArea && areaId
    ? `area(${areaId})->.searchArea;(area.searchArea)`
    : `(${south},${west},${north},${east})`;

  if (useArea && areaId) {
    return `
[out:json][timeout:180];
area(${areaId})->.searchArea;
(
  relation["type"="route"]["route"~"train|subway|light_rail|tram|monorail"](area.searchArea);
  node["railway"~"station|halt|tram_stop"](area.searchArea);
);
out body;
>;
out geom qt;
`.trim();
  }

  return `
[out:json][timeout:180];
(
  relation["type"="route"]["route"~"train|subway|light_rail|tram|monorail"]${scope};
  node["railway"~"station|halt|tram_stop"]${scope};
);
out body;
>;
out geom qt;
`.trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function queryOverpassSync(url, query) {
  const out = execFileSync('curl', [
    '-sfS', '--max-time', '180', '-A', USER_AGENT,
    '-X', 'POST', '-H', 'Content-Type: application/x-www-form-urlencoded',
    '--data-urlencode', `data=${query}`, url,
  ], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  return JSON.parse(out).elements || [];
}

async function queryOverpass(query, attempt = 0) {
  const url = OVERPASS_URLS[attempt % OVERPASS_URLS.length];
  try {
    return queryOverpassSync(url, query);
  } catch (err) {
    if (attempt < 4) {
      const wait = 8000 * (attempt + 1);
      console.warn(`    Overpass retry in ${wait / 1000}s (${err.message})`);
      await sleep(wait);
      return queryOverpass(query, attempt + 1);
    }
    throw err;
  }
}

async function queryRegionTile({ areaId, bbox }) {
  const modes = areaId ? [{ useArea: true }, { useArea: false }] : [{ useArea: false }];
  for (const mode of modes) {
    try {
      const elements = await queryOverpass(buildDualQuery({ areaId, bbox, ...mode }));
      if (elements.length) return elements;
    } catch (err) {
      if (mode === modes[modes.length - 1]) throw err;
      console.warn(`    fallback to bbox: ${err.message}`);
    }
  }
  return [];
}

function writeCleanFile(relativePath, regionId, macroRegion, lines, stations, source = 'overpass') {
  const dedupedLines = mergeDedup(lines);
  const dedupedStations = mergeDedup(stations);
  const features = [...dedupedLines, ...dedupedStations];

  const payload = {
    type: 'FeatureCollection',
    version: 3,
    region: regionId,
    macro_region: macroRegion,
    updated: new Date().toISOString(),
    source,
    features,
    lines: dedupedLines,
    stations: dedupedStations,
    stats: { lines: dedupedLines.length, stations: dedupedStations.length },
  };

  const outPath = path.join(OUT_DIR, relativePath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload));

  const bytes = fs.statSync(outPath).size;
  const mb = (bytes / 1024 / 1024).toFixed(2);
  console.log(`  ✓ ${relativePath} — ${dedupedLines.length} lines, ${dedupedStations.length} stations (${mb} MB)`);
  return {
    region: regionId,
    macro: macroRegion,
    file: `/data/${relativePath.replace(/\\/g, '/')}`,
    bytes,
    lines: dedupedLines.length,
    stations: dedupedStations.length,
  };
}

function topoToFeatures(raw, macroRegion, tol) {
  const lines = [];
  const stations = [];
  if (raw.type !== 'Topology') return { lines, stations };

  const lineFC = raw.objects.lines ? feature(raw, raw.objects.lines) : { features: [] };
  const stationFC = raw.objects.stations ? feature(raw, raw.objects.stations) : { features: [] };

  for (const f of lineFC.features || []) {
    const rw = f.properties?.railway;
    if (!rw || !RAILWAY_WAYS.test(rw) || shouldSkipWay(f.properties)) continue;
    const tags = pickTags(f.properties);
    const legacy = f.properties?.railway_type || f.properties?.rail_type;
    const mapped = legacy === 'hsr' ? 'highspeed' : legacy;
    const railway_type = mapped || classifyWay({ ...tags, railway: rw }, null);
    const color = resolveColor(railway_type, macroRegion, tags, normalizeColor(f.properties?.color || f.properties?.line_color));
    const fakeEl = { id: f.properties?.osm_id, type: 'way' };
    const coords = f.geometry?.coordinates;
    if (!coords) continue;

    const push = (seg) => {
      const simplified = simplifyLine(seg, tol);
      if (simplified.length < 2 || lineLengthSq(simplified) < 1e-8) return;
      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: simplified },
        properties: lineProps({ ...tags, railway: rw }, macroRegion, fakeEl, {
          railway_type, color, line_name: f.properties?.line_name || tags.name,
        }),
      });
    };

    if (f.geometry.type === 'MultiLineString') for (const seg of coords) push(seg);
    else push(coords);
  }

  for (const f of stationFC.features || []) {
    const c = f.geometry?.coordinates;
    if (!c) continue;
    const tags = pickTags(f.properties);
    if (!shouldKeepStation(tags, macroRegion, false)) continue;
    const legacy = f.properties?.railway_type || f.properties?.rail_type;
    const mapped = legacy === 'hsr' ? 'highspeed' : legacy;
    stations.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [round5(c[0]), round5(c[1])] },
      properties: stationProps(tags, macroRegion, { id: f.properties?.osm_id }, {
        railway_type: mapped || classifyStation(tags, macroRegion, null),
        line_name: f.properties?.line_name,
        color: normalizeColor(f.properties?.color),
      }),
    });
  }

  return { lines, stations };
}

async function fetchRegion(macroRegion, def) {
  console.log(`\n▶ ${macroRegion} (${def.bboxes.length} tile(s))`);
  const results = [];
  const acc = { lines: [], stations: [] };
  let ok = false;

  for (let i = 0; i < def.bboxes.length; i++) {
    const entry = def.bboxes[i];
    const bbox = entry.bbox || entry;
    const slug = entry.slug || `${macroRegion}-tile-${String(i).padStart(2, '0')}`;
    const relPath = def.merged ? def.file : `clean/${slug}.json`;

    console.log(`  [${i + 1}/${def.bboxes.length}] ${relPath}`);
    try {
      const elements = await queryRegionTile({ areaId: def.areaId, bbox });
      const { lines, stations } = osmToFeatures(elements, macroRegion);
      if (lines.length || stations.length) ok = true;
      if (def.merged) {
        acc.lines.push(...lines);
        acc.stations.push(...stations);
      } else {
        results.push(writeCleanFile(relPath, slug, macroRegion, lines, stations));
      }
    } catch (err) {
      console.warn(`    ⚠ ${err.message}`);
    }
    if (i < def.bboxes.length - 1) await sleep(5000);
  }

  if (def.merged && ok) {
    results.push(writeCleanFile(def.file, macroRegion, macroRegion, acc.lines, acc.stations));
  }
  return results;
}

function bootstrapFromTopo(macroRegion, def) {
  console.log(`\n▶ Bootstrap ${macroRegion} from topo…`);
  const tol = REGION_TOLERANCE[macroRegion] || REGION_TOLERANCE.default;
  const results = [];
  const tryFiles = [];

  if (macroRegion === 'china') {
    const dir = path.join(OUT_DIR, 'china');
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.topo.json'))) {
        tryFiles.push({ path: path.join(dir, f), slug: `china-${f.replace('.topo.json', '')}` });
      }
    }
  } else if (macroRegion === 'japan') {
    const dir = path.join(OUT_DIR, 'japan');
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.topo.json'))) {
        tryFiles.push({ path: path.join(dir, f), slug: `japan-${f.replace('.topo.json', '')}` });
      }
    }
  } else {
    const single = path.join(OUT_DIR, `${macroRegion}.topo.json`);
    if (fs.existsSync(single)) tryFiles.push({ path: single, slug: macroRegion });
  }

  if (!tryFiles.length) {
    console.warn(`  no topo for ${macroRegion}`);
    return [];
  }

  if (def.merged) {
    let allLines = [];
    let allStations = [];
    for (const { path: fp } of tryFiles) {
      const chunk = topoToFeatures(JSON.parse(fs.readFileSync(fp, 'utf8')), macroRegion, tol);
      allLines = allLines.concat(chunk.lines);
      allStations = allStations.concat(chunk.stations);
    }
    results.push(writeCleanFile(def.file, macroRegion, macroRegion, allLines, allStations, 'topo-bootstrap'));
    return results;
  }

  for (const { path: fp, slug } of tryFiles) {
    const { lines, stations } = topoToFeatures(JSON.parse(fs.readFileSync(fp, 'utf8')), macroRegion, tol);
    results.push(writeCleanFile(`clean/${slug}.json`, slug, macroRegion, lines, stations, 'topo-bootstrap'));
  }
  return results;
}

function writeManifest(allResults) {
  const files = allResults.flat().filter(Boolean);
  fs.writeFileSync(
    path.join(OUT_DIR, 'clean-manifest.json'),
    JSON.stringify({ version: 3, updated: new Date().toISOString(), files }, null, 2)
  );
  console.log(`\n✓ manifest — ${files.length} file(s)`);
}

async function main() {
  const args = process.argv.slice(2);
  const bootstrap = args.includes('--bootstrap');
  const regionArg = args.find((a) => a.startsWith('--region='));
  const only = regionArg ? regionArg.split('=')[1] : null;
  const targets = only ? { [only]: REGIONS[only] } : REGIONS;

  if (only && !REGIONS[only]) {
    console.error(`Unknown region: ${only}`);
    process.exit(1);
  }

  console.log('East Asia Railway — dual-track Overpass pipeline');
  console.log(`Mode: ${bootstrap ? 'topo bootstrap' : 'live Overpass'}`);

  const results = [];
  for (const [id, def] of Object.entries(targets)) {
    if (bootstrap) {
      results.push(...bootstrapFromTopo(id, def));
      continue;
    }
    const fetched = await fetchRegion(id, def);
    if (fetched.length) {
      results.push(...fetched);
    } else {
      console.log(`  falling back to topo for ${id}`);
      results.push(...bootstrapFromTopo(id, def));
    }
    await sleep(3000);
  }

  writeManifest(results);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
