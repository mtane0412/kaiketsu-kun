/**
 * 案件データから時系列ビュー・証言者別ビューを導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { buildTimeline, groupClaimsBySpeaker } from './case-views';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case } from './types';

describe('buildTimeline', () => {
  it('出来事を起きた時点の早い順に並べる', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      events: [
        { id: 'event-search', title: '警察が別荘を捜索した', when: { text: '8月15日', earliest: '1998-08-15' }, participantIds: [] },
        ...sampleFictionalCase.events,
      ],
    };

    const titles = buildTimeline(案件).entries.map((entry) => entry.event.title);

    expect(titles).toEqual(['持ち主が最後に目撃された', '警察が別荘を捜索した']);
  });

  it('出来事ごとに、場所・関与人物・主張をまとめる', () => {
    const [entry] = buildTimeline(sampleFictionalCase).entries;

    expect(entry?.place?.name).toBe('湖畔の別荘');
    expect(entry?.participants.map((person) => person.name)).toEqual(['別荘の持ち主']);
    expect(entry?.claims.map((item) => item.claim.id)).toEqual(['claim-neighbor', 'claim-report', 'claim-caretaker']);
  });

  it('証言が述べる時刻が出来事の見立てと重ならない場合に、時刻の食い違いを示す', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      events: sampleFictionalCase.events.map((event) => ({
        ...event,
        when: { text: '夜8時以降', earliest: '1998-08-12T20:00', latest: '1998-08-12T23:59' },
      })),
    };

    const [entry] = buildTimeline(案件).entries;
    const conflicts = Object.fromEntries(entry?.claims.map((item) => [item.claim.id, item.hasTimeConflict]) ?? []);

    expect(conflicts).toEqual({
      'claim-neighbor': false,
      'claim-report': false,
      'claim-caretaker': true,
    });
  });

  it('証言が述べる場所が出来事の見立てと異なる場合に、場所の食い違いを示す', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      places: [...sampleFictionalCase.places, { id: 'place-station', name: '最寄り駅' }],
      claims: sampleFictionalCase.claims.map((claim) =>
        claim.id === 'claim-neighbor' ? { ...claim, placeId: 'place-station' } : claim
      ),
    };

    const [entry] = buildTimeline(案件).entries;
    const 隣家の証言 = entry?.claims.find((item) => item.claim.id === 'claim-neighbor');

    expect(隣家の証言?.hasPlaceConflict).toBe(true);
    expect(隣家の証言?.place?.name).toBe('最寄り駅');
  });

  it('出来事に紐づかない主張を別枠にまとめる', () => {
    const ids = buildTimeline(sampleFictionalCase).unlinkedClaims.map((item) => item.claim.id);

    expect(ids).toEqual(['claim-user-guess']);
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
          speaker: { kind: 'person', personId: 'person-caretaker' },
          sourceId: 'source-newspaper',
          content: '持ち主とは挨拶をする程度の付き合いだった。',
          statedAt: { text: '1998年8月14日', earliest: '1998-08-14' },
          mentionedPersonIds: ['person-owner'],
          assessment: 'unverified',
        },
      ],
    };

    const 管理人 = groupClaimsBySpeaker(案件).find((group) => group.label === '管理人');

    expect(管理人?.claims.map((item) => item.claim.id)).toEqual(['claim-caretaker-early', 'claim-caretaker']);
  });

  it('主張にソース名を添える', () => {
    const 管理人 = groupClaimsBySpeaker(sampleFictionalCase).find((group) => group.label === '管理人');

    expect(管理人?.claims[0]?.source?.title).toBe('湖畔の夏 20年目の証言（架空の書籍）');
  });
});
