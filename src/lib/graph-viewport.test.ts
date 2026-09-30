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
const fullViewBox: ViewBox = { x: 0, y: 0, width: 400, height: 200 };

describe('zoomViewBox', () => {
  it('倍率2で拡大すると、表示範囲の幅と高さが半分になる', () => {
    const afterZoomIn = zoomViewBox(fullViewBox, fullViewBox, 2, { x: 200, y: 100 });

    expect(afterZoomIn.width).toBeCloseTo(200, 5);
    expect(afterZoomIn.height).toBeCloseTo(100, 5);
  });

  it('拡大の中心に指定した座標は、拡大しても同じ位置にとどまる', () => {
    // 前提: マウスの位置を中心に拡大するため、その座標が表示範囲の中で占める割合は変わらない
    const center = { x: 300, y: 150 };

    const afterZoomIn = zoomViewBox(fullViewBox, fullViewBox, 2, center);

    expect(center.x).toBeGreaterThanOrEqual(afterZoomIn.x);
    expect(center.x).toBeLessThanOrEqual(afterZoomIn.x + afterZoomIn.width);
    // もとの表示範囲で中心が占める割合（横75%・縦75%）が、拡大後も保たれる
    expect((center.x - afterZoomIn.x) / afterZoomIn.width).toBeCloseTo(0.75, 5);
    expect((center.y - afterZoomIn.y) / afterZoomIn.height).toBeCloseTo(0.75, 5);
  });

  it('最大の倍率を超えては拡大しない', () => {
    const afterZoomIn = zoomViewBox(fullViewBox, fullViewBox, MAX_ZOOM * 10, { x: 200, y: 100 });

    expect(zoomOf(fullViewBox, afterZoomIn)).toBeCloseTo(MAX_ZOOM, 5);
  });

  it('最小の倍率を下回っては縮小しない', () => {
    const afterZoomOut = zoomViewBox(fullViewBox, fullViewBox, MIN_ZOOM / 10, { x: 200, y: 100 });

    expect(zoomOf(fullViewBox, afterZoomOut)).toBeCloseTo(MIN_ZOOM, 5);
  });

  it('すでに拡大している表示範囲を、さらに拡大できる', () => {
    const firstZoom = zoomViewBox(fullViewBox, fullViewBox, 2, { x: 200, y: 100 });
    const secondZoom = zoomViewBox(fullViewBox, firstZoom, 2, { x: 200, y: 100 });

    expect(zoomOf(fullViewBox, secondZoom)).toBeCloseTo(4, 5);
  });
});

describe('panViewBox', () => {
  it('図を右下へ動かすと、表示範囲は左上へ動く', () => {
    // 前提: 図をつかんで右下へ引っ張ると、見えている窓（表示範囲）は逆の左上へずれる
    const afterMove = panViewBox(fullViewBox, { x: 30, y: 10 });

    expect(afterMove).toEqual({ x: -30, y: -10, width: 400, height: 200 });
  });
});

describe('pixelsPerUnit', () => {
  it('表示範囲と要素の縦横比が違う場合は、全体が収まる側の倍率を返す', () => {
    // 前提: SVGは preserveAspectRatio="xMidYMid meet" のため、収まる方（小さい方）の倍率で表示される
    const scale = pixelsPerUnit({ left: 0, top: 0, width: 800, height: 200 }, { x: 0, y: 0, width: 100, height: 100 });

    expect(scale).toBeCloseTo(2, 5);
  });
});

describe('clientToSvgPoint', () => {
  /** 横に余白（レターボックス）ができる組み合わせです。倍率2、左右に100pxずつの余白ができます。 */
  const elementRect = { left: 0, top: 0, width: 400, height: 200 };
  const viewBox: ViewBox = { x: 0, y: 0, width: 100, height: 100 };

  it('要素の中心の座標を、表示範囲の中心の座標に変換する', () => {
    expect(clientToSvgPoint({ x: 200, y: 100 }, elementRect, viewBox)).toEqual({ x: 50, y: 50 });
  });

  it('左右の余白のぶんをずらして変換する', () => {
    // 図の左端は、要素の左端ではなく、余白100pxぶん右にある
    expect(clientToSvgPoint({ x: 100, y: 0 }, elementRect, viewBox)).toEqual({ x: 0, y: 0 });
  });

  it('要素の位置（画面上のずれ）を差し引いて変換する', () => {
    expect(clientToSvgPoint({ x: 150, y: 50 }, { left: 50, top: 50, width: 400, height: 200 }, viewBox)).toEqual({ x: 0, y: 0 });
  });

  it('要素に大きさが無い場合は、変換できないため例外を投げる', () => {
    expect(() => clientToSvgPoint({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 }, viewBox)).toThrow();
  });
});
