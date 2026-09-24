/**
 * グラフビューで「何を描くか」を決めるロジック（絞り込み・手で動かした位置・強調する範囲）のテスト
 */
import { describe, expect, it } from 'vitest';
import { filterGraph, moveNodes, neighborhoodOf, type PositionedGraph } from './graph-display';
import type { PositionedGraphEdge, PositionedGraphNode } from './graph-layout';

/** 人物のノードを作ります。 */
function 人物ノード(id: string, name: string, x: number, y: number): PositionedGraphNode {
  return { id, kind: 'person', label: name, entityId: id, x, y };
}

/** 証言のノードを作ります。 */
function 証言ノード(id: string, label: string, x: number, y: number): PositionedGraphNode {
  return { id, kind: 'claim', label, entityId: id, x, y };
}

/** 2つのノードを結ぶエッジを作ります。 */
function エッジ(
  id: string,
  kind: PositionedGraphEdge['kind'],
  source: PositionedGraphNode,
  target: PositionedGraphNode
): PositionedGraphEdge {
  return { id, kind, sourceId: source.id, targetId: target.id, source, target };
}

const 管理人 = 人物ノード('person:管理人', '管理人', 0, 0);
const 別荘の持ち主 = 人物ノード('person:持ち主', '別荘の持ち主', 100, 0);
const ユーザー: PositionedGraphNode = { id: 'user', kind: 'user', label: 'ユーザーの推測', x: 0, y: 100 };
const 管理人の証言 = 証言ノード('claim:見回り', '見回りをしたとき…', 50, 50);
const ユーザーの推測 = 証言ノード('claim:推測', '犯人は内部の人物では…', 0, 150);

/** 人物2人・ユーザー・証言2件と、発言・言及・関係の線を持つグラフです。 */
const 見本のグラフ: PositionedGraph = {
  nodes: [管理人, 別荘の持ち主, ユーザー, 管理人の証言, ユーザーの推測],
  edges: [
    エッジ('edge:発言', 'speaks', 管理人, 管理人の証言),
    エッジ('edge:言及', 'mentions', 管理人の証言, 別荘の持ち主),
    エッジ('edge:ユーザーの発言', 'speaks', ユーザー, ユーザーの推測),
    エッジ('edge:関係', 'relates', 別荘の持ち主, 管理人),
  ],
};

/** すべてを表示する絞り込みの設定です。各テストでは、ここから1つだけ変えます。 */
const すべて表示 = { persons: true, claims: true, relations: true };

describe('filterGraph', () => {
  it('何も絞り込まない場合は、すべてのノードと線をそのまま返す', () => {
    const 結果 = filterGraph(見本のグラフ, すべて表示);

    expect(結果.nodes).toHaveLength(5);
    expect(結果.edges).toHaveLength(4);
  });

  it('人物を隠すと、人物のノードと、人物につながる線を描かない', () => {
    const 結果 = filterGraph(見本のグラフ, { ...すべて表示, persons: false });

    expect(結果.nodes.map((node) => node.id)).toEqual(['claim:見回り', 'claim:推測']);
    // 発言・言及・関係は、いずれも人物につながるため残らない
    expect(結果.edges).toHaveLength(0);
  });

  it('発言者を選ばない証言をまとめるノードは、発言者であるため人物と一緒に隠す', () => {
    const 結果 = filterGraph(見本のグラフ, { ...すべて表示, persons: false });

    expect(結果.nodes.some((node) => node.kind === 'user')).toBe(false);
  });

  it('証言を隠すと、証言のノードとその線は消えるが、人物どうしの関係の線は残る', () => {
    const 結果 = filterGraph(見本のグラフ, { ...すべて表示, claims: false });

    expect(結果.nodes.map((node) => node.id)).toEqual(['person:管理人', 'person:持ち主', 'user']);
    expect(結果.edges.map((edge) => edge.id)).toEqual(['edge:関係']);
  });

  it('関係を隠すと、関係の線だけを消し、ノードはすべて残す', () => {
    const 結果 = filterGraph(見本のグラフ, { ...すべて表示, relations: false });

    expect(結果.nodes).toHaveLength(5);
    expect(結果.edges.map((edge) => edge.id)).toEqual(['edge:発言', 'edge:言及', 'edge:ユーザーの発言']);
  });
});

describe('moveNodes', () => {
  it('手で動かしたノードの座標を差し替える', () => {
    const 結果 = moveNodes(見本のグラフ, new Map([['person:管理人', { x: 300, y: 400 }]]));

    expect(結果.nodes.find((node) => node.id === 'person:管理人')).toMatchObject({ x: 300, y: 400, label: '管理人' });
  });

  it('動かしていないノードは、計算された位置のままにする', () => {
    const 結果 = moveNodes(見本のグラフ, new Map([['person:管理人', { x: 300, y: 400 }]]));

    expect(結果.nodes.find((node) => node.id === 'person:持ち主')).toMatchObject({ x: 100, y: 0 });
  });

  it('動かしたノードにつながる線の端も、一緒に動かす', () => {
    const 結果 = moveNodes(見本のグラフ, new Map([['person:管理人', { x: 300, y: 400 }]]));

    const 発言の線 = 結果.edges.find((edge) => edge.id === 'edge:発言');
    expect(発言の線?.source).toMatchObject({ x: 300, y: 400 });
    expect(発言の線?.target).toMatchObject({ x: 50, y: 50 });
  });

  it('1つも動かしていない場合は、もとのグラフをそのまま返す', () => {
    expect(moveNodes(見本のグラフ, new Map())).toBe(見本のグラフ);
  });
});

describe('neighborhoodOf', () => {
  it('選んだノード自身と、つながる相手のノード・線を返す', () => {
    const 近傍 = neighborhoodOf(見本のグラフ.edges, 'person:管理人');

    expect([...近傍.nodeIds].sort()).toEqual(['claim:見回り', 'person:持ち主', 'person:管理人']);
    expect([...近傍.edgeIds].sort()).toEqual(['edge:発言', 'edge:関係']);
  });

  it('つながっていないノードと線は含めない', () => {
    const 近傍 = neighborhoodOf(見本のグラフ.edges, 'person:管理人');

    expect(近傍.nodeIds.has('claim:推測')).toBe(false);
    expect(近傍.edgeIds.has('edge:ユーザーの発言')).toBe(false);
  });

  it('線が1本もつながっていないノードでは、そのノード自身だけを返す', () => {
    const 近傍 = neighborhoodOf([], 'person:管理人');

    expect([...近傍.nodeIds]).toEqual(['person:管理人']);
    expect(近傍.edgeIds.size).toBe(0);
  });
});
