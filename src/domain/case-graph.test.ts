/**
 * ケースデータからグラフビューのノードとエッジを導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { buildCaseGraph, USER_GRAPH_NODE_ID } from './case-graph';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case } from './types';

/** 指定した種類のエッジを「始点→終点」の形の文字列にして返します。 */
function エッジの並び(graph: ReturnType<typeof buildCaseGraph>, kind: string): string[] {
  return graph.edges.filter((edge) => edge.kind === kind).map((edge) => `${edge.sourceId}→${edge.targetId}`);
}

describe('buildCaseGraph', () => {
  it('登録された人物をすべてノードにし、人物の登録順に並べる', () => {
    const graph = buildCaseGraph(sampleFictionalCase);

    const 人物のノード = graph.nodes.filter((node) => node.kind === 'person');
    expect(人物のノード.map((node) => node.label)).toEqual([
      '別荘の持ち主',
      '隣家の住人',
      '管理人',
      '県警',
      '県道の防犯カメラ',
      '架空日報 朝刊',
      '湖畔の夏 20年目の証言（架空の書籍）',
    ]);
  });

  it('証言をすべてノードにし、時系列ボードの並び順に並べる', () => {
    const graph = buildCaseGraph(sampleFictionalCase);

    const 証言のノード = graph.nodes.filter((node) => node.kind === 'claim');
    expect(証言のノード.map((node) => node.id)).toEqual([
      'claim:claim-caretaker',
      'claim:claim-police-camera',
      'claim:claim-neighbor',
      'claim:claim-report',
      'claim:claim-user-guess',
    ]);
  });

  it('証言のノードには、証言の名前（見出し、または本文の冒頭）を付ける', () => {
    const ケース: Case = {
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

    const graph = buildCaseGraph(ケース);

    expect(graph.nodes.find((node) => node.id === 'claim:claim-extortion')?.label).toBe('Zによる恐喝事件があった');
  });

  it('発言者の人物から証言へ、発言のエッジを張る', () => {
    const graph = buildCaseGraph(sampleFictionalCase);

    expect(エッジの並び(graph, 'speaks')).toContain('person:person-caretaker→claim:claim-caretaker');
    expect(エッジの並び(graph, 'speaks')).toContain('person:person-road-camera→claim:claim-police-camera');
  });

  it('伝聞の経路を、証言から経由した人物へ、伝えた順につなぐ', () => {
    // 前提: 防犯カメラの記録は、県警が発表し、架空日報が報じた（viaPersonIds: [県警, 架空日報]）
    const graph = buildCaseGraph(sampleFictionalCase);

    expect(エッジの並び(graph, 'via')).toEqual([
      'claim:claim-caretaker→person:person-book',
      'claim:claim-police-camera→person:person-police',
      'person:person-police→person:person-newspaper',
      'claim:claim-neighbor→person:person-newspaper',
    ]);
  });

  it('証言から、その証言が言及している人物へ、言及のエッジを張る', () => {
    const graph = buildCaseGraph(sampleFictionalCase);

    expect(エッジの並び(graph, 'mentions')).toContain('claim:claim-caretaker→person:person-owner');
    expect(エッジの並び(graph, 'mentions')).toContain('claim:claim-user-guess→person:person-neighbor');
  });

  it('ユーザーの推測は、ユーザーのノードから発言のエッジを張る', () => {
    const graph = buildCaseGraph(sampleFictionalCase);

    expect(graph.nodes.find((node) => node.id === USER_GRAPH_NODE_ID)?.label).toBe('ユーザーの推測');
    expect(エッジの並び(graph, 'speaks')).toContain(`${USER_GRAPH_NODE_ID}→claim:claim-user-guess`);
  });

  it('ユーザーの推測が1件も無いケースでは、ユーザーのノードを作らない', () => {
    const ケース: Case = {
      ...sampleFictionalCase,
      claims: sampleFictionalCase.claims.filter((claim) => claim.speaker.kind === 'person'),
    };

    const graph = buildCaseGraph(ケース);

    expect(graph.nodes.some((node) => node.id === USER_GRAPH_NODE_ID)).toBe(false);
  });

  it('証言に1度も登場しない人物も、孤立したノードとして残す', () => {
    // 前提: 登録しただけで、まだどの証言にも出てこない人物を、グラフから消さずに見せる
    const ケース: Case = {
      ...sampleFictionalCase,
      persons: [...sampleFictionalCase.persons, { id: 'person-stranger', name: '目撃者X' }],
    };

    const graph = buildCaseGraph(ケース);

    expect(graph.nodes.some((node) => node.id === 'person:person-stranger')).toBe(true);
    expect(graph.edges.some((edge) => edge.sourceId === 'person:person-stranger' || edge.targetId === 'person:person-stranger')).toBe(false);
  });

  it('人物のノードには、アイコンに使う画像と1文字を載せる', () => {
    const ケース: Case = {
      ...sampleFictionalCase,
      persons: [{ id: 'person-owner', name: '別荘の持ち主', iconText: '主' }],
      claims: [],
      relationships: [],
      timelineOrder: [],
    };

    const 持ち主のノード = buildCaseGraph(ケース).nodes.find((node) => node.id === 'person:person-owner');

    expect(持ち主のノード).toMatchObject({ kind: 'person', iconText: '主' });
  });
});
