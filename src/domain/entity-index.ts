/**
 * ケースの一覧（人物・場所・資料・証言など）を、ID で引くための索引
 *
 * 配列の先頭から ID を探す処理（Array.prototype.find）を、証言1件ごと・メンション1つごとに繰り返すと、
 * 時間が「証言の件数 × 人物の人数」のように2乗で増えます。そのため、配列ごとに ID の索引（Map）を作って使い回します。
 *
 * 注意: 索引は配列のオブジェクトをキーにして覚えます（WeakMap）。ケースは変更のたびに新しい配列へ置き換える前提です
 * （src/stores/useCaseStore.ts）。配列をその場で書き換えると、古い索引を返してしまうため、書き換えないでください。
 */
import type { Id } from './types';

/** 配列ごとの ID の索引です。配列が使われなくなれば、索引も一緒に破棄されます。 */
const indexes = new WeakMap<readonly { id: Id }[], ReadonlyMap<Id, { id: Id }>>();

/**
 * 配列の要素を ID で引く索引を返します。同じ配列に対しては、2回目以降は作り直さずに同じ索引を返します。
 * 同じ ID の要素が複数ある場合は、先頭の要素を引きます（Array.prototype.find と同じ結果にするためです）。
 */
export function entityById<T extends { id: Id }>(items: readonly T[]): ReadonlyMap<Id, T> {
  const cached = indexes.get(items);
  // 索引は items から作ったものだけを items をキーにして覚えるため、要素の型は T である
  if (cached !== undefined) return cached as ReadonlyMap<Id, T>;
  const index = new Map<Id, T>();
  for (const item of items) {
    if (!index.has(item.id)) index.set(item.id, item);
  }
  indexes.set(items, index);
  return index;
}
