/**
 * 国土地理院の地理院タイルの設定
 *
 * 地理院タイルは無料でキーが不要です。出典の明示が利用条件のため、地図には必ず GSI_ATTRIBUTION を表示します。
 * 標準地図は地名・道路・等高線などの情報量が多く、淡色地図は同じ内容を淡い色で描いた、ピンや線を重ねても見やすい地図です。
 */

export const GSI_ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>';

/** 地理院タイル（標準地図・淡色地図）が提供されているズームレベルの範囲です。 */
export const MIN_ZOOM = 5;
export const MAX_ZOOM = 18;

/** 切り替えられる地図の種類です。 */
export type GsiTileStyle = 'standard' | 'pale';

/** 地図の種類ごとの表示名とタイルのURLです。切り替えの選択肢は、この順に並びます。 */
export const GSI_TILE_STYLES: { style: GsiTileStyle; label: string; url: string }[] = [
  { style: 'pale', label: '淡色地図', url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png' },
  { style: 'standard', label: '標準地図', url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png' },
];
