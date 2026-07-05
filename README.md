# 東亞動態鐵路網絡與 GIS 矩陣控制系統

**East Asia Railway Map & Interactive GIS Matrix**

A production-grade, bilingual Web GIS for exploring railway networks across **Hong Kong, Macau, Taiwan, Mainland China, and Japan**. Built with Next.js 15, MapLibre GL JS, and Tailwind CSS — architected for the fluid UX, official line colours, and backend data discipline of [RailsMaps](https://railsmaps.com).

[![Live Demo](https://img.shields.io/badge/demo-vercel.app-0070f3?style=flat-square)](https://east-asia-railway-map.vercel.app)
[![Data Pipeline](https://img.shields.io/badge/data-GitHub%20Actions-2088FF?style=flat-square)](#github-actions-data-pipeline)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

---

## Features

### 1. RailsMaps-grade aesthetic architecture

- **Carto Dark Matter** vector basemap — GPU-accelerated, no API key
- **Official line colours** inherited from OSM route relations (`colour` / `color` tags)
- Tracks and station labels share the same geometry — no drift, no missing hubs
- Dark GIS canvas with frosted-glass sidebar (`bg-slate-900/80 backdrop-blur-md`)

### 2. Bilingual rendering engine

- **One-click 繁中 / EN** — UI and map labels switch instantly via `map.setLayoutProperty`
- Zero reload; MapLibre expressions swap `text-field` in milliseconds

| Mode | MapLibre `text-field` |
|------|------------------------|
| 繁中 | `coalesce(name:zh-Hant, name:zh-HK, name:zh-TW, name:zh, name)` |
| EN | `coalesce(name:en, name)` |

### 3. Dual-matrix control panel

Cross-filter **5 macro-regions × 4 railway types** with hardware-accelerated `map.setFilter()`:

| Regions | Railway types |
|---------|---------------|
| 香港 Hong Kong | 高鐵 / 新幹線 `highspeed` |
| 澳門 Macau | 普通鐵路 `rail` |
| 台灣 Taiwan | 地鐵 / 捷運 `subway` |
| 中國大陸 China | 輕軌 / 路面電車 `tram` |
| 日本 Japan | |

- **Default:** Hong Kong only — other regions load on demand (zero initial payload)
- **Select all / Clear all** for both matrices
- **Live legend** reflects active type selection with RailsMaps-style colours

### 4. Strict zoom thinning (60 FPS target)

| Type | `minzoom` | When visible |
|------|-----------|--------------|
| `highspeed` | **3** | Continent scale — CRH, Shinkansen backbone |
| `rail` | **7** | Regional intercity |
| `subway` | **10** | City metro + station labels |
| `tram` | **12.5** | Light rail / Macau LRT / HK Light Rail — neighbourhood only |

MapLibre never evaluates tram layers below Z12.5 — eliminating label collision and OOM at country zoom.

### 5. GitHub Actions data pipeline

Heavy OSM work runs **off the browser** every Sunday:

```
Overpass API  →  route relations + station nodes  →  clean GeoJSON  →  git push  →  Vercel deploy
```

| Stage | Action |
|-------|--------|
| **Dual-track fetch** | Route relations (colour inheritance) + standalone `station`/`halt` nodes |
| **Classify** | Unified `railway_type`: `highspeed`, `rail`, `subway`, `tram` |
| **Compress** | Strip OSM bloat; Douglas–Peucker simplify; coords → 5 decimals |
| **Slice** | HK/MO/TW single files; China/Japan provincial shards (~100 KB–3 MB each) |
| **Deploy** | Auto-commit `public/data/*_clean.json` triggers Vercel static rebuild |

Frontend reads pre-baked JSON only — **no Overpass in browser, no 300 MB TopoJSON, no blank-page crashes**.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Map | MapLibre GL JS 4.x |
| Styling | Tailwind CSS 3.x |
| Data | Clean GeoJSON (`FeatureCollection`) |
| CI/CD | GitHub Actions + Vercel |

---

## Project structure

```
├── components/
│   ├── RailwayMap.jsx      # Map + dual-matrix sidebar
│   └── MapPage.jsx         # Full-screen layout wrapper
├── scripts/
│   └── fetch-and-clean-transit.js   # Overpass pipeline
├── .github/workflows/
│   └── update-railway-data.yml      # Weekly cron + manual dispatch
└── public/data/
    ├── hongkong_clean.json
    ├── macau_clean.json
    ├── taiwan_clean.json
    ├── clean-manifest.json
    └── clean/               # China + Japan shards
        ├── china-*.json
        └── japan-*.json
```

---

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
```

### Refresh data locally

```bash
# Live Overpass (slow; needs curl + network)
npm run fetch-transit

# Offline from existing topo sources
npm run fetch-transit:bootstrap

# Single region
node scripts/fetch-and-clean-transit.js --region=macau
```

---

## GitHub Actions data pipeline

Workflow: [`.github/workflows/update-railway-data.yml`](.github/workflows/update-railway-data.yml)

| Trigger | Schedule |
|---------|----------|
| Cron | Every Sunday 00:00 UTC |
| Manual | `workflow_dispatch` in GitHub Actions tab |

The job runs `node scripts/fetch-and-clean-transit.js`, commits changes under `public/data/`, and pushes to `main`. Vercel rebuilds automatically.

**Note:** Pushing workflow files requires a GitHub token with the `workflow` scope. Add the workflow via the GitHub UI if push is rejected.

---

## Data schema (clean GeoJSON)

Each `*_clean.json` is a slim `FeatureCollection`:

**LineString properties**

| Field | Description |
|-------|-------------|
| `railway_type` | `highspeed` \| `rail` \| `subway` \| `tram` |
| `color` | Official route colour (from OSM relation) |
| `line_name` | Route name |
| `name:zh-Hant`, `name:en` | Bilingual labels |
| `macro_region` | `hongkong`, `macau`, `taiwan`, `china`, `japan` |

**Point (station) properties**

| Field | Description |
|-------|-------------|
| `railway_type` | Inherited from route relation or node heuristics |
| `name:zh-Hant`, `name:en` | Station names |

---

## Deployment

Connected to [Vercel](https://vercel.com) — every push to `main` deploys production.

```bash
npx vercel deploy --prod
```

Live: **https://east-asia-railway-map.vercel.app**

---

## Credits

- Map data © [OpenStreetMap](https://www.openstreetmap.org) contributors (ODbL)
- Basemap © [CARTO](https://carto.com) Dark Matter
- UX inspiration: [RailsMaps](https://railsmaps.com)

## License

MIT
