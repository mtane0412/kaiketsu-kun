/**
 * 地図の画像（タイル）の表示と、地図の種類（地理院タイルの淡色地図・標準地図、OpenStreetMap）の切り替え
 *
 * MapContainer の中に置くと、地図の右上に切り替えの選択肢を表示します。
 * 注意: 選んだ種類は保存しません。地図を開き直すと defaultStyle に戻ります。
 */
'use client';

import { LayersControl, TileLayer } from 'react-leaflet';
import { MAP_TILE_STYLES, type MapTileStyle } from '@/lib/map-tiles';

type MapTileLayersProps = {
  /** 最初に表示する地図の種類です。 */
  defaultStyle: MapTileStyle;
};

export function MapTileLayers({ defaultStyle }: MapTileLayersProps) {
  return (
    <LayersControl position="topright" collapsed={false}>
      {MAP_TILE_STYLES.map(({ style, label, url, attribution }) => (
        <LayersControl.BaseLayer key={style} name={label} checked={style === defaultStyle}>
          <TileLayer url={url} attribution={attribution} />
        </LayersControl.BaseLayer>
      ))}
    </LayersControl>
  );
}
