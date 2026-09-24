/**
 * グラフビューで「何を描くか」を決めるロジック
 *
 * ノードの配置（src/lib/graph-layout.ts）を計算したあと、ユーザーの操作に応じて描く内容を調整します。
 * ここで扱うのは次の3つで、いずれも配置の計算はやり直しません。配置を計算し直すと、操作のたびに図の形が変わり、
 * どこに何があったかを見失うためです。
 *
 * - 絞り込み（filterGraph）: 人物・証言・関係のうち、見たいものだけを残します
 * - 手で動かした位置（moveNodes）: ユーザーがドラッグしたノードの座標を、計算された座標の上に重ねます
 * - 強調する範囲（neighborhoodOf）: マウスを重ねた（または選んだ）ノードと、そこにつながる相手だけを取り出します
 *
 * 描画（GraphView）とは分け、座標と識別子だけを扱います。マウス操作を再現しにくいテスト環境でも、
 * 何が描かれるはずかを確かめられるようにするためです。
 */
import type { PositionedGraphEdge, PositionedGraphNode } from './graph-layout';

/** 座標が決まったノードと、その両端が解決済みのエッジの組です。 */
export type PositionedGraph = {
  nodes: PositionedGraphNode[];
  edges: PositionedGraphEdge[];
};

/**
 * 図に描くものの絞り込みです。
 *
 * persons は、人物のノードと、発言者を選ばない証言をまとめるノード（ユーザー）の両方を指します。
 * ユーザーのノードも図の上では発言者の位置に置かれるため、人物と切り離して出し入れすると、
 * 発言の線だけが宙に浮いて読めなくなるためです。
 */
export type GraphFilter = {
  /** 人物のノード（およびユーザーのノード）を描くかどうかです。 */
  persons: boolean;
  /** 証言のノードを描くかどうかです。 */
  claims: boolean;
  /** 人物どうしの関係の線を描くかどうかです。 */
  relations: boolean;
};

/** 図の座標です。 */
type Point = { x: number; y: number };

/** ノードが、絞り込みの設定で表示されるかどうかを返します。 */
function isVisible(node: PositionedGraphNode, filter: GraphFilter): boolean {
  return node.kind === 'claim' ? filter.claims : filter.persons;
}

/**
 * 絞り込みの設定に合わせて、描くノードと線を選びます。
 * 線は、両端のノードがどちらも描かれる場合にだけ残します。片方が消えた線は、どこへつながるのかが読めないためです。
 */
export function filterGraph(graph: PositionedGraph, filter: GraphFilter): PositionedGraph {
  const nodes = graph.nodes.filter((node) => isVisible(node, filter));
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => {
    if (edge.kind === 'relates' && !filter.relations) return false;
    return visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId);
  });
  return { nodes, edges };
}

/**
 * ユーザーが手で動かしたノードの座標を、計算された座標の上に重ねます。
 * 線の両端は、線を描くときに使う座標をそのまま持っているため、動かしたノードにつながる線も差し替えます。
 *
 * 注意: 1つも動かしていない場合は、もとのグラフをそのまま返します。描画側が、配置が変わっていないことを
 * 参照の同一性で判断できるようにするためです。
 */
export function moveNodes(graph: PositionedGraph, positions: Map<string, Point>): PositionedGraph {
  if (positions.size === 0) return graph;

  const nodes = graph.nodes.map((node) => {
    const moved = positions.get(node.id);
    return moved === undefined ? node : { ...node, x: moved.x, y: moved.y };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = graph.edges.map((edge) => {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) {
      throw new Error(`エッジの両端のノードが見つかりません: ${edge.id}`);
    }
    return { ...edge, source, target };
  });
  return { nodes, edges };
}

/**
 * 指定したノードと、そこに線でつながっているノード・線の識別子を返します。
 * マウスを重ねたノードの周りだけを濃く描き、それ以外を薄くするために使います。
 * 線が1本もつながっていないノードでは、そのノード自身だけを返します。
 */
export function neighborhoodOf(edges: PositionedGraphEdge[], nodeId: string): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>([nodeId]);
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edge.sourceId !== nodeId && edge.targetId !== nodeId) continue;
    edgeIds.add(edge.id);
    nodeIds.add(edge.sourceId);
    nodeIds.add(edge.targetId);
  }
  return { nodeIds, edgeIds };
}
