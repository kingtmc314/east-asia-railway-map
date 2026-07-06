#!/usr/bin/env node
/**
 * East Asia Epic Schematic Railway Grid — matrix routing generator.
 *   node scripts/init-topology-mock.js
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'data', 'railway_topology.json');

const COLORS = {
  hsr: '#E60012',
  intercity: '#005A9C',
  metro_hk: '#E3002C',
  metro_hk_blue: '#007DC5',
  metro_hk_teal: '#5EB6E4',
  metro_jp: '#00A040',
  metro_jp_red: '#E60012',
  metro_tw: '#FF6600',
  tra: '#003366',
  macau: '#9B1096',
  crossborder: '#FFD700',
};

const regions = [
  { id: 'china_north', name: '華北華中', name_en: 'North & Central China', bounds: { minX: -500, minY: -3400, maxX: 1100, maxY: -2400 } },
  { id: 'guangxi', name: '廣西門戶', name_en: 'Guangxi Gateway', bounds: { minX: -1400, minY: -1200, maxX: -500, maxY: -800 } },
  { id: 'china_south', name: '華南粵港澳', name_en: 'South China & GBA', bounds: { minX: -500, minY: -1500, maxX: 500, maxY: -900 } },
  { id: 'hongkong', name: '香港', name_en: 'Hong Kong', bounds: { minX: -350, minY: -200, maxX: 350, maxY: 350 } },
  { id: 'macau', name: '澳門', name_en: 'Macau', bounds: { minX: -650, minY: 50, maxX: -150, maxY: 450 } },
  { id: 'taiwan', name: '台灣', name_en: 'Taiwan', bounds: { minX: 1300, minY: 200, maxX: 2000, maxY: 1000 } },
  { id: 'japan_south', name: '日本西南', name_en: 'Japan West & Kyushu', bounds: { minX: 2800, minY: -300, maxX: 4000, maxY: -700 } },
  { id: 'japan_tokyo', name: '東京圈', name_en: 'Greater Tokyo', bounds: { minX: 4200, minY: -1900, maxX: 4800, maxY: -1300 } },
  { id: 'japan_north', name: '東北北海道', name_en: 'Tohoku & Hokkaido', bounds: { minX: 5300, minY: -3400, maxX: 6700, maxY: -2200 } },
];

const stations = [];
const lines = [];
const stationIndex = new Map();

function addStation(s) {
  if (stationIndex.has(s.id)) return stationIndex.get(s.id);
  const st = {
    type: s.type || 'regular',
    tier: s.tier || 'regular',
    region: s.region,
    ...s,
  };
  stations.push(st);
  stationIndex.set(s.id, st);
  return st;
}

function spineLine(id, name, name_en, color, region, tier, ids, extra = {}) {
  const path = [];
  for (let i = 0; i < ids.length - 1; i++) path.push([ids[i], ids[i + 1]]);
  lines.push({ id, name, name_en, color, region, tier, path, ...extra });
}

function routeSpine(def) {
  const ids = [];
  def.nodes.forEach((node, i) => {
    const id = node.id || `${def.prefix}_${i}`;
    addStation({
      id,
      name: node.name,
      name_en: node.name_en,
      x: node.x,
      y: node.y,
      region: node.region || def.region,
      type: node.type || (node.gateway ? 'gateway' : node.interchange ? 'interchange' : 'regular'),
      tier: node.tier || def.defaultTier || 'regular',
      gateway: node.gateway,
    });
    ids.push(id);
  });
  spineLine(def.id, def.name, def.name_en, def.color, def.region, def.tier || 'backbone', ids, def.extra);
  return ids;
}

function ringLine(id, name, name_en, color, region, tier, ids) {
  const path = [];
  for (let i = 0; i < ids.length; i++) path.push([ids[i], ids[(i + 1) % ids.length]]);
  lines.push({ id, name, name_en, color, region, tier: tier || 'metro', path });
}

function metroGrid(def) {
  const ids = def.nodes.map((node) => {
    addStation({
      ...node,
      region: def.region,
      type: node.type || 'interchange',
      tier: node.tier || 'regular',
    });
    return node.id;
  });
  for (const seg of def.segments) {
    lines.push({
      id: seg.id,
      name: seg.name,
      name_en: seg.name_en,
      color: seg.color,
      region: def.region,
      tier: 'metro',
      path: seg.path,
    });
  }
  return ids;
}

// ── Spine 1: 京廣高鐵縱貫 ──
routeSpine({
  id: 'CN_JINGGUANG',
  name: '京廣高鐵',
  name_en: 'Beijing–Guangzhou HSR',
  color: COLORS.hsr,
  region: 'china_north',
  tier: 'backbone',
  prefix: 'JG',
  defaultTier: 'hub',
  nodes: [
    { id: 'CN_BeijingSouth', name: '北京南', name_en: 'Beijing South', x: 0, y: -3200, region: 'china_north', tier: 'hub',
      gateway: { targetRegion: 'china_north', label_zh: '往 華北高鐵網 ➔', label_en: 'To North China HSR ➔' } },
    { id: 'CN_ZhengzhouEast', name: '鄭州東', name_en: 'Zhengzhou East', x: 0, y: -2800, region: 'china_north', interchange: true },
    { id: 'CN_Wuhan', name: '武漢', name_en: 'Wuhan', x: 0, y: -2400, region: 'china_north', tier: 'hub' },
    { id: 'CN_ChangshaSouth', name: '長沙南', name_en: 'Changsha South', x: 0, y: -2000, region: 'china_south' },
    { id: 'CN_GuangzhouSouth', name: '廣州南', name_en: 'Guangzhou South', x: 0, y: -1600, region: 'china_south', tier: 'hub',
      gateway: { targetRegion: 'guangxi', label_zh: '往 廣西/東盟門戶 ➔', label_en: 'To Guangxi / ASEAN Gateway ➔' } },
    { id: 'CN_ShenzhenNorth', name: '深圳北', name_en: 'Shenzhen North', x: 0, y: -1300, region: 'china_south', tier: 'hub' },
    { id: 'HK_WestKowloon', name: '香港西九龍', name_en: 'Hong Kong West Kowloon', x: 0, y: -1050, region: 'hongkong', type: 'gateway', tier: 'hub',
      gateway: { targetRegion: 'hongkong', label_zh: '往 香港市區 ➔', label_en: 'To Hong Kong Urban ➔' } },
  ],
});

// ── Spine: 京滬高鐵 ──
routeSpine({
  id: 'CN_JINGHU',
  name: '京滬高鐵',
  name_en: 'Beijing–Shanghai HSR',
  color: COLORS.hsr,
  region: 'china_north',
  tier: 'backbone',
  prefix: 'JH',
  defaultTier: 'hub',
  nodes: [
    { id: 'CN_BeijingSouth', name: '北京南', name_en: 'Beijing South', x: 0, y: -3200, region: 'china_north' },
    { id: 'CN_XianNorth', name: '西安北', name_en: "Xi'an North", x: -400, y: -3000, region: 'china_north', tier: 'hub' },
    { id: 'CN_NanjingSouth', name: '南京南', name_en: 'Nanjing South', x: 600, y: -2900, region: 'china_north' },
    { id: 'CN_ShanghaiHongqiao', name: '上海虹橋', name_en: 'Shanghai Hongqiao', x: 900, y: -3100, region: 'china_north', tier: 'hub',
      gateway: { targetRegion: 'china_north', label_zh: '往 華東樞紐 ➔', label_en: 'To East China Hub ➔' } },
  ],
});

// ── Spine 2: 南廣/貴廣軸 ──
routeSpine({
  id: 'CN_GUANGXI_SPINE',
  name: '南廣貴廣城際',
  name_en: 'Nanning–Guangzhou Intercity',
  color: COLORS.intercity,
  region: 'guangxi',
  tier: 'backbone',
  prefix: 'GX',
  defaultTier: 'hub',
  nodes: [
    { id: 'CN_NanningEast', name: '南寧東', name_en: 'Nanning East', x: -1200, y: -1000, region: 'guangxi', tier: 'hub',
      gateway: { targetRegion: 'guangxi', label_zh: '往 西南門戶 ➔', label_en: 'To Southwest Gateway ➔' } },
    { id: 'CN_Guilin', name: '桂林', name_en: 'Guilin', x: -900, y: -1100, region: 'guangxi', interchange: true },
    { id: 'CN_ZhaoqingEast', name: '肇慶東', name_en: 'Zhaoqing East', x: -500, y: -1400, region: 'guangxi' },
    { id: 'CN_GuangzhouSouth', name: '廣州南', name_en: 'Guangzhou South', x: 0, y: -1600, region: 'china_south' },
  ],
});

// ── Cross-border GBA ──
addStation({ id: 'SZ_Luohu', name: '深圳羅湖', name_en: 'Shenzhen Luohu', x: 150, y: -1150, region: 'china_south', type: 'gateway', tier: 'hub',
  gateway: { targetRegion: 'hongkong', label_zh: '往 香港東鐵綫 ➔', label_en: 'To HK East Rail ➔' } });
addStation({ id: 'HK_LoWu', name: '羅湖', name_en: 'Lo Wu', x: 150, y: -900, region: 'hongkong', type: 'gateway', tier: 'hub',
  gateway: { targetRegion: 'china_south', label_zh: '往 深圳/華南高鐵 ➔', label_en: 'To Shenzhen / South China HSR ➔' } });
spineLine('XB_SZ_HK', '廣深口岸', 'Shenzhen–HK Crossing', COLORS.crossborder, 'china_south', 'crossborder', [
  'CN_ShenzhenNorth', 'SZ_Luohu', 'HK_LoWu',
]);

addStation({ id: 'CN_Zhuhai', name: '珠海', name_en: 'Zhuhai', x: -350, y: -1200, region: 'china_south', type: 'gateway', tier: 'hub',
  gateway: { targetRegion: 'macau', label_zh: '往 澳門輕軌 ➔', label_en: 'To Macau LRT ➔' } });

// ── Hong Kong metro grid (0,0) ──
metroGrid({
  region: 'hongkong',
  nodes: [
    { id: 'HK_Central', name: '中環', name_en: 'Central', x: 0, y: 0, type: 'interchange', tier: 'major' },
    { id: 'HK_Admiralty', name: '金鐘', name_en: 'Admiralty', x: 120, y: 0, type: 'interchange', tier: 'major' },
    { id: 'HK_WanChai', name: '灣仔', name_en: 'Wan Chai', x: 240, y: 0, tier: 'regular' },
    { id: 'HK_CausewayBay', name: '銅鑼灣', name_en: 'Causeway Bay', x: 360, y: 0, tier: 'regular' },
    { id: 'HK_TST', name: '尖沙咀', name_en: 'Tsim Sha Tsui', x: 0, y: 120, type: 'interchange', tier: 'major' },
    { id: 'HK_MongKok', name: '旺角', name_en: 'Mong Kok', x: 0, y: 240, type: 'interchange', tier: 'regular' },
    { id: 'HK_HungHom', name: '紅磡', name_en: 'Hung Hom', x: 240, y: 360, type: 'interchange', tier: 'major' },
    { id: 'HK_KowloonTong', name: '九龍塘', name_en: 'Kowloon Tong', x: 120, y: 360, type: 'interchange', tier: 'regular' },
    { id: 'HK_TaiWai', name: '大圍', name_en: 'Tai Wai', x: 120, y: 480, tier: 'regular' },
    { id: 'HK_ShaTin', name: '沙田', name_en: 'Sha Tin', x: 120, y: 600, tier: 'regular' },
    { id: 'HK_Fanling', name: '粉嶺', name_en: 'Fanling', x: 150, y: 720, tier: 'regular' },
  ],
  segments: [
    { id: 'HK_ISL', name: '港島綫', name_en: 'Island Line', color: COLORS.metro_hk_blue,
      path: [['HK_Central', 'HK_Admiralty'], ['HK_Admiralty', 'HK_WanChai'], ['HK_WanChai', 'HK_CausewayBay']] },
    { id: 'HK_TWL', name: '荃灣綫', name_en: 'Tsuen Wan Line', color: COLORS.metro_hk,
      path: [['HK_Central', 'HK_TST'], ['HK_TST', 'HK_MongKok']] },
    { id: 'HK_EAL', name: '東鐵綫', name_en: 'East Rail Line', color: COLORS.metro_hk_teal,
      path: [['HK_HungHom', 'HK_KowloonTong'], ['HK_KowloonTong', 'HK_TaiWai'], ['HK_TaiWai', 'HK_ShaTin'], ['HK_ShaTin', 'HK_Fanling'], ['HK_Fanling', 'HK_LoWu']] },
    { id: 'HK_CONNECT', name: '西九龍接駁', name_en: 'West Kowloon Link', color: COLORS.metro_hk_teal,
      path: [['HK_WestKowloon', 'HK_TST'], ['HK_TST', 'HK_HungHom']] },
  ],
});

// ── Macau LRT (-400, 200) ──
routeSpine({
  id: 'MO_LRT',
  name: '澳門輕軌',
  name_en: 'Macau LRT',
  color: COLORS.macau,
  region: 'macau',
  tier: 'regional',
  prefix: 'MO',
  nodes: [
    { id: 'MO_Barra', name: '媽閣', name_en: 'Barra', x: -500, y: 200, interchange: true },
    { id: 'MO_Taipa', name: '氹仔客運碼頭', name_en: 'Taipa Ferry', x: -400, y: 300 },
    { id: 'MO_Cotai', name: '路氹東', name_en: 'Cotai East', x: -300, y: 300, interchange: true },
    { id: 'MO_BorderGate', name: '關閘', name_en: 'Border Gate', x: -400, y: 150, type: 'gateway', tier: 'hub',
      gateway: { targetRegion: 'china_south', label_zh: '往 珠海/珠三角 ➔', label_en: 'To Zhuhai / PRD ➔' } },
    { id: 'MO_Hengqin', name: '橫琴', name_en: 'Hengqin', x: -250, y: 100, type: 'gateway',
      gateway: { targetRegion: 'china_south', label_zh: '往 橫琴口岸 ➔', label_en: 'To Hengqin Port ➔' } },
  ],
});

spineLine('XB_MO_ZH', '珠澳口岸', 'Macau–Zhuhai Crossing', COLORS.crossborder, 'macau', 'crossborder', [
  'MO_BorderGate', 'CN_Zhuhai',
]);

// ── Taiwan THSR + loop (1600, 600) ──
routeSpine({
  id: 'TW_THSR',
  name: '台灣高鐵',
  name_en: 'Taiwan HSR',
  color: COLORS.metro_tw,
  region: 'taiwan',
  tier: 'backbone',
  prefix: 'TW_HSR',
  defaultTier: 'hub',
  nodes: [
    { id: 'TW_Taipei', name: '台北', name_en: 'Taipei', x: 1600, y: 400, tier: 'hub' },
    { id: 'TW_Banqiao', name: '板橋', name_en: 'Banqiao', x: 1600, y: 500, interchange: true },
    { id: 'TW_Taichung', name: '台中', name_en: 'Taichung', x: 1600, y: 650, tier: 'hub' },
    { id: 'TW_Tainan', name: '台南', name_en: 'Tainan', x: 1600, y: 800 },
    { id: 'TW_Zuoying', name: '左營', name_en: 'Zuoying', x: 1600, y: 920, tier: 'hub',
      gateway: { targetRegion: 'taiwan', label_zh: '往 高雄/南台灣 ➔', label_en: 'To Kaohsiung / South Taiwan ➔' } },
  ],
});

metroGrid({
  region: 'taiwan',
  nodes: [
    { id: 'TW_Keelung', name: '基隆', name_en: 'Keelung', x: 1750, y: 350, tier: 'regular' },
    { id: 'TW_Yilan', name: '宜蘭', name_en: 'Yilan', x: 1850, y: 500, tier: 'regular' },
    { id: 'TW_Hualien', name: '花蓮', name_en: 'Hualien', x: 1950, y: 650, tier: 'regular' },
    { id: 'TW_Taitung', name: '台東', name_en: 'Taitung', x: 1950, y: 850, tier: 'regular' },
    { id: 'TW_Kaohsiung', name: '高雄', name_en: 'Kaohsiung', x: 1750, y: 920, type: 'interchange', tier: 'major' },
  ],
  segments: [
    { id: 'TW_TRA_N', name: '台鐵北環', name_en: 'TRA North Ring', color: COLORS.tra,
      path: [['TW_Keelung', 'TW_Taipei'], ['TW_Taipei', 'TW_Banqiao'], ['TW_Banqiao', 'TW_Yilan']] },
    { id: 'TW_TRA_E', name: '台鐵東部幹線', name_en: 'TRA Eastern Line', color: COLORS.tra,
      path: [['TW_Yilan', 'TW_Hualien'], ['TW_Hualien', 'TW_Taitung'], ['TW_Taitung', 'TW_Kaohsiung'], ['TW_Kaohsiung', 'TW_Zuoying']] },
  ],
});

// ── Spine 3: 日本新幹線全縱貫 ──
routeSpine({
  id: 'JP_SHINKANSEN',
  name: '新幹線全縱貫',
  name_en: 'Japan Shinkansen Backbone',
  color: COLORS.hsr,
  region: 'japan_south',
  tier: 'backbone',
  prefix: 'JP_SN',
  defaultTier: 'hub',
  nodes: [
    { id: 'JP_Kagoshima', name: '鹿兒島中央', name_en: 'Kagoshima-Chuo', x: 3000, y: -200, tier: 'hub',
      gateway: { targetRegion: 'japan_south', label_zh: '往 九州南端 ➔', label_en: 'To Kyushu South ➔' } },
    { id: 'JP_Hakata', name: '博多', name_en: 'Hakata', x: 3200, y: -400, tier: 'hub' },
    { id: 'JP_Hiroshima', name: '廣島', name_en: 'Hiroshima', x: 3400, y: -600, tier: 'hub' },
    { id: 'JP_ShinOsaka', name: '新大阪', name_en: 'Shin-Osaka', x: 3600, y: -800, tier: 'hub',
      gateway: { targetRegion: 'japan_south', label_zh: '往 關西圈 ➔', label_en: 'To Kansai ➔' } },
    { id: 'JP_Nagoya', name: '名古屋', name_en: 'Nagoya', x: 3800, y: -1000, tier: 'hub',
      gateway: { targetRegion: 'japan_tokyo', label_zh: '往 東京/東海道 ➔', label_en: 'To Tokyo / Tokaido ➔' } },
    { id: 'JP_Tokyo', name: '東京', name_en: 'Tokyo', x: 4500, y: -1600, tier: 'hub',
      gateway: { targetRegion: 'japan_tokyo', label_zh: '往 東京圈地鐵 ➔', label_en: 'To Tokyo Metro ➔' } },
    { id: 'JP_Sendai', name: '仙台', name_en: 'Sendai', x: 5500, y: -2400, tier: 'hub',
      gateway: { targetRegion: 'japan_north', label_zh: '往 東北/北海道 ➔', label_en: 'To Tohoku / Hokkaido ➔' } },
    { id: 'JP_ShinHakodate', name: '新函館北斗', name_en: 'Shin-Hakodate-Hokuto', x: 6300, y: -3100, tier: 'hub',
      gateway: { targetRegion: 'japan_north', label_zh: '往 北海道 ➔', label_en: 'To Hokkaido ➔' } },
    { id: 'JP_Sapporo', name: '札幌', name_en: 'Sapporo', x: 6500, y: -3200, tier: 'hub',
      gateway: { targetRegion: 'japan_north', label_zh: '往 北海道樞紐 ➔', label_en: 'To Hokkaido Hub ➔' } },
  ],
});

// ── Tokyo metro ring (4500, -1600) ──
metroGrid({
  region: 'japan_tokyo',
  nodes: [
    { id: 'JP_Ueno', name: '上野', name_en: 'Ueno', x: 4600, y: -1600, type: 'interchange', tier: 'major' },
    { id: 'JP_Shinagawa', name: '品川', name_en: 'Shinagawa', x: 4400, y: -1600, type: 'interchange', tier: 'major' },
    { id: 'JP_Shibuya', name: '澀谷', name_en: 'Shibuya', x: 4400, y: -1700, type: 'interchange', tier: 'regular' },
    { id: 'JP_Shinjuku', name: '新宿', name_en: 'Shinjuku', x: 4500, y: -1700, type: 'interchange', tier: 'major' },
    { id: 'JP_Ikebukuro', name: '池袋', name_en: 'Ikebukuro', x: 4600, y: -1700, type: 'interchange', tier: 'regular' },
  ],
  segments: [
    { id: 'JP_YAMANOTE', name: '山手線', name_en: 'Yamanote Line', color: COLORS.metro_jp,
      path: [['JP_Ueno', 'JP_Tokyo'], ['JP_Tokyo', 'JP_Shinagawa'], ['JP_Shinagawa', 'JP_Shibuya'], ['JP_Shibuya', 'JP_Shinjuku'], ['JP_Shinjuku', 'JP_Ikebukuro'], ['JP_Ikebukuro', 'JP_Ueno']] },
    { id: 'JP_MARUNOUCHI', name: '丸之內線', name_en: 'Marunouchi Line', color: COLORS.metro_jp_red,
      path: [['JP_Ikebukuro', 'JP_Tokyo'], ['JP_Tokyo', 'JP_Shinjuku']] },
  ],
});

// ── Tohoku extension (Morioka) ──
addStation({ id: 'JP_Morioka', name: '盛岡', name_en: 'Morioka', x: 6000, y: -2800, region: 'japan_north', type: 'interchange', tier: 'hub' });
spineLine('JP_TOHOKU_EXT', '東北延伸', 'Tohoku Extension', COLORS.hsr, 'japan_north', 'backbone', [
  'JP_Sendai', 'JP_Morioka', 'JP_ShinHakodate',
]);

// Validate
const ids = new Set(stations.map((s) => s.id));
for (const line of lines) {
  for (const [a, b] of line.path) {
    if (!ids.has(a) || !ids.has(b)) {
      console.error(`Broken path ${line.id}: ${a} → ${b}`);
      process.exit(1);
    }
  }
}

const xs = stations.map((s) => s.x);
const ys = stations.map((s) => s.y);
const payload = {
  version: 2,
  updated: new Date().toISOString(),
  canvas: {
    minX: Math.min(...xs) - 300,
    minY: Math.min(...ys) - 300,
    maxX: Math.max(...xs) + 300,
    maxY: Math.max(...ys) + 300,
  },
  regions,
  stations,
  lines,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`✓ ${OUT}`);
console.log(`  ${regions.length} regions · ${stations.length} stations · ${lines.length} lines`);
