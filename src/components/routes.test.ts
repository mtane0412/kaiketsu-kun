/**
 * 画面のURLを組み立てる関数のテスト
 */
import { describe, expect, it } from 'vitest';
import {
  boardHref,
  casesHref,
  claimHref,
  mentionHref,
  newPersonHref,
  newPlaceHref,
  parseDetailKind,
  parseTab,
  personHref,
  placeHref,
  withTab,
} from './routes';

/** テストで使うケースのIDです。 */
const ケースのId = 'case-villa';

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
  it('ケースの一覧ページのURLを返す', () => {
    expect(casesHref()).toBe('/');
  });
});

describe('boardHref', () => {
  it('時系列のタブは、クエリの無いURLにする', () => {
    expect(boardHref(ケースのId, 'timeline')).toBe('/cases/case-villa');
  });

  it('時系列以外のタブは、tab をクエリに持たせる', () => {
    expect(boardHref(ケースのId, 'map')).toBe('/cases/case-villa?tab=map');
  });

  it('ケースのIDに含まれる記号は、URLとして安全な形に変換する', () => {
    expect(boardHref('a/b', 'timeline')).toBe('/cases/a%2Fb');
  });
});

describe('claimHref', () => {
  it('証言の詳細ページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(claimHref(ケースのId, 'claim-neighbor', 'timeline')).toBe('/cases/case-villa/claims/claim-neighbor');
    expect(claimHref(ケースのId, 'claim-neighbor', 'map')).toBe('/cases/case-villa/claims/claim-neighbor?tab=map');
  });

  it('IDに含まれる記号は、URLとして安全な形に変換する', () => {
    expect(claimHref(ケースのId, 'a/b', 'timeline')).toBe('/cases/case-villa/claims/a%2Fb');
  });
});

describe('personHref', () => {
  it('人物の詳細ページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(personHref(ケースのId, 'person-neighbor', 'timeline')).toBe('/cases/case-villa/persons/person-neighbor');
    expect(personHref(ケースのId, 'person-neighbor', 'speaker')).toBe(
      '/cases/case-villa/persons/person-neighbor?tab=speaker'
    );
  });

  it('IDに含まれる記号は、URLとして安全な形に変換する', () => {
    expect(personHref(ケースのId, 'a/b', 'timeline')).toBe('/cases/case-villa/persons/a%2Fb');
  });
});

describe('placeHref', () => {
  it('場所の詳細ページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(placeHref(ケースのId, 'place-villa', 'timeline')).toBe('/cases/case-villa/places/place-villa');
    expect(placeHref(ケースのId, 'place-villa', 'map')).toBe('/cases/case-villa/places/place-villa?tab=map');
  });

  it('IDに含まれる記号は、URLとして安全な形に変換する', () => {
    expect(placeHref(ケースのId, 'a/b', 'timeline')).toBe('/cases/case-villa/places/a%2Fb');
  });
});

describe('mentionHref', () => {
  it('メンションの種類に応じて、人物・場所の詳細ページのURLを返す', () => {
    expect(mentionHref(ケースのId, 'person', 'person-neighbor', 'map')).toBe(
      '/cases/case-villa/persons/person-neighbor?tab=map'
    );
    expect(mentionHref(ケースのId, 'place', 'place-villa', 'map')).toBe('/cases/case-villa/places/place-villa?tab=map');
  });
});

describe('newPersonHref・newPlaceHref', () => {
  it('人物・場所を新しく登録するページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(newPersonHref(ケースのId, 'timeline')).toBe('/cases/case-villa/persons/new');
    expect(newPersonHref(ケースのId, 'map')).toBe('/cases/case-villa/persons/new?tab=map');
    expect(newPlaceHref(ケースのId, 'timeline')).toBe('/cases/case-villa/places/new');
    expect(newPlaceHref(ケースのId, 'speaker')).toBe('/cases/case-villa/places/new?tab=speaker');
  });

  it('登録のURLは、IDが「new」の人物・場所の詳細より優先される', () => {
    // 前提: IDが「new」のエンティティは、アプリが振るID（nanoid）では生まれない。
    // 読み込んだJSONに書かれていた場合だけ起こりうる衝突で、そのときは登録のページが優先される。
    // Next.js が静的なセグメント（new）を動的なセグメント（[personId]）より優先するため、判定もそれに合わせる。
    expect(parseDetailKind(personHref(ケースのId, 'new', 'timeline'))).toBe('newPerson');
    expect(parseDetailKind(personHref(ケースのId, 'person-neighbor', 'timeline'))).toBe('person');
    expect(parseDetailKind(newPersonHref(ケースのId, 'timeline'))).toBe('newPerson');
  });
});

describe('parseDetailKind', () => {
  it('証言・人物・場所の詳細のURLから、開いている詳細の種類を読み取る', () => {
    expect(parseDetailKind('/cases/case-villa/claims/claim-neighbor')).toBe('claim');
    expect(parseDetailKind('/cases/case-villa/persons/person-neighbor')).toBe('person');
    expect(parseDetailKind('/cases/case-villa/places/place-villa')).toBe('place');
  });

  it('人物・場所を新しく登録するURLから、登録の種類を読み取る', () => {
    expect(parseDetailKind('/cases/case-villa/persons/new')).toBe('newPerson');
    expect(parseDetailKind('/cases/case-villa/places/new')).toBe('newPlace');
  });

  it('ボードのURLと、詳細ではないURLでは undefined を返す', () => {
    expect(parseDetailKind('/cases/case-villa')).toBeUndefined();
    expect(parseDetailKind('/')).toBeUndefined();
    expect(parseDetailKind('/cases/case-villa/claims')).toBeUndefined();
  });
});

describe('withTab', () => {
  it('詳細のURLに、開いているタブをクエリとして付け直す', () => {
    // 検証: 詳細を開いたままタブだけを切り替えるために使う
    expect(withTab('/cases/case-villa/claims/claim-neighbor', 'map')).toBe(
      '/cases/case-villa/claims/claim-neighbor?tab=map'
    );
    expect(withTab('/cases/case-villa/claims/claim-neighbor', 'timeline')).toBe(
      '/cases/case-villa/claims/claim-neighbor'
    );
  });
});
