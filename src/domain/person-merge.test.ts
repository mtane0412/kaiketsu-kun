/**
 * 2人の人物を1人にまとめる操作のテスト
 */
import { describe, expect, it } from 'vitest';
import { mergePersons } from './person-merge';
import type { Case } from './types';

/**
 * 同姓同名の2人と、資料ごとに呼び方が入れ替わる「Aさん」を含むケースです。
 * - 被害女性と元交際相手は、どちらも「佐藤恵」です。
 * - ブログは元交際相手を「Aさん」、週刊誌は被害女性を「Aさん」と書きます。
 */
function createCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'case-1',
    name: '山あいの村の事件',
    persons: [
      { id: 'person-victim', name: '佐藤恵', kind: 'individual', aliases: ['被害女性'] },
      { id: 'person-ex', name: '元交際相手', kind: 'individual', aliases: ['佐藤恵'] },
      { id: 'person-suspect', name: '小林健', kind: 'individual' },
      { id: 'person-blog', name: 'ジャーナリストのブログ', kind: 'organization' },
      { id: 'person-weekly', name: '週刊誌', kind: 'organization' },
    ],
    places: [],
    claims: [],
    relationships: [],
    interviews: [
      { id: 'interview-blog', interviewerPersonId: 'person-blog', personNames: [{ name: 'Aさん', personId: 'person-ex' }] },
      { id: 'interview-weekly', interviewerPersonId: 'person-weekly', personNames: [{ name: 'Aさん', personId: 'person-victim' }] },
      { id: 'interview-plain' },
    ],
    crossChecks: [],
    hypotheses: [],
    tasks: [],
    timelineOrder: [],
    personLaneOrder: [],
    ...overrides,
  };
}

describe('mergePersons', () => {
  /** 「男」と書かれていた人物を、後から被疑者と同じ人物だと分かってまとめるケースです。 */
  function caseWithDuplicate(): Case {
    return createCase({
      persons: [
        ...createCase().persons,
        {
          id: 'person-man',
          name: '男',
          kind: 'individual',
          aliases: ['村内の男性'],
          identifiers: [{ type: '車両ナンバー', value: '岩手 300 あ 12-34' }],
          note: '黒い車に乗っていた',
        },
      ],
      claims: [
        {
          id: 'claim-1',
          speaker: { kind: 'person', personIds: ['person-man', 'person-suspect'] },
          sources: [{ interviewId: 'interview-blog', viaPersonIds: ['person-man', 'person-blog'] }],
          content: '@[男](person:person-man) が車を止めた',
          mentionedPersonIds: ['person-man'],
        },
      ],
      interviews: [
        { id: 'interview-blog', interviewerPersonId: 'person-man', personNames: [{ name: '男', personId: 'person-man' }] },
        { id: 'interview-weekly', origin: { publisherPersonId: 'person-man' } },
      ],
      relationships: [
        { id: 'relationship-1', fromPersonId: 'person-man', toPersonId: 'person-victim', label: '知人', directed: false, basisClaimIds: [] },
      ],
      hypotheses: [
        {
          id: 'hypothesis-1',
          title: '被疑者が犯人である',
          status: 'open',
          supportingClaimIds: [],
          opposingClaimIds: [],
          targets: [
            { personId: 'person-suspect', claimIds: { motive: [], opportunity: [], means: [] } },
            { personId: 'person-man', claimIds: { motive: [], opportunity: ['claim-1'], means: [] } },
          ],
        },
      ],
      tasks: [{ id: 'task-1', content: '車の持ち主を確かめる', status: 'todo', claimIds: [], personIds: ['person-man', 'person-suspect'], placeIds: [] }],
      personLaneOrder: ['person-man', 'person-suspect'],
    });
  }

  it('まとめる人物への参照を、まとめ先の人物への参照にすべて付け替え、まとめる人物を削除する', () => {
    const merged = mergePersons(caseWithDuplicate(), 'person-man', 'person-suspect');

    expect(merged.persons.map((person) => person.id)).not.toContain('person-man');
    const [claim] = merged.claims;
    // 発言者・経由に同じ人物が2回並ばないよう、1つにまとめる。発言者になった人物は、自分自身の経由として残さない
    expect(claim?.speaker).toEqual({ kind: 'person', personIds: ['person-suspect'] });
    expect(claim?.sources).toEqual([{ interviewId: 'interview-blog', viaPersonIds: ['person-blog'] }]);
    expect(claim?.mentionedPersonIds).toEqual(['person-suspect']);
    // 本文の表記「男」は、資料での表記として残す
    expect(claim?.content).toBe('@[男](person:person-suspect) が車を止めた');
    expect(merged.interviews).toEqual([
      { id: 'interview-blog', interviewerPersonId: 'person-suspect', personNames: [{ name: '男', personId: 'person-suspect' }] },
      { id: 'interview-weekly', origin: { publisherPersonId: 'person-suspect' } },
    ]);
    expect(merged.relationships[0]).toMatchObject({ fromPersonId: 'person-suspect', toPersonId: 'person-victim' });
    expect(merged.tasks[0]?.personIds).toEqual(['person-suspect']);
    expect(merged.personLaneOrder).toEqual(['person-suspect']);
  });

  it('経由が発言者だけだった資料なしの出典は、経由を除くと何も残らないため、出典ごと取り除く', () => {
    // 前提: 「被疑者が男から聞いた」という、資料にひもづかない経由だけの出典。男と被疑者が同じ人物だと分かった
    const base = caseWithDuplicate();
    const target: Case = {
      ...base,
      claims: [
        {
          id: 'claim-2',
          speaker: { kind: 'person', personIds: ['person-suspect'] },
          sources: [{ viaPersonIds: ['person-man'] }],
          content: '車を止めた',
          mentionedPersonIds: [],
        },
      ],
    };

    expect(mergePersons(target, 'person-man', 'person-suspect').claims[0]?.sources).toEqual([]);
  });

  it('仮説の対象に2人とも含まれていた場合は、観点ごとの証言を1人の対象にまとめる', () => {
    const merged = mergePersons(caseWithDuplicate(), 'person-man', 'person-suspect');

    expect(merged.hypotheses[0]?.targets).toEqual([
      { personId: 'person-suspect', claimIds: { motive: [], opportunity: ['claim-1'], means: [] } },
    ]);
  });

  it('第三者の説の主唱者も、まとめ先の人物に付け替える', () => {
    // 前提: 「男」が唱えた説として登録した仮説がある
    const base = caseWithDuplicate();
    const target: Case = {
      ...base,
      hypotheses: [
        { id: 'hypothesis-2', title: '事故だった', status: 'open', supportingClaimIds: [], opposingClaimIds: [], targets: [], proponentPersonId: 'person-man' },
      ],
    };

    expect(mergePersons(target, 'person-man', 'person-suspect').hypotheses[0]?.proponentPersonId).toBe('person-suspect');
  });

  it('まとめる人物の名前・別名・識別子・メモを、まとめ先の人物に引き継ぐ', () => {
    const merged = mergePersons(caseWithDuplicate(), 'person-man', 'person-suspect');

    expect(merged.persons.find((person) => person.id === 'person-suspect')).toEqual({
      id: 'person-suspect',
      name: '小林健',
      kind: 'individual',
      aliases: ['男', '村内の男性'],
      identifiers: [{ type: '車両ナンバー', value: '岩手 300 あ 12-34' }],
      note: '黒い車に乗っていた',
    });
  });

  it('ほかの人物のメモにあるメンションも付け替える', () => {
    const base = caseWithDuplicate();
    const target = {
      ...base,
      persons: base.persons.map((person) =>
        person.id === 'person-victim' ? { ...person, note: '@[男](person:person-man) と口論していた' } : person
      ),
    };

    const merged = mergePersons(target, 'person-man', 'person-suspect');

    expect(merged.persons.find((person) => person.id === 'person-victim')?.note).toBe('@[男](person:person-suspect) と口論していた');
  });

  it('2人の間に関係がある場合は、自分自身との関係になるため、まとめずにエラーにする', () => {
    const base = caseWithDuplicate();
    const target = {
      ...base,
      relationships: [
        { id: 'relationship-2', fromPersonId: 'person-man', toPersonId: 'person-suspect', label: '兄弟', directed: false, basisClaimIds: [] },
      ],
    };

    expect(() => mergePersons(target, 'person-man', 'person-suspect')).toThrow(/2人の間の関係/);
  });

  it('同じ人物どうし、または存在しない人物はまとめられない', () => {
    expect(() => mergePersons(caseWithDuplicate(), 'person-man', 'person-man')).toThrow();
    expect(() => mergePersons(caseWithDuplicate(), 'person-gone', 'person-suspect')).toThrow(/person-gone/);
  });
});
