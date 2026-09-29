/**
 * 人物どうしの関係（Relationship）の期間を扱うロジック
 *
 * 関係は、任意で開始（since）と終了（until）を持ちます（src/domain/types.ts）。
 * 前身のスナップショット機能（グラフ全体を手でコピーして時点ごとに保存する方式）は引き継がず、
 * 時点を指定して、その時点で成り立つ関係を導出します（docs/domain-model.md の未決事項5）。
 *
 * 判定の規則:
 * - 開始・終了を持たない側は、限りなく続くものとして扱います。期間を持たない関係は、すべての時点で成り立ちます。
 * - 開始と終了は時刻参照（TimeRef）のため、精度の粗い表記（'1998-05'）はその期間全体を表します。
 *   関係の期間は「開始の期間の最初から、終了の期間の最後まで」とし、指定した時点の区間と一部でも重なれば成り立つとします。
 *   精度が粗く、成り立っていたかどうかが決まらない場合は、表示から外さない側に倒します。関係を見落とすより、
 *   余分に表示するほうが読み違えにくいためです。
 *
 * 注意: 開始・終了・時点の表記が解釈できない場合は、toInterval が例外を投げます。
 * 保存前の入力フォームと、読み込み時の検証（src/domain/case-schema.ts）で弾く前提です。
 */
import { formatTimeRef, intervalsOverlap, toInterval } from './time-ref';
import type { Relationship, TimeRef } from './types';

/** 関係の期間にあたる項目です。グラフのエッジなど、関係そのもの以外からも判定できるよう、期間だけを受け取ります。 */
export type RelationshipPeriod = Pick<Relationship, 'since' | 'until'>;

/**
 * 関係が、指定した時点で成り立つかどうかを判定します。
 *
 * @param period 関係の開始と終了です
 * @param at 判定する時点です。区間を持つ表記の場合は、その区間のどこかで成り立てば成り立つとします
 */
export function relationshipHoldsAt(period: RelationshipPeriod, at: TimeRef): boolean {
  const start = period.since === undefined ? -Infinity : toInterval(period.since).start;
  const end = period.until === undefined ? Infinity : toInterval(period.until).end;
  return intervalsOverlap({ start, end }, toInterval(at));
}

/** 指定した時点で成り立つ関係だけを、もとの並び順のまま返します。 */
export function relationshipsAt<T extends RelationshipPeriod>(relationships: T[], at: TimeRef): T[] {
  return relationships.filter((relationship) => relationshipHoldsAt(relationship, at));
}

/**
 * 関係の期間を、画面に表示する日本語の表記にします（例: '1995年4月〜1998年5月'、'1995年4月〜'、'〜1998年5月'）。
 * 期間を持たない関係では undefined を返します。
 */
export function formatRelationshipPeriod(period: RelationshipPeriod): string | undefined {
  if (period.since === undefined && period.until === undefined) return undefined;
  const sinceText = period.since === undefined ? '' : formatTimeRef(period.since);
  const untilText = period.until === undefined ? '' : formatTimeRef(period.until);
  return `${sinceText}〜${untilText}`;
}
