/**
 * 列挙値の表示名
 * 入力フォームとビューの両方で同じ表示名を使うため、ここに集約します。
 */
import type { MentionKind } from './mention';
import type { SourceKind } from './types';

/** ソースの種類の表示名です。 */
export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  article: '記事',
  book: '書籍',
  'court-record': '裁判記録',
  broadcast: '放送',
  web: 'ウェブ',
  'fiction-episode': '作品の話数',
  other: 'その他',
};

/** メンションで参照できるエンティティの種類の表示名です。 */
export const MENTION_KIND_LABELS: Record<MentionKind, string> = {
  person: '人物',
  place: '場所',
  event: '出来事',
  source: 'ソース',
};
