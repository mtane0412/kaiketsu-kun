/**
 * 地図に重ねたパネルが地図を覆う幅（地図の左端・上端からの距離）の計算
 *
 * 地図ビュー（src/components/views/MapView.tsx）は、操作のパネルを地図の左上に重ねます。
 * ピンがパネルの裏に隠れないよう、地図の位置合わせ（すべてのピンを収める・選択中のピンへ移る）では、
 * パネルが覆う部分を除いた残りの領域にピンを収めます。ここでは、その除く幅を求めます。
 *
 * パネルは左上の角にあるため、残りの領域の候補は「パネルの右側」か「パネルの下側」です。
 * 広い画面ではパネルが縦長になり右側が、狭い画面ではパネルが地図の幅いっぱいになり下側が、広く空きます。
 * そこで、面積の広い方を残りの領域とし、もう一方の向きは覆わないものとして扱います。
 * 両方の向きを覆うものとして扱うと、残りの領域が右下の狭い一角だけになり、ピンが極端に小さく表示されるためです。
 */

/** 画面上での要素の位置と大きさです（DOMRect のうち、計算に使う4つ）。 */
export type ElementRect = { left: number; top: number; width: number; height: number };

/** パネルが地図を覆う幅（px）です。地図の左端から left、上端から top までを、ピンを置かない領域とします。 */
export type ObscuredInset = { left: number; top: number };

/**
 * パネルが地図を覆う幅を返します。
 * パネルが無い（隠している）場合は、地図を覆いません。
 *
 * @param map - 地図の領域です
 * @param panel - 地図に重ねたパネルの領域です。パネルを隠している場合は undefined を渡します
 */
export function obscuredInset(map: ElementRect, panel: ElementRect | undefined): ObscuredInset {
  if (!panel) return { left: 0, top: 0 };

  const panelRight = panel.left + panel.width - map.left;
  const panelBottom = panel.top + panel.height - map.top;
  const freeRightArea = (map.width - panelRight) * map.height;
  const freeBelowArea = map.width * (map.height - panelBottom);

  return freeRightArea >= freeBelowArea ? { left: panelRight, top: 0 } : { left: 0, top: panelBottom };
}
