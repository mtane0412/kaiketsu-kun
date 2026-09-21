/**
 * 地理院タイルの表示と、地図の種類（標準地図・淡色地図）の切り替え
 *
 * MapContainer の中に置くと、地図の右上に切り替えの選択肢を表示します。
 * 注意: 選んだ種類は保存しません。地図を開き直すと defaultStyle に戻ります。
 */
'use client';

import { LayersControl, TileLayer } from 'react-leaflet';
import { GSI_ATTRIBUTION, GSI_TILE_STYLES, type GsiTileStyle } from '@/lib/gsi-tiles';

type GsiTileLayersProps = {
  /** 最初に表示する地図の種類です。 */
  defaultStyle: GsiTileStyle;
};

export function GsiTileLayers({ defaultStyle }: GsiTileLayersProps) {
  return (
    <LayersControl position="topright" collapsed={false}>
      {GSI_TILE_STYLES.map(({ style, label, url }) => (
        <LayersControl.BaseLayer key={style} name={label} checked={style === defaultStyle}>
          <TileLayer url={url} attribution={GSI_ATTRIBUTION} />
        </LayersControl.BaseLayer>
      ))}
    </LayersControl>
  );
}
