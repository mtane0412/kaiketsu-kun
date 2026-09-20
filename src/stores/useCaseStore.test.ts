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
  sourceId: 'source-newspaper',
  content: '翌朝、別荘の郵便受けに新聞が残ったままだった。',
  mentionedPersonIds: ['person-owner'],
};

beforeEach(() => {
  useCaseStore.getState().replaceCase(sampleFictionalCase);
});

describe('upsert', () => {
  it('新しいIDの主張を追加する', () => {
    useCaseStore.getState().upsert('claims', 新しい証言);

    expect(useCaseStore.getState().currentCase.claims).toHaveLength(sampleFictionalCase.claims.length + 1);
  });

  it('既存のIDの主張は、追加せずに置き換える', () => {
    useCaseStore.getState().upsert('claims', { ...sampleFictionalCase.claims[1]!, locator: '社会面 3段目' });

    const claims = useCaseStore.getState().currentCase.claims;
    expect(claims).toHaveLength(sampleFictionalCase.claims.length);
    expect(claims.find((claim) => claim.id === 'claim-neighbor')?.locator).toBe('社会面 3段目');
  });

  it('存在しない人物を参照する主張はエラーにし、案件を変更しない', () => {
    const 不正な証言: Claim = { ...新しい証言, mentionedPersonIds: ['person-unknown'] };

    expect(() => useCaseStore.getState().upsert('claims', 不正な証言)).toThrow(
      '存在しない人物を参照しています: person-unknown'
    );
    expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase);
  });
});

describe('upsertMany', () => {
  it('新しい人物と、その人物に言及する主張を、1回の検証でまとめて追加する', () => {
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
  it('どこからも参照されていない主張を削除する', () => {
    useCaseStore.getState().remove('claims', 'claim-report');

    const ids = useCaseStore.getState().currentCase.claims.map((claim) => claim.id);
    expect(ids).not.toContain('claim-report');
  });

  it('主張から参照されている人物は削除できず、案件を変更しない', () => {
    expect(() => useCaseStore.getState().remove('persons', 'person-owner')).toThrow(
      '他のデータから参照されているため削除できません'
    );
    expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase);
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
  /** 警察の捜索（8月15日）についての、出来事に束ねていない主張です。 */
  const 捜索の推測: Claim = {
    id: 'claim-police-search',
    speaker: { kind: 'user' },
    content: '警察が別荘を捜索したはずだ。',
    mentionedPersonIds: [],
    when: { text: '8月15日', earliest: '1998-08-15' },
  };

  it('項目を動かすと、並び順を保存する', () => {
    // 前提: サンプルの並びは、出来事「持ち主が最後に目撃された」→ ユーザーの推測（日時なし）
    useCaseStore.getState().moveTimelineItem('claim:claim-user-guess', 0);

    expect(useCaseStore.getState().currentCase.timelineOrder).toEqual(['claim:claim-user-guess', 'event:event-last-seen']);
  });

  it('日時と矛盾する位置へは動かせず、案件を変更しない', () => {
    // 前提: 出来事の束は8月12日、捜索の推測は8月15日について述べている
    useCaseStore.getState().upsert('claims', 捜索の推測);
    const 変更前 = useCaseStore.getState().currentCase;

    expect(() => useCaseStore.getState().moveTimelineItem('claim:claim-police-search', 0)).toThrow('日時と矛盾するため');
    expect(useCaseStore.getState().currentCase).toBe(変更前);
  });

  it('主張に日時を入力して現在の位置と矛盾した場合は、最も近い矛盾しない位置へ動かす', () => {
    // 前提: 並びは 出来事の束（8月12日）→ ユーザーの推測（日時なし）→ 捜索の推測（8月15日）
    useCaseStore.getState().upsert('claims', 捜索の推測);
    useCaseStore.getState().moveTimelineItem('claim:claim-police-search', 2);

    // 末尾の捜索の推測の日時を、出来事の束より前の「8月10日」に直す
    useCaseStore.getState().upsert('claims', { ...捜索の推測, when: { text: '8月10日', earliest: '1998-08-10' } });

    expect(useCaseStore.getState().currentCase.timelineOrder).toEqual([
      'claim:claim-police-search',
      'event:event-last-seen',
      'claim:claim-user-guess',
    ]);
  });

  it('出来事に束ねた主張の日時を直して、束の位置が矛盾した場合は、束を動かす', () => {
    // 前提: 並びは 出来事の束（8月12日）→ ユーザーの推測（日時なし）→ 捜索の推測（8月15日）
    useCaseStore.getState().upsert('claims', 捜索の推測);
    const 束ねた主張 = sampleFictionalCase.claims.filter((claim) => claim.eventId === 'event-last-seen');

    // 束ねた主張が述べる日時を、すべて捜索より後の「8月20日」に直す
    for (const claim of 束ねた主張) {
      if (claim.when) useCaseStore.getState().upsert('claims', { ...claim, when: { text: '8月20日', earliest: '1998-08-20' } });
    }

    expect(useCaseStore.getState().currentCase.timelineOrder).toEqual([
      'claim:claim-user-guess',
      'claim:claim-police-search',
      'event:event-last-seen',
    ]);
  });
});
