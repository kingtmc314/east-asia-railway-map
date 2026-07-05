# 東亞動態鐵路網絡與 GIS 矩陣控制系統

**East Asia Railway Map & Interactive GIS Matrix**

A professional, bilingual Web GIS platform for exploring railway networks across **Hong Kong, Macau, Taiwan, Mainland China, and Japan**. Built with Next.js 15, MapLibre GL JS, and Tailwind CSS — inspired by the fluid UX of [RailsMaps](https://railsmaps.com).

[![Live Demo](https://img.shields.io/badge/demo-vercel.app-0070f3?style=flat-square)](https://east-asia-railway-map.vercel.app)
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

Industry-grade performance for tens of thousands of features:

| Type | `minzoom` | Rationale |
|------|-----------|-----------|
| High-speed / Shinkansen | **3** | Global backbone visible at continent scale |
| Conventional rail | **7** | Intercity lines appear at regional zoom |
| Metro / Subway | **10** | Urban networks + station labels at city scale |
| Light rail / Tram | **12.5** | Neighbourhood detail only when zoomed in (Tuen Mun, Macau LRT) |

At low zoom, MapLibre **never evaluates** tram/metro layers — eliminating label collision lag. At Z12.5+, full bilingual labels render with overlap enabled for dense LRT stops.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Map engine | MapLibre GL JS 4.x |
| Styling | Tailwind CSS 3 |
| Data format | TopoJSON (OSM-derived) |
| Basemap | CARTO Dark Matter GL |

---

## Project structure

```
├── components/
│   └── RailwayMap.jsx       # GIS matrix UI + MapLibre layers
├── public/data/
│   ├── manifest.json        # Region index (China provinces, Japan blocks)
│   ├── hongkong.topo.json
│   ├── macau.topo.json
│   ├── taiwan.topo.json
│   ├── china/*.topo.json    # 36 provincial files
│   └── japan/*.topo.json    # 6 regional files
├── app/
│   ├── layout.jsx
│   └── page.jsx
└── README.md
```

---

## Local development

```bash
npm install
npm run dev
# → http://localhost:3000
```

Data files ship with the repo. No fetch scripts required for local preview.

---

## Deploy to Vercel

```bash
git push origin main
npx vercel deploy --prod --yes
```

**Production:** [east-asia-railway-map.vercel.app](https://east-asia-railway-map.vercel.app)

> China + Japan TopoJSON totals ~300 MB. Initial deploy may take several minutes. Data is served as static assets from `/public/data/`.

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
        ↓
MapLibre re-evaluates expressions — no source reload
```

### Data classification

Each line feature is tagged at load time:

```javascript
rail_type: 'hsr' | 'rail' | 'subway' | 'tram'
macro_region: 'hongkong' | 'macau' | 'taiwan' | 'china' | 'japan'
```

Stations inherit `rail_type` from nearest connected line segment.

---

## Data source & licence

- **Map data:** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- **Basemap:** © [CARTO](https://carto.com/attributions) · © OpenStreetMap
- **Code:** MIT License

---

## Acknowledgements

UX patterns inspired by [RailsMaps](https://railsmaps.com) — the gold standard for interactive railway cartography on the web.
