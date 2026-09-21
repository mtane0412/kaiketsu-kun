/**
 * 案件ストア（追加・更新・削除・読み込み・ブラウザ保存）のテスト
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Claim } from '@/domain/types';
import { BACKUP_STORAGE_KEY, STORAGE_KEY, useCaseStore } from './useCaseStore';

const 新しい証言: Claim = {
  id: 'claim-postman',
  speaker: { kind: 'person', personIds: ['person-neighbor'] },
  viaPersonIds: ['person-newspaper'],
  content: '翌朝、別荘の郵便受けに新聞が残ったままだった。',
  mentionedPersonIds: ['person-owner'],
};

beforeEach(() => {
  useCaseStore.getState().replaceCase(sampleFictionalCase);
});

describe('upsert', () => {
  it('新しいIDの証言を追加する', () => {
    useCaseStore.getState().upsert('claims', 新しい証言);

    expect(useCaseStore.getState().currentCase.claims).toHaveLength(sampleFictionalCase.claims.length + 1);
  });

  it('既存のIDの証言は、追加せずに置き換える', () => {
    useCaseStore.getState().upsert('claims', { ...sampleFictionalCase.claims[1]!, locator: '社会面 3段目' });

    const claims = useCaseStore.getState().currentCase.claims;
    expect(claims).toHaveLength(sampleFictionalCase.claims.length);
    expect(claims.find((claim) => claim.id === 'claim-neighbor')?.locator).toBe('社会面 3段目');
  });

  it('存在しない人物を参照する証言はエラーにし、案件を変更しない', () => {
    const 不正な証言: Claim = { ...新しい証言, mentionedPersonIds: ['person-unknown'] };

    expect(() => useCaseStore.getState().upsert('claims', 不正な証言)).toThrow(
      '存在しない人物を参照しています: person-unknown'
    );
    expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase);
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

    const { persons, claims } = useCaseStore.getState().currentCase;
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
    expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase);
  });
});

describe('remove', () => {
  it('どこからも参照されていない証言を削除する', () => {
    useCaseStore.getState().remove('claims', 'claim-report');

    const ids = useCaseStore.getState().currentCase.claims.map((claim) => claim.id);
    expect(ids).not.toContain('claim-report');
  });

  it('証言の経由としてだけ参照されている人物（媒体）も削除できず、案件を変更しない', () => {
    // 前提: 書籍「湖畔の夏」は、管理人の証言の経由としてだけ参照されている（発言者でも、本文のメンションでもない）
    expect(() => useCaseStore.getState().remove('persons', 'person-book')).toThrow(
      '他のデータから参照されているため削除できません'
    );
    expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase);
  });

  it('証言から参照されている人物は削除できず、案件を変更しない', () => {
    expect(() => useCaseStore.getState().remove('persons', 'person-owner')).toThrow(
      '他のデータから参照されているため削除できません'
    );
    expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase);
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
    const 削除前の案件 = useCaseStore.getState().currentCase;

    expect(() => useCaseStore.getState().remove('places', 'place-station')).toThrow(
      '他のデータから参照されているため削除できません'
    );
    expect(useCaseStore.getState().currentCase).toEqual(削除前の案件);
  });
});

describe('replaceCase', () => {
  it('検証に失敗するデータは受け付けず、案件を変更しない', () => {
    expect(() => useCaseStore.getState().replaceCase({ name: '項目が足りない案件' })).toThrow(
      '案件データの形式が正しくありません'
    );
    expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase);
  });
});

describe('resetCase', () => {
  it('新しいIDを持つ空の案件に置き換える', () => {
    useCaseStore.getState().resetCase();

    const { currentCase } = useCaseStore.getState();
    expect(currentCase.id).not.toBe(sampleFictionalCase.id);
    expect(currentCase.claims).toEqual([]);
    expect(currentCase.persons).toEqual([]);
  });
});

describe('ブラウザへの保存', () => {
  it('案件を変更すると、LocalStorageに保存する', () => {
    useCaseStore.getState().upsert('claims', 新しい証言);

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(saved.state.currentCase.claims.map((claim: Claim) => claim.id)).toContain('claim-postman');
  });

  it('保存済みの案件を読み込んで復元する', async () => {
    const 保存済みの案件 = { ...sampleFictionalCase, name: '保存済みの案件' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { currentCase: 保存済みの案件 }, version: 0 }));

    await useCaseStore.persist.rehydrate();

    expect(useCaseStore.getState().currentCase.name).toBe('保存済みの案件');
    expect(useCaseStore.getState().loadError).toBeNull();
  });

  it('保存済みのデータが無い初回起動では、読み込みエラーを示さず、退避も行わない', async () => {
    useCaseStore.getState().resetCase();
    localStorage.clear();

    await useCaseStore.persist.rehydrate();

    expect(useCaseStore.getState().loadError).toBeNull();
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBeNull();
  });

  it('保存済みのデータが検証に失敗した場合は、退避用のキーに保管して読み込みエラーを示す', async () => {
    const 壊れた保存データ = { state: { currentCase: { name: '古い形式の案件' } }, version: 0 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(壊れた保存データ));

    await useCaseStore.persist.rehydrate();

    expect(useCaseStore.getState().loadError).toContain('案件データの形式が正しくありません');
    expect(JSON.parse(localStorage.getItem(BACKUP_STORAGE_KEY) ?? 'null')).toEqual({ name: '古い形式の案件' });
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

    expect(useCaseStore.getState().currentCase.timelineOrder).toEqual([
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
    const 変更前 = useCaseStore.getState().currentCase;

    expect(() => useCaseStore.getState().moveTimelineItem('claim:claim-police-search', 0)).toThrow('日時と矛盾するため');
    expect(useCaseStore.getState().currentCase).toBe(変更前);
  });

  it('証言に日時を入力して現在の位置と矛盾した場合は、最も近い矛盾しない位置へ動かす', () => {
    // 前提: 並びは サンプルの証言（8月12日）→ ユーザーの推測（日時なし）→ 捜索の推測（8月15日）
    useCaseStore.getState().upsert('claims', 捜索の推測);

    // 末尾の捜索の推測の日時を、サンプルの証言より前の「8月10日」に直す
    useCaseStore.getState().upsert('claims', { ...捜索の推測, when: '1998-08-10' });

    expect(useCaseStore.getState().currentCase.timelineOrder).toEqual([
      'claim:claim-police-search',
      'claim:claim-caretaker',
      'claim:claim-police-camera',
      'claim:claim-neighbor',
      'claim:claim-report',
      'claim:claim-user-guess',
    ]);
  });
});
