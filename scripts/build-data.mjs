#!/usr/bin/env node
/**
 * 資料建置管線：色彩 enrichment → 區域拆分 → TopoJSON → manifest
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as topojsonServer from 'topojson-server';
import { enrichFeatureProperties } from '../lib/railway-colors.js';
import {
  CHINA_PROVINCES,
  bucketFeaturesByRegion,
  manifestBbox,
} from '../lib/china-provinces.js';
import { JAPAN_REGIONS, manifestBboxFromRegion } from '../lib/japan-regions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const CHINA_DIR = path.join(DATA_DIR, 'china');
const JAPAN_DIR = path.join(DATA_DIR, 'japan');

const SMALL_REGIONS = [
  { id: 'taiwan', label: '台灣', bbox: [119.3, 21.9, 122.0, 25.3] },
  { id: 'hongkong', label: '香港', bbox: [113.83, 22.15, 114.45, 22.57] },
  { id: 'macau', label: '澳門', bbox: [113.52, 22.10, 113.62, 22.22] },
];

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
  return JSON.parse(raw).features || [];
}

async function buildSmallRegion(region, inputPath) {
  const features = await readGeoJSON(inputPath);
  const { lines, stations } = processFeatures(features, region.label, region.id);
  const outPath = path.join(DATA_DIR, `${region.id}.topo.json`);
  await writeTopoJSON(outPath, lines, stations);
  const stat = await fs.stat(outPath);
  console.log(`   ✓ ${region.id}.topo.json — ${lines.length} 線 / ${stations.length} 站 (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
  const [w, s, e, n] = [region.bbox[0], region.bbox[1], region.bbox[2], region.bbox[3]];
  return {
    id: region.id,
    label: region.label,
    file: `/data/${region.id}.topo.json`,
    bbox: [w, s, e, n],
    lines: lines.length,
    stations: stations.length,
  };
}

async function buildSplitRegions({ inputPath, regions, outDir, prefix, logPrefix }) {
  await fs.mkdir(outDir, { recursive: true });
  const features = await readGeoJSON(inputPath);
  const buckets = bucketFeaturesByRegion(features, regions);
  const entries = [];

  for (const region of regions) {
    const bucket = buckets.get(region.id) || [];
    if (!bucket.length) continue;

    const regionId = prefix ? `${prefix}-${region.id}` : region.id;
    const { lines, stations } = processFeatures(bucket, region.label, regionId);
    const outPath = path.join(outDir, `${region.id}.topo.json`);
    await writeTopoJSON(outPath, lines, stations);
    const stat = await fs.stat(outPath);

    console.log(`   ✓ ${logPrefix}${region.id}.topo.json — ${lines.length} 線 / ${stations.length} 站 (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

    entries.push({
      id: regionId,
      label: region.label,
      file: `/data/${logPrefix}${region.id}.topo.json`,
      bbox: manifestBboxFromRegion(region),
      lines: lines.length,
      stations: stations.length,
    });
  }

  const other = buckets.get('other') || [];
  if (other.length) {
    console.warn(`   ⚠ ${logPrefix} 未分配 features: ${other.length}`);
  }

  return entries;
}

async function cleanupOldFiles() {
  const obsolete = [
    path.join(DATA_DIR, 'japan.topo.json'),
    path.join(CHINA_DIR, 'inner-mongolia-east.topo.json'),
    path.join(CHINA_DIR, 'hebei.topo.json'),
  ];
  for (const f of obsolete) {
    try {
      await fs.unlink(f);
      console.log(`   🗑 已移除 ${path.basename(f)}`);
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const fromRaw = process.argv.includes('--from-raw');
  const inputDir = fromRaw ? RAW_DIR : DATA_DIR;

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(CHINA_DIR, { recursive: true });
  await fs.mkdir(JAPAN_DIR, { recursive: true });

  console.log('🔧 資料建置管線 v3（質心單一歸屬 + 細分區域）');
  console.log(`   來源: ${inputDir}`);

  const manifestRegions = [];

  for (const region of SMALL_REGIONS) {
    const inputPath = path.join(inputDir, `${region.id}.json`);
    try {
      await fs.access(inputPath);
      manifestRegions.push(await buildSmallRegion(region, inputPath));
    } catch {
      console.warn(`   ⚠ 跳過 ${region.id}`);
    }
  }

  const japanPath = path.join(inputDir, 'japan.json');
  try {
    await fs.access(japanPath);
    console.log('\n📦 拆分日本區域檔案...');
    const japanEntries = await buildSplitRegions({
      inputPath: japanPath,
      regions: JAPAN_REGIONS,
      outDir: JAPAN_DIR,
      prefix: 'japan',
      logPrefix: 'japan/',
    });
    manifestRegions.push(...japanEntries);
  } catch {
    console.warn('   ⚠ 跳過 japan');
  }

  const chinaPath = path.join(inputDir, 'china.json');
  try {
    await fs.access(chinaPath);
    console.log('\n📦 拆分中國大陸省級檔案...');
    const chinaEntries = await buildSplitRegions({
      inputPath: chinaPath,
      regions: CHINA_PROVINCES,
      outDir: CHINA_DIR,
      prefix: 'china',
      logPrefix: 'china/',
    });
    manifestRegions.push(...chinaEntries);
  } catch {
    console.warn('   ⚠ 跳過 china');
  }

  await cleanupOldFiles();

  const manifest = {
    version: 3,
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
