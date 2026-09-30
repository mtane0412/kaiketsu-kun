/**
 * 人物どうしの関係の期間（開始・終了）を扱うロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { formatRelationshipPeriod, relationshipHoldsAt, relationshipsAt } from './relationship-period';
import type { Relationship } from './types';

/** 期間を指定して、別荘の持ち主と管理人の関係を作ります。 */
function makeRelationship(id: string, period: Pick<Relationship, 'since' | 'until'> = {}): Relationship {
  return {
    id,
    fromPersonId: 'person-owner',
    toPersonId: 'person-caretaker',
    label: '雇用主',
    directed: true,
    basisClaimIds: [],
    ...period,
  };
}

describe('relationshipHoldsAt', () => {
  it('期間を持たない関係は、どの時点でも成り立つ', () => {
    expect(relationshipHoldsAt(makeRelationship('期間なし'), '1900')).toBe(true);
    expect(relationshipHoldsAt(makeRelationship('期間なし'), '2099-12-31T23:59')).toBe(true);
  });

  it('開始より前の時点では成り立たず、開始以降の時点では成り立つ', () => {
    const employment = makeRelationship('雇用', { since: '1995-04' });

    expect(relationshipHoldsAt(employment, '1995-03-31')).toBe(false);
    expect(relationshipHoldsAt(employment, '1995-04-01')).toBe(true);
    expect(relationshipHoldsAt(employment, '2000')).toBe(true);
  });

  it('終了より後の時点では成り立たず、終了までの時点では成り立つ', () => {
    // 例: 事件（1998年8月）の3か月前に離婚した
    const marriage = makeRelationship('婚姻', { until: '1998-05' });

    expect(relationshipHoldsAt(marriage, '1998-05-31')).toBe(true);
    expect(relationshipHoldsAt(marriage, '1998-08-12T19:00')).toBe(false);
  });

  it('開始と終了の両方を持つ関係は、その間の時点でだけ成り立つ', () => {
    const debt = makeRelationship('借金', { since: '1998-08-11', until: '1998-08-20' });

    expect(relationshipHoldsAt(debt, '1998-08-10')).toBe(false);
    expect(relationshipHoldsAt(debt, '1998-08-12')).toBe(true);
    expect(relationshipHoldsAt(debt, '1998-08-21')).toBe(false);
  });

  it('指定した時点が期間の境目にまたがる場合は、成り立つものとして扱う', () => {
    // 前提: 「1998年」と指定すると、1998年のどこかで成り立っていれば表示する（見落とさない側に倒す）
    const marriage = makeRelationship('婚姻', { until: '1998-05' });

    expect(relationshipHoldsAt(marriage, '1998')).toBe(true);
  });
});

describe('relationshipsAt', () => {
  it('指定した時点で成り立つ関係だけを、もとの並び順のまま返す', () => {
    const list = [makeRelationship('期間なし'), makeRelationship('婚姻', { until: '1998-05' }), makeRelationship('雇用', { since: '1995-04' })];

    expect(relationshipsAt(list, '1998-08-12').map((item) => item.id)).toEqual(['期間なし', '雇用']);
  });
});

describe('formatRelationshipPeriod', () => {
  it('期間を持たない関係では undefined を返す', () => {
    expect(formatRelationshipPeriod(makeRelationship('期間なし'))).toBeUndefined();
  });

  it('開始と終了を「〜」でつないで表示する', () => {
    expect(formatRelationshipPeriod(makeRelationship('借金', { since: '1998-08-11', until: '1998-08-20' }))).toBe(
      '1998年8月11日〜1998年8月20日'
    );
  });

  it('開始だけの関係は「〜」で終わり、終了だけの関係は「〜」で始まる', () => {
    expect(formatRelationshipPeriod(makeRelationship('雇用', { since: '1995-04' }))).toBe('1995年4月〜');
    expect(formatRelationshipPeriod(makeRelationship('婚姻', { until: '1998-05' }))).toBe('〜1998年5月');
  });
});
