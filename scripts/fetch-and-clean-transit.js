#!/usr/bin/env node
/**
 * East Asia Railway — way-only Overpass pipeline (v7).
 * Multi-mirror round-robin + exponential backoff for 429 defence.
 *
 *   node scripts/fetch-and-clean-transit.js
 *   node scripts/fetch-and-clean-transit.js --region=taiwan
 *   node scripts/fetch-and-clean-transit.js --bootstrap
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { feature } = require('topojson-client');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const USER_AGENT = 'east-asia-railway-map/7.0 (github.com/kingtmc314/east-asia-railway-map)';
const REGION_PAUSE_MS = 15000;
const TILE_PAUSE_MS = 15000;
const MAX_SHARD_MB = 1.2;
const MAX_RETRIES = 12;

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

const REGION_ENDPOINT_PREF = {
  taiwan: 'https://overpass.nchc.org.tw/api/interpreter',
  japan: 'https://overpass.kumi.systems/api/interpreter',
};

const RAIL_WAYS = /^(rail|subway|tram|light_rail|monorail|narrow_gauge)$/;
const SKIP_SERVICE = /yard|siding|spur|switch|crossover/i;

const TYPE_COLOR = {
  highspeed: '#E60012',
  rail: '#005A9C',
  subway: '#009E60',
  tram: '#FFD700',
};

const REGION_COLOR = {
  hongkong: { highspeed: '#E60012', rail: '#971018', subway: '#00A040', tram: '#F7931E' },
  macau: { highspeed: '#E60012', rail: '#003DA5', subway: '#0099CC', tram: '#9B1096' },
  taiwan: { highspeed: '#E60012', rail: '#003366', subway: '#007748', tram: '#FFD100' },
  china: { highspeed: '#E60012', rail: '#005A9C', subway: '#009E60', tram: '#FFD700' },
  japan: { highspeed: '#E60012', rail: '#006633', subway: '#009944', tram: '#FF8800' },
};

const OPERATOR_RULES = [
  { re: /mtr|港鐵|mass transit railway/i, color: '#E3002C', type: 'subway' },
  { re: /kcr|九廣|九广|east rail/i, color: '#5EB6E4', type: 'rail' },
  { re: /macao lrt|澳門輕軌|澳门轻轨|mlm|metro ligeiro/i, color: '#9B1096', type: 'tram' },
  { re: /jr east|東日本|东日本|jreast/i, color: '#2E8B57', type: 'rail' },
  { re: /jr central|東海|东海|jrcentral/i, color: '#FF6600', type: 'rail' },
  { re: /jr west|西日本|jrwest/i, color: '#0072BC', type: 'rail' },
  { re: /jr hokkaido|北海道/i, color: '#00A040', type: 'rail' },
  { re: /jr kyushu|九州/i, color: '#E60012', type: 'rail' },
  { re: /tokyo metro|東京メトロ|东京地铁/i, color: '#009944', type: 'subway' },
  { re: /toei|都営/i, color: '#00A040', type: 'subway' },
  { re: /osaka metro|大阪メトロ|大阪地铁/i, color: '#E44D2E', type: 'subway' },
  { re: /crh|china railway high|高铁|高鐵|中国国家铁路.*高速/i, color: '#E60012', type: 'highspeed' },
  { re: /beijing subway|北京地铁|北京地鐵|bjsubway/i, color: '#009BC0', type: 'subway' },
  { re: /shanghai metro|上海地铁|上海地鐵/i, color: '#E3002C', type: 'subway' },
  { re: /guangzhou metro|广州地铁|廣州地鐵/i, color: '#F08300', type: 'subway' },
  { re: /shenzhen metro|深圳地铁|深圳地鐵/i, color: '#00A040', type: 'subway' },
  { re: /mrt|台北捷運|台北捷运|taoyuan metro|桃園捷運/i, color: '#007748', type: 'subway' },
  { re: /thsr|台灣高鐵|台湾高铁|taiwan high speed/i, color: '#FF6600', type: 'highspeed' },
  { re: /tra|台灣鐵路|台湾铁路|taiwan railway/i, color: '#003366', type: 'rail' },
];

const TOLERANCE = {
  hongkong: 0.00006, macau: 0.00005, taiwan: 0.00012,
  china: 0.003, japan: 0.002, default: 0.00015,
};

const KEEP = new Set([
  'name', 'name:en', 'name:zh', 'name:zh-Hant', 'name:zh-HK', 'name:zh-TW', 'name:ja',
  'railway', 'color', 'colour', 'ref_colour', 'highspeed', 'bullet_train',
  'operator', 'network', 'ref',
]);

const REGIONS = {
  hongkong: {
    iso: 'HK', file: 'hongkong_clean.json', merged: true,
    bboxes: [[22.15, 113.83, 22.57, 114.45]],
  },
  macau: {
    iso: null, file: 'macau_clean.json', merged: true,
    bboxes: [[22.05, 113.51, 22.23, 113.65]],
  },
  taiwan: {
    iso: 'TW', file: 'taiwan_clean.json', merged: true,
    bboxes: [[21.9, 119.3, 25.3, 122.0]],
  },
  china: {
    iso: null, merged: false,
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
    iso: null, merged: false,
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

const WAY_SEL = 'way["railway"~"rail|subway|light_rail|tram|monorail"]["service"!~"yard|siding|spur|switch"]["abandoned"!="yes"]["construction"!="yes"]';
const NODE_SEL = 'node["railway"~"station|halt|tram_stop"]';

let mirrorCursor = 0;

const round5 = (n) => parseFloat(Number(n).toFixed(5));
const roundCoords = (c) => c.map(([x, y]) => [round5(x), round5(y)]);

function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (!dx && !dy) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplify(coords, tol) {
  if (coords.length <= 2) return roundCoords(coords);
  let maxD = 0;
  let idx = 0;
  const end = coords.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpDist(coords[i], coords[0], coords[end]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > tol) {
    const L = simplify(coords.slice(0, idx + 1), tol);
    const R = simplify(coords.slice(idx), tol);
    return L.slice(0, -1).concat(R);
  }
  return roundCoords([coords[0], coords[end]]);
}

function lenSq(c) {
  let s = 0;
  for (let i = 1; i < c.length; i++) {
    const dx = c[i][0] - c[i - 1][0];
    const dy = c[i][1] - c[i - 1][1];
    s += dx * dx + dy * dy;
  }
  return s;
}

const pick = (tags) => {
  const o = {};
  for (const [k, v] of Object.entries(tags || {})) if (KEEP.has(k)) o[k] = v;
  return o;
};

const normColor = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^#[0-9A-Fa-f]{3,8}$/.test(s)) return s;
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return `#${s}`;
  return null;
};

const blob = (t) => `${t.operator || ''}${t.network || ''}${t.name || ''}${t.ref || ''}`.toLowerCase();

function matchOperator(t) {
  for (const rule of OPERATOR_RULES) {
    if (rule.re.test(blob(t))) return rule;
  }
  return null;
}

function isHighspeed(t) {
  if (t.highspeed === 'yes' || t.bullet_train === 'yes') return true;
  return /高铁|高鐵|shinkansen|新幹線|high.?speed|hsr|crh|bullet|台湾高铁|台灣高鐵/.test(blob(t));
}

function classifyWay(t) {
  const op = matchOperator(t);
  if (op?.type) return op.type;
  if (t.railway === 'subway') return 'subway';
  if (t.railway === 'tram' || t.railway === 'light_rail' || t.railway === 'monorail') return 'tram';
  if (isHighspeed(t)) return 'highspeed';
  return 'rail';
}

function classifyStation(t, macro) {
  const op = matchOperator(t);
  if (op?.type) return op.type;
  if (isHighspeed(t)) return 'highspeed';
  if (t.railway === 'subway' || t.station === 'subway' || t.subway === 'yes') return 'subway';
  if (/subway|metro|mtr|地下鐵|地下铁|捷運|捷运|地铁|轨道交通|都営|東京メトロ|东京地下|toei|地下鉄/.test(blob(t))) return 'subway';
  if (t.railway === 'tram' || t.railway === 'tram_stop' || t.tram === 'yes' || t.light_rail === 'yes') return 'tram';
  if (/light.?rail|輕軌|轻轨|tram|路面電|路面电/.test(blob(t))) return 'tram';
  if (macro === 'china' && /高铁站|高鐵站|客运|火车站/.test(`${t.name || ''}`)) return isHighspeed(t) ? 'highspeed' : 'rail';
  return 'rail';
}

function resolveColor(type, macro, t) {
  const op = matchOperator(t);
  if (op?.color) return op.color;
  const tag = normColor(t.colour || t.color || t.ref_colour);
  if (tag) return tag;
  return REGION_COLOR[macro]?.[type] || TYPE_COLOR[type] || '#888888';
}

function names(t, fallback) {
  const p = {};
  const n = t.name || fallback;
  if (n) p.name = n;
  if (t['name:en']) { p['name:en'] = t['name:en']; p.name_en = t['name:en']; }
  if (t['name:zh-Hant']) p['name:zh-Hant'] = t['name:zh-Hant'];
  else if (t['name:zh']) p['name:zh'] = t['name:zh'];
  if (t['name:zh-HK']) p['name:zh-HK'] = t['name:zh-HK'];
  if (t['name:zh-TW']) p['name:zh-TW'] = t['name:zh-TW'];
  if (t['name:ja']) p['name:ja'] = t['name:ja'];
  return p;
}

function isJunkWay(t) {
  if (t.abandoned === 'yes' || t.construction === 'yes' || t.disused === 'yes') return true;
  if (t.service && SKIP_SERVICE.test(t.service)) return true;
  if (t.usage === 'industrial' || t.usage === 'military') return true;
  return false;
}

function hasIdentity(t) {
  return !!(t.name || t['name:en'] || t['name:zh'] || t.ref || t.operator || t.network);
}

function lineProps(t, macro, el) {
  const railway_type = classifyWay(t);
  const color = resolveColor(railway_type, macro, t);
  const line_name = t.name || t.ref || t.network || null;
  return {
    osm_id: el.id, osm_type: 'way', macro_region: macro,
    railway_type, color, line_name, ...names(t, line_name),
  };
}

function stationProps(t, macro, el) {
  const railway_type = classifyStation(t, macro);
  return {
    osm_id: el.id, osm_type: 'node', macro_region: macro, railway_type,
    color: resolveColor(railway_type, macro, t), ...names(t),
  };
}

function geomToCoords(geometry) {
  if (!geometry?.length) return [];
  return geometry.map((g) => [round5(g.lon), round5(g.lat)]);
}

function osmToFeatures(elements, macro) {
  const tol = TOLERANCE[macro] || TOLERANCE.default;
  const strict = macro === 'china' || macro === 'japan';
  const lines = [];
  const stations = [];
  const seenL = new Set();
  const seenN = new Set();

  for (const el of elements) {
    if (el.type === 'way') {
      const t = el.tags || {};
      if (!t.railway || !RAIL_WAYS.test(t.railway)) continue;
      if (isJunkWay(t)) continue;
      if (strict && !hasIdentity(t)) continue;
      if (!el.geometry?.length || seenL.has(el.id)) continue;
      const coords = simplify(geomToCoords(el.geometry), tol);
      if (coords.length < 2 || lenSq(coords) < 1e-8) continue;
      seenL.add(el.id);
      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: lineProps(pick(t), macro, el),
      });
    }

    if (el.type === 'node') {
      const t = el.tags || {};
      if (!/^(station|halt|tram_stop)$/.test(t.railway || '')) continue;
      if (seenN.has(el.id)) continue;
      const lon = el.lon ?? el.geometry?.[0];
      const lat = el.lat ?? el.geometry?.[1];
      if (lon == null || lat == null) continue;
      if (strict && !hasIdentity(t)) continue;
      seenN.add(el.id);
      stations.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [round5(lon), round5(lat)] },
        properties: stationProps(pick(t), macro, el),
      });
    }
  }

  return { lines, stations };
}

function dedup(features) {
  const seen = new Set();
  return features.filter((f) => {
    const k = `${f.properties.osm_type}/${f.properties.osm_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function buildQuery({ iso, bbox }) {
  if (iso) {
    return `[out:json][timeout:180];
area["ISO3166-1"="${iso}"]->.searchArea;
(
  ${WAY_SEL}(area.searchArea);
  ${NODE_SEL}(area.searchArea);
);
out tags geom;`;
  }
  const [s, w, n, e] = bbox;
  return `[out:json][timeout:180];
(
  ${WAY_SEL}(${s},${w},${n},${e});
  ${NODE_SEL}(${s},${w},${n},${e});
);
out tags geom;`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function endpointOrder(regionId) {
  const pref = REGION_ENDPOINT_PREF[regionId];
  if (!pref) return OVERPASS_ENDPOINTS;
  return [pref, ...OVERPASS_ENDPOINTS.filter((u) => u !== pref)];
}

function curlQuery(url, query) {
  const raw = execFileSync('curl', [
    '-sS', '--max-time', '180', '-A', USER_AGENT,
    '-w', '\n__HTTP_STATUS__:%{http_code}',
    '-X', 'POST', '-H', 'Content-Type: application/x-www-form-urlencoded',
    '--data-urlencode', `data=${query}`, url,
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });

  const marker = raw.lastIndexOf('\n__HTTP_STATUS__:');
  const body = marker >= 0 ? raw.slice(0, marker) : raw;
  const status = marker >= 0 ? raw.slice(marker + 17).trim() : '200';

  if (status === '429' || status === '503' || status === '504') {
    throw new Error(`HTTP ${status} from ${new URL(url).hostname}`);
  }
  if (!/^2\d\d$/.test(status)) {
    throw new Error(`HTTP ${status} from ${new URL(url).hostname}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`invalid JSON from ${new URL(url).hostname}`);
  }
  if (parsed.remark && /rate|429|too many/i.test(parsed.remark)) {
    throw new Error(`HTTP 429 from ${new URL(url).hostname} — ${parsed.remark}`);
  }
  return parsed.elements || [];
}

async function overpass(query, regionId, attempt = 0) {
  const order = endpointOrder(regionId);
  const url = order[(mirrorCursor + attempt) % order.length];

  try {
    const els = await curlQuery(url, query);
    return els;
  } catch (err) {
    const retriable = /429|503|504|rate|timeout|timed out|reset|empty|invalid json/i.test(err.message);
    if (!retriable || attempt >= MAX_RETRIES) throw err;

    mirrorCursor = (mirrorCursor + 1) % OVERPASS_ENDPOINTS.length;
    const backoffMs = 15000 * (attempt + 1);
    const nextUrl = order[(mirrorCursor + attempt + 1) % order.length];
    console.warn(`    ⚠ ${err.message} — mirror rotate → ${new URL(nextUrl).hostname}, backoff ${backoffMs / 1000}s`);
    await sleep(backoffMs);
    return overpass(query, regionId, attempt + 1);
  }
}

async function fetchTile(def, bbox, regionId) {
  return overpass(buildQuery({ iso: def.iso || null, bbox }), regionId);
}

function shrinkLines(lines, macro, factor) {
  const tol = (TOLERANCE[macro] || 0.001) * factor;
  return lines.map((f) => ({
    ...f,
    geometry: { type: 'LineString', coordinates: simplify(f.geometry.coordinates, tol) },
  }));
}

function writeShard(relPath, regionId, macro, lines, stations, source = 'overpass') {
  let dl = dedup(lines);
  let ds = dedup(stations);
  const outPath = path.join(OUT_DIR, relPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const pack = (lns) => JSON.stringify({
    type: 'FeatureCollection', version: 7, region: regionId, macro_region: macro,
    updated: new Date().toISOString(), source,
    features: [...lns, ...ds], lines: lns, stations: ds,
    stats: { lines: lns.length, stations: ds.length },
  });

  let payload = pack(dl);
  let mb = payload.length / (1024 * 1024);
  let factor = 2;
  while (mb > MAX_SHARD_MB && factor <= 8) {
    dl = shrinkLines(dl, macro, factor);
    payload = pack(dl);
    mb = payload.length / (1024 * 1024);
    factor += 1;
  }

  fs.writeFileSync(outPath, payload);
  console.log(`  ✓ ${relPath} — ${dl.length} lines, ${ds.length} stations (${mb.toFixed(2)} MB)`);
  return {
    region: regionId, macro, file: `/data/${relPath.replace(/\\/g, '/')}`,
    bytes: payload.length, lines: dl.length, stations: ds.length,
  };
}

function topoToFeatures(raw, macro, tol) {
  const lines = [];
  const stations = [];
  if (raw.type !== 'Topology') return { lines, stations };
  const lf = raw.objects.lines ? feature(raw, raw.objects.lines) : { features: [] };
  const sf = raw.objects.stations ? feature(raw, raw.objects.stations) : { features: [] };

  for (const f of lf.features || []) {
    const rw = f.properties?.railway;
    if (!rw || !RAIL_WAYS.test(rw)) continue;
    if (SKIP_SERVICE.test(f.properties?.service || '')) continue;
    const t = pick(f.properties);
    const legacy = f.properties?.railway_type;
    const mapped = legacy === 'hsr' ? 'highspeed' : legacy;
    const railway_type = mapped || classifyWay({ ...t, railway: rw });
    const fake = { id: f.properties?.osm_id, type: 'way' };
    const push = (seg) => {
      const c = simplify(seg, tol);
      if (c.length < 2) return;
      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: c },
        properties: lineProps({ ...t, railway: rw }, macro, fake),
      });
    };
    if (f.geometry?.type === 'MultiLineString') f.geometry.coordinates.forEach(push);
    else if (f.geometry?.coordinates) push(f.geometry.coordinates);
  }

  for (const f of sf.features || []) {
    const c = f.geometry?.coordinates;
    if (!c) continue;
    const t = pick(f.properties);
    stations.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [round5(c[0]), round5(c[1])] },
      properties: stationProps(t, macro, { id: f.properties?.osm_id }),
    });
  }
  return { lines, stations };
}

async function fetchRegion(id, def) {
  console.log(`\n▶ ${id} (${def.bboxes.length} tile(s)) — way-only + mirror pool`);
  const results = [];
  const acc = { lines: [], stations: [] };
  let ok = false;

  for (let i = 0; i < def.bboxes.length; i++) {
    const entry = def.bboxes[i];
    const bbox = entry.bbox || entry;
    const slug = entry.slug || id;
    const rel = def.merged ? def.file : `clean/${slug}.json`;
    console.log(`  [${i + 1}/${def.bboxes.length}] ${rel}`);
    try {
      const els = await fetchTile(def, bbox, id);
      const chunk = osmToFeatures(els, id);
      if (chunk.lines.length || chunk.stations.length) ok = true;
      if (def.merged) {
        acc.lines.push(...chunk.lines);
        acc.stations.push(...chunk.stations);
      } else {
        results.push(writeShard(rel, slug, id, chunk.lines, chunk.stations));
      }
    } catch (err) {
      console.warn(`    ⚠ ${err.message}`);
    }
    if (i < def.bboxes.length - 1) await sleep(TILE_PAUSE_MS);
  }

  if (def.merged && ok) results.push(writeShard(def.file, id, id, acc.lines, acc.stations));
  return results;
}

function bootstrap(id, def) {
  console.log(`\n▶ bootstrap ${id}`);
  const tol = TOLERANCE[id] || TOLERANCE.default;
  const files = [];
  if (id === 'china' || id === 'japan') {
    const dir = path.join(OUT_DIR, id);
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.topo.json'))) {
        files.push({ path: path.join(dir, f), slug: `${id}-${f.replace('.topo.json', '')}` });
      }
    }
  } else {
    const p = path.join(OUT_DIR, `${id}.topo.json`);
    if (fs.existsSync(p)) files.push({ path: p, slug: id });
  }
  if (!files.length) return [];

  if (def.merged) {
    let lines = [];
    let stations = [];
    for (const { path: fp } of files) {
      const c = topoToFeatures(JSON.parse(fs.readFileSync(fp, 'utf8')), id, tol);
      lines = lines.concat(c.lines);
      stations = stations.concat(c.stations);
    }
    return [writeShard(def.file, id, id, lines, stations, 'topo-bootstrap')];
  }
  return files.map(({ path: fp, slug }) => {
    const c = topoToFeatures(JSON.parse(fs.readFileSync(fp, 'utf8')), id, tol);
    return writeShard(`clean/${slug}.json`, slug, id, c.lines, c.stations, 'topo-bootstrap');
  });
}

function writeManifest(results) {
  const files = results.flat().filter(Boolean);
  const manifestPath = path.join(OUT_DIR, 'clean-manifest.json');
  let prev = { files: [] };
  if (fs.existsSync(manifestPath)) {
    try { prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* */ }
  }
  const byFile = new Map((prev.files || []).map((f) => [f.file, f]));
  for (const f of files) byFile.set(f.file, f);
  fs.writeFileSync(manifestPath, JSON.stringify({
    version: 7, updated: new Date().toISOString(), files: [...byFile.values()],
  }, null, 2));
  console.log(`\n✓ manifest — ${byFile.size} file(s)`);
}

async function main() {
  const args = process.argv.slice(2);
  const bootstrapMode = args.includes('--bootstrap');
  const regionArg = args.find((a) => a.startsWith('--region='));
  const only = regionArg ? regionArg.split('=')[1] : null;
  const targets = only ? { [only]: REGIONS[only] } : REGIONS;
  if (only && !REGIONS[only]) { console.error(`Unknown: ${only}`); process.exit(1); }

  console.log('East Asia Railway — way-only mirror pool pipeline v7');
  const results = [];
  for (const [id, def] of Object.entries(targets)) {
    if (bootstrapMode) {
      results.push(...bootstrap(id, def));
    } else {
      const got = await fetchRegion(id, def);
      results.push(...(got.length ? got : bootstrap(id, def)));
    }
    console.log(`  ⏸ resting ${REGION_PAUSE_MS / 1000}s before next region…`);
    await sleep(REGION_PAUSE_MS);
  }
  writeManifest(results);
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
