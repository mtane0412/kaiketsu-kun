/**
 * 時系列ボードの並び順（相対関係）と、日時との整合性のテスト
 */
import { describe, expect, it } from 'vitest';
import {
  allowedIndexRange,
  moveTimelineItem,
  placeTimelineItem,
  resolveTimelineOrder,
  settleTimelineItems,
} from './timeline-order';
import type { Case, Claim, TimeRef } from './types';

/** ユーザーの推測としての証言を作ります。 */
function makeClaim(id: string, when?: TimeRef): Claim {
  const claim: Claim = { id, speaker: { kind: 'user' }, viaPersonIds: [], content: `${id}の内容`, mentionedPersonIds: [] };
  if (when) claim.when = when;
  return claim;
}

function makeCase(parts: Partial<Case>): Case {
  return {
    id: 'case-lakeside',
    name: '湖畔の別荘の失踪',
    persons: [],
    places: [],
    claims: [],
    relationships: [],
    interviews: [],
    crossChecks: [],
    hypotheses: [],
    tasks: [],
    timelineOrder: [],
    personLaneOrder: [],
    ...parts,
  };
}

const august10: TimeRef = '1998-08-10';
const august12: TimeRef = '1998-08-12';
const august15: TimeRef = '1998-08-15';
const duringAugust: TimeRef = '1998-08';

describe('resolveTimelineOrder', () => {
  it('保存した並び順のとおりに、証言を並べる', () => {
    const target = makeCase({
      claims: [makeClaim('claim-arrival'), makeClaim('claim-last-seen'), makeClaim('claim-search')],
      timelineOrder: ['claim:claim-search', 'claim:claim-last-seen', 'claim:claim-arrival'],
    });

    expect(resolveTimelineOrder(target)).toEqual(['claim:claim-search', 'claim:claim-last-seen', 'claim:claim-arrival']);
  });

  it('並び順に載っていない証言は、末尾に登録順で並べる', () => {
    // 前提: 「ボードに書き足す」で位置を決めずに書いた証言は、並び順に載せずに保存される
    const target = makeCase({
      claims: [makeClaim('claim-arrival'), makeClaim('claim-search'), makeClaim('claim-memo')],
      timelineOrder: ['claim:claim-search'],
    });

    expect(resolveTimelineOrder(target)).toEqual(['claim:claim-search', 'claim:claim-arrival', 'claim:claim-memo']);
  });

  it('削除された証言は、並び順から除く', () => {
    const target = makeCase({
      claims: [makeClaim('claim-search')],
      timelineOrder: ['claim:claim-deleted', 'claim:claim-search'],
    });

    expect(resolveTimelineOrder(target)).toEqual(['claim:claim-search']);
  });
});

describe('allowedIndexRange', () => {
  it('区間表記の日時も、区間の重なりで動かせる範囲を決める', () => {
    // 前提: 19:10〜19:40 の証言は、19:30 の証言とは重なり、19:50 の証言より完全に前
    const target = makeCase({
      claims: [
        makeClaim('claim-seen-at-lake', '2026-09-28T19:30'),
        makeClaim('claim-heard-scream', '2026-09-28T19:50'),
        makeClaim('claim-walking', '2026-09-28T19:10/19:40'),
      ],
      timelineOrder: ['claim:claim-seen-at-lake', 'claim:claim-heard-scream', 'claim:claim-walking'],
    });

    expect(allowedIndexRange(target, 'claim:claim-walking')).toEqual({ min: 0, max: 1 });
  });

  it('日時を持たない項目は、どこへでも動かせる', () => {
    const target = makeCase({
      claims: [makeClaim('claim-arrival', august10), makeClaim('claim-memo'), makeClaim('claim-search', august15)],
    });

    expect(allowedIndexRange(target, 'claim:claim-memo')).toEqual({ min: 0, max: 2 });
  });

  it('日時を持つ項目は、自分より完全に前の項目の後ろ、完全に後の項目の前にだけ動かせる', () => {
    // 前提: 並びは 8月10日 → メモ（日時なし）→ 8月12日 → 8月15日
    const target = makeCase({
      claims: [makeClaim('claim-arrival', august10), makeClaim('claim-memo'), makeClaim('claim-last-seen', august12), makeClaim('claim-search', august15)],
    });

    // 8月12日の証言は、8月10日より後ろ（1番目以降）、8月15日より前（2番目以前）にだけ置ける。
    // 日時を持たないメモの前後は、どちらにも置ける
    expect(allowedIndexRange(target, 'claim:claim-last-seen')).toEqual({ min: 1, max: 2 });
  });

  it('日時の区間が重なる項目同士は、どちらの順でも並べられる', () => {
    // 前提: 「1998年8月」は 8月10日 と 8月15日 のどちらとも区間が重なる
    const target = makeCase({
      claims: [makeClaim('claim-arrival', august10), makeClaim('claim-summer', duringAugust), makeClaim('claim-search', august15)],
    });

    expect(allowedIndexRange(target, 'claim:claim-summer')).toEqual({ min: 0, max: 2 });
  });
});

describe('moveTimelineItem', () => {
  it('項目を指定した位置へ動かした並び順を返す', () => {
    const target = makeCase({ claims: [makeClaim('claim-arrival'), makeClaim('claim-memo'), makeClaim('claim-search')] });

    expect(moveTimelineItem(target, 'claim:claim-search', 0)).toEqual([
      'claim:claim-search',
      'claim:claim-arrival',
      'claim:claim-memo',
    ]);
  });

  it('日時と矛盾する位置へ動かそうとすると、例外を投げる', () => {
    const target = makeCase({ claims: [makeClaim('claim-arrival', august10), makeClaim('claim-search', august15)] });

    expect(() => moveTimelineItem(target, 'claim:claim-search', 0)).toThrow('日時と矛盾するため');
  });

  it('ボードに無い項目を動かそうとすると、例外を投げる', () => {
    const target = makeCase({ claims: [makeClaim('claim-arrival')] });

    expect(() => moveTimelineItem(target, 'claim:claim-unknown', 0)).toThrow('ボードに項目が見つかりません');
  });
});

describe('placeTimelineItem', () => {
  it('日時と矛盾しない位置は、指定したとおりの位置に置く', () => {
    const target = makeCase({ claims: [makeClaim('claim-arrival'), makeClaim('claim-memo'), makeClaim('claim-search')] });

    expect(placeTimelineItem(target, 'claim:claim-search', 1)).toEqual([
      'claim:claim-arrival',
      'claim:claim-search',
      'claim:claim-memo',
    ]);
  });

  it('日時と矛盾する位置を指定すると、拒否せずに、最も近い矛盾しない位置に置く', () => {
    // 前提: 8月10日と8月12日の証言の間（位置1）を指定して、8月15日の証言を書き足した
    const target = makeCase({
      claims: [makeClaim('claim-arrival', august10), makeClaim('claim-last-seen', august12), makeClaim('claim-search', august15)],
      timelineOrder: ['claim:claim-arrival', 'claim:claim-last-seen', 'claim:claim-search'],
    });

    expect(placeTimelineItem(target, 'claim:claim-search', 1)).toEqual([
      'claim:claim-arrival',
      'claim:claim-last-seen',
      'claim:claim-search',
    ]);
  });

  it('ボードに無い項目を置こうとすると、例外を投げる', () => {
    const target = makeCase({ claims: [makeClaim('claim-arrival')] });

    expect(() => placeTimelineItem(target, 'claim:claim-unknown', 0)).toThrow('ボードに項目が見つかりません');
  });
});

describe('settleTimelineItems', () => {
  it('現在の位置が日時と矛盾する項目を、最も近い矛盾しない位置へ動かす', () => {
    // 前提: 末尾に書き足したメモに、後から「8月12日」の日時を入力した
    const target = makeCase({
      claims: [makeClaim('claim-arrival', august10), makeClaim('claim-search', august15), makeClaim('claim-last-seen', august12)],
    });

    expect(settleTimelineItems(target, ['claim:claim-last-seen'])).toEqual([
      'claim:claim-arrival',
      'claim:claim-last-seen',
      'claim:claim-search',
    ]);
  });

  it('現在の位置が日時と矛盾しない項目は、動かさない', () => {
    const target = makeCase({
      claims: [makeClaim('claim-arrival', august10), makeClaim('claim-memo'), makeClaim('claim-summer', duringAugust), makeClaim('claim-search', august15)],
    });

    expect(settleTimelineItems(target, ['claim:claim-summer'])).toEqual(resolveTimelineOrder(target));
  });

  it('ボードの項目ではないキー（削除された証言など）は無視する', () => {
    const target = makeCase({ claims: [makeClaim('claim-arrival', august10)] });

    expect(settleTimelineItems(target, ['claim:claim-unknown'])).toEqual(['claim:claim-arrival']);
  });
});
