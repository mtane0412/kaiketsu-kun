/**
 * 人物の呼び方（名前・別名・資料ごとの呼び方）と、人物をまとめる操作のテスト
 */
import { describe, expect, it } from 'vitest';
import { findPersonsByName, isSourceNameOf, normalizeName } from './person-names';
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

describe('normalizeName', () => {
  it('前後の空白を除き、全角と連続の空白を半角1つにし、大文字小文字を区別しない', () => {
    expect(normalizeName('  山田　 花子 ')).toBe('山田 花子');
    expect(normalizeName('Lake Villa')).toBe(normalizeName('lake villa'));
  });
});

describe('findPersonsByName', () => {
  it('資料での呼び方を、人物の名前・別名より優先する（同じ「Aさん」でも、資料ごとに別の人物を指すため）', () => {
    const target = createCase();

    expect(findPersonsByName(target, 'interview-blog', 'Aさん')).toEqual([{ id: 'person-ex', name: '元交際相手' }]);
    expect(findPersonsByName(target, 'interview-weekly', ' aさん ')).toEqual([{ id: 'person-victim', name: '佐藤恵' }]);
  });

  it('資料での呼び方が無い名前は、人物の名前・別名と照らし合わせ、一致した人物をすべて返す（同姓同名を黙って1人に決めないため）', () => {
    const target = createCase();

    expect(findPersonsByName(target, 'interview-plain', '佐藤恵')).toEqual([
      { id: 'person-victim', name: '佐藤恵' },
      { id: 'person-ex', name: '元交際相手' },
    ]);
    expect(findPersonsByName(target, 'interview-plain', '小林健')).toEqual([{ id: 'person-suspect', name: '小林健' }]);
  });

  it('ほかの資料での呼び方は、この資料の照らし合わせには使わない', () => {
    const target = createCase();

    expect(findPersonsByName(target, 'interview-plain', 'Aさん')).toEqual([]);
  });
});

describe('isSourceNameOf', () => {
  it('人物の別名と、いずれかの資料での呼び方は、資料での表記とみなす', () => {
    const target = createCase();

    expect(isSourceNameOf(target, 'person-victim', '被害女性')).toBe(true);
    expect(isSourceNameOf(target, 'person-victim', 'Aさん')).toBe(true);
  });

  it('現在の名前と、どこにも登録されていない表記（改名前の名前など）は、資料での表記とみなさない', () => {
    const target = createCase();

    expect(isSourceNameOf(target, 'person-victim', '佐藤恵')).toBe(false);
    expect(isSourceNameOf(target, 'person-victim', '旧姓の佐藤')).toBe(false);
    expect(isSourceNameOf(target, 'person-suspect', 'Aさん')).toBe(false);
  });
});
