/**
 * 地図の画像（タイル）の設定（国土地理院の地理院タイル・OpenStreetMap）
 *
 * どちらも無料でキーが不要です。出典の明示が利用条件のため、タイルごとの attribution を地図に必ず表示します。
 * - 地理院タイル: 日本国内の情報が細かい地図です。標準地図は地名・道路・等高線などの情報量が多く、
 *   淡色地図は同じ内容を淡い色で描いた、ピンや線を重ねても見やすい地図です。
 * - OpenStreetMap: 世界中の地名・道路が載っている地図です。海外の場所を扱うときに使います。
 *   注意: OpenStreetMap の公式タイルは、大量のアクセスを想定していません（タイルの利用ルールによる）。
 */

const GSI_ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/** 地図のズームレベルの範囲です。最小は世界全体が収まる縮尺で、どのタイルもこの範囲で提供されています。 */
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 18;

/** 切り替えられる地図の種類です。 */
export type MapTileStyle = 'standard' | 'pale' | 'osm';

/** 地図の種類ごとの表示名・タイルのURL・出典です。切り替えの選択肢は、この順に並びます。 */
export const MAP_TILE_STYLES: { style: MapTileStyle; label: string; url: string; attribution: string }[] = [
  { style: 'pale', label: '淡色地図', url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', attribution: GSI_ATTRIBUTION },
  { style: 'standard', label: '標準地図', url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', attribution: GSI_ATTRIBUTION },
  { style: 'osm', label: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: OSM_ATTRIBUTION },
];
