/**
 * 鐵路公司/路線官方色對照表
 * 優先使用 OSM color/colour 標籤，否則依 operator/network/name 匹配
 */

/** @type {Array<{ patterns: string[]; color: string; field?: 'operator'|'network'|'name'|'ref' }>} */
export const COLOR_MAPPINGS = [
  // ── 台灣 ──
  { patterns: ['台灣高鐵', '台湾高铁', 'Taiwan High Speed Rail', 'THSR'], color: '#FF6600', field: 'operator' },
  { patterns: ['高鐵', '高铁'], color: '#FF6600', field: 'name' },
  { patterns: ['台灣鐵路', '台湾铁路', '台铁', '台鐵', 'TRA', 'Taiwan Railway'], color: '#005B94', field: 'operator' },
  { patterns: ['台北捷運', '臺北捷運', '台北地铁', 'Taipei Metro'], color: '#007749', field: 'operator' },
  { patterns: ['高雄捷運', '高雄地铁', 'Kaohsiung Metro'], color: '#007749', field: 'operator' },
  { patterns: ['文湖線', 'BR'], color: '#BF8B00', field: 'name' },
  { patterns: ['淡水信義線', '紅線', 'R'], color: '#E3002C', field: 'name' },
  { patterns: ['板南線', '藍線'], color: '#007AFF', field: 'name' },
  { patterns: ['中和新蘆線', '橙線'], color: '#FFC72C', field: 'name' },
  { patterns: ['松山新店線', '綠線'], color: '#008659', field: 'name' },

  // ── 香港 ──
  { patterns: ['港鐵', 'MTR', 'Mass Transit Railway'], color: '#CC0000', field: 'operator' },
  { patterns: ['觀塘線', 'Kwun Tong Line'], color: '#00A752', field: 'name' },
  { patterns: ['荃灣線', 'Tsuen Wan Line'], color: '#E60012', field: 'name' },
  { patterns: ['港島線', 'Island Line'], color: '#007DC5', field: 'name' },
  { patterns: ['東涌線', 'Tung Chung Line'], color: '#F7943D', field: 'name' },
  { patterns: ['將軍澳線', 'Tseung Kwan O Line'], color: '#7D499D', field: 'name' },
  { patterns: ['東鐵線', 'East Rail Line'], color: '#5EB6E4', field: 'name' },
  { patterns: ['屯馬線', 'Tuen Ma Line'], color: '#9A3B26', field: 'name' },
  { patterns: ['南港島線', 'South Island Line'], color: '#B5BD00', field: 'name' },
  { patterns: ['迪士尼線', 'Disneyland Resort Line'], color: '#F173AC', field: 'name' },
  { patterns: ['機場快線', 'Airport Express'], color: '#00888A', field: 'name' },
  { patterns: ['輕鐵', 'Light Rail'], color: '#CD9700', field: 'name' },

  // ── 澳門 ──
  { patterns: ['澳門輕軌', 'Macau LRT'], color: '#89CFF0', field: 'operator' },

  // ── 日本 JR ──
  { patterns: ['JR東日本', 'JR East', '東日本旅客鐵道'], color: '#008000', field: 'operator' },
  { patterns: ['JR西日本', 'JR West', '西日本旅客鐵道'], color: '#0078C9', field: 'operator' },
  { patterns: ['JR東海', 'JR Central', '東海旅客鐵道'], color: '#FF6600', field: 'operator' },
  { patterns: ['JR北海道', 'JR Hokkaido'], color: '#008000', field: 'operator' },
  { patterns: ['JR九州', 'JR Kyushu'], color: '#E60012', field: 'operator' },
  { patterns: ['JR四国', 'JR Shikoku'], color: '#008000', field: 'operator' },
  { patterns: ['山手線', 'Yamanote Line', 'Yamanote'], color: '#80C241', field: 'name' },
  { patterns: ['中央線', 'Chuo Line'], color: '#FF6600', field: 'name' },
  { patterns: ['京浜東北線', 'Keihin-Tohoku'], color: '#00B2E5', field: 'name' },
  { patterns: ['総武線', 'Sobu Line'], color: '#FFD400', field: 'name' },
  { patterns: ['東海道新幹線', 'Tokaido Shinkansen'], color: '#0066CC', field: 'name' },
  { patterns: ['山陽新幹線', 'Sanyo Shinkansen'], color: '#0066CC', field: 'name' },
  { patterns: ['東北新幹線', 'Tohoku Shinkansen'], color: '#0066CC', field: 'name' },
  { patterns: ['新幹線', 'Shinkansen'], color: '#0066CC', field: 'name' },

  // ── 日本私鐵 ──
  { patterns: ['阪急電鐵', '阪急', 'Hankyu'], color: '#800020', field: 'operator' },
  { patterns: ['阪神電鐵', '阪神', 'Hanshin'], color: '#009944', field: 'operator' },
  { patterns: ['近畿日本鐵道', '近鐵', 'Kintetsu'], color: '#0068B7', field: 'operator' },
  { patterns: ['南海電鐵', '南海', 'Nankai'], color: '#FF6600', field: 'operator' },
  { patterns: ['京阪電鐵', '京阪', 'Keihan'], color: '#006633', field: 'operator' },
  { patterns: ['東急電鐵', '東急', 'Tokyu'], color: '#E60012', field: 'operator' },
  { patterns: ['小田急電鐵', '小田急', 'Odakyu'], color: '#0068B7', field: 'operator' },
  { patterns: ['京王電鐵', '京王', 'Keio'], color: '#E60012', field: 'operator' },
  { patterns: ['西武鉄道', '西武', 'Seibu'], color: '#009944', field: 'operator' },
  { patterns: ['東武鉄道', '東武', 'Tobu'], color: '#0068B7', field: 'operator' },
  { patterns: ['名古屋市営地下鉄', 'Nagoya Metro'], color: '#E60012', field: 'operator' },
  { patterns: ['Osaka Metro', '大阪市交通局', '大阪地下鉄'], color: '#E60012', field: 'operator' },
  { patterns: ['御堂筋線', 'Midosuji Line'], color: '#E60012', field: 'name' },
  { patterns: ['東京Metro', '東京メトロ', 'Tokyo Metro'], color: '#009944', field: 'operator' },
  { patterns: ['都營地下鉄', 'Toei Subway'], color: '#E60012', field: 'operator' },

  // ── 中國大陸 ──
  { patterns: ['中国铁路', '中國鐵路', 'CR', 'China Railway'], color: '#003DA5', field: 'operator' },
  { patterns: ['京沪高铁', '京滬高鐵', '京广高铁', '京廣高鐵'], color: '#E60012', field: 'name' },
  { patterns: ['高速铁路', '高鐵', '高铁'], color: '#E60012', field: 'name' },
  { patterns: ['上海地铁', '上海地鐵', 'Shanghai Metro'], color: '#E60012', field: 'operator' },
  { patterns: ['北京地铁', '北京地鐵', 'Beijing Subway'], color: '#0066CC', field: 'operator' },
  { patterns: ['广州地铁', '廣州地鐵', 'Guangzhou Metro'], color: '#E60012', field: 'operator' },
  { patterns: ['深圳地铁', '深圳地鐵', 'Shenzhen Metro'], color: '#006633', field: 'operator' },
];

const DEFAULT_COLORS = {
  hsr: '#E60012',
  intercity: '#003DA5',
  metro: '#7C3AED',
  tram: '#059669',
  default: '#64748B',
};

const HSR_PATTERNS = [
  '高鐵', '高铁', '高速', '新幹線', 'Shinkansen', 'HSR', 'High Speed', 'highspeed',
  '京沪', '京滬', '京广', '京廣', '沪昆', '滬昆',
];

function normalizeColor(raw) {
  if (!raw) return null;
  let c = String(raw).trim();
  if (/^#[0-9A-Fa-f]{3}$/.test(c)) {
    c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(c)) return c.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(c)) return `#${c.toUpperCase()}`;
  return null;
}

function matchesPattern(text, pattern) {
  if (!text) return false;
  return text.toLowerCase().includes(pattern.toLowerCase());
}

function getFieldValues(props) {
  return {
    operator: props.operator || '',
    network: props.network || '',
    name: props.name || props['name:zh'] || props['name:en'] || props['name:ja'] || '',
    ref: props.ref || '',
  };
}

export function isHighSpeedLine(props = {}) {
  if (props.highspeed === 'yes') return true;
  if (props.line_tier === 'hsr') return true;
  const text = [
    props.name, props['name:zh'], props['name:en'], props['name:ja'],
    props.network, props.ref, props.usage,
  ].filter(Boolean).join(' ');
  return HSR_PATTERNS.some((p) => matchesPattern(text, p));
}

export function classifyLineTier(props = {}) {
  if (props.railway === 'subway') return 'metro';
  if (props.railway === 'tram') return 'tram';
  if (isHighSpeedLine(props)) return 'hsr';
  if (props.railway === 'rail') return 'intercity';
  return 'other';
}

export function resolveLineColor(props = {}) {
  const osmColor = normalizeColor(props.color || props.colour);
  if (osmColor) return osmColor;

  const fields = getFieldValues(props);
  for (const mapping of COLOR_MAPPINGS) {
    const field = mapping.field || 'operator';
    const value = fields[field];
    if (mapping.patterns.some((p) => matchesPattern(value, p))) {
      return mapping.color;
    }
  }

  // 跨欄位 fallback 搜尋
  const allText = Object.values(fields).join(' ');
  for (const mapping of COLOR_MAPPINGS) {
    if (mapping.patterns.some((p) => matchesPattern(allText, p))) {
      return mapping.color;
    }
  }

  const tier = classifyLineTier(props);
  return DEFAULT_COLORS[tier] || DEFAULT_COLORS.default;
}

export function enrichFeatureProperties(props = {}) {
  const line_tier = classifyLineTier(props);
  const line_color = resolveLineColor(props);
  const label_zh =
    props['name:zh'] ||
    props['name:zh-TW'] ||
    props['name:zh-HK'] ||
    props['name:zh-CN'] ||
    props.name ||
    '';

  return {
    ...props,
    line_tier,
    line_color,
    label_zh,
    is_hsr: line_tier === 'hsr' ? 1 : 0,
  };
}
