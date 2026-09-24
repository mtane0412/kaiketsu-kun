/**
 * グラフビューの表示範囲（拡大縮小・平行移動）を計算するロジック
 *
 * グラフは、ノードの配置（src/lib/graph-layout.ts）を計算したあと、SVGの表示範囲（viewBox）を動かすことで拡大縮小と移動を行います。
 * ノードの座標そのものは動かしません。座標を動かすと、拡大のたびに配置を計算し直すことになり、図の形が変わってしまうためです。
 *
 * ここでは描画もイベントの購読も行わず、「いまの表示範囲」と「操作」から「次の表示範囲」を返すことに徹します。
 * 計算を切り出しておくと、マウス操作を再現しにくいテスト環境でも、拡大縮小の振る舞いを確かめられるためです。
 *
 * 注意: SVGは preserveAspectRatio="xMidYMid meet" で描くため、表示範囲と要素の縦横比が違うときは
 * 上下または左右に余白（レターボックス）ができます。画面の座標を図の座標へ直す計算は、この余白を含めて行います。
 */

/** SVGの表示範囲です。SVGの viewBox 属性にそのまま対応します。 */
export type ViewBox = { x: number; y: number; width: number; height: number };

/** 画面上の座標、または図の中の座標です。 */
export type Point = { x: number; y: number };

/** 画面上での要素の位置と大きさです（DOMRect のうち、計算に使う4つ）。 */
export type ElementRect = { left: number; top: number; width: number; height: number };

/** 図の全体を表示した状態を1としたときの、いちばん小さい倍率です。 */
export const MIN_ZOOM = 0.4;

/** 図の全体を表示した状態を1としたときの、いちばん大きい倍率です。 */
export const MAX_ZOOM = 6;

/** 拡大・縮小ボタン1回ぶんの、倍率の変化です。 */
export const ZOOM_STEP = 1.4;

/** マウスホイール1目盛りぶんの、倍率の変化です。ボタンより細かく効くようにします。 */
export const WHEEL_ZOOM_STEP = 1.12;

/**
 * 図の全体を表示した状態を1としたときの、いまの倍率を返します。
 * 表示範囲が狭いほど拡大されているため、もとの幅を、いまの幅で割った値になります。
 */
export function zoomOf(base: ViewBox, current: ViewBox): number {
  return base.width / current.width;
}

/**
 * 表示範囲を拡大・縮小します。
 *
 * anchor に与えた図の座標は、拡大・縮小しても画面上の同じ位置にとどまります。マウスの位置を渡すと、
 * カーソルの下にあるものを見失わずに拡大できます。
 * 倍率は base（図の全体が収まる表示範囲）を1として、MIN_ZOOM 以上 MAX_ZOOM 以下に収めます。
 */
export function zoomViewBox(base: ViewBox, current: ViewBox, factor: number, anchor: Point): ViewBox {
  const 目標の倍率 = zoomOf(base, current) * factor;
  const 収めた倍率 = Math.min(Math.max(目標の倍率, MIN_ZOOM), MAX_ZOOM);
  const width = base.width / 収めた倍率;
  // 拡大・縮小の前後で、anchor が表示範囲の中で占める割合を変えない
  const ratio = width / current.width;
  const height = current.height * ratio;
  return {
    x: anchor.x - (anchor.x - current.x) * ratio,
    y: anchor.y - (anchor.y - current.y) * ratio,
    width,
    height,
  };
}

/**
 * 表示範囲を平行移動します。delta は、図を動かしたい向きと量（図の座標での距離）です。
 * 図を右へ動かすことは、見えている窓を左へ動かすことと同じであるため、表示範囲は逆向きに動かします。
 */
export function panViewBox(current: ViewBox, delta: Point): ViewBox {
  return { ...current, x: current.x - delta.x, y: current.y - delta.y };
}

/**
 * 図の座標1に対して、画面上の何pxが割り当てられているかを返します。
 * 縦横比が違う場合は、全体が収まる側（小さい方）の倍率になります（preserveAspectRatio="xMidYMid meet" のため）。
 */
export function pixelsPerUnit(rect: ElementRect, viewBox: ViewBox): number {
  return Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
}

/**
 * 画面上の座標（clientX / clientY）を、図の中の座標へ直します。
 *
 * 注意: 要素に大きさが無い場合は倍率を決められません。暗黙に0を返すと、マウスの位置が図の左上に化けて
 * 図が飛んでしまうため、例外を投げて呼び出し側で気付けるようにします。
 */
export function clientToSvgPoint(client: Point, rect: ElementRect, viewBox: ViewBox): Point {
  const 倍率 = pixelsPerUnit(rect, viewBox);
  if (!Number.isFinite(倍率) || 倍率 <= 0) {
    throw new Error('図の大きさが取得できないため、画面の座標を図の座標へ直せません');
  }
  // 中央揃え（xMidYMid）のため、図の左上は、要素の左上から余白の半分だけ内側にある
  const 左の余白 = (rect.width - viewBox.width * 倍率) / 2;
  const 上の余白 = (rect.height - viewBox.height * 倍率) / 2;
  return {
    x: viewBox.x + (client.x - rect.left - 左の余白) / 倍率,
    y: viewBox.y + (client.y - rect.top - 上の余白) / 倍率,
  };
}
