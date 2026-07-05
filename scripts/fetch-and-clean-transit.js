#!/usr/bin/env node
/**
 * Overpass → clean GeoJSON pipeline for East Asia Railway Map.
 * Fetches OSM transit data, strips bloat, simplifies geometry, writes public/data/*_clean.json
 *
 * Usage:
 *   node scripts/fetch-and-clean-transit.js
 *   node scripts/fetch-and-clean-transit.js --region=hongkong
 *   node scripts/fetch-and-clean-transit.js --bootstrap   # convert existing topo → clean (offline)
 */

const fs = require('fs');
const path = require('path');
const { feature } = require('topojson-client');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'data');

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const RAILWAY_WAYS = /^(rail|subway|tram|light_rail)$/;
const RAILWAY_STATIONS = /^(station|halt|tram_stop)$/;
const SKIP_SERVICE = new Set(['siding', 'yard', 'spur', 'crossover']);

const REGION_TOLERANCE = {
  hongkong: 0.00006,
  macau: 0.00006,
  taiwan: 0.0001,
  china: 0.002,
  japan: 0.0012,
  default: 0.00012,
};

const KEEP_TAGS = new Set([
  'name', 'name:en', 'name:zh', 'name:zh-Hant', 'name:zh-HK', 'name:zh-TW', 'name:ja',
  'railway', 'color', 'colour', 'highspeed', 'operator', 'network', 'usage', 'service',
]);

const REGIONS = {
  hongkong: {
    file: 'hongkong_clean.json',
    bboxes: [[22.15, 113.83, 22.57, 114.45]],
    merged: true,
  },
  macau: {
    file: 'macau_clean.json',
    bboxes: [[22.1, 113.52, 22.22, 113.62]],
    merged: true,
  },
  taiwan: {
    file: 'taiwan_clean.json',
    bboxes: [[21.9, 119.3, 25.3, 122.0]],
    merged: true,
  },
  china: {
    file: 'china_clean.json',
    merged: false,
    bboxes: [
      [18.0, 73.5, 28.0, 88.0], [18.0, 88.0, 28.0, 102.0], [18.0, 102.0, 28.0, 116.0],
      [18.0, 116.0, 28.0, 122.0], [18.0, 122.0, 28.0, 135.0],
      [28.0, 73.5, 38.0, 88.0], [28.0, 88.0, 38.0, 102.0], [28.0, 102.0, 38.0, 116.0],
      [28.0, 116.0, 38.0, 122.0], [28.0, 122.0, 38.0, 135.0],
      [38.0, 73.5, 48.0, 88.0], [38.0, 88.0, 48.0, 102.0], [38.0, 102.0, 48.0, 116.0],
      [38.0, 116.0, 48.0, 122.0], [38.0, 122.0, 48.0, 135.0],
    ],
  },
  japan: {
    file: 'japan_clean.json',
    merged: false,
    bboxes: [
      { slug: 'hokkaido', bbox: [41.0, 139.0, 45.9, 146.0] },
      { slug: 'tohoku', bbox: [36.0, 137.0, 41.5, 141.5] },
      { slug: 'kanto-chubu', bbox: [34.5, 136.0, 37.5, 141.0] },
      { slug: 'kansai-chugoku', bbox: [33.0, 130.0, 36.0, 137.0] },
      { slug: 'shikoku', bbox: [33.0, 131.0, 35.5, 135.5] },
      { slug: 'kyushu-okinawa', bbox: [24.0, 122.0, 32.0, 132.0] },
    ],
  },
};

/* ─── Geometry utils ─── */
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
  const proj = [a[0] + t * dx, a[1] + t * dy];
  return Math.sqrt(sqDist(point, proj));
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

function simplifyLine(coords, tolerance = 0.00008) {
  if (coords.length <= 2) return roundCoords(coords);
  return roundCoords(douglasPeucker(coords, tolerance));
}
function pickTags(tags) {
  const out = {};
  for (const [k, v] of Object.entries(tags || {})) {
    if (KEEP_TAGS.has(k)) out[k] = v;
  }
  return out;
}

function isHsr(tags) {
  if (tags.highspeed === 'yes') return true;
  const op = `${tags.operator || ''}${tags.network || ''}${tags.name || ''}`;
  if (/高铁|高鐵|shinkansen|新幹線|high.?speed|HSR|CRH|台湾高铁|台灣高鐵/i.test(op)) return true;
  return false;
}

function classifyRailType(tags) {
  const rw = tags.railway;
  if (rw === 'light_rail' || rw === 'tram') return 'tram';
  if (rw === 'subway') return 'subway';
  if (isHsr(tags)) return 'hsr';
  return 'rail';
}

function hasDisplayName(tags) {
  return !!(tags.name || tags['name:en'] || tags['name:zh'] || tags['name:zh-Hant'] || tags['name:zh-HK'] || tags['name:zh-TW']);
}

function shouldKeepStation(tags, macroRegion) {
  if (macroRegion === 'hongkong' || macroRegion === 'macau' || macroRegion === 'taiwan') return true;
  return hasDisplayName(tags);
}

function shouldSkipWay(tags) {
  if (SKIP_SERVICE.has(tags?.service)) return true;
  return false;
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

function slimProperties(tags, rail_type, macroRegion, el, line_color) {
  const p = {
    osm_id: el.id,
    osm_type: el.type === 'way' ? 'way' : 'node',
    macro_region: macroRegion,
    railway: tags.railway,
    rail_type,
    line_color,
  };
  if (tags.name) p.name = tags.name;
  if (tags['name:en']) p['name:en'] = tags['name:en'];
  if (tags['name:zh-Hant']) p['name:zh-Hant'] = tags['name:zh-Hant'];
  else if (tags['name:zh']) p['name:zh'] = tags['name:zh'];
  if (tags['name:zh-HK']) p['name:zh-HK'] = tags['name:zh-HK'];
  if (tags['name:zh-TW']) p['name:zh-TW'] = tags['name:zh-TW'];
  if (tags.color) p.color = tags.color;
  if (rail_type === 'hsr') p.is_hsr = 1;
  return p;
}

function defaultColor(railType, tags) {
  if (tags.color || tags.colour) return tags.color || tags.colour;
  const map = { hsr: '#FF3040', rail: '#3B82F6', subway: '#22C55E', tram: '#F97316' };
  return map[railType] || '#888888';
}

function slimStationProps(tags, macroRegion, el) {
  const p = {
    osm_id: el.id ?? el.properties?.osm_id,
    osm_type: 'node',
    macro_region: macroRegion,
    railway: tags.railway || 'station',
  };
  if (tags.name) p.name = tags.name;
  if (tags['name:en']) p['name:en'] = tags['name:en'];
  if (tags['name:zh-Hant']) p['name:zh-Hant'] = tags['name:zh-Hant'];
  else if (tags['name:zh']) p['name:zh'] = tags['name:zh'];
  if (tags['name:zh-HK']) p['name:zh-HK'] = tags['name:zh-HK'];
  if (tags['name:zh-TW']) p['name:zh-TW'] = tags['name:zh-TW'];
  return p;
}

function osmToFeatures(elements, macroRegion) {
  const tol = REGION_TOLERANCE[macroRegion] || REGION_TOLERANCE.default;
  const lines = [];
  const stations = [];

  for (const el of elements) {
    if (el.type === 'way' && el.tags?.railway && RAILWAY_WAYS.test(el.tags.railway)) {
      if (shouldSkipWay(el.tags) || !el.geometry?.length) continue;
      const coords = simplifyLine(el.geometry.map((g) => [g.lon, g.lat]), tol);
      if (coords.length < 2 || lineLengthSq(coords) < 1e-8) continue;
      const tags = pickTags(el.tags);
      const rail_type = classifyRailType(tags);
      const line_color = defaultColor(rail_type, tags);
      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: slimProperties(tags, rail_type, macroRegion, el, line_color),
      });
    }

    if (el.type === 'node' && el.tags?.railway && RAILWAY_STATIONS.test(el.tags.railway)) {
      const tags = pickTags(el.tags);
      if (!shouldKeepStation(tags, macroRegion)) continue;
      stations.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [round5(el.lon), round5(el.lat)] },
        properties: slimStationProps(tags, macroRegion, el),
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

function buildOverpassQuery([south, west, north, east]) {
  return `
[out:json][timeout:240];
(
  way["railway"~"^(rail|subway|tram|light_rail)$"](${south},${west},${north},${east});
);
out geom;
(
  node["railway"~"^(station|halt|tram_stop)$"](${south},${west},${north},${east});
);
out;
`.trim();
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function queryOverpass(bbox, attempt = 0) {
  const query = buildOverpassQuery(bbox);
  const url = OVERPASS_URLS[attempt % OVERPASS_URLS.length];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) {
    if (attempt < 4) {
      await sleep(3000 * (attempt + 1));
      return queryOverpass(bbox, attempt + 1);
    }
    throw new Error(`Overpass ${res.status} for bbox ${bbox.join(',')}`);
  }
  const json = await res.json();
  return json.elements || [];
}

function writeCleanFile(relativePath, regionId, macroRegion, lines, stations, source = 'overpass') {
  const dedupedLines = mergeDedup(lines);
  const dedupedStations = mergeDedup(stations);
  const payload = {
    version: 1,
    region: regionId,
    macro_region: macroRegion,
    updated: new Date().toISOString(),
    source,
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
    const rail_type = classifyRailType({ ...tags, railway: rw });
    const line_color = f.properties?.line_color || defaultColor(rail_type, tags);
    const fakeEl = { id: f.properties?.osm_id, type: 'way' };
    const coords = f.geometry?.coordinates;
    if (!coords) continue;
    const pushLine = (seg) => {
      const simplified = simplifyLine(seg, tol);
      if (simplified.length < 2 || lineLengthSq(simplified) < 1e-8) return;
      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: simplified },
        properties: slimProperties({ ...tags, railway: rw }, rail_type, macroRegion, fakeEl, line_color),
      });
    };
    if (f.geometry.type === 'MultiLineString') {
      for (const seg of coords) pushLine(seg);
    } else {
      pushLine(coords);
    }
  }

  for (const f of stationFC.features || []) {
    const c = f.geometry?.coordinates;
    if (!c) continue;
    const tags = pickTags(f.properties);
    if (!shouldKeepStation(tags, macroRegion)) continue;
    stations.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [round5(c[0]), round5(c[1])] },
      properties: slimStationProps(tags, macroRegion, { id: f.properties?.osm_id }),
    });
  }
  return { lines, stations };
}

async function fetchRegion(macroRegion, def) {
  console.log(`\n▶ Fetching ${macroRegion} (${def.bboxes.length} tile(s))…`);
  const results = [];
  const acc = { lines: [], stations: [] };

  for (let i = 0; i < def.bboxes.length; i++) {
    const entry = def.bboxes[i];
    const bbox = entry.bbox || entry;
    const slug = entry.slug || `${macroRegion}-tile-${String(i).padStart(2, '0')}`;
    const regionId = slug.includes('-') ? slug : `${macroRegion}-${slug}`;
    const relPath = def.merged ? def.file : `clean/${regionId}.json`;
    console.log(`  tile ${i + 1}/${def.bboxes.length} → ${relPath}`);
    try {
      const elements = await queryOverpass(bbox);
      const { lines, stations } = osmToFeatures(elements, macroRegion);
      if (def.merged) {
        acc.lines = acc.lines.concat(lines);
        acc.stations = acc.stations.concat(stations);
      } else {
        results.push(writeCleanFile(relPath, regionId, macroRegion, lines, stations));
      }
    } catch (err) {
      console.warn(`    ⚠ tile failed: ${err.message}`);
    }
    if (i < def.bboxes.length - 1) await sleep(2000);
  }

  if (def.merged) {
    results.push(writeCleanFile(def.file, macroRegion, macroRegion, acc.lines, acc.stations));
  }
  return results;
}

function bootstrapFromTopo(macroRegion, def) {
  console.log(`\n▶ Bootstrap ${macroRegion} from existing topo…`);
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
    console.warn(`  no topo source for ${macroRegion}, skipping`);
    return [];
  }

  if (def.merged) {
    let allLines = [];
    let allStations = [];
    for (const { path: filePath } of tryFiles) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const chunk = topoToFeatures(raw, macroRegion, tol);
      allLines = allLines.concat(chunk.lines);
      allStations = allStations.concat(chunk.stations);
    }
    results.push(writeCleanFile(def.file, macroRegion, macroRegion, allLines, allStations, 'topo-bootstrap'));
    return results;
  }

  for (const { path: filePath, slug } of tryFiles) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const { lines, stations } = topoToFeatures(raw, macroRegion, tol);
    results.push(writeCleanFile(`clean/${slug}.json`, slug, macroRegion, lines, stations, 'topo-bootstrap'));
  }
  return results;
}

function writeManifest(allResults) {
  const files = allResults.flat().filter(Boolean);
  const manifest = {
    version: 1,
    updated: new Date().toISOString(),
    files,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'clean-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n✓ clean-manifest.json — ${files.length} file(s)`);
}

async function main() {
  const args = process.argv.slice(2);
  const bootstrap = args.includes('--bootstrap');
  const regionArg = args.find((a) => a.startsWith('--region='));
  const onlyRegion = regionArg ? regionArg.split('=')[1] : null;

  const targets = onlyRegion
    ? { [onlyRegion]: REGIONS[onlyRegion] }
    : REGIONS;

  if (onlyRegion && !REGIONS[onlyRegion]) {
    console.error(`Unknown region: ${onlyRegion}`);
    process.exit(1);
  }

  console.log('East Asia Railway — fetch & clean pipeline');
  console.log(`Mode: ${bootstrap ? 'bootstrap (topo → clean)' : 'Overpass API'}`);

  const results = [];
  for (const [id, def] of Object.entries(targets)) {
    if (bootstrap) {
      results.push(...bootstrapFromTopo(id, def));
    } else {
      try {
        results.push(...(await fetchRegion(id, def)));
      } catch (err) {
        console.error(`✗ ${id} failed:`, err.message);
        console.log(`  falling back to topo bootstrap for ${id}…`);
        results.push(...bootstrapFromTopo(id, def));
      }
    }
  }

  writeManifest(results);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
