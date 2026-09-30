/**
 * グラフビューで「何を描くか」を決めるロジック（絞り込み・手で動かした位置・強調する範囲）のテスト
 */
import { describe, expect, it } from 'vitest';
import { filterGraph, moveNodes, neighborhoodOf, type GraphFilter, type PositionedGraph } from './graph-display';
import type { PersonKind } from '@/domain/types';
import type { PositionedGraphEdge, PositionedGraphNode } from './graph-layout';

/** 人物のノードを作ります。 */
function makePersonNode(id: string, name: string, x: number, y: number, personKind: PersonKind = 'individual'): PositionedGraphNode {
  return { id, kind: 'person', label: name, entityId: id, personKind, x, y };
}

/** 証言のノードを作ります。 */
function makeClaimNode(id: string, label: string, x: number, y: number): PositionedGraphNode {
  return { id, kind: 'claim', label, entityId: id, x, y };
}

/** 2つのノードを結ぶエッジを作ります。 */
function makeEdge(
  id: string,
  kind: PositionedGraphEdge['kind'],
  source: PositionedGraphNode,
  target: PositionedGraphNode
): PositionedGraphEdge {
  return { id, kind, sourceId: source.id, targetId: target.id, source, target };
}

const caretaker = makePersonNode('person:管理人', '管理人', 0, 0);
const villaOwner = makePersonNode('person:持ち主', '別荘の持ち主', 100, 0);
const securityCamera = makePersonNode('person:防犯カメラ', '県道の防犯カメラ', 200, 0, 'record');
const user: PositionedGraphNode = { id: 'user', kind: 'user', label: 'ユーザーの推測', x: 0, y: 100 };
const caretakerClaim = makeClaimNode('claim:見回り', '見回りをしたとき…', 50, 50);
const userGuess = makeClaimNode('claim:推測', '犯人は内部の人物では…', 0, 150);

/** 人物2人・ユーザー・証言2件と、発言・言及・関係の線を持つグラフです。 */
const sampleGraph: PositionedGraph = {
  nodes: [caretaker, villaOwner, user, caretakerClaim, userGuess],
  edges: [
    makeEdge('edge:発言', 'speaks', caretaker, caretakerClaim),
    makeEdge('edge:言及', 'mentions', caretakerClaim, villaOwner),
    makeEdge('edge:ユーザーの発言', 'speaks', user, userGuess),
    makeEdge('edge:関係', 'relates', villaOwner, caretaker),
  ],
};

/** すべてを表示する絞り込みの設定です。各テストでは、ここから1つだけ変えます。 */
const showAll: GraphFilter = {
  persons: true,
  personKinds: new Set<PersonKind>(['individual', 'organization', 'record', 'object']),
  claims: true,
  relations: true,
};

describe('filterGraph', () => {
  it('何も絞り込まない場合は、すべてのノードと線をそのまま返す', () => {
    const result = filterGraph(sampleGraph, showAll);

    expect(result.nodes).toHaveLength(5);
    expect(result.edges).toHaveLength(4);
  });

  it('人物の種別を外すと、その種別の人物のノードと、そこにつながる線を描かない', () => {
    const securityCameraClaim = makeClaimNode('claim:映像', '車が映っていた', 200, 50);
    const graph: PositionedGraph = {
      nodes: [caretaker, securityCamera, securityCameraClaim],
      edges: [makeEdge('edge:カメラの発言', 'speaks', securityCamera, securityCameraClaim), makeEdge('edge:カメラの言及', 'mentions', securityCameraClaim, caretaker)],
    };

    const result = filterGraph(graph, { ...showAll, personKinds: new Set<PersonKind>(['individual']) });

    expect(result.nodes.map((node) => node.id)).toEqual(['person:管理人', 'claim:映像']);
    expect(result.edges.map((edge) => edge.id)).toEqual(['edge:カメラの言及']);
  });

  it('人物を隠すと、人物のノードと、人物につながる線を描かない', () => {
    const result = filterGraph(sampleGraph, { ...showAll, persons: false });

    expect(result.nodes.map((node) => node.id)).toEqual(['claim:見回り', 'claim:推測']);
    // 発言・言及・関係は、いずれも人物につながるため残らない
    expect(result.edges).toHaveLength(0);
  });

  it('発言者を選ばない証言をまとめるノードは、発言者であるため人物と一緒に隠す', () => {
    const result = filterGraph(sampleGraph, { ...showAll, persons: false });

    expect(result.nodes.some((node) => node.kind === 'user')).toBe(false);
  });

  it('証言を隠すと、証言のノードとその線は消えるが、人物どうしの関係の線は残る', () => {
    const result = filterGraph(sampleGraph, { ...showAll, claims: false });

    expect(result.nodes.map((node) => node.id)).toEqual(['person:管理人', 'person:持ち主', 'user']);
    expect(result.edges.map((edge) => edge.id)).toEqual(['edge:関係']);
  });

  it('関係を隠すと、関係の線だけを消し、ノードはすべて残す', () => {
    const result = filterGraph(sampleGraph, { ...showAll, relations: false });

    expect(result.nodes).toHaveLength(5);
    expect(result.edges.map((edge) => edge.id)).toEqual(['edge:発言', 'edge:言及', 'edge:ユーザーの発言']);
  });

  it('時点を指定すると、その時点で成り立たない関係の線だけを消す', () => {
    const divorcedRelationship: PositionedGraphEdge = {
      ...makeEdge('edge:婚姻', 'relates', villaOwner, caretaker),
      relation: { directed: false, hasBasis: false, until: '1998-05' },
    };
    const ongoingRelationship: PositionedGraphEdge = {
      ...makeEdge('edge:雇用', 'relates', villaOwner, caretaker),
      relation: { directed: true, hasBasis: true, since: '1995-04' },
    };
    const graph: PositionedGraph = { ...sampleGraph, edges: [...sampleGraph.edges, divorcedRelationship, ongoingRelationship] };

    const result = filterGraph(graph, { ...showAll, relationsAt: '1998-08-12' });

    // 期間を持たない関係（edge:関係）は、すべての時点で成り立つものとして残る
    expect(result.edges.map((edge) => edge.id)).toEqual(['edge:発言', 'edge:言及', 'edge:ユーザーの発言', 'edge:関係', 'edge:雇用']);
    expect(result.nodes).toHaveLength(5);
  });
});

describe('moveNodes', () => {
  it('手で動かしたノードの座標を差し替える', () => {
    const result = moveNodes(sampleGraph, new Map([['person:管理人', { x: 300, y: 400 }]]));

    expect(result.nodes.find((node) => node.id === 'person:管理人')).toMatchObject({ x: 300, y: 400, label: '管理人' });
  });

  it('動かしていないノードは、計算された位置のままにする', () => {
    const result = moveNodes(sampleGraph, new Map([['person:管理人', { x: 300, y: 400 }]]));

    expect(result.nodes.find((node) => node.id === 'person:持ち主')).toMatchObject({ x: 100, y: 0 });
  });

  it('動かしたノードにつながる線の端も、一緒に動かす', () => {
    const result = moveNodes(sampleGraph, new Map([['person:管理人', { x: 300, y: 400 }]]));

    const statementLine = result.edges.find((edge) => edge.id === 'edge:発言');
    expect(statementLine?.source).toMatchObject({ x: 300, y: 400 });
    expect(statementLine?.target).toMatchObject({ x: 50, y: 50 });
  });

  it('1つも動かしていない場合は、もとのグラフをそのまま返す', () => {
    expect(moveNodes(sampleGraph, new Map())).toBe(sampleGraph);
  });
});

describe('neighborhoodOf', () => {
  it('選んだノード自身と、つながる相手のノード・線を返す', () => {
    const neighborhood = neighborhoodOf(sampleGraph.edges, 'person:管理人');

    expect([...neighborhood.nodeIds].sort()).toEqual(['claim:見回り', 'person:持ち主', 'person:管理人']);
    expect([...neighborhood.edgeIds].sort()).toEqual(['edge:発言', 'edge:関係']);
  });

  it('つながっていないノードと線は含めない', () => {
    const neighborhood = neighborhoodOf(sampleGraph.edges, 'person:管理人');

    expect(neighborhood.nodeIds.has('claim:推測')).toBe(false);
    expect(neighborhood.edgeIds.has('edge:ユーザーの発言')).toBe(false);
  });

  it('線が1本もつながっていないノードでは、そのノード自身だけを返す', () => {
    const neighborhood = neighborhoodOf([], 'person:管理人');

    expect([...neighborhood.nodeIds]).toEqual(['person:管理人']);
    expect(neighborhood.edgeIds.size).toBe(0);
  });
});
