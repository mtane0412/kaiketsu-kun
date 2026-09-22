/**
 * グラフビュー
 *
 * 人物と証言の両方をノードに置き、「誰が・誰を経由して・誰について述べたか」を図にします。
 * ノードとエッジの導出は src/domain/case-graph.ts、配置の計算は src/lib/graph-layout.ts が担い、
 * このコンポーネントは受け取った座標をSVGに描くことに徹します。
 *
 * 人物・証言のノードは、それぞれの詳細ページへのリンクです。図から人物・証言へたどる導線で、
 * リンク先のURLには、いま開いているタブ（graph）を「ボードに戻る」の戻り先として引き継ぎます。
 * 発言者を選ばない証言（ユーザーの推測）をまとめるノードは、開く先の詳細を持たないためリンクにしません。
 *
 * 線の種類（発言・経由・言及）は、太さと破線の形で見分けます。図の中に線の名前を書くと、
 * 線が交差する箇所で文字が重なって読めなくなるため、名前は図の外の凡例にまとめています。
 *
 * 注意: SVGの中身は読み上げで図としてたどれないため、図そのものに名前（aria-label）を付け、
 * 中のノードはリンクとして読み上げからも操作できるようにしています。
 */
'use client';

import Link from 'next/link';
import { useId, useMemo } from 'react';
import { buildCaseGraph, type GraphEdgeKind } from '@/domain/case-graph';
import type { Case } from '@/domain/types';
import { layoutGraph, NODE_RADIUS, shortLabelOf, type PositionedGraphEdge, type PositionedGraphNode } from '@/lib/graph-layout';
import { claimHref, personHref } from '../routes';
import { useCaseId } from '../useCaseId';

/** このビューを表すタブです。ノードのリンク先に、戻り先として引き継ぎます。 */
const TAB = 'graph';

/** エッジの種類ごとの、名前と線の見た目です。凡例と図の両方で同じ値を使います。 */
const EDGE_STYLES: Record<GraphEdgeKind, { label: string; description: string; className: string; dashArray?: string }> = {
  speaks: { label: '発言', description: '発言者から証言へ', className: 'stroke-foreground/70' },
  via: { label: '経由', description: '証言が伝わった経路', className: 'stroke-foreground/50', dashArray: '7 4' },
  mentions: { label: '言及', description: '証言から、その証言が言及している人物へ', className: 'stroke-foreground/35', dashArray: '1 5' },
};

/** 凡例に並べる順番です。証言を中心に、発言・経由・言及の順で読めるようにします。 */
const EDGE_KINDS: GraphEdgeKind[] = ['speaks', 'via', 'mentions'];

/** 矢印の先端と、指し先のノードの縁との間に空ける余白（px）です。 */
const ARROW_GAP = 4;

/** ノードの種類ごとの、丸の見た目です。 */
const NODE_CLASSES = {
  person: 'fill-primary stroke-background',
  user: 'fill-muted stroke-border',
  claim: 'fill-card stroke-foreground/40',
} as const;

/** ノードの読み上げ用の名前です。図の中で人物と証言のどちらを指すかが分かるよう、種類を前に付けます。 */
function accessibleNameOf(node: PositionedGraphNode): string {
  return node.kind === 'person' ? `人物: ${node.label}` : `証言: ${node.label}`;
}

/** エッジの線を、両端のノードの丸に隠れない長さに切り詰めます。矢印の先端がノードの縁に触れる位置で止めます。 */
function lineOf(edge: PositionedGraphEdge): { x1: number; y1: number; x2: number; y2: number } {
  const dx = edge.target.x - edge.source.x;
  const dy = edge.target.y - edge.source.y;
  // 同じ座標に重なった場合に0で割らないよう、長さの下限を1にする
  const length = Math.max(Math.hypot(dx, dy), 1);
  const sourceOffset = NODE_RADIUS[edge.source.kind];
  const targetOffset = NODE_RADIUS[edge.target.kind] + ARROW_GAP;
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
  const layout = useMemo(() => layoutGraph(buildCaseGraph(target)), [target]);

  if (layout.nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        人物も証言もまだ登録されていません。時系列のボードから書き足してください。
      </p>
    );
  }

  const arrowMarkerId = `${idPrefix}-arrow`;

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

        {layout.edges.map((edge) => {
          const style = EDGE_STYLES[edge.kind];
          return (
            <line
              key={edge.id}
              {...lineOf(edge)}
              strokeWidth={1.5}
              strokeDasharray={style.dashArray}
              markerEnd={`url(#${arrowMarkerId})`}
              className={style.className}
            />
          );
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

      <ul aria-label="線の見方" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {EDGE_KINDS.map((kind) => (
          <li key={kind} className="flex items-center gap-1.5">
            <svg aria-hidden="true" width="28" height="8" viewBox="0 0 28 8" className="shrink-0">
              <line
                x1="0"
                y1="4"
                x2="28"
                y2="4"
                strokeWidth={1.5}
                strokeDasharray={EDGE_STYLES[kind].dashArray}
                className={EDGE_STYLES[kind].className}
              />
            </svg>
            <span className="font-medium text-foreground">{EDGE_STYLES[kind].label}</span>
            <span>{EDGE_STYLES[kind].description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
