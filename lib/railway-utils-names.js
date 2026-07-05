/** 取得顯示用路線/車站名稱（繁體中文優先） */
export function getDisplayName(props = {}) {
  return (
    props['name:zh-Hant'] ||
    props['name:zh-HK'] ||
    props['name:zh-TW'] ||
    props['name:zh'] ||
    props['name:ja'] ||
    props.name ||
    props['name:en'] ||
    props.ref ||
    props.network ||
    '未命名'
  );
}

export function getEnglishName(props = {}) {
  return props['name:en'] || props.name || null;
}

export function getLineKey(props = {}) {
  return `${props.osm_id ?? ''}:${getDisplayName(props)}`;
}
