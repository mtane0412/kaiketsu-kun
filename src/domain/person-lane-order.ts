/**
 * 人物の動きビューの列（人物）の並び順
 *
 * 列の位置は、ケースが持つ並び順（Case.personLaneOrder）で決まります。
 * 並び順に載っていない人物（並び替えた後に登録した人物など）は、末尾に登録順で並べます。
 * 削除済みの人物のIDが並び順に残っていても無視します（時系列ボードの並び順と同じ扱いです。src/domain/timeline-order.ts）。
 *
 * 注意: 並び順は、列に現れない人物（どの証言にも登場しない人物）も含めた、ケースの全人物について扱います。
 * 列に現れない人物を挟んでも、列同士の前後関係は、動かした操作のとおりになります。
 */
import type { Case, Id } from './types';

/** 人物のIDを、列の並び順で返します。 */
export function resolvePersonLaneOrder(target: Pick<Case, 'persons' | 'personLaneOrder'>): Id[] {
  const registered = target.persons.map((person) => person.id);
  const known = new Set(registered);
  const listed = [...new Set(target.personLaneOrder)].filter((id) => known.has(id));
  const listedIds = new Set(listed);
  return [...listed, ...registered.filter((id) => !listedIds.has(id))];
}

/**
 * 人物 personId の列を、人物 overPersonId の列の位置へ動かした後の並び順を返します。
 * 前にある列の位置へ動かすとその列の前に、後ろにある列の位置へ動かすとその列の後ろに入ります（ドラッグで重ねた列の位置に置く操作です）。
 * どちらかの人物がケースに存在しない場合は、例外を投げます。
 */
export function movePersonLane(target: Pick<Case, 'persons' | 'personLaneOrder'>, personId: Id, overPersonId: Id): Id[] {
  const order = resolvePersonLaneOrder(target);
  const fromIndex = order.indexOf(personId);
  const toIndex = order.indexOf(overPersonId);
  if (fromIndex < 0 || toIndex < 0) {
    throw new Error(`人物が見つかりません: ${fromIndex < 0 ? personId : overPersonId}`);
  }
  const moved = order.filter((id) => id !== personId);
  moved.splice(toIndex, 0, personId);
  return moved;
}
