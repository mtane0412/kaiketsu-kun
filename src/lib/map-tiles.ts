/**
 * 地図の画像（タイル）の設定（OpenStreetMap）
 *
 * 無料でキーが不要です。出典の明示が利用条件のため、attribution を地図に必ず表示します。
 * 注意: OpenStreetMap の公式タイルは、大量のアクセスを想定していません（タイルの利用ルールによる）。
 */

/** 地図のズームレベルの範囲です。最小は世界全体が収まる縮尺で、タイルはこの範囲で提供されています。 */
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 18;

/** タイルのURLです。 */
export const MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** 地図に表示する出典です。 */
export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
