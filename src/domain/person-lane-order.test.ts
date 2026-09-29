/**
 * 人物の動きビューの列（人物）の並び順のテスト
 */
import { describe, expect, it } from 'vitest';
import { movePersonLane, resolvePersonLaneOrder } from './person-lane-order';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case } from './types';

/** サンプルの人物の登録順です。 */
const 登録順 = sampleFictionalCase.persons.map((person) => person.id);

describe('resolvePersonLaneOrder', () => {
  it('並び順を保存していなければ、ケースへの登録順で返す', () => {
    expect(resolvePersonLaneOrder({ ...sampleFictionalCase, personLaneOrder: [] })).toEqual(登録順);
  });

  it('保存した並び順の人物を先に並べ、載っていない人物を末尾に登録順で並べる', () => {
    const ケース: Case = { ...sampleFictionalCase, personLaneOrder: ['person-caretaker', 'person-neighbor'] };

    expect(resolvePersonLaneOrder(ケース)).toEqual([
      'person-caretaker',
      'person-neighbor',
      ...登録順.filter((id) => id !== 'person-caretaker' && id !== 'person-neighbor'),
    ]);
  });

  it('削除済みの人物と、重複したIDは無視する', () => {
    const ケース: Case = { ...sampleFictionalCase, personLaneOrder: ['person-deleted', 'person-caretaker', 'person-caretaker'] };

    expect(resolvePersonLaneOrder(ケース)).toEqual(['person-caretaker', ...登録順.filter((id) => id !== 'person-caretaker')]);
  });
});

describe('movePersonLane', () => {
  // 前提: サンプルの登録順は、別荘の持ち主・隣家の住人・管理人・…
  it('前にある人物の位置へ動かすと、その人物の前に入る', () => {
    const 並び順 = movePersonLane({ ...sampleFictionalCase, personLaneOrder: [] }, 'person-caretaker', 'person-owner');

    expect(並び順.slice(0, 3)).toEqual(['person-caretaker', 'person-owner', 'person-neighbor']);
  });

  it('後ろにある人物の位置へ動かすと、その人物の後ろに入る', () => {
    const 並び順 = movePersonLane({ ...sampleFictionalCase, personLaneOrder: [] }, 'person-owner', 'person-caretaker');

    expect(並び順.slice(0, 3)).toEqual(['person-neighbor', 'person-caretaker', 'person-owner']);
  });

  it('存在しない人物を指定した場合は、例外を投げる', () => {
    expect(() => movePersonLane(sampleFictionalCase, 'person-deleted', 'person-owner')).toThrow('人物が見つかりません');
    expect(() => movePersonLane(sampleFictionalCase, 'person-owner', 'person-deleted')).toThrow('人物が見つかりません');
  });
});
