/**
 * ケースデータからグラフビューのノードとエッジを導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { buildCaseGraph, USER_GRAPH_NODE_ID } from './case-graph';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case } from './types';

/** 指定した種類のエッジを「始点→終点」の形の文字列にして返します。 */
function listEdgeKeys(graph: ReturnType<typeof buildCaseGraph>, kind: string): string[] {
  return graph.edges.filter((edge) => edge.kind === kind).map((edge) => `${edge.sourceId}→${edge.targetId}`);
}

describe('buildCaseGraph', () => {
  it('登録された人物をすべてノードにし、人物の登録順に並べる', () => {
    const graph = buildCaseGraph(sampleFictionalCase);

    const personNode = graph.nodes.filter((node) => node.kind === 'person');
    expect(personNode.map((node) => node.label)).toEqual([
      '別荘の持ち主',
      '隣家の住人',
      '管理人',
      '県警',
      '県道の防犯カメラ',
      '架空日報 朝刊',
      '湖畔の夏 20年目の証言（架空の書籍）',
    ]);
  });

  it('人物のノードに、人物の種別を載せる（種別で色分け・絞り込みをするため）', () => {
    const graph = buildCaseGraph(sampleFictionalCase);

    expect(graph.nodes.find((node) => node.id === 'person:person-police')?.personKind).toBe('organization');
    expect(graph.nodes.find((node) => node.id === 'person:person-owner')?.personKind).toBe('individual');
  });

  it('証言をすべてノードにし、時系列ボードの並び順に並べる', () => {
    const graph = buildCaseGraph(sampleFictionalCase);

    const claimNode = graph.nodes.filter((node) => node.kind === 'claim');
    expect(claimNode.map((node) => node.id)).toEqual([
      'claim:claim-caretaker',
      'claim:claim-police-camera',
      'claim:claim-neighbor',
      'claim:claim-report',
      'claim:claim-user-guess',
    ]);
  });

  it('証言のノードには、証言の名前（見出し、または本文の冒頭）を付ける', () => {
    const caseData: Case = {
      ...sampleFictionalCase,
      claims: [
        {
          id: 'claim-extortion',
          speaker: { kind: 'person', personIds: ['person-newspaper'] },
          viaPersonIds: [],
          title: 'Zによる恐喝事件があった',
          content: 'Zは被害者の自宅を訪れ、現金を渡すよう繰り返し迫った。',
          mentionedPersonIds: [],
        },
      ],
      timelineOrder: [],
    };

    const graph = buildCaseGraph(caseData);

    expect(graph.nodes.find((node) => node.id === 'claim:claim-extortion')?.label).toBe('Zによる恐喝事件があった');
  });

  it('発言者の人物から証言へ、発言のエッジを張る', () => {
    const graph = buildCaseGraph(sampleFictionalCase);

    expect(listEdgeKeys(graph, 'speaks')).toContain('person:person-caretaker→claim:claim-caretaker');
    expect(listEdgeKeys(graph, 'speaks')).toContain('person:person-road-camera→claim:claim-police-camera');
  });

  it('伝聞の経路を、証言から経由した人物へ、伝えた順につなぐ', () => {
    // 前提: 防犯カメラの記録は、県警が発表し、架空日報が報じた（viaPersonIds: [県警, 架空日報]）
    const graph = buildCaseGraph(sampleFictionalCase);

    expect(listEdgeKeys(graph, 'via')).toEqual([
      'claim:claim-caretaker→person:person-book',
      'claim:claim-police-camera→person:person-police',
      'person:person-police→person:person-newspaper',
      'claim:claim-neighbor→person:person-newspaper',
    ]);
  });

  it('複数の証言が同じ伝聞の経路を通っても、エッジのIDは重複しない', () => {
    // 前提: 経由のエッジは人物と人物をつなぐため、元になった証言をIDに含めないと、同じ経路を通る証言同士でIDがぶつかる
    const caseData: Case = {
      ...sampleFictionalCase,
      claims: sampleFictionalCase.claims.map((claim) => ({ ...claim, viaPersonIds: ['person-police', 'person-newspaper'] })),
    };

    const graph = buildCaseGraph(caseData);

    expect(new Set(graph.edges.map((edge) => edge.id)).size).toBe(graph.edges.length);
  });

  it('証言から、その証言が言及している人物へ、言及のエッジを張る', () => {
    const graph = buildCaseGraph(sampleFictionalCase);

    expect(listEdgeKeys(graph, 'mentions')).toContain('claim:claim-caretaker→person:person-owner');
    expect(listEdgeKeys(graph, 'mentions')).toContain('claim:claim-user-guess→person:person-neighbor');
  });

  it('ユーザーの推測は、ユーザーのノードから発言のエッジを張る', () => {
    const graph = buildCaseGraph(sampleFictionalCase);

    expect(graph.nodes.find((node) => node.id === USER_GRAPH_NODE_ID)?.label).toBe('ユーザーの推測');
    expect(listEdgeKeys(graph, 'speaks')).toContain(`${USER_GRAPH_NODE_ID}→claim:claim-user-guess`);
  });

  it('ユーザーの推測が1件も無いケースでは、ユーザーのノードを作らない', () => {
    const caseData: Case = {
      ...sampleFictionalCase,
      claims: sampleFictionalCase.claims.filter((claim) => claim.speaker.kind === 'person'),
    };

    const graph = buildCaseGraph(caseData);

    expect(graph.nodes.some((node) => node.id === USER_GRAPH_NODE_ID)).toBe(false);
  });

  it('証言に1度も登場しない人物も、孤立したノードとして残す', () => {
    // 前提: 登録しただけで、まだどの証言にも出てこない人物を、グラフから消さずに見せる
    const caseData: Case = {
      ...sampleFictionalCase,
      persons: [...sampleFictionalCase.persons, { id: 'person-stranger', name: '目撃者X', kind: 'individual' }],
    };

    const graph = buildCaseGraph(caseData);

    expect(graph.nodes.some((node) => node.id === 'person:person-stranger')).toBe(true);
    expect(graph.edges.some((edge) => edge.sourceId === 'person:person-stranger' || edge.targetId === 'person:person-stranger')).toBe(false);
  });

  it('人物のノードには、アイコンに使う画像と1文字を載せる', () => {
    const caseData: Case = {
      ...sampleFictionalCase,
      persons: [{ id: 'person-owner', name: '別荘の持ち主', kind: 'individual', iconText: '主' }],
      claims: [],
      relationships: [],
      timelineOrder: [],
    };

    const ownerNode = buildCaseGraph(caseData).nodes.find((node) => node.id === 'person:person-owner');

    expect(ownerNode).toMatchObject({ kind: 'person', iconText: '主' });
  });
});

describe('buildCaseGraph（人物どうしの関係）', () => {
  it('登録された関係を、人物から人物へのエッジにし、ケースへの登録順に並べる', () => {
    // 前提: サンプルのケースには「別荘の持ち主 → 管理人（雇用主）」と「管理人 と 別荘の持ち主（金銭トラブル？）」がある
    const graph = buildCaseGraph(sampleFictionalCase);

    expect(listEdgeKeys(graph, 'relates')).toEqual([
      'person:person-owner→person:person-caretaker',
      'person:person-caretaker→person:person-owner',
    ]);
  });

  it('関係のエッジを、証言から導いたエッジの後に並べる', () => {
    // 前提: 証言から導いたエッジ（発言・経由・言及）を先に描き、関係のエッジを重ねる
    const kindOrder = buildCaseGraph(sampleFictionalCase).edges.map((edge) => edge.kind);

    const firstRelationship = kindOrder.indexOf('relates');
    expect(firstRelationship).toBeGreaterThan(0);
    expect(kindOrder.slice(firstRelationship).every((kind) => kind === 'relates')).toBe(true);
  });

  it('関係のエッジに、向きの有無と根拠の有無を載せる', () => {
    const caseData: Case = {
      ...sampleFictionalCase,
      relationships: [
        {
          id: 'relationship-employment',
          fromPersonId: 'person-owner',
          toPersonId: 'person-caretaker',
          label: '雇用主',
          directed: true,
          basisClaimIds: ['claim-caretaker'],
        },
        {
          id: 'relationship-acquaintance',
          fromPersonId: 'person-owner',
          toPersonId: 'person-neighbor',
          label: '面識がある',
          directed: false,
          basisClaimIds: [],
        },
      ],
    };

    const relationshipEdge = buildCaseGraph(caseData).edges.filter((edge) => edge.kind === 'relates');

    expect(relationshipEdge.map((edge) => edge.relation)).toEqual([
      { directed: true, hasBasis: true },
      { directed: false, hasBasis: false },
    ]);
  });

  it('関係のエッジに、関係の開始と終了を載せる', () => {
    const caseData: Case = {
      ...sampleFictionalCase,
      relationships: [
        {
          id: 'relationship-marriage',
          fromPersonId: 'person-owner',
          toPersonId: 'person-caretaker',
          label: '婚姻',
          directed: false,
          basisClaimIds: [],
          since: '1990',
          until: '1998-05',
        },
      ],
    };

    const [relationshipEdge] = buildCaseGraph(caseData).edges.filter((edge) => edge.kind === 'relates');

    expect(relationshipEdge?.relation).toEqual({ directed: false, hasBasis: false, since: '1990', until: '1998-05' });
  });

  it('関係のエッジに、関係の名前を載せる', () => {
    const relationshipEdge = buildCaseGraph(sampleFictionalCase).edges.filter((edge) => edge.kind === 'relates');

    expect(relationshipEdge.map((edge) => edge.label)).toEqual(['雇用主', '金銭トラブル？']);
  });

  it('関係が1件も無いケースでは、関係のエッジを作らない', () => {
    const caseData: Case = { ...sampleFictionalCase, relationships: [] };

    expect(buildCaseGraph(caseData).edges.some((edge) => edge.kind === 'relates')).toBe(false);
  });

  it('同じ2人の間に複数の関係があっても、エッジのIDが重ならない', () => {
    const graph = buildCaseGraph(sampleFictionalCase);
    const relationshipEdge = graph.edges.filter((edge) => edge.kind === 'relates');

    expect(new Set(relationshipEdge.map((edge) => edge.id)).size).toBe(relationshipEdge.length);
  });
});
