/**
 * 案件ストア（案件の切り替え・追加・更新・削除・ブラウザ保存）のテスト
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case, Claim } from '@/domain/types';
import { CASE_KEY_PREFIX, listCaseSummaries, loadCase, saveCase } from '@/lib/case-storage';
import { useCaseStore } from './useCaseStore';

const 新しい証言: Claim = {
  id: 'claim-postman',
  speaker: { kind: 'person', personIds: ['person-neighbor'] },
  viaPersonIds: ['person-newspaper'],
  content: '翌朝、別荘の郵便受けに新聞が残ったままだった。',
  mentionedPersonIds: ['person-owner'],
};

/** 開いている案件を返します。開いていない場合はテストを失敗させます。 */
function 開いている案件(): Case {
  const { currentCase } = useCaseStore.getState();
  if (currentCase === null) throw new Error('案件が開かれていません');
  return currentCase;
}

beforeEach(() => {
  localStorage.clear();
  saveCase(sampleFictionalCase);
  useCaseStore.getState().openCase(sampleFictionalCase.id);
});

describe('openCase', () => {
  it('保存済みの案件を開く', () => {
    expect(開いている案件()).toEqual(sampleFictionalCase);
    expect(useCaseStore.getState().loadError).toBeNull();
  });

  it('保存されていないIDを開こうとすると、案件を開かずに理由を示す', () => {
    useCaseStore.getState().openCase('case-unknown');

    expect(useCaseStore.getState().currentCase).toBeNull();
    expect(useCaseStore.getState().loadError).toContain('案件が見つかりません');
  });

  it('保存データが検証に失敗した場合は、案件を開かずに理由を示す', () => {
    localStorage.setItem(`${CASE_KEY_PREFIX}case-broken`, '{"id":"case-broken"}');

    useCaseStore.getState().openCase('case-broken');

    expect(useCaseStore.getState().currentCase).toBeNull();
    expect(useCaseStore.getState().loadError).toContain('案件データの形式が正しくありません');
  });
});

describe('createCase', () => {
  it('空の案件を作って保存し、そのIDを返す', () => {
    const 新しい案件のId = useCaseStore.getState().createCase('湖畔の別荘の事件');

    expect(loadCase(新しい案件のId).name).toBe('湖畔の別荘の事件');
    expect(listCaseSummaries().map((summary) => summary.id)).toContain(新しい案件のId);
  });

  it('作っただけでは、開いている案件を切り替えない', () => {
    useCaseStore.getState().createCase('湖畔の別荘の事件');

    expect(開いている案件().id).toBe(sampleFictionalCase.id);
  });
});

describe('importCase', () => {
  it('読み込んだ案件を、新しい案件として保存する', () => {
    const 読み込んだ案件: Case = { ...sampleFictionalCase, id: 'case-imported', name: '受け取った案件' };

    const 案件のId = useCaseStore.getState().importCase(読み込んだ案件);

    expect(案件のId).toBe('case-imported');
    expect(loadCase('case-imported').name).toBe('受け取った案件');
  });

  it('保存済みの案件とIDが重なる場合は、新しいIDを振って追加し、元の案件を上書きしない', () => {
    const 同じIDの案件: Case = { ...sampleFictionalCase, name: '別の人から受け取った案件' };

    const 案件のId = useCaseStore.getState().importCase(同じIDの案件);

    expect(案件のId).not.toBe(sampleFictionalCase.id);
    expect(loadCase(sampleFictionalCase.id).name).toBe(sampleFictionalCase.name);
    expect(loadCase(案件のId).name).toBe('別の人から受け取った案件');
  });

  it('検証に失敗するデータは受け付けず、案件を追加しない', () => {
    expect(() => useCaseStore.getState().importCase({ name: '項目が足りない案件' })).toThrow(
      '案件データの形式が正しくありません'
    );
    expect(listCaseSummaries()).toHaveLength(1);
  });
});

describe('deleteCase', () => {
  it('案件を保存から消し、一覧からも取り除く', () => {
    useCaseStore.getState().deleteCase(sampleFictionalCase.id);

    expect(listCaseSummaries()).toEqual([]);
  });

  it('開いている案件を消した場合は、開いている案件を空にする', () => {
    useCaseStore.getState().deleteCase(sampleFictionalCase.id);

    expect(useCaseStore.getState().currentCase).toBeNull();
  });

  it('開いていない案件を消しても、開いている案件はそのままにする', () => {
    const 別の案件のId = useCaseStore.getState().createCase('別の案件');

    useCaseStore.getState().deleteCase(別の案件のId);

    expect(開いている案件().id).toBe(sampleFictionalCase.id);
  });
});

describe('案件の一覧', () => {
  it('案件を作ると、一覧に加える', () => {
    useCaseStore.getState().createCase('湖畔の別荘の事件');

    expect(useCaseStore.getState().summaries.map((summary) => summary.name)).toContain('湖畔の別荘の事件');
  });

  it('案件名を変えると、一覧の名前も変える', () => {
    useCaseStore.getState().renameCase('改名した案件');

    expect(useCaseStore.getState().summaries.map((summary) => summary.name)).toContain('改名した案件');
  });
});

describe('upsert', () => {
  it('新しいIDの証言を追加する', () => {
    useCaseStore.getState().upsert('claims', 新しい証言);

    expect(開いている案件().claims).toHaveLength(sampleFictionalCase.claims.length + 1);
  });

  it('既存のIDの証言は、追加せずに置き換える', () => {
    useCaseStore.getState().upsert('claims', { ...sampleFictionalCase.claims[1]!, locator: '社会面 3段目' });

    const claims = 開いている案件().claims;
    expect(claims).toHaveLength(sampleFictionalCase.claims.length);
    expect(claims.find((claim) => claim.id === 'claim-neighbor')?.locator).toBe('社会面 3段目');
  });

  it('存在しない人物を参照する証言はエラーにし、案件を変更しない', () => {
    const 不正な証言: Claim = { ...新しい証言, mentionedPersonIds: ['person-unknown'] };

    expect(() => useCaseStore.getState().upsert('claims', 不正な証言)).toThrow(
      '存在しない人物を参照しています: person-unknown'
    );
    expect(開いている案件()).toEqual(sampleFictionalCase);
  });

  it('案件を開いていない場合はエラーにする', () => {
    useCaseStore.getState().closeCase();

    expect(() => useCaseStore.getState().upsert('claims', 新しい証言)).toThrow('案件が開かれていません');
  });
});

describe('upsertMany', () => {
  it('新しい人物と、その人物に言及する証言を、1回の検証でまとめて追加する', () => {
    const 郵便配達員 = { id: 'person-postman', name: '郵便配達員' };
    const 配達員への言及: Claim = { ...新しい証言, mentionedPersonIds: ['person-postman'] };

    useCaseStore.getState().upsertMany([
      { key: 'persons', entity: 郵便配達員 },
      { key: 'claims', entity: 配達員への言及 },
    ]);

    const { persons, claims } = 開いている案件();
    expect(persons).toContainEqual(郵便配達員);
    expect(claims).toContainEqual(配達員への言及);
  });

  it('1件でも規則に違反する場合は、どの要素も追加しない', () => {
    const 郵便配達員 = { id: 'person-postman', name: '郵便配達員' };
    const 不正な証言: Claim = { ...新しい証言, mentionedPersonIds: ['person-unknown'] };

    expect(() =>
      useCaseStore.getState().upsertMany([
        { key: 'persons', entity: 郵便配達員 },
        { key: 'claims', entity: 不正な証言 },
      ])
    ).toThrow('存在しない人物を参照しています: person-unknown');
    expect(開いている案件()).toEqual(sampleFictionalCase);
  });
});

describe('remove', () => {
  it('どこからも参照されていない証言を削除する', () => {
    useCaseStore.getState().remove('claims', 'claim-report');

    const ids = 開いている案件().claims.map((claim) => claim.id);
    expect(ids).not.toContain('claim-report');
  });

  it('証言の経由としてだけ参照されている人物（媒体）も削除できず、案件を変更しない', () => {
    // 前提: 書籍「湖畔の夏」は、管理人の証言の経由としてだけ参照されている（発言者でも、本文のメンションでもない）
    expect(() => useCaseStore.getState().remove('persons', 'person-book')).toThrow(
      '他のデータから参照されているため削除できません'
    );
    expect(開いている案件()).toEqual(sampleFictionalCase);
  });

  it('証言から参照されている人物は削除できず、案件を変更しない', () => {
    expect(() => useCaseStore.getState().remove('persons', 'person-owner')).toThrow(
      '他のデータから参照されているため削除できません'
    );
    expect(開いている案件()).toEqual(sampleFictionalCase);
  });
});

describe('remove（メモのメンション）', () => {
  it('他のエンティティのメモで言及されているだけの場所も削除できず、案件を変更しない', () => {
    // 前提: 湖畔駅は証言からは参照されておらず、管理人のメモだけが言及している
    useCaseStore.getState().upsertMany([
      { key: 'places', entity: { id: 'place-station', name: '湖畔駅' } },
      {
        key: 'persons',
        entity: { id: 'person-caretaker', name: '管理人', note: '@[湖畔駅](place:place-station)の近くに住んでいる。' },
      },
    ]);
    const 削除前の案件 = 開いている案件();

    expect(() => useCaseStore.getState().remove('places', 'place-station')).toThrow(
      '他のデータから参照されているため削除できません'
    );
    expect(開いている案件()).toEqual(削除前の案件);
  });
});

describe('ブラウザへの保存', () => {
  it('案件を変更すると、その案件のキーへ保存する', () => {
    useCaseStore.getState().upsert('claims', 新しい証言);

    expect(loadCase(sampleFictionalCase.id).claims.map((claim) => claim.id)).toContain('claim-postman');
  });

  it('開いていない案件は書き換えない', () => {
    const 別の案件のId = useCaseStore.getState().createCase('別の案件');

    useCaseStore.getState().upsert('claims', 新しい証言);

    expect(loadCase(別の案件のId).claims).toEqual([]);
  });
});

describe('時系列ボードの並び順', () => {
  /** 警察の捜索（8月15日）についての証言です。 */
  const 捜索の推測: Claim = {
    id: 'claim-police-search',
    speaker: { kind: 'user' },
    viaPersonIds: [],
    content: '警察が別荘を捜索したはずだ。',
    mentionedPersonIds: [],
    when: '1998-08-15',
  };

  it('項目を動かすと、並び順を保存する', () => {
    // 前提: サンプルの並びは、管理人 → 防犯カメラ → 隣家の住人 → 架空日報 → ユーザーの推測（日時なし）
    useCaseStore.getState().moveTimelineItem('claim:claim-user-guess', 0);

    expect(開いている案件().timelineOrder).toEqual([
      'claim:claim-user-guess',
      'claim:claim-caretaker',
      'claim:claim-police-camera',
      'claim:claim-neighbor',
      'claim:claim-report',
    ]);
  });

  it('日時と矛盾する位置へは動かせず、案件を変更しない', () => {
    // 前提: サンプルの証言は8月12日、捜索の推測は8月15日について述べている
    useCaseStore.getState().upsert('claims', 捜索の推測);
    const 変更前 = 開いている案件();

    expect(() => useCaseStore.getState().moveTimelineItem('claim:claim-police-search', 0)).toThrow('日時と矛盾するため');
    expect(開いている案件()).toBe(変更前);
  });

  it('証言に日時を入力して現在の位置と矛盾した場合は、最も近い矛盾しない位置へ動かす', () => {
    // 前提: 並びは サンプルの証言（8月12日）→ ユーザーの推測（日時なし）→ 捜索の推測（8月15日）
    useCaseStore.getState().upsert('claims', 捜索の推測);

    // 末尾の捜索の推測の日時を、サンプルの証言より前の「8月10日」に直す
    useCaseStore.getState().upsert('claims', { ...捜索の推測, when: '1998-08-10' });

    expect(開いている案件().timelineOrder).toEqual([
      'claim:claim-police-search',
      'claim:claim-caretaker',
      'claim:claim-police-camera',
      'claim:claim-neighbor',
      'claim:claim-report',
      'claim:claim-user-guess',
    ]);
  });
});
