import { feature } from 'topojson-client';
import { getDisplayName, getEnglishName, getLineKey } from './railway-utils-names.js';

export { getDisplayName, getEnglishName, getLineKey };

const STATION_SNAP_DEG = 0.004;

/** 計算車站交會路線 */
export function enrichStations(lines, stations) {
  const thresholdSq = STATION_SNAP_DEG * STATION_SNAP_DEG;

  return stations.map((station) => {
    const [sx, sy] = station.geometry.coordinates;
    const connectedLines = [];
    const seen = new Set();

    for (const line of lines) {
      const coords = line.geometry.coordinates;
      let matched = false;
      for (let i = 0; i < coords.length; i++) {
        const dx = coords[i][0] - sx;
        const dy = coords[i][1] - sy;
        if (dx * dx + dy * dy <= thresholdSq) {
          matched = true;
          break;
        }
      }

      if (matched) {
        const key = getLineKey(line.properties);
        if (!seen.has(key)) {
          seen.add(key);
          connectedLines.push({
            osm_id: line.properties.osm_id,
            name: getDisplayName(line.properties),
            nameEn: getEnglishName(line.properties),
            operator: line.properties.operator || null,
            railway: line.properties.railway,
            network: line.properties.network || null,
            line_color: line.properties.line_color || null,
          });
        }
      }
    }

    return {
      ...station,
      properties: {
        ...station.properties,
        transfer_count: connectedLines.length,
        connected_line_ids: connectedLines.map((l) => l.osm_id),
        connected_lines: connectedLines,
      },
    };
  });
}

/** 解析 TopoJSON */
export function decodeTopology(topology) {
  if (!topology?.objects) {
    return {
      lines: { type: 'FeatureCollection', features: [] },
      stations: { type: 'FeatureCollection', features: [] },
    };
  }
  return {
    lines: topology.objects.lines
      ? feature(topology, topology.objects.lines)
      : { type: 'FeatureCollection', features: [] },
    stations: topology.objects.stations
      ? feature(topology, topology.objects.stations)
      : { type: 'FeatureCollection', features: [] },
  };
}

export function mergeCollections(existing, incoming) {
  const seen = new Set(
    existing.features.map((f) => `${f.properties?.osm_type}/${f.properties?.osm_id}`)
  );
  const merged = [...existing.features];
  for (const f of incoming.features) {
    const key = `${f.properties?.osm_type}/${f.properties?.osm_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(f);
    }
  }
  return { type: 'FeatureCollection', features: merged };
}

export function bboxIntersects(a, b) {
  const [aw, as, ae, an] = a;
  const [bw, bs, be, bn] = b;
  return !(ae < bw || aw > be || an < bs || as > bn);
}

export function getMapBbox(map) {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

/** 更新 MapLibre source 並重建轉乘索引 */
export function applyDataToMap(map, allLines, enrichedStations, stationMetaRef) {
  stationMetaRef.current.clear();
  for (const st of enrichedStations) {
    stationMetaRef.current.set(st.properties.osm_id, {
      connectedLines: st.properties.connected_lines,
      connected_line_ids: st.properties.connected_line_ids,
      transfer_count: st.properties.transfer_count,
    });
  }

  map.getSource('railway-lines').setData({
    type: 'FeatureCollection',
    features: allLines,
  });
  map.getSource('railway-stations').setData({
    type: 'FeatureCollection',
    features: enrichedStations.map((st) => ({
      ...st,
      properties: {
        ...st.properties,
        transfer_count: st.properties.transfer_count,
      },
    })),
  });
}
