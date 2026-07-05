#!/usr/bin/env node
/**
 * East Asia Railway — dual-track Overpass pipeline (RailsMaps-grade).
 * Route relations + standalone station nodes → slim GeoJSON shards.
 *
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
const USER_AGENT = 'east-asia-railway-map/4.0 (github.com/kingtmc314/east-asia-railway-map)';
const TILE_PAUSE_MS = 5000;
const MAX_SHARD_MB = 3.2;

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const ROUTE_RE = /^(train|subway|light_rail|tram|monorail)$/;
const STOP_ROLES = /^(stop|stop_entry_only|station|platform)$/;
const RAIL_WAYS = /^(rail|subway|tram|light_rail|monorail|narrow_gauge)$/;
const SKIP_SERVICE = new Set(['siding', 'yard', 'spur', 'crossover']);

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

const TOLERANCE = {
  hongkong: 0.00006, macau: 0.00005, taiwan: 0.0001,
  china: 0.002, japan: 0.0012, default: 0.00012,
};

const KEEP = new Set([
  'name', 'name:en', 'name:zh', 'name:zh-Hant', 'name:zh-HK', 'name:zh-TW', 'name:ja',
  'railway', 'color', 'colour', 'ref_colour', 'highspeed', 'bullet_train',
  'operator', 'network', 'route', 'station', 'subway', 'train', 'tram', 'light_rail',
]);

const REGIONS = {
  hongkong: {
    iso: 'HK', file: 'hongkong_clean.json', merged: true,
    bboxes: [[22.15, 113.83, 22.57, 114.45]],
  },
  macau: {
    iso: 'MO', file: 'macau_clean.json', merged: true,
    bboxes: [[22.05, 113.51, 22.23, 113.65]],
  },
  taiwan: {
    iso: 'TW', file: 'taiwan_clean.json', merged: true,
    bboxes: [[21.9, 119.3, 25.3, 122.0]],
  },
  china: {
    iso: 'CN', merged: false,
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
    iso: 'JP', merged: false,
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

/* ─── geometry ─── */
const round5 = (n) => Math.round(n * 1e5) / 1e5;
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

function isHighspeed(t) {
  if (t.highspeed === 'yes' || t.bullet_train === 'yes') return true;
  return /高铁|高鐵|shinkansen|新幹線|high.?speed|hsr|crh|bullet|台湾高铁|台灣高鐵/.test(blob(t));
}

function routeType(route, t) {
  if (route === 'subway') return 'subway';
  if (route === 'light_rail' || route === 'tram' || route === 'monorail') return 'tram';
  if (route === 'train') return isHighspeed(t) ? 'highspeed' : 'rail';
  return 'rail';
}

function classifyStation(t, macro, inherited) {
  if (inherited) return inherited;
  if (isHighspeed(t)) return 'highspeed';
  if (t.railway === 'subway' || t.station === 'subway' || t.subway === 'yes') return 'subway';
  if (/subway|metro|mtr|地下鐵|地下铁|捷運|捷运|地铁|轨道交通|都営|東京メトロ|东京地下|toei/.test(blob(t))) return 'subway';
  if (t.railway === 'tram' || t.railway === 'light_rail' || t.tram === 'yes' || t.light_rail === 'yes') return 'tram';
  if (/light.?rail|輕軌|轻轨|tram|路面電|路面电/.test(blob(t))) return 'tram';
  if (macro === 'china' && /高铁站|高鐵站|客运|火车站/.test(`${t.name || ''}`)) return isHighspeed(t) ? 'highspeed' : 'rail';
  return 'rail';
}

function classifyWay(t, inherited) {
  if (inherited) return inherited;
  if (t.railway === 'subway') return 'subway';
  if (t.railway === 'tram' || t.railway === 'light_rail' || t.railway === 'monorail') return 'tram';
  if (isHighspeed(t)) return 'highspeed';
  return 'rail';
}

function resolveColor(type, macro, t, inherited) {
  return inherited
    || normColor(t.colour || t.color || t.ref_colour)
    || REGION_COLOR[macro]?.[type]
    || TYPE_COLOR[type]
    || '#888888';
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

function buildInheritance(relations) {
  const wayMeta = new Map();
  const nodeMeta = new Map();
  for (const rel of relations) {
    const route = rel.tags?.route;
    if (!route || !ROUTE_RE.test(route)) continue;
    const railway_type = routeType(route, rel.tags);
    const color = normColor(rel.tags.colour || rel.tags.color || rel.tags.ref_colour);
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

function lineProps(t, macro, el, meta) {
  const railway_type = classifyWay(t, meta?.railway_type);
  const color = resolveColor(railway_type, macro, t, meta?.color);
  const line_name = meta?.line_name || t.name || t.ref || null;
  return {
    osm_id: el.id, osm_type: 'way', macro_region: macro,
    railway_type, color, line_name,
    relation_id: meta?.relation_id || null,
    ...names(t, line_name),
  };
}

function stationProps(t, macro, el, meta) {
  const railway_type = classifyStation(t, macro, meta?.railway_type);
  return {
    osm_id: el.id, osm_type: 'node', macro_region: macro, railway_type,
    ...(meta?.line_name ? { line_name: meta.line_name } : {}),
    ...(meta?.color ? { color: meta.color } : {}),
    ...names(t),
  };
}

function osmToFeatures(elements, macro) {
  const tol = TOLERANCE[macro] || TOLERANCE.default;
  const relations = elements.filter((e) => e.type === 'relation');
  const { wayMeta, nodeMeta } = buildInheritance(relations);
  const lines = [];
  const stations = [];
  const seenW = new Set();
  const seenN = new Set();

  for (const el of elements) {
    if (el.type === 'way') {
      const meta = wayMeta.get(el.id);
      const t = el.tags || {};
      if (!meta && !(t.railway && RAIL_WAYS.test(t.railway))) continue;
      if (SKIP_SERVICE.has(t.service)) continue;
      if (!el.geometry?.length || seenW.has(el.id)) continue;
      const coords = simplify(el.geometry.map((g) => [g.lon, g.lat]), tol);
      if (coords.length < 2 || lenSq(coords) < 1e-8) continue;
      seenW.add(el.id);
      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: lineProps(pick(t), macro, el, meta),
      });
    }
    if (el.type === 'node') {
      const meta = nodeMeta.get(el.id);
      const t = el.tags || {};
      const isStop = !!meta;
      const isSta = t.railway === 'station' || t.railway === 'halt' || t.railway === 'tram_stop';
      if (!isStop && !isSta) continue;
      if (seenN.has(el.id)) continue;
      const lon = el.lon ?? el.geometry?.[0];
      const lat = el.lat ?? el.geometry?.[1];
      if (lon == null || lat == null) continue;
      if (!isStop && macro !== 'hongkong' && macro !== 'macau' && macro !== 'taiwan') {
        if (!t.name && !t['name:en'] && !t['name:zh']) continue;
      }
      seenN.add(el.id);
      stations.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [round5(lon), round5(lat)] },
        properties: stationProps(pick(t), macro, el, meta),
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

/** Dual-track Overpass: relations + station nodes → member ways with geom only */
function buildQuery({ iso, bbox }) {
  const route = 'relation["type"="route"]["route"~"train|subway|light_rail|tram|monorail"]';
  const nodes = 'node["railway"~"station|halt|tram_stop"]';
  if (iso && bbox) {
    const [s, w, n, e] = bbox;
    return `[out:json][timeout:300];
area["ISO3166-1"="${iso}"]->.searchArea;
(
  ${route}(area.searchArea);
  ${nodes}(area.searchArea);
);
out tags;
>;
out tags geom qt;`;
  }
  if (iso) {
    return `[out:json][timeout:300];
area["ISO3166-1"="${iso}"]->.searchArea;
(
  ${route}(area.searchArea);
  ${nodes}(area.searchArea);
);
out tags;
>;
out tags geom qt;`;
  }
  const [s, w, n, e] = bbox;
  return `[out:json][timeout:300];
(
  ${route}(${s},${w},${n},${e});
  ${nodes}(${s},${w},${n},${e});
);
out tags;
>;
out tags geom qt;`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function curlQuery(url, query) {
  const out = execFileSync('curl', [
    '-sfS', '--max-time', '300', '-A', USER_AGENT,
    '-X', 'POST', '-H', 'Content-Type: application/x-www-form-urlencoded',
    '--data-urlencode', `data=${query}`, url,
  ], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  return JSON.parse(out).elements || [];
}

async function overpass(query, attempt = 0) {
  const url = OVERPASS_URLS[attempt % OVERPASS_URLS.length];
  try {
    return curlQuery(url, query);
  } catch (err) {
    if (attempt < 4) {
      const wait = 8000 * (attempt + 1);
      console.warn(`    retry ${attempt + 1} in ${wait / 1000}s — ${err.message}`);
      await sleep(wait);
      return overpass(query, attempt + 1);
    }
    throw err;
  }
}

async function fetchTile(def, bbox) {
  const modes = [];
  if (def.iso && def.merged) modes.push({ iso: def.iso, bbox: null });
  if (def.iso) modes.push({ iso: def.iso, bbox });
  modes.push({ iso: null, bbox });

  for (const m of modes) {
    try {
      const els = await overpass(buildQuery(m));
      if (els.length) return els;
    } catch (err) {
      if (m === modes[modes.length - 1]) throw err;
      console.warn(`    fallback query: ${err.message}`);
    }
  }
  return [];
}

function writeShard(relPath, regionId, macro, lines, stations, source = 'overpass') {
  let dl = dedup(lines);
  let ds = dedup(stations);
  const outPath = path.join(OUT_DIR, relPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  let payload = JSON.stringify({
    type: 'FeatureCollection', version: 4, region: regionId, macro_region: macro,
    updated: new Date().toISOString(), source,
    features: [...dl, ...ds], lines: dl, stations: ds,
    stats: { lines: dl.length, stations: ds.length },
  });

  let mb = payload.length / (1024 * 1024);
  if (mb > MAX_SHARD_MB) {
    const tol = (TOLERANCE[macro] || 0.001) * 2;
    dl = dl.map((f) => ({
      ...f,
      geometry: {
        type: 'LineString',
        coordinates: simplify(f.geometry.coordinates, tol),
      },
    }));
    payload = JSON.stringify({
      type: 'FeatureCollection', version: 4, region: regionId, macro_region: macro,
      updated: new Date().toISOString(), source,
      features: [...dl, ...ds], lines: dl, stations: ds,
      stats: { lines: dl.length, stations: ds.length },
    });
    mb = payload.length / (1024 * 1024);
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
    if (!rw || !RAIL_WAYS.test(rw) || SKIP_SERVICE.has(f.properties?.service)) continue;
    const t = pick(f.properties);
    const legacy = f.properties?.railway_type;
    const mapped = legacy === 'hsr' ? 'highspeed' : legacy;
    const railway_type = mapped || classifyWay({ ...t, railway: rw }, null);
    const color = resolveColor(railway_type, macro, t, normColor(f.properties?.color));
    const fake = { id: f.properties?.osm_id, type: 'way' };
    const push = (seg) => {
      const c = simplify(seg, tol);
      if (c.length < 2) return;
      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: c },
        properties: lineProps({ ...t, railway: rw }, macro, fake, {
          railway_type, color, line_name: f.properties?.line_name || t.name,
        }),
      });
    };
    if (f.geometry?.type === 'MultiLineString') f.geometry.coordinates.forEach(push);
    else if (f.geometry?.coordinates) push(f.geometry.coordinates);
  }

  for (const f of sf.features || []) {
    const c = f.geometry?.coordinates;
    if (!c) continue;
    const t = pick(f.properties);
    const legacy = f.properties?.railway_type;
    const mapped = legacy === 'hsr' ? 'highspeed' : legacy;
    stations.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [round5(c[0]), round5(c[1])] },
      properties: stationProps(t, macro, { id: f.properties?.osm_id }, {
        railway_type: mapped || classifyStation(t, macro, null),
        line_name: f.properties?.line_name,
        color: normColor(f.properties?.color),
      }),
    });
  }
  return { lines, stations };
}

async function fetchRegion(id, def) {
  console.log(`\n▶ ${id} (${def.bboxes.length} tile(s))`);
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
      const els = await fetchTile(def, bbox);
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
  const merged = {
    version: 4,
    updated: new Date().toISOString(),
    files: [...byFile.values()],
  };
  fs.writeFileSync(manifestPath, JSON.stringify(merged, null, 2));
  console.log(`\n✓ manifest — ${merged.files.length} file(s)`);
}

async function main() {
  const args = process.argv.slice(2);
  const bootstrapMode = args.includes('--bootstrap');
  const regionArg = args.find((a) => a.startsWith('--region='));
  const only = regionArg ? regionArg.split('=')[1] : null;
  const targets = only ? { [only]: REGIONS[only] } : REGIONS;
  if (only && !REGIONS[only]) { console.error(`Unknown: ${only}`); process.exit(1); }

  console.log('East Asia Railway — dual-track geom pipeline v4');
  const results = [];
  for (const [id, def] of Object.entries(targets)) {
    if (bootstrapMode) {
      results.push(...bootstrap(id, def));
    } else {
      const got = await fetchRegion(id, def);
      results.push(...(got.length ? got : bootstrap(id, def)));
    }
    await sleep(3000);
  }
  writeManifest(results);
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
