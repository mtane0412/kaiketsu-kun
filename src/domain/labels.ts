/**
 * 列挙値の表示名
 * 入力フォームとビューの両方で同じ表示名を使うため、ここに集約します。
 */
import type { MentionKind } from './mention';

/** 日時のメンション（ケースのエンティティではなく、日時そのものを指すメンション）の表示名です。 */
export const DATE_MENTION_LABEL = '日時';

/** メンションで参照できるエンティティの種類の表示名です。 */
export const MENTION_KIND_LABELS: Record<MentionKind, string> = {
  person: '人物',
  place: '場所',
};
