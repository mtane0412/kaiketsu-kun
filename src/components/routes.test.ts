/**
 * 画面のURLを組み立てる関数のテスト
 */
import { describe, expect, it } from 'vitest';
import { boardHref, casesHref, claimHref, mentionHref, parseTab, personHref, placeHref } from './routes';

/** テストで使う案件のIDです。 */
const 案件のId = 'case-villa';

describe('parseTab', () => {
  it('URLの tab の値を、ボードのタブとして読み取る', () => {
    expect(parseTab('map')).toBe('map');
    expect(parseTab('speaker')).toBe('speaker');
  });

  it('tab が無い場合と、知らない値の場合は、時系列のタブとして扱う', () => {
    // 前提: URLはユーザーが自由に書き換えられるため、知らない値でも画面を表示する
    expect(parseTab(null)).toBe('timeline');
    expect(parseTab('存在しないタブ')).toBe('timeline');
  });
});

describe('casesHref', () => {
  it('案件の一覧ページのURLを返す', () => {
    expect(casesHref()).toBe('/');
  });
});

describe('boardHref', () => {
  it('時系列のタブは、クエリの無いURLにする', () => {
    expect(boardHref(案件のId, 'timeline')).toBe('/cases/case-villa');
  });

  it('時系列以外のタブは、tab をクエリに持たせる', () => {
    expect(boardHref(案件のId, 'map')).toBe('/cases/case-villa?tab=map');
  });

  it('案件のIDに含まれる記号は、URLとして安全な形に変換する', () => {
    expect(boardHref('a/b', 'timeline')).toBe('/cases/a%2Fb');
  });
});

describe('claimHref', () => {
  it('証言の詳細ページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(claimHref(案件のId, 'claim-neighbor', 'timeline')).toBe('/cases/case-villa/claims/claim-neighbor');
    expect(claimHref(案件のId, 'claim-neighbor', 'map')).toBe('/cases/case-villa/claims/claim-neighbor?tab=map');
  });

  it('IDに含まれる記号は、URLとして安全な形に変換する', () => {
    expect(claimHref(案件のId, 'a/b', 'timeline')).toBe('/cases/case-villa/claims/a%2Fb');
  });
});

describe('personHref', () => {
  it('人物の詳細ページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(personHref(案件のId, 'person-neighbor', 'timeline')).toBe('/cases/case-villa/persons/person-neighbor');
    expect(personHref(案件のId, 'person-neighbor', 'speaker')).toBe(
      '/cases/case-villa/persons/person-neighbor?tab=speaker'
    );
  });

  it('IDに含まれる記号は、URLとして安全な形に変換する', () => {
    expect(personHref(案件のId, 'a/b', 'timeline')).toBe('/cases/case-villa/persons/a%2Fb');
  });
});

describe('placeHref', () => {
  it('場所の詳細ページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(placeHref(案件のId, 'place-villa', 'timeline')).toBe('/cases/case-villa/places/place-villa');
    expect(placeHref(案件のId, 'place-villa', 'map')).toBe('/cases/case-villa/places/place-villa?tab=map');
  });

  it('IDに含まれる記号は、URLとして安全な形に変換する', () => {
    expect(placeHref(案件のId, 'a/b', 'timeline')).toBe('/cases/case-villa/places/a%2Fb');
  });
});

describe('mentionHref', () => {
  it('メンションの種類に応じて、人物・場所の詳細ページのURLを返す', () => {
    expect(mentionHref(案件のId, 'person', 'person-neighbor', 'map')).toBe(
      '/cases/case-villa/persons/person-neighbor?tab=map'
    );
    expect(mentionHref(案件のId, 'place', 'place-villa', 'map')).toBe('/cases/case-villa/places/place-villa?tab=map');
  });
});
