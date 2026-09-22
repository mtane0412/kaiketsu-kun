/**
 * 人物の詳細に表示する、人物どうしの関係を導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { buildBasisClaimCandidates, buildPersonRelationships, describePersonRelationship } from './person-relationships';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case } from './types';

describe('buildPersonRelationships', () => {
  it('この人物が関わる関係を、ケースへの登録順に、相手と向きを添えて返す', () => {
    // 前提: サンプルのケースには「別荘の持ち主 → 管理人（雇用主・片方向）」と「管理人 と 別荘の持ち主（金銭トラブル？・双方向）」がある
    const 関係 = buildPersonRelationships(sampleFictionalCase, 'person-owner');

    expect(関係.map((view) => [view.relationship.label, view.other.name, view.direction])).toEqual([
      ['雇用主', '管理人', 'outgoing'],
      ['金銭トラブル？', '管理人', 'mutual'],
    ]);
  });

  it('片方向の関係を、指し示されている側の人物から見ると incoming になる', () => {
    const 関係 = buildPersonRelationships(sampleFictionalCase, 'person-caretaker');

    const 雇用主 = 関係.find((view) => view.relationship.id === 'relationship-employment');
    expect(雇用主?.direction).toBe('incoming');
    expect(雇用主?.other.name).toBe('別荘の持ち主');
  });

  it('関係が1件も無い人物では、空の配列を返す', () => {
    // 前提: 隣家の住人は、どの関係にも登場しない
    expect(buildPersonRelationships(sampleFictionalCase, 'person-neighbor')).toEqual([]);
  });

  it('根拠の証言を、時系列ボードの並び順で返す', () => {
    const ケース: Case = {
      ...sampleFictionalCase,
      relationships: [
        {
          id: 'relationship-multi-basis',
          fromPersonId: 'person-owner',
          toPersonId: 'person-caretaker',
          label: '雇用主',
          directed: true,
          // 前提: 時系列ボードでは claim-caretaker が claim-report より前に並ぶ
          basisClaimIds: ['claim-report', 'claim-caretaker'],
        },
      ],
    };

    const [関係] = buildPersonRelationships(ケース, 'person-owner');

    expect(関係?.basisClaims.map((view) => view.claim.id)).toEqual(['claim-caretaker', 'claim-report']);
  });

  it('根拠の証言が登録されていない関係では、根拠の証言を空にする', () => {
    const ケース: Case = {
      ...sampleFictionalCase,
      relationships: [
        {
          id: 'relationship-no-basis',
          fromPersonId: 'person-owner',
          toPersonId: 'person-caretaker',
          label: '面識がある',
          directed: false,
          basisClaimIds: [],
        },
      ],
    };

    const [関係] = buildPersonRelationships(ケース, 'person-owner');

    expect(関係?.basisClaims).toEqual([]);
  });

  it('根拠の証言がケースに無い場合は、データの破損として例外を投げる', () => {
    const ケース: Case = {
      ...sampleFictionalCase,
      relationships: [
        {
          id: 'relationship-broken-basis',
          fromPersonId: 'person-owner',
          toPersonId: 'person-caretaker',
          label: '雇用主',
          directed: true,
          basisClaimIds: ['claim-missing'],
        },
      ],
    };

    expect(() => buildPersonRelationships(ケース, 'person-owner')).toThrow();
  });

  it('相手の人物がケースに無い場合は、データの破損として例外を投げる', () => {
    const ケース: Case = {
      ...sampleFictionalCase,
      relationships: [
        {
          id: 'relationship-broken',
          fromPersonId: 'person-owner',
          toPersonId: 'person-missing',
          label: '雇用主',
          directed: true,
          basisClaimIds: [],
        },
      ],
    };

    expect(() => buildPersonRelationships(ケース, 'person-owner')).toThrow();
  });
});

describe('describePersonRelationship', () => {
  it('片方向の関係を、関係の名前と、どちらからどちらへ向く関係かで説明する', () => {
    const [関係] = buildPersonRelationships(sampleFictionalCase, 'person-owner');

    expect(describePersonRelationship(関係!, '別荘の持ち主')).toBe('雇用主（別荘の持ち主から管理人へ）');
  });

  it('指し示されている側から見た片方向の関係を、相手から自分へ向く関係として説明する', () => {
    const 関係 = buildPersonRelationships(sampleFictionalCase, 'person-caretaker').find(
      (view) => view.relationship.id === 'relationship-employment'
    );

    expect(describePersonRelationship(関係!, '管理人')).toBe('雇用主（別荘の持ち主から管理人へ）');
  });

  it('双方向の関係を、向きを持たない関係として説明する', () => {
    const 関係 = buildPersonRelationships(sampleFictionalCase, 'person-owner').find(
      (view) => view.relationship.id === 'relationship-money-trouble'
    );

    expect(describePersonRelationship(関係!, '別荘の持ち主')).toBe('金銭トラブル？（別荘の持ち主と管理人の双方向）');
  });
});

describe('buildBasisClaimCandidates', () => {
  it('指定した人物が関わる証言を、時系列ボードの並び順で返す', () => {
    // 前提: 管理人は claim-caretaker を述べ、claim-user-guess から言及されている
    const 候補 = buildBasisClaimCandidates(sampleFictionalCase, ['person-caretaker'], []);

    expect(候補.map((view) => view.claim.id)).toEqual(['claim-caretaker', 'claim-user-guess']);
  });

  it('複数の人物を指定すると、いずれかが関わる証言を返す', () => {
    // 前提: 架空日報は claim-report を述べ、claim-neighbor と claim-police-camera を経由して伝えている
    const 候補 = buildBasisClaimCandidates(sampleFictionalCase, ['person-caretaker', 'person-newspaper'], []);

    expect(候補.map((view) => view.claim.id)).toEqual([
      'claim-caretaker',
      'claim-police-camera',
      'claim-neighbor',
      'claim-report',
      'claim-user-guess',
    ]);
  });

  it('すでに根拠として選ばれている証言は、指定した人物が関わらなくても候補に残す', () => {
    // 前提: 隣家の住人は claim-neighbor と claim-user-guess に関わり、claim-report には関わらない
    const 候補 = buildBasisClaimCandidates(sampleFictionalCase, ['person-neighbor'], ['claim-report']);

    expect(候補.map((view) => view.claim.id)).toEqual(['claim-neighbor', 'claim-report', 'claim-user-guess']);
  });
});
