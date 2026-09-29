/**
 * 列挙値の表示名
 * 入力フォームとビューの両方で同じ表示名を使うため、ここに集約します。
 */
import type { MentionKind } from './mention';
import type { CrossCheckKind } from './types';

/** 日時のメンション（ケースのエンティティではなく、日時そのものを指すメンション）の表示名です。 */
export const DATE_MENTION_LABEL = '日時';

/** メンションで参照できるエンティティの種類の表示名です。 */
export const MENTION_KIND_LABELS: Record<MentionKind, string> = {
  person: '人物',
  place: '場所',
};

/** 照合の種類の表示名です。照合の一覧と入力フォームで使います。 */
export const CROSS_CHECK_KIND_LABELS: Record<CrossCheckKind, string> = {
  supports: '裏付ける',
  contradicts: '食い違う',
  sameSubject: '同じ事柄を述べている',
};

/** 照合の種類の短い表示名です。時系列ボードのカードに件数を添えて示すときに使います。 */
export const CROSS_CHECK_KIND_SHORT_LABELS: Record<CrossCheckKind, string> = {
  supports: '裏付け',
  contradicts: '食い違い',
  sameSubject: '同じ事柄',
};
