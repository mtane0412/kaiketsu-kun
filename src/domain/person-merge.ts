/**
 * 2人の人物を1人にまとめる操作
 *
 * 資料ごとに「男」「村内の男性」「Xさん」のように別の人物として登録した人物が、調べた結果、同じ人物だと分かったときに使います。
 * まとめる人物（from）への参照を、すべてまとめ先の人物（into）への参照に付け替え、まとめる人物を削除します。
 *
 * 付け替えの規則:
 * - 発言者・経由・言及・未了事項の人物など、人物の一覧は、付け替えた後に同じ人物が2回並ばないよう1つにまとめます。
 *   発言者になった人物は、出典の経由から除きます（自分自身を経由して伝えた形にしないためです）。
 *   経由を除いて資料・経由・引用のどれも無くなった出典は、取り除きます。
 * - 本文とメモのメンションは、IDだけを付け替え、表記（「男」など）は残します。表記は資料での書き方だからです。
 * - まとめる人物の名前と別名は、まとめ先の人物の別名に足します。本文に残した表記を、資料での表記として示すためです
 *   （src/domain/person-names.ts の isSourceNameOf）。識別子も引き継ぎ、メモはまとめ先のメモの後ろに足します。
 * - 仮説の対象に2人とも含まれていた場合は、観点ごとの証言をまとめ先の対象にまとめます。
 * - 2人の間に関係がある場合は、自分自身との関係になってしまうため、まとめずにエラーにします（関係を先に削除してもらいます）。
 *
 * 人物を分ける操作（1人の人物への参照の一部を、新しい人物に移す）は、ここでは扱いません。
 */
import { formatMention, parseContent } from './mention';
import { normalizeName } from './person-names';
import type { Case, Id, Person } from './types';

/** 一覧の中の from を into に付け替え、同じIDが2回並ばないよう、最初の位置だけを残します。 */
function replaceInList(ids: Id[], fromId: Id, intoId: Id): Id[] {
  return [...new Set(ids.map((id) => (id === fromId ? intoId : id)))];
}

/** IDが from なら into に付け替えます。 */
function replaceId<T extends Id | undefined>(id: T, fromId: Id, intoId: Id): T | Id {
  return id === fromId ? intoId : id;
}

/** 本文・メモの人物のメンションのうち、from を指すものを into に付け替えます。表記はそのまま残します。 */
function replaceInContent(content: string, fromId: Id, intoId: Id): string {
  return parseContent(content)
    .map((segment) => {
      if (segment.type !== 'mention') return segment.text;
      const { kind, id, label } = segment;
      return formatMention({ kind, id: kind === 'person' && id === fromId ? intoId : id, label });
    })
    .join('');
}

/** まとめる人物の名前・別名・識別子・メモを、まとめ先の人物に引き継ぎます。 */
function mergePersonFields(from: Person, into: Person): Person {
  const knownNames = new Set([into.name, ...(into.aliases ?? [])].map(normalizeName));
  const aliases = [...(into.aliases ?? [])];
  for (const name of [from.name, ...(from.aliases ?? [])]) {
    if (knownNames.has(normalizeName(name))) continue;
    knownNames.add(normalizeName(name));
    aliases.push(name);
  }
  const identifiers = [...(into.identifiers ?? [])];
  for (const identifier of from.identifiers ?? []) {
    if (!identifiers.some((item) => item.type === identifier.type && item.value === identifier.value)) identifiers.push(identifier);
  }
  const note = [into.note, from.note].filter((item) => item !== undefined && item !== '').join('\n\n');

  const merged: Person = { ...into };
  if (aliases.length > 0) merged.aliases = aliases;
  if (identifiers.length > 0) merged.identifiers = identifiers;
  if (note !== '') merged.note = note;
  return merged;
}

/**
 * 人物 fromId を人物 intoId にまとめたケースを返します。規則はこのファイル冒頭のコメントを参照してください。
 * 同じ人物どうし・存在しない人物・2人の間に関係がある場合は、エラーにします。
 */
export function mergePersons(target: Case, fromId: Id, intoId: Id): Case {
  if (fromId === intoId) throw new Error('同じ人物どうしはまとめられません');
  const from = target.persons.find((person) => person.id === fromId);
  const into = target.persons.find((person) => person.id === intoId);
  if (from === undefined) throw new Error(`人物が見つかりません: ${fromId}`);
  if (into === undefined) throw new Error(`人物が見つかりません: ${intoId}`);
  const between = target.relationships.filter(
    (relationship) => [relationship.fromPersonId, relationship.toPersonId].sort().join() === [fromId, intoId].sort().join()
  );
  if (between.length > 0) {
    throw new Error(`2人の間の関係（${between.map((relationship) => relationship.label).join('、')}）を削除してから、まとめてください`);
  }

  const mergedInto = mergePersonFields(from, into);
  return {
    ...target,
    persons: target.persons
      .filter((person) => person.id !== fromId)
      .map((person) => {
        const current = person.id === intoId ? mergedInto : person;
        return current.note === undefined ? current : { ...current, note: replaceInContent(current.note, fromId, intoId) };
      }),
    places: target.places.map((place) => (place.note === undefined ? place : { ...place, note: replaceInContent(place.note, fromId, intoId) })),
    claims: target.claims.map((claim) => {
      const speakerIds = claim.speaker.kind === 'person' ? replaceInList(claim.speaker.personIds, fromId, intoId) : [];
      const sources = claim.sources
        // 同じ人物になった発言者を、自分自身の経由として残さない
        .map((source) => ({ ...source, viaPersonIds: replaceInList(source.viaPersonIds, fromId, intoId).filter((id) => !speakerIds.includes(id)) }))
        // 経由を除いて資料・経由・引用のどれも無くなった出典は、伝わった経路を何も表さないため取り除く
        .filter((source) => source.interviewId !== undefined || source.viaPersonIds.length > 0 || source.quote !== undefined);
      return {
        ...claim,
        speaker: claim.speaker.kind === 'person' ? { kind: 'person' as const, personIds: speakerIds } : claim.speaker,
        sources,
        mentionedPersonIds: replaceInList(claim.mentionedPersonIds, fromId, intoId),
        content: replaceInContent(claim.content, fromId, intoId),
      };
    }),
    interviews: target.interviews.map((interview) => {
      const next = { ...interview };
      if (interview.interviewerPersonId !== undefined) next.interviewerPersonId = replaceId(interview.interviewerPersonId, fromId, intoId);
      if (interview.origin?.publisherPersonId !== undefined) {
        next.origin = { ...interview.origin, publisherPersonId: replaceId(interview.origin.publisherPersonId, fromId, intoId) };
      }
      if (interview.personNames !== undefined) {
        next.personNames = interview.personNames.map((personName) => ({ ...personName, personId: replaceId(personName.personId, fromId, intoId) }));
      }
      return next;
    }),
    relationships: target.relationships.map((relationship) => ({
      ...relationship,
      fromPersonId: replaceId(relationship.fromPersonId, fromId, intoId),
      toPersonId: replaceId(relationship.toPersonId, fromId, intoId),
    })),
    hypotheses: target.hypotheses.map((hypothesis) => {
      const fromTarget = hypothesis.targets.find((item) => item.personId === fromId);
      if (fromTarget === undefined) return hypothesis;
      const intoTarget = hypothesis.targets.find((item) => item.personId === intoId);
      if (intoTarget === undefined) {
        return { ...hypothesis, targets: hypothesis.targets.map((item) => (item === fromTarget ? { ...item, personId: intoId } : item)) };
      }
      // 2人とも対象だった場合は、観点ごとの証言をまとめ先の対象にまとめる
      const claimIds = {
        motive: [...new Set([...intoTarget.claimIds.motive, ...fromTarget.claimIds.motive])],
        opportunity: [...new Set([...intoTarget.claimIds.opportunity, ...fromTarget.claimIds.opportunity])],
        means: [...new Set([...intoTarget.claimIds.means, ...fromTarget.claimIds.means])],
      };
      return {
        ...hypothesis,
        targets: hypothesis.targets.filter((item) => item !== fromTarget).map((item) => (item === intoTarget ? { ...item, claimIds } : item)),
      };
    }),
    tasks: target.tasks.map((task) => ({ ...task, personIds: replaceInList(task.personIds, fromId, intoId) })),
    personLaneOrder: replaceInList(target.personLaneOrder, fromId, intoId),
  };
}
