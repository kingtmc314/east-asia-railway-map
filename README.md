# 東亞鐵路拓撲圖

大阪官方路網圖風格的東亞鐵路互動地圖，涵蓋 **台灣、香港、澳門、中國大陸、日本**。資料來源 OpenStreetMap，前端 Next.js + MapLibre GL JS。

## 功能特色

- **官方路線色**：OSM `color` / `operator` / `network` + 對照表補全
- **三級縮放**：Z4–6 高鐵 → Z7–10 城際 → Z11+ 地鐵/私鐵/輕軌
- **完整站名**：Z11+ 可變錨點標籤，Z16+ 強制顯示所有站名（含私鐵/地鐵）
- **TopoJSON + 省級拆分**：視窗動態載入，Vercel 友善

## 專案結構

```
├── components/RailwayMap.jsx     # MapLibre 地圖核心
├── lib/map-style.js            # 底圖、Paint、站名 Label 設定
├── public/data/                # 靜態鐵路資料（部署時必須存在）
│   ├── manifest.json           # 區域索引
│   ├── taiwan.topo.json
│   ├── hongkong.topo.json
│   ├── macau.topo.json
│   ├── japan/*.topo.json
│   └── china/*.topo.json
└── scripts/
    ├── fetch-railway-data.mjs  # Overpass 抓取
    └── build-data.mjs          # TopoJSON 建置
```

## 本機開發

```bash
# 1. 安裝依賴
npm install

# 2. 抓取最新 OSM 資料（約 20–60 分鐘）
npm run fetch-data
# 別名：npm run fetch-railways

# 3. 或從現有 GeoJSON 建置 TopoJSON
npm run build-data

# 4. 啟動開發伺服器
npm run dev
# → http://localhost:3000
```

### 資料路徑說明

- 原始 GeoJSON 輸出至 `public/data/raw/`（不進版控）
- 建置後 TopoJSON 位於 `public/data/` 及子目錄
- 前端一律使用**絕對根路徑** fetch，例如：
  - `/data/manifest.json`
  - `/data/taiwan.topo.json`
  - `/data/china/guangdong.topo.json`

## 部署到 Vercel（一鍵）

### 前置：推送至 GitHub

```bash
git init
git add .
git commit -m "East Asia Railway Map"
git remote add origin https://github.com/elitelearning-PRO/east-asia-railway-map.git
git push -u origin main
```

> **重要**：請將 `public/data/**/*.topo.json` 與 `manifest.json` 一併 commit。  
> 原始 `.json` 大檔已在 `.gitignore` 排除；`.vercelignore` 排除超過 100MB 的 raw GeoJSON。

### Vercel 連動步驟

1. 登入 [vercel.com](https://vercel.com)
2. 點 **Add New → Project**
3. 選 **Import Git Repository**，連動你的 GitHub 帳號
4. 選擇 `east-asia-railway-map` repository
5. **Framework Preset** 選 **Next.js**（自動偵測）
6. 建置設定使用預設值即可：
   - Build Command: `npm run build`
   - Output Directory: `.next`（Next.js 預設）
   - Install Command: `npm install`
7. 點 **Deploy**

部署完成後，Vercel 會提供 `https://your-project.vercel.app` 網址。

### CLI 快速部署（選用）

```bash
npx vercel --prod
```

## 站名 Label 設定

站名圖層設定於 `lib/map-style.js`：

- **繁中優先**：`name:zh-Hant` → `name:zh-HK` → `name:zh-TW` → `name:zh` → `name:ja` → `name`
- **CJK 字型**：`Noto Sans CJK JP Regular` + `Open Sans Regular` 備用
- **Z11–15**：`text-variable-anchor` 自動找空位
- **Z16+**：`text-allow-overlap: true` 確保密集地鐵/私鐵站名 100% 顯示

## 授權

- 程式碼：MIT
- 地圖資料：© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
