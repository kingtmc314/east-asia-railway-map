# 東亞動態鐵路網絡與 GIS 矩陣控制系統

**East Asia Railway Map & Interactive GIS Matrix**

A professional, bilingual Web GIS platform for exploring railway networks across **Hong Kong, Macau, Taiwan, Mainland China, and Japan**. Built with Next.js 15, MapLibre GL JS, and Tailwind CSS — inspired by the fluid UX and backend architecture of [RailsMaps](https://railsmaps.com).

[![Live Demo](https://img.shields.io/badge/demo-vercel.app-0070f3?style=flat-square)](https://east-asia-railway-map.vercel.app)
[![Data Pipeline](https://img.shields.io/badge/data-GitHub%20Actions-2088FF?style=flat-square)](#automated-data-pipeline)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

---

## Features

### 1. RailsMaps-grade aesthetic architecture

- **Carto Dark Matter** basemap — no API key, GPU-accelerated vector tiles
- **Official line colours** from OpenStreetMap (`line_color`, operator, network)
- Station labels anchored to track geometry — no drift, no missing hubs
- Dark GIS canvas with frosted-glass sidebar control panel

### 2. Bilingual rendering engine

- **One-click 繁中 / EN toggle** — instant label switch via `map.setLayoutProperty`
- **Zero reload** — MapLibre expressions swap `text-field` in milliseconds
- Full UI localisation: sidebar, legend, type descriptions, status bar

| Mode | MapLibre `text-field` expression |
|------|----------------------------------|
| 繁中 | `coalesce(name:zh-Hant, name:zh-HK, name:zh-TW, name:zh, label_zh, name)` |
| EN | `coalesce(name:en, name)` |

### 3. Dual-matrix control panel

Cross-filter **5 macro-regions × 4 railway types** with instant GPU filters:

| Regions | Types |
|---------|-------|
| 香港 Hong Kong | 高鐵 / 新幹線 High-speed |
| 澳門 Macau | 普通鐵路 / 國鐵 Conventional rail |
| 台灣 Taiwan | 地鐵 / 捷運 Metro |
| 中國大陸 China | 輕軌 / 路面電車 Light rail |
| 日本 Japan | |

- **Select all / Clear all** for both matrices
- **Live legend** updates with active type selection
- Region & type changes use `map.setFilter()` only — no data re-fetch

### 4. Hardware-accelerated zoom thinning

| Type | `minzoom` | Rationale |
|------|-----------|-----------|
| High-speed / Shinkansen | **3** | Global backbone visible at continent scale |
| Conventional rail | **7** | Intercity lines appear at regional zoom |
| Metro / Subway | **10** | Urban networks + station labels at city scale |
| Light rail / Tram | **12.5** | Neighbourhood detail only when zoomed in |

At low zoom, MapLibre **never evaluates** tram/metro layers — eliminating label collision lag.

### 5. Automated data pipeline (RailsMaps-style backend)

Heavy OSM processing runs **off the browser** via GitHub Actions:

| Stage | What happens |
|-------|----------------|
| **Fetch** | Overpass API pulls latest `rail/subway/tram/light_rail` ways + stations |
| **Clean** | Strip OSM metadata bloat; keep only `name:zh-Hant`, `name:en`, `railway`, `color` |
| **Simplify** | Douglas–Peucker + 5-decimal coords → **1–5 MB per region** |
| **Deploy** | Auto-commit `*_clean.json` → Vercel rebuilds static assets |

Frontend reads pre-baked files only — **no Overpass calls, no 300 MB TopoJSON, no blank-page OOM**.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Map engine | MapLibre GL JS 4.x |
| Styling | Tailwind CSS 3 |
| Data format | Clean GeoJSON (`*_clean.json`) |
| Data pipeline | Node.js + GitHub Actions + Overpass API |
| Basemap | CARTO Dark Matter GL |

---

## Project structure

```
├── components/
│   └── RailwayMap.jsx              # GIS matrix UI + MapLibre layers
├── scripts/
│   └── fetch-and-clean-transit.js  # Overpass fetch + clean + simplify
├── .github/workflows/
│   └── update-railway-data.yml     # Weekly cron + manual dispatch
├── public/data/
│   ├── clean-manifest.json         # Index of all clean files + stats
│   ├── hongkong_clean.json         # Single-file regions (~0.5–3 MB)
│   ├── macau_clean.json
│   ├── taiwan_clean.json
│   └── clean/                      # Sharded large regions
│       ├── china-beijing.json
│       ├── china-guangdong.json
│       ├── japan-kanto-chubu.json
│       └── …
└── README.md
```

---

## Local development

```bash
npm install

# Generate clean JSON from existing topo (offline, fast)
npm run fetch-transit:bootstrap

# Or fetch fresh data from Overpass (slow, needs network)
npm run fetch-transit

npm run dev
# → http://localhost:3000
```

---

## Automated data pipeline

### Weekly schedule

`.github/workflows/update-railway-data.yml` runs every **Sunday 00:00 UTC**:

1. Checkout repo on Ubuntu
2. `node scripts/fetch-and-clean-transit.js`
3. Auto-commit `public/data/*_clean.json`
4. Push → Vercel auto-deploys

### Manual trigger

GitHub → **Actions** → **Update Railway Data** → **Run workflow**

| Input | Description |
|-------|-------------|
| `region` | `all`, `hongkong`, `macau`, `taiwan`, `china`, or `japan` |
| `bootstrap_only` | Skip Overpass; convert existing topo → clean |

### What gets stripped

Removed: `uid`, `timestamp`, `user`, `changeset`, `version`, highway tags, etc.

Kept: `name:zh-Hant`, `name:en`, `name:zh`, `railway`, `color`, `operator`, `network`, `highspeed`

### Frontend loading

```
User checks [ 日本 ]
        ↓
fetch('/data/clean-manifest.json') → parallel fetch clean/japan-*.json shards
        ↓
map.setFilter() for region matrix — 0 ms re-download on toggle
```

---

## Deploy to Vercel

```bash
git push origin main
npx vercel deploy --prod --yes
```

**Production:** [east-asia-railway-map.vercel.app](https://east-asia-railway-map.vercel.app)

Clean JSON bundle uses **sharded files** for China/Japan (~1–8 MB each) — fast cold starts, no browser OOM.

---

## Architecture notes

### Instant filter pipeline

```
User toggles region/type
        ↓
map.setFilter(layerId, ['all', typeFilter, regionFilter])
        ↓
GPU culls features — 0 ms network, 0 ms parse
```

### Bilingual pipeline

```
User toggles 繁中 / EN
        ↓
map.setLayoutProperty('labels-*', 'text-field', TEXT_ZH | TEXT_EN)
```

### Data classification

Each feature is tagged at pipeline time:

```javascript
rail_type: 'hsr' | 'rail' | 'subway' | 'tram'
macro_region: 'hongkong' | 'macau' | 'taiwan' | 'china' | 'japan'
```

---

## Data source & licence

- **Map data:** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- **Basemap:** © [CARTO](https://carto.com/attributions) · © OpenStreetMap
- **Code:** MIT License

---

## Acknowledgements

UX and pipeline patterns inspired by [RailsMaps](https://railsmaps.com) — the gold standard for interactive railway cartography on the web.
