/**
 * メンションの入力欄（MentionTextarea）とストアをつなぐ変換
 *
 * 証言の本文と、人物・場所のメモの両方の入力フォームで使用します。
 */
import type { MentionKind } from '@/domain/mention';
import type { Case } from '@/domain/types';
import type { UpsertEntry } from '@/stores/useCaseStore';
import type { MentionCandidate } from './MentionTextarea';

/** ケースに登録済みのエンティティを、メンションの候補に変換します。 */
export function caseToCandidates(target: Case): MentionCandidate[] {
  return [
    ...target.persons.map((person) => ({
      kind: 'person' as const,
      id: person.id,
      label: person.name,
      keywords: person.aliases,
    })),
    ...target.places.map((place) => ({ kind: 'place' as const, id: place.id, label: place.name })),
  ];
}

/** 名前だけを持つ新しいエンティティを、保存用の形で作成します。詳細は各エンティティの編集画面で後から入力します。 */
export function createEntry(kind: MentionKind, id: string, name: string): UpsertEntry {
  switch (kind) {
    case 'person':
      return { key: 'persons', entity: { id, name } };
    case 'place':
      return { key: 'places', entity: { id, name } };
  }
}
