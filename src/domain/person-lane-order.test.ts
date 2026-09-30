/**
 * 人物の動きビューの列（人物）の並び順のテスト
 */
import { describe, expect, it } from 'vitest';
import { movePersonLane, resolvePersonLaneOrder } from './person-lane-order';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case } from './types';

/** サンプルの人物の登録順です。 */
const registrationOrder = sampleFictionalCase.persons.map((person) => person.id);

describe('resolvePersonLaneOrder', () => {
  it('並び順を保存していなければ、ケースへの登録順で返す', () => {
    expect(resolvePersonLaneOrder({ ...sampleFictionalCase, personLaneOrder: [] })).toEqual(registrationOrder);
  });

  it('保存した並び順の人物を先に並べ、載っていない人物を末尾に登録順で並べる', () => {
    const caseData: Case = { ...sampleFictionalCase, personLaneOrder: ['person-caretaker', 'person-neighbor'] };

    expect(resolvePersonLaneOrder(caseData)).toEqual([
      'person-caretaker',
      'person-neighbor',
      ...registrationOrder.filter((id) => id !== 'person-caretaker' && id !== 'person-neighbor'),
    ]);
  });

  it('削除済みの人物と、重複したIDは無視する', () => {
    const caseData: Case = { ...sampleFictionalCase, personLaneOrder: ['person-deleted', 'person-caretaker', 'person-caretaker'] };

    expect(resolvePersonLaneOrder(caseData)).toEqual(['person-caretaker', ...registrationOrder.filter((id) => id !== 'person-caretaker')]);
  });
});

describe('movePersonLane', () => {
  // 前提: サンプルの登録順は、別荘の持ち主・隣家の住人・管理人・…
  it('前にある人物の位置へ動かすと、その人物の前に入る', () => {
    const order = movePersonLane({ ...sampleFictionalCase, personLaneOrder: [] }, 'person-caretaker', 'person-owner');

    expect(order.slice(0, 3)).toEqual(['person-caretaker', 'person-owner', 'person-neighbor']);
  });

  it('後ろにある人物の位置へ動かすと、その人物の後ろに入る', () => {
    const order = movePersonLane({ ...sampleFictionalCase, personLaneOrder: [] }, 'person-owner', 'person-caretaker');

    expect(order.slice(0, 3)).toEqual(['person-neighbor', 'person-caretaker', 'person-owner']);
  });

  it('存在しない人物を指定した場合は、例外を投げる', () => {
    expect(() => movePersonLane(sampleFictionalCase, 'person-deleted', 'person-owner')).toThrow('人物が見つかりません');
    expect(() => movePersonLane(sampleFictionalCase, 'person-owner', 'person-deleted')).toThrow('人物が見つかりません');
  });
});
