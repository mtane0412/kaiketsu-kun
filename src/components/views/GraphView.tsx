/**
 * グラフビュー
 *
 * 人物と証言の両方をノードに置き、「誰が・誰を経由して・誰について述べたか」を図にします。
 * これに加えて、ユーザーが証言から導いた結論である人物どうしの関係（Relationship）を、人物と人物を結ぶ線で重ねます。
 * ノードとエッジの導出は src/domain/case-graph.ts、配置の計算は src/lib/graph-layout.ts が担い、
 * このコンポーネントは受け取った座標をSVGに描くことと、図に対する操作を受け付けることに徹します。
 *
 * 図は次のように操作できます。ノードが増えると図が細かくなり、そのままでは名前も線もたどれないためです。
 * 操作しても配置（src/lib/graph-layout.ts の計算結果）はやり直しません。操作のたびに図の形が変わると、
 * どこに何があったかを見失うためです。
 *
 * - 拡大縮小: マウスホイール、または図の右上のボタンで行います。ホイールではカーソルの位置を中心に拡大し、
 *   カーソルの下にあるものを見失わないようにします。計算は src/lib/graph-viewport.ts が担います
 * - 平行移動: 図の背景をドラッグします
 * - ノードを手で動かす: ノードをドラッグします。線が重なって読めない箇所を、ユーザーがほどけるようにするためです
 * - つながりの強調: ノードにマウスを重ねる（またはキーボードで選ぶ）と、そのノードにつながる相手と線だけを濃く描きます
 * - 絞り込み: 人物・証言・関係のうち、図に描くものを選べます
 * - 表示を戻す: 拡大率・位置・手で動かしたノードを、まとめて最初の状態に戻します
 *
 * 人物・証言のノードは、それぞれの詳細ページへのリンクです。図から人物・証言へたどる導線で、
 * リンク先のURLには、いま開いているタブ（graph）を「ボードに戻る」の戻り先として引き継ぎます。
 * 発言者を選ばない証言（ユーザーの推測）をまとめるノードは、開く先の詳細を持たないためリンクにしません。
 * ノードをドラッグしたときは、そのドラッグの終わりに続くクリックを打ち消します。動かしただけで詳細ページへ移ると、
 * 位置を直す操作のたびに画面が切り替わってしまうためです。
 *
 * 線の種類（発言・経由・言及・関係）は、色と破線の形で見分けます。図の中に線の名前を書くと、
 * 線が交差する箇所で文字が重なって読めなくなるため、名前は図の外の凡例（GraphControls）にまとめています。
 * 関係の線は、片方向の関係にだけ矢印を付け、根拠の証言が無い関係は破線にします。裏付けのある関係かどうかを、
 * 図のまま見分けられるようにするためです。
 * 関係の線だけは直線ではなく弧で描きます。同じ2人の間には複数の関係（「雇用主」と「金銭トラブル？」など）を
 * 登録できるため、直線で描くと互いに、また同じ2人を結ぶ経由の線とも、完全に重なって1本に見えるためです。
 *
 * 注意: SVGの中身は読み上げで図としてたどれないため、図そのものに名前（aria-label）を付け、
 * 中のノードはリンクとして読み上げからも操作できるようにしています。
 */
'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { buildCaseGraph } from '@/domain/case-graph';
import type { Case } from '@/domain/types';
import { filterGraph, moveNodes, neighborhoodOf, type GraphFilter } from '@/lib/graph-display';
import { layoutGraph, NODE_RADIUS, shortLabelOf, type PositionedGraphEdge, type PositionedGraphNode } from '@/lib/graph-layout';
import {
  clientToSvgPoint,
  panViewBox,
  pixelsPerUnit,
  WHEEL_ZOOM_STEP,
  zoomOf,
  zoomViewBox,
  ZOOM_STEP,
  type Point,
  type ViewBox,
} from '@/lib/graph-viewport';
import { EDGE_CLASSES, EDGE_DASH_ARRAYS, GraphFilterControls, GraphLegend, GraphZoomButtons, NO_BASIS_DASH_ARRAY } from './GraphControls';
import { claimHref, personHref } from '../routes';
import { useCaseId } from '../useCaseId';

/** このビューを表すタブです。ノードのリンク先に、戻り先として引き継ぎます。 */
const TAB = 'graph';

/** 矢印の先端と、指し先のノードの縁との間に空ける余白（px）です。 */
const ARROW_GAP = 4;

/** 関係の弧の、直線からのふくらみ（px）です。同じ2人を結ぶ関係が増えるたびに、この幅ずつ外へずらします。 */
const RELATION_CURVE_STEP = 26;

/** 押したまま動かした距離が、この値（px）を超えたらドラッグとみなします。手の震えでリンクが開かなくなるのを防ぎます。 */
const DRAG_THRESHOLD = 4;

/** 強調していないノード・線の薄さです。 */
const DIMMED_CLASS = 'opacity-15';

/** 最初に表示する絞り込みです。まずは図の全体を見せます。 */
const DEFAULT_FILTER: GraphFilter = { persons: true, claims: true, relations: true };

/** ノードの種類ごとの、丸の見た目です。 */
const NODE_CLASSES = {
  person: 'fill-primary stroke-background',
  user: 'fill-muted stroke-border',
  claim: 'fill-card stroke-foreground/40',
} as const;

/**
 * ドラッグ中の状態です。図の背景をつかんだ場合（pan）と、ノードをつかんだ場合（node）があります。
 * 指を置いた時点の位置と倍率を持ち、動くたびに「開始位置＋動かした距離」で描き直します。
 * 直前の位置からの差分を積み重ねないのは、丸めの誤差が溜まって位置がずれるのを避けるためです。
 *
 * つかんでいる指（pointerId）も持ちます。タッチでは複数の指が同時に動くため、これが無いと
 * 2本目の指の動きが1本目のドラッグの計算に混ざり、図やノードが指と無関係に飛んでしまいます。
 */
type DragState = { pointerId: number; startClient: Point; unitsPerPixel: number } & (
  | { kind: 'pan'; viewBox: ViewBox }
  | { kind: 'node'; nodeId: string; origin: Point }
);

/**
 * エッジ1本の線の見た目を返します。
 *
 * 関係の線だけは、同じ種類でも形が変わります。向きを持つ関係にだけ矢印を付け、根拠の証言が無い関係は破線にします。
 * 向きを持たない関係に矢印を付けると、どちらからどちらへの関係かを読み違えるためです。
 */
function appearanceOf(edge: PositionedGraphEdge): { className: string; dashArray?: string; hasArrow: boolean } {
  const className = EDGE_CLASSES[edge.kind];
  if (edge.kind !== 'relates') {
    const dashArray = EDGE_DASH_ARRAYS[edge.kind];
    return { className, hasArrow: true, ...(dashArray === undefined ? {} : { dashArray }) };
  }

  const hasArrow = edge.relation?.directed === true;
  const hasBasis = edge.relation?.hasBasis === true;
  return { className, hasArrow, ...(hasBasis ? {} : { dashArray: NO_BASIS_DASH_ARRAY }) };
}

/**
 * 関係の線ごとに、弧のふくらみ（直線からのずれ、px）を決めます。
 *
 * 同じ2人を結ぶ関係には、線の左右へ交互に、少しずつ大きなふくらみを割り当てます。
 * 2人の組は向きを無視して数えます。「AからBへ」と「BからAへ」の関係も、図の上では同じ位置に重なるためです。
 *
 * ふくらむ向きは、エッジの向きではなく、2人の組の並び（IDの順）を基準にします。
 * エッジの向きを基準にすると、「AからBへ」と「BからAへ」の関係で線と直角の向きが反転し、
 * 左右に振り分けたつもりの2本が同じ側へ重なってしまうためです。
 */
function curveOffsetsOf(edges: PositionedGraphEdge[]): Map<string, number> {
  const countByPair = new Map<string, number>();
  const offsets = new Map<string, number>();

  for (const edge of edges) {
    if (edge.kind !== 'relates') continue;
    const pairKey = [edge.sourceId, edge.targetId].sort().join('|');
    const index = countByPair.get(pairKey) ?? 0;
    countByPair.set(pairKey, index + 1);
    // 0本目は右へ、1本目は左へ、2本目はさらに右へ…と、左右に振り分けながら広げる
    const depth = Math.floor(index / 2) + 1;
    const side = index % 2 === 0 ? 1 : -1;
    // 組の並びと逆向きのエッジは、線と直角の向きも逆になるため、符号を戻して同じ側へ寄らないようにする
    const direction = edge.sourceId <= edge.targetId ? 1 : -1;
    offsets.set(edge.id, RELATION_CURVE_STEP * depth * side * direction);
  }
  return offsets;
}

/** 関係の弧を描く経路（2次ベジェ曲線）を組み立てます。制御点は、両端を結ぶ線の中点から、線と直角の向きへずらした位置です。 */
function curvePathOf(edge: PositionedGraphEdge, offset: number, hasArrow: boolean): string {
  const { x1, y1, x2, y2 } = lineOf(edge, hasArrow);
  const dx = x2 - x1;
  const dy = y2 - y1;
  // 同じ座標に重なった場合に0で割らないよう、長さの下限を1にする
  const length = Math.max(Math.hypot(dx, dy), 1);
  const controlX = (x1 + x2) / 2 + (-dy / length) * offset;
  const controlY = (y1 + y2) / 2 + (dx / length) * offset;
  return `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`;
}

/**
 * 関係の線に付ける名前です。線の形だけでは何の関係かが分からないため、関係の名前を、根拠が無い場合はその旨を添えて返します。
 * 図の中に文字として書くと線が交差する箇所で重なって読めなくなるため、名前はマウスを重ねたときと読み上げにだけ伝えます。
 */
function relationTitleOf(edge: PositionedGraphEdge): string {
  const label = edge.label ?? '';
  return edge.relation?.hasBasis === true ? label : `${label}（根拠未登録）`;
}

/** ノードの読み上げ用の名前です。図の中で人物と証言のどちらを指すかが分かるよう、種類を前に付けます。 */
function accessibleNameOf(node: PositionedGraphNode): string {
  return node.kind === 'person' ? `人物: ${node.label}` : `証言: ${node.label}`;
}

/**
 * エッジの線を、両端のノードの丸に隠れない長さに切り詰めます。
 * 矢印を付ける線は、矢印の先端がノードの縁に触れる位置で止め、矢印を付けない線は、ノードの縁まで届かせます。
 */
function lineOf(edge: PositionedGraphEdge, hasArrow: boolean): { x1: number; y1: number; x2: number; y2: number } {
  const dx = edge.target.x - edge.source.x;
  const dy = edge.target.y - edge.source.y;
  // 同じ座標に重なった場合に0で割らないよう、長さの下限を1にする
  const length = Math.max(Math.hypot(dx, dy), 1);
  const sourceOffset = NODE_RADIUS[edge.source.kind];
  const targetOffset = NODE_RADIUS[edge.target.kind] + (hasArrow ? ARROW_GAP : 0);
  return {
    x1: edge.source.x + (dx / length) * sourceOffset,
    y1: edge.source.y + (dy / length) * sourceOffset,
    x2: edge.target.x - (dx / length) * targetOffset,
    y2: edge.target.y - (dy / length) * targetOffset,
  };
}

/** 丸の中身（登録した画像、または1文字）を描きます。どちらも無い証言の丸は、中身を持ちません。 */
function NodeFace({ node, clipPathId }: { node: PositionedGraphNode; clipPathId: string }) {
  const radius = NODE_RADIUS[node.kind];
  if (node.imageDataUrl) {
    return (
      <>
        <clipPath id={clipPathId}>
          <circle cx={node.x} cy={node.y} r={radius} />
        </clipPath>
        {/* 縮小済みの data URL のため、next/image の最適化は使用しない */}
        <image
          href={node.imageDataUrl}
          x={node.x - radius}
          y={node.y - radius}
          width={radius * 2}
          height={radius * 2}
          clipPath={`url(#${clipPathId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      </>
    );
  }
  if (!node.iconText) return null;
  return (
    <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central" className="fill-primary-foreground text-sm font-semibold">
      {node.iconText}
    </text>
  );
}

/** ノード1つ（丸と、その下の名前）を描きます。 */
function NodeShape({ node, clipPathId }: { node: PositionedGraphNode; clipPathId: string }) {
  const radius = NODE_RADIUS[node.kind];
  return (
    <>
      <circle cx={node.x} cy={node.y} r={radius} strokeWidth={2} className={NODE_CLASSES[node.kind]} />
      <NodeFace node={node} clipPathId={clipPathId} />
      <text x={node.x} y={node.y + radius + 14} textAnchor="middle" className="fill-foreground text-[11px]">
        {shortLabelOf(node.label)}
      </text>
    </>
  );
}

type GraphViewProps = {
  target: Case;
};

export function GraphView({ target }: GraphViewProps) {
  const caseId = useCaseId();
  const idPrefix = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const layout = useMemo(() => layoutGraph(buildCaseGraph(target)), [target]);

  const [filter, setFilter] = useState<GraphFilter>(DEFAULT_FILTER);
  /** 拡大縮小・平行移動で動かした表示範囲です。null は、図の全体が収まる表示範囲（操作していない状態）を指します。 */
  const [viewBox, setViewBox] = useState<ViewBox | null>(null);
  /** ユーザーが手で動かしたノードの座標です。 */
  const [positions, setPositions] = useState<Map<string, Point>>(new Map());
  /** マウスを重ねている（またはキーボードで選んでいる）ノードです。 */
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /** 直前のドラッグで実際に動かしたかどうかです。ドラッグの終わりに続くクリックを打ち消すために持ちます。 */
  const draggedRef = useRef(false);

  const baseViewBox = layout.viewBox;
  const currentViewBox = viewBox ?? baseViewBox;

  /** 図の座標を中心に拡大・縮小します。 */
  const zoomAt = useCallback(
    (factor: number, anchor: Point) => {
      setViewBox((current) => zoomViewBox(baseViewBox, current ?? baseViewBox, factor, anchor));
    },
    [baseViewBox]
  );

  // ドラッグ中だけ、画面全体でポインタを追いかける。図の外へカーソルが出てもドラッグが途切れないようにするため
  useEffect(() => {
    if (drag === null) return;

    const handleMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      const movedX = event.clientX - drag.startClient.x;
      const movedY = event.clientY - drag.startClient.y;
      if (Math.hypot(movedX, movedY) > DRAG_THRESHOLD) draggedRef.current = true;
      const dx = movedX * drag.unitsPerPixel;
      const dy = movedY * drag.unitsPerPixel;
      if (drag.kind === 'pan') {
        setViewBox(panViewBox(drag.viewBox, { x: dx, y: dy }));
        return;
      }
      setPositions((current) => new Map(current).set(drag.nodeId, { x: drag.origin.x + dx, y: drag.origin.y + dy }));
    };
    const handleEnd = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      setDrag(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, [drag]);

  // ホイールでの拡大縮小は、ページのスクロールを止める必要がある。Reactのイベントでは止められないため、直接登録する
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const anchor = clientToSvgPoint({ x: event.clientX, y: event.clientY }, rect, currentViewBox);
      zoomAt(event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP, anchor);
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [currentViewBox, zoomAt]);

  /**
   * ドラッグを始めます。図の座標と画面の座標の比を、この時点で求めて持ち回ります。
   * 注意: 図に大きさが無い間（描画前など）は比を求められないため、ドラッグを始めません。
   */
  const beginDrag = (event: ReactPointerEvent, 掴んだもの: { kind: 'pan' } | { kind: 'node'; nodeId: string; origin: Point }) => {
    // 別の指ですでにドラッグしている間は、その計算を引き継がせない
    if (event.button !== 0 || drag !== null) return;
    const svg = svgRef.current;
    if (svg === null) return;

    // 押し下げのたびに、直前のドラッグの記録を消す（早期に戻る場合も含め、古い記録を残さない）
    draggedRef.current = false;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const unitsPerPixel = 1 / pixelsPerUnit(rect, currentViewBox);
    const startClient = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;
    setDrag(
      掴んだもの.kind === 'pan'
        ? { kind: 'pan', pointerId, startClient, unitsPerPixel, viewBox: currentViewBox }
        : { kind: 'node', pointerId, startClient, unitsPerPixel, nodeId: 掴んだもの.nodeId, origin: 掴んだもの.origin }
    );
  };

  /** 拡大率・位置・手で動かしたノードを、まとめて最初の状態に戻します。 */
  const reset = () => {
    setViewBox(null);
    setPositions(new Map());
  };

  if (layout.nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        人物も証言もまだ登録されていません。時系列のボードから書き足してください。
      </p>
    );
  }

  const arrowMarkerId = `${idPrefix}-arrow`;
  // 手で動かした位置を重ねてから、絞り込みで描くものを選ぶ。配置そのものは計算し直さない
  const graph = filterGraph(moveNodes(layout, positions), filter);
  const curveOffsets = curveOffsetsOf(graph.edges);
  const focused = graph.nodes.some((node) => node.id === focusedNodeId) ? focusedNodeId : null;
  const highlight = focused === null ? null : neighborhoodOf(graph.edges, focused);
  const centerOfView = { x: currentViewBox.x + currentViewBox.width / 2, y: currentViewBox.y + currentViewBox.height / 2 };

  /**
   * ノード1つを、詳細ページへのリンク（開く先を持たないノードはただのまとまり）として描きます。
   * 注意: コンポーネントではなく、その場でJSXを組み立てる関数にしています。描き直しのたびに新しい
   * コンポーネントとして扱われると、ノードが作り直されてマウスの重なりやキーボードの選択が外れるためです。
   */
  function renderNode(node: PositionedGraphNode) {
    const dimmed = highlight !== null && !highlight.nodeIds.has(node.id);
    const shape = <NodeShape node={node} clipPathId={`${idPrefix}-clip-${node.id.replace(/[^\w-]/g, '-')}`} />;
    const shared = {
      'data-node-id': node.id,
      'data-dimmed': dimmed,
      onPointerDown: (event: ReactPointerEvent) => {
        // 背景のドラッグ（図全体の移動）と二重に始まらないよう、ここで止める
        event.stopPropagation();
        beginDrag(event, { kind: 'node', nodeId: node.id, origin: { x: node.x, y: node.y } });
      },
      onPointerEnter: () => setFocusedNodeId(node.id),
      onPointerLeave: () => setFocusedNodeId((current) => (current === node.id ? null : current)),
      onFocus: () => setFocusedNodeId(node.id),
      onBlur: () => setFocusedNodeId((current) => (current === node.id ? null : current)),
      onClick: (event: { detail: number; preventDefault: () => void }) => {
        // 位置を直しただけのときに詳細ページへ移らないよう、ドラッグの終わりに続くクリックは打ち消す。
        // キーボード（Enter・Space）で開いたクリックは detail が 0 で、ドラッグとは無関係のため打ち消さない
        if (draggedRef.current && event.detail > 0) event.preventDefault();
      },
    };

    if (node.kind === 'user' || node.entityId === undefined) {
      return (
        <g key={node.id} {...shared} className={dimmed ? DIMMED_CLASS : undefined}>
          {shape}
        </g>
      );
    }
    const href = node.kind === 'person' ? personHref(caseId, node.entityId, TAB) : claimHref(caseId, node.entityId, TAB);
    return (
      <Link
        key={node.id}
        {...shared}
        href={href}
        aria-label={accessibleNameOf(node)}
        className={cn('cursor-pointer', dimmed && DIMMED_CLASS)}
      >
        {shape}
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg
          ref={svgRef}
          role="group"
          aria-label="人物と証言のつながり"
          viewBox={`${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`}
          preserveAspectRatio="xMidYMid meet"
          // ドラッグで画面がスクロールしないよう、タッチの既定の動作を止める（文字が選択されないよう select-none も付ける）
          style={{ touchAction: 'none' }}
          className={cn('h-[70vh] w-full rounded-lg border bg-muted/30 select-none', drag?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-grab')}
          onPointerDown={(event) => beginDrag(event, { kind: 'pan' })}
        >
          <defs>
            {/* 矢印の色は、線の色をそのまま受け取る（context-stroke）。線の種類ごとに矢印を用意しなくて済む */}
            <marker id={arrowMarkerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>

          {graph.edges.map((edge) => {
            const appearance = appearanceOf(edge);
            const dimmed = highlight !== null && !highlight.edgeIds.has(edge.id);
            const shared = {
              'data-edge-kind': edge.kind,
              'data-dimmed': dimmed,
              strokeWidth: 1.5,
              strokeDasharray: appearance.dashArray,
              markerEnd: appearance.hasArrow ? `url(#${arrowMarkerId})` : undefined,
              className: cn(appearance.className, dimmed && DIMMED_CLASS),
            };
            const offset = curveOffsets.get(edge.id);
            if (offset !== undefined) {
              return (
                // 弧の内側が塗りつぶされないよう、塗りは持たせない
                <path key={edge.id} d={curvePathOf(edge, offset, appearance.hasArrow)} fill="none" {...shared}>
                  <title>{relationTitleOf(edge)}</title>
                </path>
              );
            }
            return <line key={edge.id} {...lineOf(edge, appearance.hasArrow)} {...shared} />;
          })}

          {graph.nodes.map((node) => renderNode(node))}
        </svg>

        <GraphZoomButtons
          zoom={zoomOf(baseViewBox, currentViewBox)}
          onZoomIn={() => zoomAt(ZOOM_STEP, centerOfView)}
          onZoomOut={() => zoomAt(1 / ZOOM_STEP, centerOfView)}
          onReset={reset}
        />
      </div>

      <GraphFilterControls filter={filter} onFilterChange={setFilter} />
      <GraphLegend showsRelations={filter.relations} />
    </div>
  );
}
