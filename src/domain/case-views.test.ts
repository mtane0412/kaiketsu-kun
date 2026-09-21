/**
 * 案件データから時系列ビュー・証言者別ビューを導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { buildTimeline, groupClaimsBySpeaker } from './case-views';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case } from './types';

describe('buildTimeline', () => {
  it('証言を、案件の並び順（timelineOrder）のとおりに並べる', () => {
    // 前提: ボード上の位置は日時ではなく並び順で決まる。並び順に載っていない証言（架空日報の記述・ユーザーの推測）は末尾に登録順で並ぶ
    const 案件: Case = {
      ...sampleFictionalCase,
      timelineOrder: ['claim:claim-neighbor', 'claim:claim-caretaker', 'claim:claim-police-camera'],
    };

    const items = buildTimeline(案件).items;

    expect(items.map((item) => item.view.claim.id)).toEqual([
      'claim-neighbor',
      'claim-caretaker',
      'claim-police-camera',
      'claim-report',
      'claim-user-guess',
    ]);
    expect(items[0]?.key).toBe('claim:claim-neighbor');
  });

  it('証言の参照先（発言者・経由・場所・言及している人物）を解決する', () => {
    const 防犯カメラの記録 = buildTimeline(sampleFictionalCase).items.find((item) => item.view.claim.id === 'claim-police-camera')?.view;
    const 隣家の証言 = buildTimeline(sampleFictionalCase).items.find((item) => item.view.claim.id === 'claim-neighbor')?.view;

    expect(防犯カメラの記録?.speakerLabel).toBe('県道の防犯カメラ');
    expect(防犯カメラの記録?.viaPersons.map((person) => person.name)).toEqual(['県警', '架空日報 朝刊']);
    expect(隣家の証言?.place?.name).toBe('湖畔の別荘');
    expect(隣家の証言?.mentionedPersons.map((person) => person.name)).toEqual(['別荘の持ち主']);
  });

  it('証言が存在しない場所を参照している場合はエラーにする', () => {
    const 壊れた案件: Case = {
      ...sampleFictionalCase,
      claims: [{ ...sampleFictionalCase.claims[0]!, placeId: 'place-missing' }],
    };

    expect(() => buildTimeline(壊れた案件)).toThrow('場所が見つかりません: place-missing');
  });
});

describe('groupClaimsBySpeaker', () => {
  it('人物（案件への登録順）、ユーザーの推測の順にグループを作る。新聞のような媒体も人物として並ぶ', () => {
    const groups = groupClaimsBySpeaker(sampleFictionalCase);

    expect(groups.map((group) => [group.kind, group.label])).toEqual([
      ['person', '隣家の住人'],
      ['person', '管理人'],
      ['person', '県道の防犯カメラ'],
      ['person', '架空日報 朝刊'],
      ['user', 'ユーザーの推測'],
    ]);
  });

  it('経由した人物は発言者ではないため、その人物のグループには入れない', () => {
    // 前提: サンプルでは、防犯カメラの記録を県警が発表し、架空日報が報じている（発言者: 防犯カメラ、経由: 県警 → 架空日報）
    const groups = groupClaimsBySpeaker(sampleFictionalCase);
    const 防犯カメラ = groups.find((group) => group.label === '県道の防犯カメラ');

    expect(防犯カメラ?.claims.map((item) => item.claim.id)).toEqual(['claim-police-camera']);
    expect(groups.find((group) => group.label === '県警')).toBeUndefined();
    // 地の文の記述だけが、架空日報のグループに入る
    expect(groups.find((group) => group.label === '架空日報 朝刊')?.claims.map((item) => item.claim.id)).toEqual([
      'claim-report',
    ]);
  });

  it('同じ発言者の証言を、述べられた時点の早い順に並べる', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-caretaker-early',
          speaker: { kind: 'person', personIds: ['person-caretaker'] },
          viaPersonIds: ['person-newspaper'],
          content: '持ち主とは挨拶をする程度の付き合いだった。',
          statedAt: { text: '1998年8月14日', earliest: '1998-08-14' },
          mentionedPersonIds: ['person-owner'],
        },
      ],
    };

    const 管理人 = groupClaimsBySpeaker(案件).find((group) => group.label === '管理人');

    expect(管理人?.claims.map((item) => item.claim.id)).toEqual(['claim-caretaker-early', 'claim-caretaker']);
  });

  it('複数の人物が述べた証言は、それぞれの人物のグループに入れ、発言者名を全員分つなげて示す', () => {
    // 前提: 1つの記事が、隣家の住人と管理人の2人が同じことを述べたと伝えている
    const 案件: Case = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-two-speakers',
          speaker: { kind: 'person', personIds: ['person-neighbor', 'person-caretaker'] },
          viaPersonIds: ['person-newspaper'],
          content: '持ち主は几帳面な人だった。',
          mentionedPersonIds: ['person-owner'],
        },
      ],
    };

    const groups = groupClaimsBySpeaker(案件);
    const 隣家の住人 = groups.find((group) => group.label === '隣家の住人');
    const 管理人 = groups.find((group) => group.label === '管理人');

    expect(隣家の住人?.claims.map((item) => item.claim.id)).toContain('claim-two-speakers');
    expect(管理人?.claims.map((item) => item.claim.id)).toContain('claim-two-speakers');
    expect(管理人?.claims.find((item) => item.claim.id === 'claim-two-speakers')?.speakerLabel).toBe('隣家の住人、管理人');
  });

  it('証言に、経由した人物を伝えた順に添える', () => {
    const 防犯カメラ = groupClaimsBySpeaker(sampleFictionalCase).find((group) => group.label === '県道の防犯カメラ');

    expect(防犯カメラ?.claims[0]?.viaPersons.map((person) => person.name)).toEqual(['県警', '架空日報 朝刊']);
  });
});

describe('人物の画像', () => {
  const 住人の画像 = 'data:image/jpeg;base64,AAAA';
  const 案件: Case = {
    ...sampleFictionalCase,
    persons: sampleFictionalCase.persons.map((person) =>
      person.id === 'person-neighbor' ? { ...person, imageDataUrl: 住人の画像 } : person
    ),
  };

  it('証言のビューに、発言者の人物を載せる（カードに発言者の画像を表示するため）', () => {
    const 住人の証言 = buildTimeline(案件).items.find((item) => item.view.claim.id === 'claim-neighbor')?.view;
    const 推測 = buildTimeline(案件).items.find((item) => item.view.claim.id === 'claim-user-guess')?.view;

    expect(住人の証言?.speakerPersons.map((person) => person.imageDataUrl)).toEqual([住人の画像]);
    expect(推測?.speakerPersons).toEqual([]);
  });

  it('証言者別ビューのグループに、その人物の画像を載せる', () => {
    const groups = groupClaimsBySpeaker(案件);

    expect(groups.find((group) => group.key === 'person:person-neighbor')?.imageDataUrl).toBe(住人の画像);
    expect(groups.find((group) => group.key === 'user')?.imageDataUrl).toBeUndefined();
  });
});
