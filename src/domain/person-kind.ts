/**
 * 人物の種別（Person.kind）の一覧と既定値
 *
 * 種別の並び（PERSON_KINDS）は、入力フォームの選択肢と、各ビューの絞り込みのチェックボックスの並びに使います。
 * 表示名は src/domain/labels.ts の PERSON_KIND_LABELS を参照してください。
 */
import type { PersonKind } from './types';

/** すべての種別です。個人を先頭に、人から遠い順に並べます。 */
export const PERSON_KINDS = ['individual', 'organization', 'record', 'object'] as const satisfies readonly PersonKind[];

/**
 * 種別の既定値です。新しく登録する人物と、種別を持たない頃に保存したデータの人物に使います。
 * 登場人物の大半は個人であるためです。
 */
export const DEFAULT_PERSON_KIND: PersonKind = 'individual';
