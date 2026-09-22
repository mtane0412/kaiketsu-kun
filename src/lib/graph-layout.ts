/**
 * グラフビューのノードの配置を計算するロジック
 *
 * 力学モデル（d3-force）で、ノード同士が反発し、エッジがつながったノード同士を引き寄せる形に落ち着かせます。
 * 描画そのものは行わず、座標と表示範囲（viewBox）だけを返します。計算と描画を分けると、配置をテストできるためです。
 *
 * 配置は決定的です。d3-force は初期配置を渦巻き状に決めたうえで、計算の途中で乱数を使います。
 * その乱数を固定の擬似乱数（createSeededRandom）に差し替え、同じケースからは毎回同じ図が出るようにしています。
 * 開き直すたびに図の形が変わると、どこに何があったかを覚えられないためです。
 *
 * 注意: 計算はシミュレーションを同期的に進めて終わらせます（TICK_COUNT回）。
 * アニメーションさせない代わりに、描画側は結果を1度受け取るだけで済みます。
 */
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { CaseGraph, GraphEdge, GraphNode, GraphNodeKind } from '@/domain/case-graph';

/** ノードの種類ごとの半径（px）です。人物は証言より大きくし、図の中で人物を目印にできるようにします。 */
export const NODE_RADIUS: Record<GraphNodeKind, number> = { person: 26, user: 26, claim: 16 };

/** エッジがつながったノード同士の、中心間の目標の距離（px）です。 */
const LINK_DISTANCE = 160;

/** ノード同士が反発する強さです。負の値ほど強く反発します。 */
const CHARGE_STRENGTH = -520;

/** ノードの半径に加える、重なり防止の余白（px）です。 */
const COLLIDE_PADDING = 22;

/** ノードの下に表示する名前の文字数です。これより長い名前は、末尾を省略します。 */
export const NODE_LABEL_LENGTH = 10;

/** 名前1文字あたりのおおよその幅（px）です。名前の重なりを避ける間隔の見積もりに使います。 */
const LABEL_CHAR_WIDTH = 11;

/** シミュレーションを進める回数です。多いほど落ち着きますが、計算に時間がかかります。 */
const TICK_COUNT = 300;

/** 表示範囲の、いちばん外側のノードからの余白（px）です。ノードの下に置く名前が切れないよう、半径より広く取ります。 */
const VIEW_BOX_MARGIN = 72;

/** ノードが1つも無い場合に返す、表示範囲の幅と高さ（px）です。 */
const EMPTY_VIEW_BOX_SIZE = 200;

/** 擬似乱数を作る際の、固定の初期値です。 */
const RANDOM_SEED = 0x2f6e2b1;

/** 座標を与えたノードです。 */
export type PositionedGraphNode = GraphNode & { x: number; y: number };

/** 両端のノードを解決したエッジです。 */
export type PositionedGraphEdge = GraphEdge & { source: PositionedGraphNode; target: PositionedGraphNode };

/** グラフの配置の計算結果です。 */
export type GraphLayout = {
  nodes: PositionedGraphNode[];
  edges: PositionedGraphEdge[];
  /** すべてのノードと、その周りの余白が収まるSVGの表示範囲です。 */
  viewBox: { x: number; y: number; width: number; height: number };
};

/**
 * 同じ初期値からは同じ並びを返す擬似乱数を作ります（線形合同法）。
 * d3-force の乱数を差し替え、配置を決定的にするために使います。
 */
function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    // Numerical Recipes の係数。32ビットに収めたうえで 0以上1未満へ正規化する
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * ノードの下に表示する名前を、長すぎる場合に省略します。
 * 描画（GraphView）と、名前の重なりを避ける間隔の見積もり（collideRadiusOf）の両方で、同じ名前を使うために公開します。
 */
export function shortLabelOf(label: string): string {
  return label.length > NODE_LABEL_LENGTH ? `${label.slice(0, NODE_LABEL_LENGTH)}…` : label;
}

/**
 * ノードが他のノードを寄せ付けない半径を返します。
 * 丸だけでなく、丸の下に置く名前も重ならないよう、名前が長いノードほど広く取ります。
 * 注意: 名前の幅は1文字あたりの幅（LABEL_CHAR_WIDTH）からの見積もりです。実際の字幅は字体と文字によって変わるため、
 * 名前が重ならないことを保証するものではありません。
 */
function collideRadiusOf(node: GraphNode): number {
  const labelHalfWidth = (shortLabelOf(node.label).length * LABEL_CHAR_WIDTH) / 2;
  return Math.max(NODE_RADIUS[node.kind] + COLLIDE_PADDING, labelHalfWidth);
}

/** d3-force が座標を書き込むための、ノードの作業用の形です。 */
type SimulationNode = GraphNode & { x?: number; y?: number };

/** d3-force が両端を解決するための、エッジの作業用の形です。 */
type SimulationLink = GraphEdge & { source: string | SimulationNode; target: string | SimulationNode };

/** 力学モデルで落ち着いた座標を、ノードに与えます。 */
function simulate(graph: CaseGraph): SimulationNode[] {
  const nodes: SimulationNode[] = graph.nodes.map((node) => ({ ...node }));
  const links: SimulationLink[] = graph.edges.map((edge) => ({ ...edge, source: edge.sourceId, target: edge.targetId }));

  const simulation = forceSimulation(nodes)
    .randomSource(createSeededRandom(RANDOM_SEED))
    .force('link', forceLink<SimulationNode, SimulationLink>(links).id((node) => node.id).distance(LINK_DISTANCE))
    .force('charge', forceManyBody().strength(CHARGE_STRENGTH))
    .force('collide', forceCollide<SimulationNode>(collideRadiusOf))
    // つながっていないノードが遠くへ流れないよう、中心へ弱く引き寄せる
    .force('x', forceX(0).strength(0.05))
    .force('y', forceY(0).strength(0.05))
    .stop();

  simulation.tick(TICK_COUNT);
  return nodes;
}

/** すべてのノードと余白が収まる表示範囲を求めます。 */
function viewBoxOf(nodes: PositionedGraphNode[]): GraphLayout['viewBox'] {
  if (nodes.length === 0) {
    return { x: -EMPTY_VIEW_BOX_SIZE / 2, y: -EMPTY_VIEW_BOX_SIZE / 2, width: EMPTY_VIEW_BOX_SIZE, height: EMPTY_VIEW_BOX_SIZE };
  }

  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const left = Math.min(...xs) - VIEW_BOX_MARGIN;
  const top = Math.min(...ys) - VIEW_BOX_MARGIN;
  return {
    x: left,
    y: top,
    width: Math.max(...xs) + VIEW_BOX_MARGIN - left,
    height: Math.max(...ys) + VIEW_BOX_MARGIN - top,
  };
}

/**
 * グラフのノードの配置を計算します。
 *
 * 注意: 座標が決まらなかったノードは、データ破損ではなく計算の不具合であるため、例外を投げて気付けるようにします。
 */
export function layoutGraph(graph: CaseGraph): GraphLayout {
  const nodes: PositionedGraphNode[] = simulate(graph).map((node) => {
    if (node.x === undefined || node.y === undefined) {
      throw new Error(`ノードの座標が決まりませんでした: ${node.id}`);
    }
    return { ...node, x: node.x, y: node.y };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: PositionedGraphEdge[] = graph.edges.map((edge) => {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) {
      throw new Error(`エッジの両端のノードが見つかりません: ${edge.id}`);
    }
    return { ...edge, source, target };
  });

  return { nodes, edges, viewBox: viewBoxOf(nodes) };
}
