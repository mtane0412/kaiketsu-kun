/**
 * グラフビューの表示範囲（拡大縮小・平行移動）の計算のテスト
 */
import { describe, expect, it } from 'vitest';
import {
  clientToSvgPoint,
  MAX_ZOOM,
  MIN_ZOOM,
  panViewBox,
  pixelsPerUnit,
  zoomOf,
  zoomViewBox,
  type ViewBox,
} from './graph-viewport';

/** 図の全体が収まる、もとの表示範囲です。倍率1の基準になります。 */
const 全体の表示範囲: ViewBox = { x: 0, y: 0, width: 400, height: 200 };

describe('zoomViewBox', () => {
  it('倍率2で拡大すると、表示範囲の幅と高さが半分になる', () => {
    const 拡大後 = zoomViewBox(全体の表示範囲, 全体の表示範囲, 2, { x: 200, y: 100 });

    expect(拡大後.width).toBeCloseTo(200, 5);
    expect(拡大後.height).toBeCloseTo(100, 5);
  });

  it('拡大の中心に指定した座標は、拡大しても同じ位置にとどまる', () => {
    // 前提: マウスの位置を中心に拡大するため、その座標が表示範囲の中で占める割合は変わらない
    const 中心 = { x: 300, y: 150 };

    const 拡大後 = zoomViewBox(全体の表示範囲, 全体の表示範囲, 2, 中心);

    expect(中心.x).toBeGreaterThanOrEqual(拡大後.x);
    expect(中心.x).toBeLessThanOrEqual(拡大後.x + 拡大後.width);
    // もとの表示範囲で中心が占める割合（横75%・縦75%）が、拡大後も保たれる
    expect((中心.x - 拡大後.x) / 拡大後.width).toBeCloseTo(0.75, 5);
    expect((中心.y - 拡大後.y) / 拡大後.height).toBeCloseTo(0.75, 5);
  });

  it('最大の倍率を超えては拡大しない', () => {
    const 拡大後 = zoomViewBox(全体の表示範囲, 全体の表示範囲, MAX_ZOOM * 10, { x: 200, y: 100 });

    expect(zoomOf(全体の表示範囲, 拡大後)).toBeCloseTo(MAX_ZOOM, 5);
  });

  it('最小の倍率を下回っては縮小しない', () => {
    const 縮小後 = zoomViewBox(全体の表示範囲, 全体の表示範囲, MIN_ZOOM / 10, { x: 200, y: 100 });

    expect(zoomOf(全体の表示範囲, 縮小後)).toBeCloseTo(MIN_ZOOM, 5);
  });

  it('すでに拡大している表示範囲を、さらに拡大できる', () => {
    const 拡大1回目 = zoomViewBox(全体の表示範囲, 全体の表示範囲, 2, { x: 200, y: 100 });
    const 拡大2回目 = zoomViewBox(全体の表示範囲, 拡大1回目, 2, { x: 200, y: 100 });

    expect(zoomOf(全体の表示範囲, 拡大2回目)).toBeCloseTo(4, 5);
  });
});

describe('panViewBox', () => {
  it('図を右下へ動かすと、表示範囲は左上へ動く', () => {
    // 前提: 図をつかんで右下へ引っ張ると、見えている窓（表示範囲）は逆の左上へずれる
    const 移動後 = panViewBox(全体の表示範囲, { x: 30, y: 10 });

    expect(移動後).toEqual({ x: -30, y: -10, width: 400, height: 200 });
  });
});

describe('pixelsPerUnit', () => {
  it('表示範囲と要素の縦横比が違う場合は、全体が収まる側の倍率を返す', () => {
    // 前提: SVGは preserveAspectRatio="xMidYMid meet" のため、収まる方（小さい方）の倍率で表示される
    const 倍率 = pixelsPerUnit({ left: 0, top: 0, width: 800, height: 200 }, { x: 0, y: 0, width: 100, height: 100 });

    expect(倍率).toBeCloseTo(2, 5);
  });
});

describe('clientToSvgPoint', () => {
  /** 横に余白（レターボックス）ができる組み合わせです。倍率2、左右に100pxずつの余白ができます。 */
  const 要素の位置 = { left: 0, top: 0, width: 400, height: 200 };
  const 表示範囲: ViewBox = { x: 0, y: 0, width: 100, height: 100 };

  it('要素の中心の座標を、表示範囲の中心の座標に変換する', () => {
    expect(clientToSvgPoint({ x: 200, y: 100 }, 要素の位置, 表示範囲)).toEqual({ x: 50, y: 50 });
  });

  it('左右の余白のぶんをずらして変換する', () => {
    // 図の左端は、要素の左端ではなく、余白100pxぶん右にある
    expect(clientToSvgPoint({ x: 100, y: 0 }, 要素の位置, 表示範囲)).toEqual({ x: 0, y: 0 });
  });

  it('要素の位置（画面上のずれ）を差し引いて変換する', () => {
    expect(clientToSvgPoint({ x: 150, y: 50 }, { left: 50, top: 50, width: 400, height: 200 }, 表示範囲)).toEqual({ x: 0, y: 0 });
  });

  it('要素に大きさが無い場合は、変換できないため例外を投げる', () => {
    expect(() => clientToSvgPoint({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 }, 表示範囲)).toThrow();
  });
});
