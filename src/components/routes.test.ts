/**
 * 画面のURLを組み立てる関数のテスト
 */
import { describe, expect, it } from 'vitest';
import {
  boardHref,
  casesHref,
  claimHref,
  hypothesisHref,
  interviewHref,
  mentionHref,
  newHypothesisHref,
  newInterviewHref,
  newPersonHref,
  newPlaceHref,
  newTaskHref,
  parseTaskLink,
  parseDetailKind,
  parseTab,
  personHref,
  placeHref,
  searchHref,
  taskHref,
} from './routes';

/** テストで使うケースのIDです。 */
const caseId = 'case-villa';

describe('parseTab', () => {
  it('URLの tab の値を、ボードのタブとして読み取る', () => {
    expect(parseTab('map')).toBe('map');
    expect(parseTab('speaker')).toBe('speaker');
    expect(parseTab('lanes')).toBe('lanes');
    expect(parseTab('hypotheses')).toBe('hypotheses');
    expect(parseTab('tasks')).toBe('tasks');
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
    expect(boardHref(caseId, 'timeline')).toBe('/cases/case-villa');
  });

  it('時系列以外のタブは、tab をクエリに持たせる', () => {
    expect(boardHref(caseId, 'map')).toBe('/cases/case-villa?tab=map');
  });

  it('ケースのIDに含まれる記号は、URLとして安全な形に変換する', () => {
    expect(boardHref('a/b', 'timeline')).toBe('/cases/a%2Fb');
  });
});

describe('claimHref', () => {
  it('証言の詳細ページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(claimHref(caseId, 'claim-neighbor', 'timeline')).toBe('/cases/case-villa/claims/claim-neighbor');
    expect(claimHref(caseId, 'claim-neighbor', 'map')).toBe('/cases/case-villa/claims/claim-neighbor?tab=map');
  });

  it('IDに含まれる記号は、URLとして安全な形に変換する', () => {
    expect(claimHref(caseId, 'a/b', 'timeline')).toBe('/cases/case-villa/claims/a%2Fb');
  });
});

describe('personHref', () => {
  it('人物の詳細ページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(personHref(caseId, 'person-neighbor', 'timeline')).toBe('/cases/case-villa/persons/person-neighbor');
    expect(personHref(caseId, 'person-neighbor', 'speaker')).toBe(
      '/cases/case-villa/persons/person-neighbor?tab=speaker'
    );
  });

  it('IDに含まれる記号は、URLとして安全な形に変換する', () => {
    expect(personHref(caseId, 'a/b', 'timeline')).toBe('/cases/case-villa/persons/a%2Fb');
  });
});

describe('placeHref', () => {
  it('場所の詳細ページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(placeHref(caseId, 'place-villa', 'timeline')).toBe('/cases/case-villa/places/place-villa');
    expect(placeHref(caseId, 'place-villa', 'map')).toBe('/cases/case-villa/places/place-villa?tab=map');
  });

  it('IDに含まれる記号は、URLとして安全な形に変換する', () => {
    expect(placeHref(caseId, 'a/b', 'timeline')).toBe('/cases/case-villa/places/a%2Fb');
  });
});

describe('mentionHref', () => {
  it('メンションの種類に応じて、人物・場所の詳細ページのURLを返す', () => {
    expect(mentionHref(caseId, 'person', 'person-neighbor', 'map')).toBe(
      '/cases/case-villa/persons/person-neighbor?tab=map'
    );
    expect(mentionHref(caseId, 'place', 'place-villa', 'map')).toBe('/cases/case-villa/places/place-villa?tab=map');
  });
});

describe('newPersonHref・newPlaceHref', () => {
  it('人物・場所を新しく登録するページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(newPersonHref(caseId, 'timeline')).toBe('/cases/case-villa/persons/new');
    expect(newPersonHref(caseId, 'map')).toBe('/cases/case-villa/persons/new?tab=map');
    expect(newPlaceHref(caseId, 'timeline')).toBe('/cases/case-villa/places/new');
    expect(newPlaceHref(caseId, 'speaker')).toBe('/cases/case-villa/places/new?tab=speaker');
  });

  it('登録のURLは、IDが「new」の人物・場所の詳細より優先される', () => {
    // 前提: IDが「new」のエンティティは、アプリが振るID（nanoid）では生まれない。
    // 読み込んだJSONに書かれていた場合だけ起こりうる衝突で、そのときは登録のページが優先される。
    // Next.js が静的なセグメント（new）を動的なセグメント（[personId]）より優先するため、判定もそれに合わせる。
    expect(parseDetailKind(personHref(caseId, 'new', 'timeline'))).toBe('newPerson');
    expect(parseDetailKind(personHref(caseId, 'person-neighbor', 'timeline'))).toBe('person');
    expect(parseDetailKind(newPersonHref(caseId, 'timeline'))).toBe('newPerson');
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

describe('hypothesisHref・newHypothesisHref', () => {
  it('仮説の詳細ページと登録ページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(hypothesisHref(caseId, 'hypothesis-caretaker', 'hypotheses')).toBe(
      '/cases/case-villa/hypotheses/hypothesis-caretaker?tab=hypotheses'
    );
    expect(newHypothesisHref(caseId, 'hypotheses')).toBe('/cases/case-villa/hypotheses/new?tab=hypotheses');
  });

  it('仮説の詳細・登録のURLから、開いている詳細の種類を読み取る', () => {
    expect(parseDetailKind('/cases/case-villa/hypotheses/hypothesis-caretaker')).toBe('hypothesis');
    expect(parseDetailKind('/cases/case-villa/hypotheses/new')).toBe('newHypothesis');
  });
});

describe('taskHref・newTaskHref', () => {
  it('未了事項の詳細ページと登録ページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(taskHref(caseId, 'task-camera', 'tasks')).toBe('/cases/case-villa/tasks/task-camera?tab=tasks');
    expect(newTaskHref(caseId, 'tasks')).toBe('/cases/case-villa/tasks/new?tab=tasks');
  });

  it('登録ページのURLに、最初からひもづける証言・人物・場所を持たせる', () => {
    expect(newTaskHref(caseId, 'timeline', { kind: 'claim', id: 'claim-caretaker' })).toBe(
      '/cases/case-villa/tasks/new?link=claim%3Aclaim-caretaker'
    );
    expect(newTaskHref(caseId, 'map', { kind: 'place', id: 'place-villa' })).toBe(
      '/cases/case-villa/tasks/new?tab=map&link=place%3Aplace-villa'
    );
  });

  it('未了事項の詳細・登録のURLから、開いている詳細の種類を読み取る', () => {
    expect(parseDetailKind('/cases/case-villa/tasks/task-camera')).toBe('task');
    expect(parseDetailKind('/cases/case-villa/tasks/new')).toBe('newTask');
  });
});

describe('interviewHref・newInterviewHref', () => {
  it('資料の詳細ページと登録ページのURLに、戻り先のタブを引き継ぐ', () => {
    expect(interviewHref(caseId, 'interview-book', 'graph')).toBe('/cases/case-villa/interviews/interview-book?tab=graph');
    expect(newInterviewHref(caseId, 'timeline')).toBe('/cases/case-villa/interviews/new');
  });

  it('資料の詳細・登録のURLから、開いている詳細の種類を読み取る', () => {
    expect(parseDetailKind('/cases/case-villa/interviews/interview-book')).toBe('interview');
    expect(parseDetailKind('/cases/case-villa/interviews/new')).toBe('newInterview');
  });
});

describe('parseTaskLink', () => {
  it('URLの link の値を、ひもづけ先の種類とIDとして読み取る', () => {
    expect(parseTaskLink('person:person-caretaker')).toEqual({ kind: 'person', id: 'person-caretaker' });
  });

  it('link が無い場合と、知らない種類の場合は undefined を返す', () => {
    // 前提: URLはユーザーが自由に書き換えられるため、知らない値でも画面を表示する
    expect(parseTaskLink(null)).toBeUndefined();
    expect(parseTaskLink('event:event-1')).toBeUndefined();
    expect(parseTaskLink('claim:')).toBeUndefined();
  });
});

describe('searchHref', () => {
  it('検索結果のページのURLに、検索語と戻り先のタブを持たせる', () => {
    expect(searchHref(caseId, '090-1234 5678', 'timeline')).toBe(`/cases/${caseId}/search?q=090-1234+5678`);
    expect(searchHref(caseId, '管理人', 'map')).toBe(`/cases/${caseId}/search?tab=map&q=%E7%AE%A1%E7%90%86%E4%BA%BA`);
  });

  it('検索結果のページのURLから、開いている詳細の種類を読み取る', () => {
    expect(parseDetailKind(`/cases/${caseId}/search`)).toBe('search');
  });
});
