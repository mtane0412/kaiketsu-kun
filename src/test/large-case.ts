/**
 * 性能のテストに使う、大きなケースを組み立てるヘルパー
 *
 * 実際の調査では、証言が1万件近く、人物が数百〜数千人、資料が数百件を超えるケースがあります。
 * 件数の2乗で時間が増える処理を見つけるため、それに近い規模のケースを機械的に作ります。
 * 各証言は、発言者1人・経由1人・本文での言及2人・場所・資料・日時を持ちます。
 * 各資料は、2人分の資料での呼び方（personNames）を持ちます。本文のメンションの表記には、その呼び方を使います。
 */
import { formatMention } from '@/domain/mention';
import type { Case, Claim, Interview, Person, Place } from '@/domain/types';

/** 大きなケースの規模です。 */
export type LargeCaseSize = { persons: number; places: number; interviews: number; claims: number };

/** 証言の日時の起点です。証言ごとに1時間ずつ進めます。 */
const BASE_TIME_MS = Date.UTC(1998, 7, 1);
const HOUR_MS = 60 * 60 * 1000;

/**
 * 指定した規模のケースを作ります。参照の整合性（存在しない人物・場所・資料を参照しないこと）は保たれています。
 * 時系列の並び順（timelineOrder）には、すべての証言を日時の順に載せます。実データと同じく、並び順の解決と日時との突き合わせを働かせるためです。
 */
export function buildLargeCase(size: LargeCaseSize): Case {
  const persons: Person[] = Array.from({ length: size.persons }, (_, index) => ({
    id: `person-${index}`,
    name: `人物${index}`,
    kind: 'individual',
    aliases: [`別名${index}`],
  }));
  const places: Place[] = Array.from({ length: size.places }, (_, index) => ({
    id: `place-${index}`,
    name: `場所${index}`,
    latitude: 39 + index / 1000,
    longitude: 141 + index / 1000,
  }));
  const personAt = (index: number) => persons[index % persons.length]!;
  const interviews: Interview[] = Array.from({ length: size.interviews }, (_, index) => ({
    id: `interview-${index}`,
    title: `資料${index}`,
    interviewerPersonId: personAt(index).id,
    personNames: [
      { name: `資料${index}での呼び方A`, personId: personAt(index + 1).id },
      { name: `資料${index}での呼び方B`, personId: personAt(index + 2).id },
    ],
  }));
  const claims: Claim[] = Array.from({ length: size.claims }, (_, index) => {
    const interview = interviews[index % interviews.length]!;
    const [nameA, nameB] = interview.personNames!;
    const place = places[index % places.length]!;
    return {
      id: `claim-${index}`,
      speaker: { kind: 'person', personIds: [personAt(index).id] },
      sources: [{ interviewId: interview.id, viaPersonIds: [personAt(index + 3).id] }],
      content: `${formatMention({ kind: 'person', id: nameA!.personId, label: nameA!.name })}と${formatMention({
        kind: 'person',
        id: nameB!.personId,
        label: nameB!.name,
      })}が${formatMention({ kind: 'place', id: place.id, label: place.name })}にいた（証言${index}）`,
      when: new Date(BASE_TIME_MS + index * HOUR_MS).toISOString().slice(0, 16),
      placeId: place.id,
      mentionedPersonIds: [nameA!.personId, nameB!.personId],
    };
  });
  return {
    id: 'case-large',
    name: '大きなケース',
    persons,
    places,
    claims,
    relationships: [],
    interviews,
    crossChecks: [],
    hypotheses: [],
    tasks: [],
    disputes: [],
    timelineOrder: claims.map((claim) => `claim:${claim.id}`),
    personLaneOrder: [],
  };
}
