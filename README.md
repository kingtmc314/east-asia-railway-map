# 東亞鐵路拓撲圖 v2

大阪官方路網圖風格的東亞鐵路互動拓撲地圖。資料來源 OpenStreetMap，前端 Next.js + MapLibre GL JS。

## 功能特色

- **官方路線色**：從 OSM `color`/`colour`/`operator`/`network`/`relation` 提取，並以對照表補全（台灣高鐵 #F60、台鐵 #005B94、港鐵觀塘線 #00A752、JR 山手線 #80C241、阪急 #800020 等）
- **三級縮放邏輯**：Z4–6 高鐵/新幹線 → Z7–10 城際普鐵+轉乘站 → Z11+ 地鐵/私鐵/輕軌 → Z13+ 地鐵圖風格車站
- **TopoJSON 壓縮**：省級拆分 + 拓撲編碼，大幅縮小傳輸體積
- **視窗動態載入**：依 map bounds 按需載入可見省份/區域

## 專案結構

```
├── components/RailwayMap.jsx    # 拓撲地圖核心
├── lib/
│   ├── railway-colors.js        # 官方色對照表
│   ├── china-provinces.js       # 省級 bbox
│   ├── map-style.js             # 極簡底圖 + Paint 設定
│   └── data-loader.js           # TopoJSON 解碼 + 動態載入
├── public/data/
│   ├── manifest.json            # 區域索引（bbox + 檔案路徑）
│   ├── taiwan.topo.json
│   ├── hongkong.topo.json
│   ├── macau.topo.json
│   ├── japan/                   # 日本 6 區域 TopoJSON
│   │   ├── hokkaido.topo.json
│   │   └── ...
│   └── china/                   # 中國 36 省級 TopoJSON
│       ├── guangdong.topo.json
│       └── ...
└── scripts/
    ├── fetch-railway-data.mjs   # Overpass 抓取 + relation 色彩
    └── build-data.mjs           # 色彩 enrichment → 省級拆分 → TopoJSON
```

## 快速開始

```bash
npm install

# 從現有 raw GeoJSON 建置 TopoJSON（已有資料可跳過 fetch）
npm run build-data

# 或從 Overpass 重新抓取（耗時 20–60 分鐘）
npm run fetch-data

npm run dev    # http://localhost:3000
```

## 部署

```bash
npm run build
```

建議將 `public/data/*.topo.json` 一併 commit。原始 `.json` 檔案已在 `.gitignore` 中排除。

## 授權

- 程式碼：MIT
- 地圖資料：© OpenStreetMap contributors (ODbL)
