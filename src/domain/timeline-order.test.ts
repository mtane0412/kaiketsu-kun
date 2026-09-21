/**
 * 時系列ボードの並び順（相対関係）と、日時との整合性のテスト
 */
import { describe, expect, it } from 'vitest';
import {
  allowedIndexRange,
  moveTimelineItem,
  resolveTimelineOrder,
  settleTimelineItems,
} from './timeline-order';
import type { Case, Claim, TimeRef } from './types';

/** ユーザーの推測としての証言を作ります。 */
function 証言(id: string, when?: TimeRef): Claim {
  const claim: Claim = { id, speaker: { kind: 'user' }, viaPersonIds: [], content: `${id}の内容`, mentionedPersonIds: [] };
  if (when) claim.when = when;
  return claim;
}

function 案件(parts: Partial<Case>): Case {
  return {
    id: 'case-lakeside',
    name: '湖畔の別荘の失踪',
    persons: [],
    places: [],
    claims: [],
    relationships: [],
    timelineOrder: [],
    ...parts,
  };
}

const 八月十日: TimeRef = '1998-08-10';
const 八月十二日: TimeRef = '1998-08-12';
const 八月十五日: TimeRef = '1998-08-15';
const 八月中: TimeRef = '1998-08';

describe('resolveTimelineOrder', () => {
  it('保存した並び順のとおりに、証言を並べる', () => {
    const target = 案件({
      claims: [証言('claim-arrival'), 証言('claim-last-seen'), 証言('claim-search')],
      timelineOrder: ['claim:claim-search', 'claim:claim-last-seen', 'claim:claim-arrival'],
    });

    expect(resolveTimelineOrder(target)).toEqual(['claim:claim-search', 'claim:claim-last-seen', 'claim:claim-arrival']);
  });

  it('並び順に載っていない証言は、末尾に登録順で並べる', () => {
    // 前提: 「ボードに書き足す」で位置を決めずに書いた証言は、並び順に載せずに保存される
    const target = 案件({
      claims: [証言('claim-arrival'), 証言('claim-search'), 証言('claim-memo')],
      timelineOrder: ['claim:claim-search'],
    });

    expect(resolveTimelineOrder(target)).toEqual(['claim:claim-search', 'claim:claim-arrival', 'claim:claim-memo']);
  });

  it('削除された証言は、並び順から除く', () => {
    const target = 案件({
      claims: [証言('claim-search')],
      timelineOrder: ['claim:claim-deleted', 'claim:claim-search'],
    });

    expect(resolveTimelineOrder(target)).toEqual(['claim:claim-search']);
  });
});

describe('allowedIndexRange', () => {
  it('日時を持たない項目は、どこへでも動かせる', () => {
    const target = 案件({
      claims: [証言('claim-arrival', 八月十日), 証言('claim-memo'), 証言('claim-search', 八月十五日)],
    });

    expect(allowedIndexRange(target, 'claim:claim-memo')).toEqual({ min: 0, max: 2 });
  });

  it('日時を持つ項目は、自分より完全に前の項目の後ろ、完全に後の項目の前にだけ動かせる', () => {
    // 前提: 並びは 8月10日 → メモ（日時なし）→ 8月12日 → 8月15日
    const target = 案件({
      claims: [証言('claim-arrival', 八月十日), 証言('claim-memo'), 証言('claim-last-seen', 八月十二日), 証言('claim-search', 八月十五日)],
    });

    // 8月12日の証言は、8月10日より後ろ（1番目以降）、8月15日より前（2番目以前）にだけ置ける。
    // 日時を持たないメモの前後は、どちらにも置ける
    expect(allowedIndexRange(target, 'claim:claim-last-seen')).toEqual({ min: 1, max: 2 });
  });

  it('日時の区間が重なる項目同士は、どちらの順でも並べられる', () => {
    // 前提: 「1998年8月」は 8月10日 と 8月15日 のどちらとも区間が重なる
    const target = 案件({
      claims: [証言('claim-arrival', 八月十日), 証言('claim-summer', 八月中), 証言('claim-search', 八月十五日)],
    });

    expect(allowedIndexRange(target, 'claim:claim-summer')).toEqual({ min: 0, max: 2 });
  });
});

describe('moveTimelineItem', () => {
  it('項目を指定した位置へ動かした並び順を返す', () => {
    const target = 案件({ claims: [証言('claim-arrival'), 証言('claim-memo'), 証言('claim-search')] });

    expect(moveTimelineItem(target, 'claim:claim-search', 0)).toEqual([
      'claim:claim-search',
      'claim:claim-arrival',
      'claim:claim-memo',
    ]);
  });

  it('日時と矛盾する位置へ動かそうとすると、例外を投げる', () => {
    const target = 案件({ claims: [証言('claim-arrival', 八月十日), 証言('claim-search', 八月十五日)] });

    expect(() => moveTimelineItem(target, 'claim:claim-search', 0)).toThrow('日時と矛盾するため');
  });

  it('ボードに無い項目を動かそうとすると、例外を投げる', () => {
    const target = 案件({ claims: [証言('claim-arrival')] });

    expect(() => moveTimelineItem(target, 'claim:claim-unknown', 0)).toThrow('ボードに項目が見つかりません');
  });
});

describe('settleTimelineItems', () => {
  it('現在の位置が日時と矛盾する項目を、最も近い矛盾しない位置へ動かす', () => {
    // 前提: 末尾に書き足したメモに、後から「8月12日」の日時を入力した
    const target = 案件({
      claims: [証言('claim-arrival', 八月十日), 証言('claim-search', 八月十五日), 証言('claim-last-seen', 八月十二日)],
    });

    expect(settleTimelineItems(target, ['claim:claim-last-seen'])).toEqual([
      'claim:claim-arrival',
      'claim:claim-last-seen',
      'claim:claim-search',
    ]);
  });

  it('現在の位置が日時と矛盾しない項目は、動かさない', () => {
    const target = 案件({
      claims: [証言('claim-arrival', 八月十日), 証言('claim-memo'), 証言('claim-summer', 八月中), 証言('claim-search', 八月十五日)],
    });

    expect(settleTimelineItems(target, ['claim:claim-summer'])).toEqual(resolveTimelineOrder(target));
  });

  it('ボードの項目ではないキー（削除された証言など）は無視する', () => {
    const target = 案件({ claims: [証言('claim-arrival', 八月十日)] });

    expect(settleTimelineItems(target, ['claim:claim-unknown'])).toEqual(['claim:claim-arrival']);
  });
});
