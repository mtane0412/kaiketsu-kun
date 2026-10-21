/**
 * 地図に重ねたパネルが地図を覆う幅（地図の左端・上端からの距離）の計算のテスト
 */
import { describe, expect, it } from 'vitest';
import { obscuredInset } from './map-obscured-inset';

/** 広い画面の地図の領域です（幅1180px・高さ844px）。 */
const wideMap = { left: 256, top: 56, width: 1180, height: 844 };

/** 狭い画面の地図の領域です（幅390px・高さ788px）。 */
const narrowMap = { left: 0, top: 56, width: 390, height: 788 };

describe('obscuredInset', () => {
  it('パネルが無い（隠している）場合は、地図を覆わない', () => {
    expect(obscuredInset(wideMap, undefined)).toEqual({ left: 0, top: 0 });
  });

  it('広い画面で左に縦長のパネルがある場合は、パネルの右端までを、地図の左端から覆う幅とする', () => {
    // 前提: パネルは地図の左端から8pxの位置に、幅448px・高さ780pxで重なっている
    const panel = { left: 264, top: 100, width: 448, height: 780 };

    // パネルの右側（幅 1180 - 456 = 724px）の方が、パネルの下側より広く空いている
    expect(obscuredInset(wideMap, panel)).toEqual({ left: 456, top: 0 });
  });

  it('狭い画面で上に横長のパネルがある場合は、パネルの下端までを、地図の上端から覆う幅とする', () => {
    // 前提: パネルは地図の幅いっぱい（左右8pxずつ空ける）に、地図の上端から高さ394pxまで重なっている
    const panel = { left: 8, top: 64, width: 374, height: 394 };

    // パネルの下側（高さ 788 - 402 = 386px）の方が、パネルの右側（幅8px）より広く空いている
    expect(obscuredInset(narrowMap, panel)).toEqual({ left: 0, top: 402 });
  });
});
