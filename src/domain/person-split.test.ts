/**
 * 1人の人物への参照の一部を、新しい人物に移して分ける操作のテスト
 */
import { describe, expect, it } from 'vitest';
import { mergePersons } from './person-merge';
import { describePersonReference, listPersonReferences, splitPerson } from './person-split';
import type { Case, Person } from './types';

/**
 * 資料が「弟」とだけ書いていて、次男か三男かを決められずに1人の人物「弟」として登録したケースです。
 * 「弟」は、証言の発言者・経由・言及・本文のメンション、資料の聴取者・原典の媒体・資料での呼び方、
 * 関係、仮説の対象・主唱者、未了事項、人物・場所のメモ、人物の動きの列から参照されています。
 */
function createCase(): Case {
  return {
    id: 'case-1',
    name: '山あいの村の事件',
    persons: [
      { id: 'person-brother', name: '弟', kind: 'individual', aliases: ['被疑者の弟'] },
      { id: 'person-suspect', name: '小林健', kind: 'individual', note: '@[弟](person:person-brother)と同居' },
      { id: 'person-paper', name: '地方紙', kind: 'organization' },
    ],
    places: [{ id: 'place-home', name: '実家', note: '@[弟](person:person-brother)の部屋がある' }],
    claims: [
      {
        id: 'claim-alibi',
        title: '弟のアリバイ',
        speaker: { kind: 'person', personIds: ['person-brother'] },
        sources: [
          { interviewId: 'interview-paper', viaPersonIds: ['person-paper'] },
          { interviewId: 'interview-tv', viaPersonIds: ['person-brother'] },
        ],
        content: 'その夜は家にいた',
        mentionedPersonIds: [],
      },
      {
        id: 'claim-seen',
        speaker: { kind: 'person', personIds: ['person-suspect'] },
        sources: [],
        content: '@[弟](person:person-brother)と@[次男](person:person-brother)が車で出かけた',
        mentionedPersonIds: ['person-brother'],
      },
    ],
    relationships: [{ id: 'relationship-sibling', fromPersonId: 'person-suspect', toPersonId: 'person-brother', label: '兄弟', directed: false, basisClaimIds: [] }],
    interviews: [
      { id: 'interview-paper', title: '地方紙の記事', interviewerPersonId: 'person-paper', personNames: [{ name: '弟', personId: 'person-brother' }] },
      {
        id: 'interview-tv',
        title: 'テレビの取材',
        interviewerPersonId: 'person-brother',
        origin: { publisherPersonId: 'person-brother' },
      },
    ],
    crossChecks: [],
    hypotheses: [
      {
        id: 'hypothesis-1',
        title: '弟が関わった説',
        status: 'open',
        supportingClaimIds: [],
        opposingClaimIds: [],
        targets: [{ personId: 'person-brother', claimIds: { motive: ['claim-seen'], opportunity: [], means: [] } }],
        proponentPersonId: 'person-brother',
      },
    ],
    tasks: [{ id: 'task-1', content: 'どちらの弟か確かめる', status: 'todo', claimIds: [], personIds: ['person-brother'], placeIds: [] }],
    timelineOrder: [],
    personLaneOrder: ['person-suspect', 'person-brother', 'person-paper'],
  };
}

/** 分けて作る新しい人物（三男）です。 */
const thirdSon: Person = { id: 'person-third', name: '三男', kind: 'individual' };

describe('listPersonReferences', () => {
  it('人物を参照している箇所を、参照ごとに1件ずつ挙げる', () => {
    const keys = listPersonReferences(createCase(), 'person-brother').map((reference) => reference.key);

    expect(keys).toEqual([
      'claim:claim-alibi:speaker',
      'claim:claim-alibi:via:1',
      'claim:claim-seen:mention',
      'interview:interview-paper:name:弟',
      'interview:interview-tv:interviewer',
      'interview:interview-tv:publisher',
      'relationship:relationship-sibling',
      'hypothesis:hypothesis-1:target',
      'hypothesis:hypothesis-1:proponent',
      'task:task-1',
      'person:person-suspect:note',
      'place:place-home:note',
    ]);
  });

  it('ほかの人物の参照は挙げず、参照の無い人物では空の一覧を返す', () => {
    expect(listPersonReferences(createCase(), 'person-paper').map((reference) => reference.key)).toEqual([
      'claim:claim-alibi:via:0',
      'interview:interview-paper:interviewer',
    ]);
    expect(listPersonReferences({ ...createCase(), persons: [...createCase().persons, thirdSon] }, 'person-third')).toEqual([]);
  });
});

describe('describePersonReference', () => {
  it('参照の種類と、どの証言・資料かを読める文で示す', () => {
    const target = createCase();
    const described = listPersonReferences(target, 'person-brother').map((reference) => describePersonReference(target, reference));

    expect(described).toContainEqual({ group: '証言', subject: '弟のアリバイ', role: '発言者' });
    expect(described).toContainEqual({ group: '証言', subject: '弟のアリバイ', role: '経由（テレビの取材・弟）' });
    expect(described).toContainEqual({ group: '証言', subject: '@弟と@次男が車で出かけた', role: '本文での言及' });
    expect(described).toContainEqual({ group: '資料', subject: '地方紙の記事・地方紙', role: '資料での呼び方「弟」' });
    expect(described).toContainEqual({ group: '関係', subject: '小林健 → 弟（兄弟）', role: '関係の相手' });
    expect(described).toContainEqual({ group: '仮説', subject: '弟が関わった説', role: '主唱者' });
    expect(described).toContainEqual({ group: '未了事項', subject: 'どちらの弟か確かめる', role: '対象の人物' });
    expect(described).toContainEqual({ group: '人物', subject: '小林健', role: 'メモでの言及' });
  });
});

describe('splitPerson', () => {
  it('選んだ参照だけを新しい人物に移し、残りは元の人物に残す', () => {
    const result = splitPerson(createCase(), 'person-brother', thirdSon, [
      'claim:claim-alibi:via:1',
      'interview:interview-paper:name:弟',
      'hypothesis:hypothesis-1:target',
    ]);

    expect(result.persons.map((person) => person.id)).toEqual(['person-brother', 'person-suspect', 'person-paper', 'person-third']);
    const alibi = result.claims.find((claim) => claim.id === 'claim-alibi');
    expect(alibi?.speaker).toEqual({ kind: 'person', personIds: ['person-brother'] });
    expect(alibi?.sources[1]?.viaPersonIds).toEqual(['person-third']);
    expect(result.interviews[0]?.personNames).toEqual([{ name: '弟', personId: 'person-third' }]);
    expect(result.interviews[1]?.interviewerPersonId).toBe('person-brother');
    expect(result.hypotheses[0]?.targets).toEqual([{ personId: 'person-third', claimIds: { motive: ['claim-seen'], opportunity: [], means: [] } }]);
    expect(result.hypotheses[0]?.proponentPersonId).toBe('person-brother');
    expect(result.tasks[0]?.personIds).toEqual(['person-brother']);
  });

  it('本文での言及を移すと、表記を残したままIDだけを付け替え、言及している人物も入れ替える', () => {
    const result = splitPerson(createCase(), 'person-brother', thirdSon, ['claim:claim-seen:mention', 'person:person-suspect:note']);

    const seen = result.claims.find((claim) => claim.id === 'claim-seen');
    expect(seen?.content).toBe('@[弟](person:person-third)と@[次男](person:person-third)が車で出かけた');
    expect(seen?.mentionedPersonIds).toEqual(['person-third']);
    expect(result.persons.find((person) => person.id === 'person-suspect')?.note).toBe('@[弟](person:person-third)と同居');
    expect(result.places[0]?.note).toBe('@[弟](person:person-brother)の部屋がある');
  });

  it('関係・資料の聴取者と原典の媒体・主唱者・未了事項を移す', () => {
    const result = splitPerson(createCase(), 'person-brother', thirdSon, [
      'relationship:relationship-sibling',
      'interview:interview-tv:interviewer',
      'interview:interview-tv:publisher',
      'hypothesis:hypothesis-1:proponent',
      'task:task-1',
      'claim:claim-alibi:speaker',
      'place:place-home:note',
    ]);

    expect(result.relationships[0]).toMatchObject({ fromPersonId: 'person-suspect', toPersonId: 'person-third' });
    expect(result.interviews[1]).toMatchObject({ interviewerPersonId: 'person-third', origin: { publisherPersonId: 'person-third' } });
    expect(result.hypotheses[0]?.proponentPersonId).toBe('person-third');
    expect(result.tasks[0]?.personIds).toEqual(['person-third']);
    expect(result.claims[0]?.speaker).toEqual({ kind: 'person', personIds: ['person-third'] });
    expect(result.places[0]?.note).toBe('@[弟](person:person-third)の部屋がある');
  });

  it('人物の動きの列では、新しい人物を元の人物の列のすぐ後ろに置く', () => {
    const result = splitPerson(createCase(), 'person-brother', thirdSon, []);

    expect(result.personLaneOrder).toEqual(['person-suspect', 'person-brother', 'person-third', 'person-paper']);
  });

  it('すべての参照を移すと、元の人物のIDはその人物自身の項目にしか残らない', () => {
    const target = createCase();
    const allKeys = listPersonReferences(target, 'person-brother').map((reference) => reference.key);

    const result = splitPerson(target, 'person-brother', thirdSon, allKeys);

    // 参照の挙げ漏らし・移し漏らしがあると、元の人物のIDがどこかに残る
    const withoutSelf = { ...result, persons: result.persons.filter((person) => person.id !== 'person-brother'), personLaneOrder: [] };
    expect(JSON.stringify(withoutSelf)).not.toContain('person-brother');
  });

  it('存在しない人物・既にあるIDの新しい人物・参照していない箇所を指定した場合は、エラーにする', () => {
    expect(() => splitPerson(createCase(), 'person-missing', thirdSon, [])).toThrow('人物が見つかりません: person-missing');
    expect(() => splitPerson(createCase(), 'person-brother', { ...thirdSon, id: 'person-suspect' }, [])).toThrow(
      '同じIDの人物が既にあります: person-suspect'
    );
    expect(() => splitPerson(createCase(), 'person-brother', thirdSon, ['task:task-unknown'])).toThrow(
      'この人物を参照していない箇所です: task:task-unknown'
    );
  });
});

describe('mergePersons と listPersonReferences の対応', () => {
  it('まとめた後は、まとめた人物を参照している箇所が残らない', () => {
    const target = { ...createCase(), persons: [...createCase().persons, thirdSon] };

    const merged = mergePersons(target, 'person-brother', 'person-third');

    expect(listPersonReferences(merged, 'person-brother')).toEqual([]);
    expect(JSON.stringify(merged)).not.toContain('person-brother');
  });
});
