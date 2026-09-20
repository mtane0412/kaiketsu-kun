/**
 * 時系列ボードの並び順（相対関係）と、日時との整合性のテスト
 */
import { describe, expect, it } from 'vitest';
import {
  allowedIndexRange,
  legacyTimelineOrder,
  moveTimelineItem,
  resolveTimelineOrder,
  settleTimelineItems,
} from './timeline-order';
import type { Case, Claim, TimeRef } from './types';

/** ユーザーの推測として、出来事に束ねていない主張を作ります。 */
function 主張(id: string, when?: TimeRef, eventId?: string): Claim {
  const claim: Claim = { id, speaker: { kind: 'user' }, viaPersonIds: [], content: `${id}の内容`, mentionedPersonIds: [] };
  if (when) claim.when = when;
  if (eventId) claim.eventId = eventId;
  return claim;
}

function 案件(parts: Partial<Case>): Case {
  return {
    id: 'case-lakeside',
    name: '湖畔の別荘の失踪',
    persons: [],
    places: [],
    events: [],
    claims: [],
    relationships: [],
    timelineOrder: [],
    ...parts,
  };
}

const 八月十日: TimeRef = { text: '8月10日', earliest: '1998-08-10' };
const 八月十二日: TimeRef = { text: '8月12日', earliest: '1998-08-12' };
const 八月十五日: TimeRef = { text: '8月15日', earliest: '1998-08-15' };
const 八月中: TimeRef = { text: '1998年8月', earliest: '1998-08' };

describe('resolveTimelineOrder', () => {
  it('保存した並び順のとおりに、出来事の束と、出来事に束ねていない主張を並べる', () => {
    const target = 案件({
      events: [{ id: 'event-last-seen', title: '持ち主が最後に目撃された' }],
      claims: [主張('claim-arrival'), 主張('claim-search')],
      timelineOrder: ['claim:claim-search', 'event:event-last-seen', 'claim:claim-arrival'],
    });

    expect(resolveTimelineOrder(target)).toEqual(['claim:claim-search', 'event:event-last-seen', 'claim:claim-arrival']);
  });

  it('並び順に載っていない項目は、末尾に、出来事、主張の順で登録順に並べる', () => {
    // 前提: 「ボードに書き足す」で位置を決めずに書いた主張は、並び順に載せずに保存される
    const target = 案件({
      events: [{ id: 'event-last-seen', title: '持ち主が最後に目撃された' }],
      claims: [主張('claim-arrival'), 主張('claim-search'), 主張('claim-memo')],
      timelineOrder: ['claim:claim-search'],
    });

    expect(resolveTimelineOrder(target)).toEqual([
      'claim:claim-search',
      'event:event-last-seen',
      'claim:claim-arrival',
      'claim:claim-memo',
    ]);
  });

  it('削除された項目と、出来事に束ねられてボードの項目ではなくなった主張は、並び順から除く', () => {
    const target = 案件({
      events: [{ id: 'event-last-seen', title: '持ち主が最後に目撃された' }],
      claims: [主張('claim-neighbor', undefined, 'event-last-seen'), 主張('claim-search')],
      timelineOrder: ['claim:claim-neighbor', 'claim:claim-deleted', 'claim:claim-search', 'event:event-last-seen'],
    });

    expect(resolveTimelineOrder(target)).toEqual(['claim:claim-search', 'event:event-last-seen']);
  });
});

describe('allowedIndexRange', () => {
  it('日時を持たない項目は、どこへでも動かせる', () => {
    const target = 案件({
      claims: [主張('claim-arrival', 八月十日), 主張('claim-memo'), 主張('claim-search', 八月十五日)],
    });

    expect(allowedIndexRange(target, 'claim:claim-memo')).toEqual({ min: 0, max: 2 });
  });

  it('日時を持つ項目は、自分より完全に前の項目の後ろ、完全に後の項目の前にだけ動かせる', () => {
    // 前提: 並びは 8月10日 → メモ（日時なし）→ 8月12日 → 8月15日
    const target = 案件({
      claims: [主張('claim-arrival', 八月十日), 主張('claim-memo'), 主張('claim-last-seen', 八月十二日), 主張('claim-search', 八月十五日)],
    });

    // 8月12日の主張は、8月10日より後ろ（1番目以降）、8月15日より前（2番目以前）にだけ置ける。
    // 日時を持たないメモの前後は、どちらにも置ける
    expect(allowedIndexRange(target, 'claim:claim-last-seen')).toEqual({ min: 1, max: 2 });
  });

  it('日時の区間が重なる項目同士は、どちらの順でも並べられる', () => {
    // 前提: 「1998年8月」は 8月10日 と 8月15日 のどちらとも区間が重なる
    const target = 案件({
      claims: [主張('claim-arrival', 八月十日), 主張('claim-summer', 八月中), 主張('claim-search', 八月十五日)],
    });

    expect(allowedIndexRange(target, 'claim:claim-summer')).toEqual({ min: 0, max: 2 });
  });

  it('出来事の束は、束ねた主張が述べる日時の全体（最も早い始まりから最も遅い終わりまで）を区間とする', () => {
    // 前提: 出来事に束ねた主張は 8月10日 と 8月12日 を述べている
    const target = 案件({
      events: [{ id: 'event-last-seen', title: '持ち主が最後に目撃された' }],
      claims: [
        主張('claim-neighbor', 八月十日, 'event-last-seen'),
        主張('claim-caretaker', 八月十二日, 'event-last-seen'),
        主張('claim-before', { text: '8月11日', earliest: '1998-08-11' }),
        主張('claim-search', 八月十五日),
      ],
      timelineOrder: ['event:event-last-seen', 'claim:claim-before', 'claim:claim-search'],
    });

    // 8月11日の主張は束の区間（8月10日〜12日）と重なるため、束の前にも後ろにも置ける。8月15日の後ろには置けない
    expect(allowedIndexRange(target, 'claim:claim-before')).toEqual({ min: 0, max: 1 });
  });
});

describe('moveTimelineItem', () => {
  it('項目を指定した位置へ動かした並び順を返す', () => {
    const target = 案件({ claims: [主張('claim-arrival'), 主張('claim-memo'), 主張('claim-search')] });

    expect(moveTimelineItem(target, 'claim:claim-search', 0)).toEqual([
      'claim:claim-search',
      'claim:claim-arrival',
      'claim:claim-memo',
    ]);
  });

  it('日時と矛盾する位置へ動かそうとすると、例外を投げる', () => {
    const target = 案件({ claims: [主張('claim-arrival', 八月十日), 主張('claim-search', 八月十五日)] });

    expect(() => moveTimelineItem(target, 'claim:claim-search', 0)).toThrow('日時と矛盾するため');
  });

  it('ボードに無い項目を動かそうとすると、例外を投げる', () => {
    const target = 案件({ claims: [主張('claim-arrival')] });

    expect(() => moveTimelineItem(target, 'claim:claim-unknown', 0)).toThrow('ボードに項目が見つかりません');
  });
});

describe('settleTimelineItems', () => {
  it('現在の位置が日時と矛盾する項目を、最も近い矛盾しない位置へ動かす', () => {
    // 前提: 末尾に書き足したメモに、後から「8月12日」の日時を入力した
    const target = 案件({
      claims: [主張('claim-arrival', 八月十日), 主張('claim-search', 八月十五日), 主張('claim-last-seen', 八月十二日)],
    });

    expect(settleTimelineItems(target, ['claim:claim-last-seen'])).toEqual([
      'claim:claim-arrival',
      'claim:claim-last-seen',
      'claim:claim-search',
    ]);
  });

  it('現在の位置が日時と矛盾しない項目は、動かさない', () => {
    const target = 案件({
      claims: [主張('claim-arrival', 八月十日), 主張('claim-memo'), 主張('claim-summer', 八月中), 主張('claim-search', 八月十五日)],
    });

    expect(settleTimelineItems(target, ['claim:claim-summer'])).toEqual(resolveTimelineOrder(target));
  });

  it('ボードの項目ではないキー（出来事に束ねた主張など）は無視する', () => {
    const target = 案件({ claims: [主張('claim-arrival', 八月十日)] });

    expect(settleTimelineItems(target, ['claim:claim-unknown'])).toEqual(['claim:claim-arrival']);
  });
});

describe('legacyTimelineOrder', () => {
  it('並び順を持たない頃のデータを、当時の表示順（日時の早い順、並び順の数値の順、どちらも無い項目）に並べる', () => {
    const target = 案件({
      events: [{ id: 'event-last-seen', title: '持ち主が最後に目撃された' }, { id: 'event-empty', title: '主張の無い出来事' }],
      claims: [
        主張('claim-memo'),
        主張('claim-episode-4', { text: '第4話', order: 4 }),
        主張('claim-search', 八月十五日),
        主張('claim-caretaker', 八月十二日, 'event-last-seen'),
        主張('claim-episode-3', { text: '第3話', order: 3 }),
        主張('claim-arrival', 八月十日),
      ],
    });

    expect(legacyTimelineOrder(target)).toEqual([
      'claim:claim-arrival',
      'event:event-last-seen',
      'claim:claim-search',
      'claim:claim-episode-3',
      'claim:claim-episode-4',
      'event:event-empty',
      'claim:claim-memo',
    ]);
  });
});
