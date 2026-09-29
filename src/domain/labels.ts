/**
 * 列挙値の表示名
 * 入力フォームとビューの両方で同じ表示名を使うため、ここに集約します。
 */
import type { MentionKind } from './mention';
import type { TaskLinkKind } from './tasks';
import type { CrossCheckKind, HypothesisAspect, HypothesisStatus, PersonKind, TaskStatus } from './types';

/** 日時のメンション（ケースのエンティティではなく、日時そのものを指すメンション）の表示名です。 */
export const DATE_MENTION_LABEL = '日時';

/** メンションで参照できるエンティティの種類の表示名です。 */
export const MENTION_KIND_LABELS: Record<MentionKind, string> = {
  person: '人物',
  place: '場所',
};

/** 人物の種別の表示名です。入力フォーム・一覧・各ビューの絞り込みで使います。 */
export const PERSON_KIND_LABELS: Record<PersonKind, string> = {
  individual: '人物',
  organization: '組織',
  record: '記録・媒体',
  object: '物',
};

/**
 * 名前に添える種別の表記（「（記録・媒体）」など）を返します。個人（人物）には、空文字列を返します。
 * 登場人物の大半は個人のため、個人にまで種別を添えると、名前の一覧が読みにくくなるためです。
 */
export function personKindSuffixOf(kind: PersonKind): string {
  return kind === 'individual' ? '' : `（${PERSON_KIND_LABELS[kind]}）`;
}

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

/** 仮説の状態の表示名です。仮説の一覧・詳細と入力フォームで使います。 */
export const HYPOTHESIS_STATUS_LABELS: Record<HypothesisStatus, string> = {
  open: '検討中',
  likely: '有力',
  rejected: '否定された',
};

/** 被疑者を検討する観点の表示名です。仮説の詳細の表の列と、証言を使っている仮説の立場で使います。 */
export const HYPOTHESIS_ASPECT_LABELS: Record<HypothesisAspect, string> = {
  motive: '動機',
  opportunity: '機会',
  means: '手段',
};

/** 未了事項の状態の表示名です。未了事項の一覧・詳細と入力フォームで使います。 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '未着手',
  inProgress: '対応中',
  done: '完了',
};

/** 未了事項にひもづける対象の種類の表示名です。未了事項の詳細の節と、証言・人物・場所の詳細の「この〇〇の未了事項」で使います。 */
export const TASK_LINK_KIND_LABELS: Record<TaskLinkKind, string> = {
  claim: '証言',
  person: MENTION_KIND_LABELS.person,
  place: MENTION_KIND_LABELS.place,
};
