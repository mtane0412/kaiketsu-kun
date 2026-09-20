/**
 * 案件データから時系列ビュー・証言者別ビューを導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { buildTimeline, groupClaimsBySpeaker, type TimelineItem } from './case-views';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case } from './types';

/** ボードの項目を、見分けやすい名前（出来事のタイトル、または主張のID）に変換します。 */
function nameOf(item: TimelineItem): string {
  return item.kind === 'event' ? item.event.title : item.view.claim.id;
}

describe('buildTimeline', () => {
  it('出来事の束と、出来事に束ねていない主張を、主張が述べる日時の早い順に並べる', () => {
    // 前提: サンプルの出来事「持ち主が最後に目撃された」の主張は、8月12日の夜について述べている
    const 案件: Case = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-police-search',
          speaker: { kind: 'source' },
          sourceId: 'source-newspaper',
          content: '警察が別荘を捜索した。',
          mentionedPersonIds: [],
          when: { text: '8月15日', earliest: '1998-08-15' },
        },
        {
          id: 'claim-arrival',
          speaker: { kind: 'source' },
          sourceId: 'source-newspaper',
          content: '持ち主は8月10日に別荘に到着した。',
          mentionedPersonIds: [],
          when: { text: '8月10日', earliest: '1998-08-10' },
        },
      ],
    };

    const names = buildTimeline(案件).items.map(nameOf);

    expect(names).toEqual(['claim-arrival', '持ち主が最後に目撃された', 'claim-police-search']);
  });

  it('出来事の束は、束ねた主張から日時・場所・言及されている人物を導出する', () => {
    const [item] = buildTimeline(sampleFictionalCase).items;
    if (item?.kind !== 'event') throw new Error('先頭の項目が出来事の束ではありません');

    // 束の日時は、束ねた主張が述べる日時のうち最も早いもの
    expect(item.when?.text).toBe('8月12日 夜7時');
    expect(item.places.map((place) => place.name)).toEqual(['湖畔の別荘']);
    expect(item.persons.map((person) => person.name)).toEqual(['別荘の持ち主']);
  });

  it('出来事の束の中では、主張を述べる日時の早い順に並べ、日時を述べない主張を最後に置く', () => {
    const [item] = buildTimeline(sampleFictionalCase).items;
    if (item?.kind !== 'event') throw new Error('先頭の項目が出来事の束ではありません');

    expect(item.claims.map((view) => view.claim.id)).toEqual(['claim-caretaker', 'claim-neighbor', 'claim-report']);
  });

  it('同じ出来事に束ねた主張同士で、述べる時刻が重ならない場合に、時刻の食い違いを示す', () => {
    // 前提: 管理人は「夜7時」、隣家の住人は「夜9時ごろ」と述べている。架空日報の記述は日時を述べていない
    const [item] = buildTimeline(sampleFictionalCase).items;
    if (item?.kind !== 'event') throw new Error('先頭の項目が出来事の束ではありません');
    const conflicts = Object.fromEntries(item.claims.map((view) => [view.claim.id, view.hasTimeConflict]));

    expect(conflicts).toEqual({
      'claim-caretaker': true,
      'claim-neighbor': true,
      'claim-report': false,
    });
  });

  it('同じ出来事に束ねた主張同士で、述べる場所が異なる場合に、場所の食い違いを示す', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      places: [...sampleFictionalCase.places, { id: 'place-station', name: '最寄り駅' }],
      claims: sampleFictionalCase.claims.map((claim) =>
        claim.id === 'claim-neighbor' ? { ...claim, placeId: 'place-station' } : claim
      ),
    };

    const [item] = buildTimeline(案件).items;
    if (item?.kind !== 'event') throw new Error('先頭の項目が出来事の束ではありません');
    const conflicts = Object.fromEntries(item.claims.map((view) => [view.claim.id, view.hasPlaceConflict]));

    // 架空日報の記述は場所を述べていないため、食い違いの対象にならない
    expect(conflicts).toEqual({
      'claim-caretaker': true,
      'claim-neighbor': true,
      'claim-report': false,
    });
  });

  it('日時を述べる主張が無い項目を、時期不明にまとめる', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      events: [...sampleFictionalCase.events, { id: 'event-fire', title: '別荘でぼやがあった' }],
    };

    const names = buildTimeline(案件).undatedItems.map(nameOf);

    // 主張が1件も無い出来事も、書き足す先として時期不明に表示する
    expect(names).toEqual(['別荘でぼやがあった', 'claim-user-guess']);
  });

  it('主張が存在しない出来事を参照している場合はエラーにする', () => {
    const 壊れた案件: Case = {
      ...sampleFictionalCase,
      claims: [{ ...sampleFictionalCase.claims[0]!, eventId: 'event-missing' }],
    };

    expect(() => buildTimeline(壊れた案件)).toThrow('出来事が見つかりません: event-missing');
  });
});

describe('groupClaimsBySpeaker', () => {
  it('人物、ソース自体の記述、ユーザーの推測の順にグループを作る', () => {
    const groups = groupClaimsBySpeaker(sampleFictionalCase);

    expect(groups.map((group) => [group.kind, group.label])).toEqual([
      ['person', '隣家の住人'],
      ['person', '管理人'],
      ['source', '架空日報 朝刊'],
      ['user', 'ユーザーの推測'],
    ]);
  });

  it('同じ発言者の主張を、述べられた時点の早い順に並べる', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-caretaker-early',
          speaker: { kind: 'person', personIds: ['person-caretaker'] },
          sourceId: 'source-newspaper',
          content: '持ち主とは挨拶をする程度の付き合いだった。',
          statedAt: { text: '1998年8月14日', earliest: '1998-08-14' },
          mentionedPersonIds: ['person-owner'],
        },
      ],
    };

    const 管理人 = groupClaimsBySpeaker(案件).find((group) => group.label === '管理人');

    expect(管理人?.claims.map((item) => item.claim.id)).toEqual(['claim-caretaker-early', 'claim-caretaker']);
  });

  it('複数の人物が述べた主張は、それぞれの人物のグループに入れ、発言者名を全員分つなげて示す', () => {
    // 前提: 1つの記事が、隣家の住人と管理人の2人が同じことを述べたと伝えている
    const 案件: Case = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-two-speakers',
          speaker: { kind: 'person', personIds: ['person-neighbor', 'person-caretaker'] },
          sourceId: 'source-newspaper',
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

  it('主張にソース名を添える', () => {
    const 管理人 = groupClaimsBySpeaker(sampleFictionalCase).find((group) => group.label === '管理人');

    expect(管理人?.claims[0]?.source?.title).toBe('湖畔の夏 20年目の証言（架空の書籍）');
  });
});
