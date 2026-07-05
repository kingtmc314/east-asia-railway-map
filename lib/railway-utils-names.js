/** 取得顯示用路線/車站名稱（優先中文） */
export function getDisplayName(props = {}) {
  return (
    props['name:zh'] ||
    props['name:zh-TW'] ||
    props['name:zh-HK'] ||
    props['name:zh-CN'] ||
    props.name ||
    props['name:en'] ||
    props['name:ja'] ||
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
