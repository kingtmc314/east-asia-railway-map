#!/usr/bin/env node
/**
 * 從 Overpass API 抓取東亞鐵路資料
 * - 提取 relation/way 的 color/colour/operator/network
 * - 輸出 raw GeoJSON 至 public/data/raw/
 * - 自動執行 build-data 管線（TopoJSON + 省級拆分）
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { CHINA_PROVINCES } from '../lib/china-provinces.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, '..', 'public', 'data', 'raw');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_MIRROR = 'https://overpass.kumi.systems/api/interpreter';
const COORD_PRECISION = 5;
const REQUEST_DELAY_MS = 5000;

const KEEP_TAGS = new Set([
  'name', 'name:zh', 'name:en', 'name:ja', 'name:zh-TW', 'name:zh-HK', 'name:zh-CN',
  'railway', 'operator', 'network', 'ref', 'highspeed', 'service', 'usage', 'line',
  'color', 'colour', 'route', 'type',
]);

const REGIONS = [
  { id: 'taiwan', label: '台灣', areaQuery: 'area["ISO3166-1"="TW"]->.searchArea;' },
  { id: 'hongkong', label: '香港', bboxes: [[22.15, 113.83, 22.57, 114.45]] },
  { id: 'macau', label: '澳門', bboxes: [[22.10, 113.52, 22.22, 113.62]] },
  {
    id: 'japan', label: '日本',
    bboxes: [
      [41.0, 139.0, 45.9, 146.0],
      [36.0, 137.0, 41.5, 141.5],
      [34.5, 136.0, 37.5, 141.0],
      [33.5, 131.0, 36.0, 137.5],
      [32.5, 132.0, 34.5, 134.5],
      [24.0, 124.0, 34.0, 132.5],
    ],
  },
];

function roundCoord(n) {
  return Math.round(n * 10 ** COORD_PRECISION) / 10 ** COORD_PRECISION;
}

function buildAreaQuery(areaQuery) {
  return `
[out:json][timeout:600];
${areaQuery}
(
  way["railway"~"^(rail|subway|tram)$"](area.searchArea);
  node["railway"="station"](area.searchArea);
  relation["type"="route"]["route"~"^(rail|subway|tram|light_rail)$"](area.searchArea);
);
out body;
>;
out skel qt;
`.trim();
}

function buildBboxQuery(bbox) {
  const [south, west, north, east] = bbox;
  return `
[out:json][timeout:300];
(
  way["railway"~"^(rail|subway|tram)$"](${south},${west},${north},${east});
  node["railway"="station"](${south},${west},${north},${east});
  relation["type"="route"]["route"~"^(rail|subway|tram|light_rail)$"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;
`.trim();
}

function filterTags(tags = {}) {
  const filtered = {};
  for (const [key, value] of Object.entries(tags)) {
    if (KEEP_TAGS.has(key) || key.startsWith('name:')) filtered[key] = value;
  }
  return filtered;
}

function buildWayRelationTags(relations) {
  const map = new Map();
  for (const rel of relations) {
    const relTags = filterTags(rel.tags);
    for (const member of rel.members || []) {
      if (member.type !== 'way') continue;
      const prev = map.get(member.ref) || {};
      map.set(member.ref, { ...prev, ...relTags });
    }
  }
  return map;
}

function mergeWayTags(way, relationTags) {
  const rel = relationTags.get(way.id) || {};
  const wayTags = filterTags(way.tags);
  return {
    ...rel,
    ...wayTags,
    color: wayTags.color || wayTags.colour || rel.color || rel.colour,
    operator: wayTags.operator || rel.operator,
    network: wayTags.network || rel.network,
    ref: wayTags.ref || rel.ref,
    name: wayTags.name || rel.name,
  };
}

function osmToGeoJSON(elements) {
  const nodes = new Map();
  const ways = [];
  const relations = [];

  for (const el of elements) {
    if (el.type === 'node') nodes.set(el.id, el);
    else if (el.type === 'way') ways.push(el);
    else if (el.type === 'relation') relations.push(el);
  }

  const relationTags = buildWayRelationTags(relations);
  const features = [];

  for (const way of ways) {
    if (!way.nodes || way.nodes.length < 2) continue;
    const coordinates = [];
    for (const nodeId of way.nodes) {
      const node = nodes.get(nodeId);
      if (node?.lat != null && node?.lon != null) {
        coordinates.push([roundCoord(node.lon), roundCoord(node.lat)]);
      }
    }
    if (coordinates.length < 2) continue;

    features.push({
      type: 'Feature',
      id: `way/${way.id}`,
      properties: {
        ...mergeWayTags(way, relationTags),
        osm_id: way.id,
        osm_type: 'way',
      },
      geometry: { type: 'LineString', coordinates },
    });
  }

  for (const el of elements) {
    if (el.type === 'node' && el.tags?.railway === 'station') {
      features.push({
        type: 'Feature',
        id: `node/${el.id}`,
        properties: {
          ...filterTags(el.tags),
          osm_id: el.id,
          osm_type: 'node',
        },
        geometry: {
          type: 'Point',
          coordinates: [roundCoord(el.lon), roundCoord(el.lat)],
        },
      });
    }
  }

  return features;
}

function mergeFeatures(featureLists) {
  const seen = new Set();
  const merged = [];
  for (const features of featureLists) {
    for (const f of features) {
      const key = `${f.properties.osm_type}/${f.properties.osm_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(f);
      }
    }
  }
  return { type: 'FeatureCollection', features: merged };
}

async function queryOverpass(query, retries = 3) {
  const urls = [OVERPASS_URL, OVERPASS_MIRROR];
  for (let attempt = 0; attempt < retries; attempt++) {
    const url = urls[attempt % urls.length];
    try {
      const response = await axios.post(url, `data=${encodeURIComponent(query)}`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'EastAsiaRailwayMap/2.0 (github.com/east-asia-railway-map)',
        },
        timeout: 660_000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      return osmToGeoJSON(response.data.elements);
    } catch (err) {
      const wait = REQUEST_DELAY_MS * (attempt + 2);
      console.warn(`   ⚠ 請求失敗 (${err.response?.status || err.message})，${wait / 1000}s 後重試...`);
      if (attempt === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function fetchRegion(region) {
  console.log(`\n📡 正在抓取 ${region.label} (${region.id})...`);
  let allFeatures = [];

  if (region.areaQuery) {
    allFeatures = await queryOverpass(buildAreaQuery(region.areaQuery));
  } else if (region.bboxes) {
    for (let i = 0; i < region.bboxes.length; i++) {
      console.log(`   ↳ 區塊 ${i + 1}/${region.bboxes.length}...`);
      const features = await queryOverpass(buildBboxQuery(region.bboxes[i]));
      allFeatures.push(features);
      if (i < region.bboxes.length - 1) await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }
  }

  const geojson = Array.isArray(allFeatures[0])
    ? mergeFeatures(allFeatures)
    : { type: 'FeatureCollection', features: allFeatures };

  const ways = geojson.features.filter((f) => f.geometry.type === 'LineString').length;
  const stations = geojson.features.filter((f) => f.geometry.type === 'Point').length;
  console.log(`   ✓ ${ways} 條路線, ${stations} 個車站`);
  return geojson;
}

async function fetchChinaProvinces() {
  console.log('\n📡 正在抓取中國大陸（省級拆分）...');
  const allChunks = [];

  for (const province of CHINA_PROVINCES) {
    if (province.id === 'taiwan-mainland-claim') continue;
    const [s, w, n, e] = province.bbox;
    console.log(`   ↳ ${province.label}...`);
    try {
      const features = await queryOverpass(buildBboxQuery([s, w, n, e]));
      allChunks.push(features);
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.warn(`   ⚠ ${province.label} 失敗: ${err.message}`);
    }
  }

  return mergeFeatures(allChunks);
}

function parseOnlyArg() {
  const arg = process.argv.find((a) => a.startsWith('--only='));
  if (!arg) return null;
  return arg.replace('--only=', '').split(',').map((s) => s.trim());
}

function runBuildPipeline() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/build-data.mjs', '--from-raw'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`build-data exited ${code}`))));
  });
}

async function main() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  const only = parseOnlyArg();
  const skipBuild = process.argv.includes('--skip-build');

  let regions = REGIONS;
  if (only) {
    regions = REGIONS.filter((r) => only.includes(r.id));
    if (only.some((id) => id === 'china')) {
      // china handled separately
    } else if (!regions.length && !only.includes('china')) {
      console.error(`未知區域: ${only.join(', ')}`);
      process.exit(1);
    }
  }

  console.log('🚂 東亞鐵路資料抓取 v2');

  for (const region of regions) {
    try {
      const geojson = await fetchRegion(region);
      await fs.writeFile(path.join(RAW_DIR, `${region.id}.json`), JSON.stringify(geojson));
    } catch (err) {
      console.error(`   ✗ ${region.label} 失敗:`, err.message);
    }
  }

  if (!only || only.includes('china')) {
    try {
      const china = await fetchChinaProvinces();
      await fs.writeFile(path.join(RAW_DIR, 'china.json'), JSON.stringify(china));
    } catch (err) {
      console.error('   ✗ 中國大陸失敗:', err.message);
    }
  }

  if (!skipBuild) {
    console.log('\n🔧 執行 TopoJSON 建置管線...');
    await runBuildPipeline();
  }

  console.log('\n✅ 完成！');
}

main().catch((err) => {
  console.error('致命錯誤:', err);
  process.exit(1);
});
