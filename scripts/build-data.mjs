#!/usr/bin/env node
/**
 * 資料建置管線：色彩 enrichment → 省級拆分 → TopoJSON 壓縮 → manifest
 *
 * 用法:
 *   node scripts/build-data.mjs              # 處理 public/data/*.json
 *   node scripts/build-data.mjs --from-raw   # 處理 public/data/raw/*.json
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as topojsonServer from 'topojson-server';
import { enrichFeatureProperties } from '../lib/railway-colors.js';
import {
  CHINA_PROVINCES,
  assignFeatureToProvinces,
  manifestBbox,
} from '../lib/china-provinces.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const CHINA_DIR = path.join(DATA_DIR, 'china');

const BASE_REGIONS = [
  { id: 'taiwan', label: '台灣', bbox: [119.3, 21.9, 122.0, 25.3] },
  { id: 'hongkong', label: '香港', bbox: [113.83, 22.15, 114.45, 22.57] },
  { id: 'macau', label: '澳門', bbox: [113.52, 22.10, 113.62, 22.22] },
  { id: 'japan', label: '日本', bbox: [124.0, 24.0, 146.0, 46.0] },
];

function toManifestBbox([west, south, east, north]) {
  return [west, south, east, north];
}

function processFeatures(features, regionLabel, regionId) {
  const lines = [];
  const stations = [];

  for (const f of features) {
    const enriched = {
      ...f,
      properties: enrichFeatureProperties({
        ...f.properties,
        region: regionLabel,
        region_id: regionId,
      }),
    };

    if (f.geometry?.type === 'LineString') lines.push(enriched);
    else if (f.geometry?.type === 'Point') stations.push(enriched);
  }

  return { lines, stations };
}

function writeTopoJSON(outPath, lines, stations) {
  const topology = topojsonServer.topology({
    lines: { type: 'FeatureCollection', features: lines },
    stations: { type: 'FeatureCollection', features: stations },
  });
  return fs.writeFile(outPath, JSON.stringify(topology));
}

async function readGeoJSON(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(raw);
  return data.features || [];
}

async function buildRegion(region, inputPath) {
  const features = await readGeoJSON(inputPath);
  const { lines, stations } = processFeatures(features, region.label, region.id);
  const outPath = path.join(DATA_DIR, `${region.id}.topo.json`);
  await writeTopoJSON(outPath, lines, stations);
  const stat = await fs.stat(outPath);
  console.log(`   ✓ ${region.id}.topo.json — ${lines.length} 線 / ${stations.length} 站 (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
  return {
    id: region.id,
    label: region.label,
    file: `/data/${region.id}.topo.json`,
    bbox: toManifestBbox([
      region.bbox[0], region.bbox[1], region.bbox[2], region.bbox[3],
    ]),
    lines: lines.length,
    stations: stations.length,
  };
}

async function buildChinaProvinces(inputPath) {
  await fs.mkdir(CHINA_DIR, { recursive: true });
  const features = await readGeoJSON(inputPath);

  const buckets = new Map();
  for (const p of CHINA_PROVINCES) {
    if (p.id !== 'taiwan-mainland-claim') buckets.set(p.id, []);
  }
  buckets.set('other', []);

  for (const f of features) {
    const provinces = assignFeatureToProvinces(f);
    for (const pid of provinces) {
      if (!buckets.has(pid)) buckets.set(pid, []);
      buckets.get(pid).push(f);
    }
  }

  const manifestEntries = [];

  for (const province of CHINA_PROVINCES) {
    if (province.id === 'taiwan-mainland-claim') continue;
    const bucket = buckets.get(province.id) || [];
    if (!bucket.length) continue;

    const { lines, stations } = processFeatures(bucket, province.label, `china-${province.id}`);
    const outPath = path.join(CHINA_DIR, `${province.id}.topo.json`);
    await writeTopoJSON(outPath, lines, stations);
    const stat = await fs.stat(outPath);

    console.log(`   ✓ china/${province.id}.topo.json — ${lines.length} 線 / ${stations.length} 站 (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

    const [w, s, e, n] = manifestBbox(province);
    manifestEntries.push({
      id: `china-${province.id}`,
      label: province.label,
      file: `/data/china/${province.id}.topo.json`,
      bbox: [w, s, e, n],
      lines: lines.length,
      stations: stations.length,
    });
  }

  return manifestEntries;
}

async function main() {
  const fromRaw = process.argv.includes('--from-raw');
  const inputDir = fromRaw ? RAW_DIR : DATA_DIR;

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(CHINA_DIR, { recursive: true });

  console.log('🔧 資料建置管線啟動');
  console.log(`   來源: ${inputDir}`);

  const manifestRegions = [];

  for (const region of BASE_REGIONS) {
    const inputPath = path.join(inputDir, `${region.id}.json`);
    try {
      await fs.access(inputPath);
      const entry = await buildRegion(region, inputPath);
      manifestRegions.push(entry);
    } catch {
      console.warn(`   ⚠ 跳過 ${region.id}（找不到 ${inputPath}）`);
    }
  }

  const chinaPath = path.join(inputDir, 'china.json');
  try {
    await fs.access(chinaPath);
    console.log('\n📦 拆分中國大陸省級檔案...');
    const chinaEntries = await buildChinaProvinces(chinaPath);
    manifestRegions.push(...chinaEntries);
  } catch {
    console.warn('   ⚠ 跳過 china（找不到 china.json）');
  }

  const manifest = {
    version: 2,
    updated: new Date().toISOString(),
    regions: manifestRegions,
  };

  await fs.writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n✅ manifest.json — ${manifestRegions.length} 個區域`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
