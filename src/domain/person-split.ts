/**
 * 1人の人物を2人に分ける操作
 *
 * 資料が「弟」とだけ書いていて次男か三男かを決められず、1人の人物として登録した後で、別の人物だと分かったときに使います。
 * 元の人物を参照している箇所（参照）を一覧にし（listPersonReferences）、読み手が選んだ参照だけを新しい人物に移します（splitPerson）。
 * 選ばなかった参照は、元の人物に残します。移す候補を自動では選びません（同じ人物かどうかの判断は読み手に任せる方針です）。
 *
 * 参照の単位（1件ずつ移す先を選べる単位）:
 * - 証言: 発言者／出典ごとの経由／本文での言及（本文のメンションと mentionedPersonIds をまとめて1件）
 *   同じ証言の中でも、発言者は元の人物・言及は新しい人物のように、参照ごとに分けられます。
 *   本文のメンションは、同じ人物を指すものを1件にまとめます（1つの本文の中で、同じ人物の呼び方ごとに分けることはしません）。
 * - 資料: 聴取者／原典の媒体／資料での呼び方（呼び方ごと）
 * - 関係: 関係ごと（関係のうち、元の人物の側の端を移します）
 * - 仮説: 対象の人物（観点ごとの証言ごと移します）／第三者の説の主唱者
 * - 未了事項: 未了事項ごと
 * - 人物・場所のメモでの言及: メモごと
 *
 * 移し方の規則:
 * - 本文とメモのメンションは、IDだけを付け替え、表記（「弟」など、資料での書き方）は残します。
 * - 新しい人物は、人物の動きの列では元の人物の列のすぐ後ろに置きます。
 * - 元の人物の名前・別名・メモなどの項目は、新しい人物に写しません（新しい人物は呼び出し側が作ります）。
 *
 * 人物を参照する項目を足した場合は、listPersonReferences・splitPerson と、src/domain/person-merge.ts の mergePersons を合わせて直してください。
 * 片方だけを直すと、person-split.test.ts の「元の人物のIDが残らない」テストが失敗します。
 */
import { formatInterviewLabel } from './interviews';
import { hasPersonMention, parseContent, replacePersonMentions } from './mention';
import type { Case, Id, Person } from './types';

/** 人物を参照している箇所1件です。key は、移す参照を選ぶときの識別子です（同じケースの中で一意です）。 */
export type PersonReference =
  | { key: string; kind: 'claimSpeaker'; claimId: Id }
  | { key: string; kind: 'claimVia'; claimId: Id; sourceIndex: number }
  | { key: string; kind: 'claimMention'; claimId: Id }
  | { key: string; kind: 'interviewer'; interviewId: Id }
  | { key: string; kind: 'publisher'; interviewId: Id }
  | { key: string; kind: 'sourceName'; interviewId: Id; name: string }
  | { key: string; kind: 'relationship'; relationshipId: Id }
  | { key: string; kind: 'hypothesisTarget'; hypothesisId: Id }
  | { key: string; kind: 'proponent'; hypothesisId: Id }
  | { key: string; kind: 'task'; taskId: Id }
  | { key: string; kind: 'personNote'; personId: Id }
  | { key: string; kind: 'placeNote'; placeId: Id };

/** 参照を、画面で読み手が判断できるように示す文です。group は参照元の種類、subject は参照元、role は参照のしかたです。 */
export type PersonReferenceDescription = { group: string; subject: string; role: string };

/**
 * 参照の key の作り方です。参照の一覧（listPersonReferences）と、選んだ参照を移す処理（splitPerson）の両方で使い、
 * 2か所で key の形が食い違わないようにします。
 */
const referenceKey = {
  claimSpeaker: (claimId: Id) => `claim:${claimId}:speaker`,
  claimVia: (claimId: Id, sourceIndex: number) => `claim:${claimId}:via:${sourceIndex}`,
  claimMention: (claimId: Id) => `claim:${claimId}:mention`,
  interviewer: (interviewId: Id) => `interview:${interviewId}:interviewer`,
  publisher: (interviewId: Id) => `interview:${interviewId}:publisher`,
  sourceName: (interviewId: Id, name: string) => `interview:${interviewId}:name:${name}`,
  relationship: (relationshipId: Id) => `relationship:${relationshipId}`,
  hypothesisTarget: (hypothesisId: Id) => `hypothesis:${hypothesisId}:target`,
  proponent: (hypothesisId: Id) => `hypothesis:${hypothesisId}:proponent`,
  task: (taskId: Id) => `task:${taskId}`,
  personNote: (personId: Id) => `person:${personId}:note`,
  placeNote: (placeId: Id) => `place:${placeId}:note`,
};

/** 参照元の文の冒頭として示す文字数です。長い本文で一覧が読みにくくならないよう、ここで切ります。 */
const SUBJECT_LENGTH = 40;

/** 人物 personId を参照している箇所を、証言・資料・関係・仮説・未了事項・人物のメモ・場所のメモの順に返します。 */
export function listPersonReferences(target: Case, personId: Id): PersonReference[] {
  const references: PersonReference[] = [];
  for (const claim of target.claims) {
    if (claim.speaker.kind === 'person' && claim.speaker.personIds.includes(personId)) {
      references.push({ key: referenceKey.claimSpeaker(claim.id), kind: 'claimSpeaker', claimId: claim.id });
    }
    claim.sources.forEach((source, sourceIndex) => {
      if (source.viaPersonIds.includes(personId)) {
        references.push({ key: referenceKey.claimVia(claim.id, sourceIndex), kind: 'claimVia', claimId: claim.id, sourceIndex });
      }
    });
    if (claim.mentionedPersonIds.includes(personId) || hasPersonMention(claim.content, personId)) {
      references.push({ key: referenceKey.claimMention(claim.id), kind: 'claimMention', claimId: claim.id });
    }
  }
  for (const interview of target.interviews) {
    if (interview.interviewerPersonId === personId) {
      references.push({ key: referenceKey.interviewer(interview.id), kind: 'interviewer', interviewId: interview.id });
    }
    if (interview.origin?.publisherPersonId === personId) {
      references.push({ key: referenceKey.publisher(interview.id), kind: 'publisher', interviewId: interview.id });
    }
    for (const personName of interview.personNames ?? []) {
      if (personName.personId !== personId) continue;
      references.push({ key: referenceKey.sourceName(interview.id, personName.name), kind: 'sourceName', interviewId: interview.id, name: personName.name });
    }
  }
  for (const relationship of target.relationships) {
    if (relationship.fromPersonId === personId || relationship.toPersonId === personId) {
      references.push({ key: referenceKey.relationship(relationship.id), kind: 'relationship', relationshipId: relationship.id });
    }
  }
  for (const hypothesis of target.hypotheses) {
    if (hypothesis.targets.some((item) => item.personId === personId)) {
      references.push({ key: referenceKey.hypothesisTarget(hypothesis.id), kind: 'hypothesisTarget', hypothesisId: hypothesis.id });
    }
    if (hypothesis.proponentPersonId === personId) {
      references.push({ key: referenceKey.proponent(hypothesis.id), kind: 'proponent', hypothesisId: hypothesis.id });
    }
  }
  for (const task of target.tasks) {
    if (task.personIds.includes(personId)) references.push({ key: referenceKey.task(task.id), kind: 'task', taskId: task.id });
  }
  for (const person of target.persons) {
    if (person.note !== undefined && hasPersonMention(person.note, personId)) {
      references.push({ key: referenceKey.personNote(person.id), kind: 'personNote', personId: person.id });
    }
  }
  for (const place of target.places) {
    if (place.note !== undefined && hasPersonMention(place.note, personId)) {
      references.push({ key: referenceKey.placeNote(place.id), kind: 'placeNote', placeId: place.id });
    }
  }
  return references;
}

/** 一覧から ID の要素を探します。参照の一覧はケースから作るため、見つからない場合はケースと一覧が食い違った誤りとして例外を投げます。 */
function findById<T extends { id: Id }>(items: T[], id: Id): T {
  const found = items.find((item) => item.id === id);
  if (found === undefined) throw new Error(`参照元が見つかりません: ${id}`);
  return found;
}

/** 長い文を、一覧で読める長さに切ります。 */
function truncate(text: string): string {
  return text.length > SUBJECT_LENGTH ? `${text.slice(0, SUBJECT_LENGTH)}…` : text;
}

/**
 * 本文を、メンションを「@表記」にした文字列で返します。
 * 人物の現在の名前ではなく本文に書かれた表記を示すのは、分けるときの手がかりが資料での書き方（「次男」など）だからです。
 */
function contentWithWrittenLabels(content: string): string {
  return parseContent(content)
    .map((segment) => (segment.type === 'mention' ? (segment.kind === 'date' ? segment.label : `@${segment.label}`) : segment.text))
    .join('');
}

/** 人物の名前を返します。 */
function personName(target: Case, personId: Id): string {
  return findById(target.persons, personId).name;
}

/** 参照を、画面で読み手が判断できるように示す文を返します。 */
export function describePersonReference(target: Case, reference: PersonReference): PersonReferenceDescription {
  switch (reference.kind) {
    case 'claimSpeaker':
    case 'claimVia':
    case 'claimMention': {
      const claim = findById(target.claims, reference.claimId);
      const subject = claim.title ?? truncate(contentWithWrittenLabels(claim.content));
      if (reference.kind === 'claimSpeaker') return { group: '証言', subject, role: '発言者' };
      if (reference.kind === 'claimMention') return { group: '証言', subject, role: '本文での言及' };
      const interviewId = claim.sources[reference.sourceIndex]?.interviewId;
      const via = interviewId === undefined ? '資料なしの出典' : formatInterviewLabel(target, findById(target.interviews, interviewId));
      return { group: '証言', subject, role: `経由（${via}）` };
    }
    case 'interviewer':
    case 'publisher':
    case 'sourceName': {
      const subject = formatInterviewLabel(target, findById(target.interviews, reference.interviewId));
      if (reference.kind === 'interviewer') return { group: '資料', subject, role: '聴取者・媒体' };
      if (reference.kind === 'publisher') return { group: '資料', subject, role: '原典の媒体' };
      return { group: '資料', subject, role: `資料での呼び方「${reference.name}」` };
    }
    case 'relationship': {
      const relationship = findById(target.relationships, reference.relationshipId);
      const subject = `${personName(target, relationship.fromPersonId)} → ${personName(target, relationship.toPersonId)}（${relationship.label}）`;
      return { group: '関係', subject, role: '関係の相手' };
    }
    case 'hypothesisTarget':
    case 'proponent': {
      const hypothesis = findById(target.hypotheses, reference.hypothesisId);
      return { group: '仮説', subject: hypothesis.title, role: reference.kind === 'proponent' ? '主唱者' : '対象の人物' };
    }
    case 'task':
      return { group: '未了事項', subject: truncate(findById(target.tasks, reference.taskId).content), role: '対象の人物' };
    case 'personNote':
      return { group: '人物', subject: personName(target, reference.personId), role: 'メモでの言及' };
    case 'placeNote':
      return { group: '場所', subject: findById(target.places, reference.placeId).name, role: 'メモでの言及' };
    default: {
      const exhaustive: never = reference;
      throw new Error(`未対応の参照です: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** 一覧の中の from を to に付け替えます。同じIDが2回並ばないよう、最初の位置だけを残します。 */
function replaceInList(ids: Id[], fromId: Id, toId: Id): Id[] {
  return [...new Set(ids.map((id) => (id === fromId ? toId : id)))];
}

/**
 * 人物 fromId を参照している箇所のうち、moveKeys で選んだ参照だけを新しい人物 newPerson に移したケースを返します。
 * 新しい人物はケースの人物の末尾に足します。規則はこのファイル冒頭のコメントを参照してください。
 * 存在しない人物・既にあるIDの新しい人物・人物 fromId を参照していない箇所を選んだ場合は、エラーにします。
 */
export function splitPerson(target: Case, fromId: Id, newPerson: Person, moveKeys: string[]): Case {
  if (!target.persons.some((person) => person.id === fromId)) throw new Error(`人物が見つかりません: ${fromId}`);
  if (target.persons.some((person) => person.id === newPerson.id)) throw new Error(`同じIDの人物が既にあります: ${newPerson.id}`);
  const referenceKeys = new Set(listPersonReferences(target, fromId).map((reference) => reference.key));
  const unknownKey = moveKeys.find((key) => !referenceKeys.has(key));
  if (unknownKey !== undefined) throw new Error(`この人物を参照していない箇所です: ${unknownKey}`);

  const toId = newPerson.id;
  const moves = new Set(moveKeys);
  const moveId = <T extends Id | undefined>(id: T, key: string): T | Id => (id === fromId && moves.has(key) ? toId : id);
  const moveNote = (note: string | undefined, key: string) =>
    note !== undefined && moves.has(key) ? replacePersonMentions(note, fromId, toId) : note;

  const lanePosition = target.personLaneOrder.indexOf(fromId);
  const personLaneOrder =
    lanePosition === -1
      ? target.personLaneOrder
      : [...target.personLaneOrder.slice(0, lanePosition + 1), toId, ...target.personLaneOrder.slice(lanePosition + 1)];

  return {
    ...target,
    persons: [
      ...target.persons.map((person) => {
        const note = moveNote(person.note, referenceKey.personNote(person.id));
        return note === person.note ? person : { ...person, note };
      }),
      newPerson,
    ],
    places: target.places.map((place) => {
      const note = moveNote(place.note, referenceKey.placeNote(place.id));
      return note === place.note ? place : { ...place, note };
    }),
    claims: target.claims.map((claim) => {
      const moveMention = moves.has(referenceKey.claimMention(claim.id));
      return {
        ...claim,
        speaker:
          claim.speaker.kind === 'person' && moves.has(referenceKey.claimSpeaker(claim.id))
            ? { kind: 'person' as const, personIds: replaceInList(claim.speaker.personIds, fromId, toId) }
            : claim.speaker,
        sources: claim.sources.map((source, sourceIndex) =>
          moves.has(referenceKey.claimVia(claim.id, sourceIndex))
            ? { ...source, viaPersonIds: replaceInList(source.viaPersonIds, fromId, toId) }
            : source
        ),
        mentionedPersonIds: moveMention ? replaceInList(claim.mentionedPersonIds, fromId, toId) : claim.mentionedPersonIds,
        content: moveMention ? replacePersonMentions(claim.content, fromId, toId) : claim.content,
      };
    }),
    interviews: target.interviews.map((interview) => {
      const next = { ...interview };
      if (interview.interviewerPersonId !== undefined) {
        next.interviewerPersonId = moveId(interview.interviewerPersonId, referenceKey.interviewer(interview.id));
      }
      if (interview.origin?.publisherPersonId !== undefined) {
        next.origin = { ...interview.origin, publisherPersonId: moveId(interview.origin.publisherPersonId, referenceKey.publisher(interview.id)) };
      }
      if (interview.personNames !== undefined) {
        next.personNames = interview.personNames.map((item) => ({
          ...item,
          personId: moveId(item.personId, referenceKey.sourceName(interview.id, item.name)),
        }));
      }
      return next;
    }),
    relationships: target.relationships.map((relationship) => {
      const key = referenceKey.relationship(relationship.id);
      return { ...relationship, fromPersonId: moveId(relationship.fromPersonId, key), toPersonId: moveId(relationship.toPersonId, key) };
    }),
    hypotheses: target.hypotheses.map((hypothesis) => {
      const next = {
        ...hypothesis,
        targets: hypothesis.targets.map((item) => ({ ...item, personId: moveId(item.personId, referenceKey.hypothesisTarget(hypothesis.id)) })),
      };
      if (hypothesis.proponentPersonId !== undefined) {
        next.proponentPersonId = moveId(hypothesis.proponentPersonId, referenceKey.proponent(hypothesis.id));
      }
      return next;
    }),
    tasks: target.tasks.map((task) => (moves.has(referenceKey.task(task.id)) ? { ...task, personIds: replaceInList(task.personIds, fromId, toId) } : task)),
    personLaneOrder,
  };
}
