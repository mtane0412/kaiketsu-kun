/**
 * グラフビュー
 *
 * 人物と証言の両方をノードに置き、「誰が・誰を経由して・誰について述べたか」を図にします。
 * これに加えて、ユーザーが証言から導いた結論である人物どうしの関係（Relationship）を、人物と人物を結ぶ線で重ねます。
 * ノードとエッジの導出は src/domain/case-graph.ts、配置の計算は src/lib/graph-layout.ts が担い、
 * このコンポーネントは受け取った座標をSVGに描くことに徹します。
 *
 * 人物・証言のノードは、それぞれの詳細ページへのリンクです。図から人物・証言へたどる導線で、
 * リンク先のURLには、いま開いているタブ（graph）を「ボードに戻る」の戻り先として引き継ぎます。
 * 発言者を選ばない証言（ユーザーの推測）をまとめるノードは、開く先の詳細を持たないためリンクにしません。
 *
 * 線の種類（発言・経由・言及・関係）は、色と破線の形で見分けます。図の中に線の名前を書くと、
 * 線が交差する箇所で文字が重なって読めなくなるため、名前は図の外の凡例にまとめています。
 * 関係の線は、片方向の関係にだけ矢印を付け、根拠の証言が無い関係は破線にします。裏付けのある関係かどうかを、
 * 図のまま見分けられるようにするためです。
 * 関係の線だけは直線ではなく弧で描きます。同じ2人の間には複数の関係（「雇用主」と「金銭トラブル？」など）を
 * 登録できるため、直線で描くと互いに、また同じ2人を結ぶ経由の線とも、完全に重なって1本に見えるためです。
 *
 * 関係の線は「関係を表示」で消せます。証言から導いた線と関係の線が重なると図が混み合うため、証言だけを読みたいときに消せるようにしています。
 * 消しても配置は計算し直しません（配置の計算には関係の線も含めます）。消すたびに図の形が変わると、どこに何があったかを見失うためです。
 *
 * 注意: SVGの中身は読み上げで図としてたどれないため、図そのものに名前（aria-label）を付け、
 * 中のノードはリンクとして読み上げからも操作できるようにしています。
 */
'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { buildCaseGraph, type GraphEdgeKind } from '@/domain/case-graph';
import type { Case } from '@/domain/types';
import { layoutGraph, NODE_RADIUS, shortLabelOf, type PositionedGraphEdge, type PositionedGraphNode } from '@/lib/graph-layout';
import { claimHref, personHref } from '../routes';
import { useCaseId } from '../useCaseId';

/** このビューを表すタブです。ノードのリンク先に、戻り先として引き継ぎます。 */
const TAB = 'graph';

/** エッジの種類ごとの、線の色です。凡例と図の両方で同じ値を使います。 */
const EDGE_CLASSES: Record<GraphEdgeKind, string> = {
  speaks: 'stroke-foreground/70',
  via: 'stroke-foreground/50',
  mentions: 'stroke-foreground/35',
  // 関係は人物どうしを結ぶため、人物のメンションと同じ色を使い、証言から導いた線と区別する
  relates: 'stroke-mention-person-foreground',
};

/** エッジの種類ごとの、破線の形です。値を持たない種類は実線です。 */
const EDGE_DASH_ARRAYS: Partial<Record<GraphEdgeKind, string>> = {
  via: '7 4',
  mentions: '1 5',
};

/** 根拠の証言が登録されていない関係の、破線の形です。 */
const NO_BASIS_DASH_ARRAY = '5 4';

/** 凡例の1行です。関係は、根拠の有無で線が変わるため2行に分けます。 */
type LegendItem = { key: string; label: string; description: string; className: string; dashArray?: string };

/** 証言から導いた線の凡例です。証言を中心に、発言・経由・言及の順で読めるようにします。 */
const CLAIM_LEGEND_ITEMS: LegendItem[] = [
  { key: 'speaks', label: '発言', description: '発言者から証言へ', className: EDGE_CLASSES.speaks },
  { key: 'via', label: '経由', description: '証言が伝わった経路', className: EDGE_CLASSES.via, dashArray: EDGE_DASH_ARRAYS.via },
  {
    key: 'mentions',
    label: '言及',
    description: '証言から、その証言が言及している人物へ',
    className: EDGE_CLASSES.mentions,
    dashArray: EDGE_DASH_ARRAYS.mentions,
  },
];

/** 関係の線の凡例です。「関係を表示」を外している間は並べません。 */
const RELATION_LEGEND_ITEMS: LegendItem[] = [
  { key: 'relates', label: '関係', description: '人物どうしの関係（矢印は片方向の関係）', className: EDGE_CLASSES.relates },
  {
    key: 'relates-no-basis',
    label: '関係（根拠未登録）',
    description: '根拠の証言がまだ登録されていない関係',
    className: EDGE_CLASSES.relates,
    dashArray: NO_BASIS_DASH_ARRAY,
  },
];

/** 「関係を表示」の切り替えの名前です。 */
const RELATION_TOGGLE_LABEL = '関係を表示';

/** 矢印の先端と、指し先のノードの縁との間に空ける余白（px）です。 */
const ARROW_GAP = 4;

/** 関係の弧の、直線からのふくらみ（px）です。同じ2人を結ぶ関係が増えるたびに、この幅ずつ外へずらします。 */
const RELATION_CURVE_STEP = 26;

/** ノードの種類ごとの、丸の見た目です。 */
const NODE_CLASSES = {
  person: 'fill-primary stroke-background',
  user: 'fill-muted stroke-border',
  claim: 'fill-card stroke-foreground/40',
} as const;

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
  const [showsRelations, setShowsRelations] = useState(true);
  const layout = useMemo(() => layoutGraph(buildCaseGraph(target)), [target]);

  if (layout.nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        人物も証言もまだ登録されていません。時系列のボードから書き足してください。
      </p>
    );
  }

  const arrowMarkerId = `${idPrefix}-arrow`;
  const relationToggleId = `${idPrefix}-relations`;
  // 配置は関係の線も含めて計算済みのため、消すときは描く線を減らすだけにする（ノードは動かさない）
  const edges = showsRelations ? layout.edges : layout.edges.filter((edge) => edge.kind !== 'relates');
  const curveOffsets = curveOffsetsOf(edges);
  const legendItems = showsRelations ? [...CLAIM_LEGEND_ITEMS, ...RELATION_LEGEND_ITEMS] : CLAIM_LEGEND_ITEMS;

  return (
    <div className="space-y-3">
      <svg
        role="group"
        aria-label="人物と証言のつながり"
        viewBox={`${layout.viewBox.x} ${layout.viewBox.y} ${layout.viewBox.width} ${layout.viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-[70vh] w-full rounded-lg border bg-muted/30"
      >
        <defs>
          {/* 矢印の色は、線の色をそのまま受け取る（context-stroke）。線の種類ごとに矢印を用意しなくて済む */}
          <marker id={arrowMarkerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>

        {edges.map((edge) => {
          const appearance = appearanceOf(edge);
          const shared = {
            'data-edge-kind': edge.kind,
            strokeWidth: 1.5,
            strokeDasharray: appearance.dashArray,
            markerEnd: appearance.hasArrow ? `url(#${arrowMarkerId})` : undefined,
            className: appearance.className,
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

        {layout.nodes.map((node) => {
          const clipPathId = `${idPrefix}-clip-${node.id.replace(/[^\w-]/g, '-')}`;
          if (node.kind === 'user' || node.entityId === undefined) {
            return <NodeShape key={node.id} node={node} clipPathId={clipPathId} />;
          }
          const href =
            node.kind === 'person' ? personHref(caseId, node.entityId, TAB) : claimHref(caseId, node.entityId, TAB);
          return (
            <Link key={node.id} href={href} aria-label={accessibleNameOf(node)} className="cursor-pointer">
              <NodeShape node={node} clipPathId={clipPathId} />
            </Link>
          );
        })}
      </svg>

      <div className="flex items-center gap-2 text-xs">
        <input
          id={relationToggleId}
          type="checkbox"
          checked={showsRelations}
          onChange={(event) => setShowsRelations(event.target.checked)}
        />
        <label htmlFor={relationToggleId} className="text-muted-foreground">
          {RELATION_TOGGLE_LABEL}
        </label>
      </div>

      <ul aria-label="線の見方" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {legendItems.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5">
            <svg aria-hidden="true" width="28" height="8" viewBox="0 0 28 8" className="shrink-0">
              <line x1="0" y1="4" x2="28" y2="4" strokeWidth={1.5} strokeDasharray={item.dashArray} className={item.className} />
            </svg>
            <span className="font-medium text-foreground">{item.label}</span>
            <span>{item.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
