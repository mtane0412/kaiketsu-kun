/**
 * 地図の画像（OpenStreetMap のタイル）の表示
 *
 * MapContainer の中に置くと、OpenStreetMap のタイルを出典と共に表示します。
 */
'use client';

import { TileLayer } from 'react-leaflet';
import { MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from '@/lib/map-tiles';

export function MapTileLayer() {
  return <TileLayer url={MAP_TILE_URL} attribution={MAP_TILE_ATTRIBUTION} />;
}
