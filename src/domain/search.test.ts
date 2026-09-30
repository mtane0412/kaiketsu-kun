/**
 * ボード全体の検索と、人物の識別子（電話番号・車両ナンバーなど）の突き合わせのテスト
 */
import { describe, expect, it } from 'vitest';
import { buildTimeline } from './case-views';
import { sampleFictionalCase } from './sample-fictional-case';
import { findPersonsSharingIdentifiers, normalizeForMatching, searchCase } from './search';
import type { Case } from './types';

/**
 * サンプルのケースに、識別子を持つ人物と、識別子の値を本文に含む証言を加えたケースです。
 * 前提: 別荘の持ち主と管理人は、表記の違う同じ電話番号を持つ。隣家の住人は別の電話番号を持つ
 */
const caseWithIdentifiers: Case = {
  ...sampleFictionalCase,
  persons: sampleFictionalCase.persons.map((person) => {
    if (person.id === 'person-owner') {
      return {
        ...person,
        identifiers: [
          { type: '電話番号', value: '090-1234-5678' },
          { type: '車両ナンバー', value: '品川 300 あ 12-34' },
        ],
      };
    }
    if (person.id === 'person-caretaker') return { ...person, identifiers: [{ type: '携帯電話', value: '０９０ １２３４ ５６７８' }] };
    if (person.id === 'person-neighbor') return { ...person, identifiers: [{ type: '電話番号', value: '080-0000-1111' }] };
    return person;
  }),
  claims: [
    ...sampleFictionalCase.claims,
    {
      id: 'claim-phone-record',
      speaker: { kind: 'user' },
      viaPersonIds: [],
      title: '通話記録のメモ',
      content: '当夜に09012345678から着信があった。',
      mentionedPersonIds: [],
    },
  ],
};

describe('normalizeForMatching', () => {
  it('全角と半角・ハイフン・空白の違いを吸収する', () => {
    expect(normalizeForMatching('０９０－１２３４　５６７８')).toBe(normalizeForMatching('090-1234-5678'));
    expect(normalizeForMatching('090‐1234―5678')).toBe('09012345678');
  });

  it('英字の大文字と小文字の違いを吸収する', () => {
    expect(normalizeForMatching('ＡＢ-12')).toBe(normalizeForMatching('ab12'));
  });
});

describe('findPersonsSharingIdentifiers', () => {
  it('表記の揺れを吸収して、同じ値の識別子を持つ人物を、一致した識別子とともに返す', () => {
    const matches = findPersonsSharingIdentifiers(caseWithIdentifiers, 'person-owner');

    expect(matches).toEqual([
      {
        person: expect.objectContaining({ id: 'person-caretaker' }),
        identifiers: [{ type: '携帯電話', value: '０９０ １２３４ ５６７８' }],
      },
    ]);
  });

  it('識別子の種類が違っても、値が同じなら一致として扱い、互いの側から見つけられる', () => {
    const matches = findPersonsSharingIdentifiers(caseWithIdentifiers, 'person-caretaker');

    expect(matches.map((match) => match.person.id)).toEqual(['person-owner']);
    expect(matches[0]?.identifiers).toEqual([{ type: '電話番号', value: '090-1234-5678' }]);
  });

  it('正規化すると空になる値（ハイフンだけの値など）は、一致として扱わない', () => {
    const caseData: Case = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) => {
        if (person.id === 'person-owner') return { ...person, identifiers: [{ type: '電話番号', value: '-' }] };
        if (person.id === 'person-caretaker') return { ...person, identifiers: [{ type: '電話番号', value: '－ －' }] };
        return person;
      }),
    };

    expect(findPersonsSharingIdentifiers(caseData, 'person-owner')).toEqual([]);
  });

  it('識別子を持たない人物、存在しない人物では、空の配列を返す', () => {
    expect(findPersonsSharingIdentifiers(caseWithIdentifiers, 'person-police')).toEqual([]);
    expect(findPersonsSharingIdentifiers(caseWithIdentifiers, 'person-gone')).toEqual([]);
  });
});

describe('searchCase', () => {
  it('証言の見出し・本文（メンションは現在の名前）を検索し、時系列ボードの並び順で返す', () => {
    const result = searchCase(caseWithIdentifiers, '別荘の持ち主');

    // 前提: サンプルの5件の証言はすべて別荘の持ち主に言及し、加えた通話記録のメモだけが言及していない
    const timelineOrder = buildTimeline(caseWithIdentifiers).items.map((item) => item.view.claim.id);
    expect(result.claims.map((hit) => hit.view.claim.id)).toEqual(timelineOrder.filter((id) => id !== 'claim-phone-record'));
    expect(result.claims.every((hit) => hit.fields.includes('本文'))).toBe(true);
  });

  it('証言の見出しに一致した場合は、一致した項目として見出しを示す', () => {
    const result = searchCase(caseWithIdentifiers, '通話記録');

    expect(result.claims).toEqual([{ view: expect.objectContaining({ claim: expect.objectContaining({ id: 'claim-phone-record' }) }), fields: ['見出し'] }]);
  });

  it('人物の名前・別名・メモ・識別子と、場所の名前・メモを検索する', () => {
    expect(searchCase(caseWithIdentifiers, '元管理人').persons).toEqual([
      { person: expect.objectContaining({ id: 'person-caretaker' }), fields: ['別名'] },
    ]);
    expect(searchCase(caseWithIdentifiers, '道路に設置').persons.map((hit) => hit.person.id)).toEqual(['person-road-camera']);
    expect(searchCase(caseWithIdentifiers, '品川300あ1234').persons).toEqual([
      { person: expect.objectContaining({ id: 'person-owner' }), fields: ['識別子'] },
    ]);
    expect(searchCase(caseWithIdentifiers, '湖畔の別荘').places).toEqual([
      { place: expect.objectContaining({ id: 'place-villa' }), fields: ['名前'] },
    ]);
  });

  it('識別子の値で検索すると、表記の違う値を本文に含む証言と、その識別子を持つ人物をたどれる', () => {
    const result = searchCase(caseWithIdentifiers, '090-1234-5678');

    expect(result.claims.map((hit) => hit.view.claim.id)).toEqual(['claim-phone-record']);
    expect(result.persons.map((hit) => hit.person.id)).toEqual(['person-owner', 'person-caretaker']);
  });

  it('空白やハイフンだけの検索語では、何も返さない', () => {
    expect(searchCase(caseWithIdentifiers, ' - ')).toEqual({ claims: [], persons: [], places: [] });
  });
});
