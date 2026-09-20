/**
 * 案件ストア（追加・更新・削除・読み込み・ブラウザ保存）のテスト
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Claim } from '@/domain/types';
import { BACKUP_STORAGE_KEY, STORAGE_KEY, useCaseStore } from './useCaseStore';

const 新しい証言: Claim = {
  id: 'claim-postman',
  speaker: { kind: 'person', personId: 'person-neighbor' },
  sourceId: 'source-newspaper',
  content: '翌朝、別荘の郵便受けに新聞が残ったままだった。',
  mentionedPersonIds: ['person-owner'],
  assessment: 'unverified',
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
    useCaseStore.getState().upsert('claims', { ...sampleFictionalCase.claims[1]!, assessment: 'credible' });

    const claims = useCaseStore.getState().currentCase.claims;
    expect(claims).toHaveLength(sampleFictionalCase.claims.length);
    expect(claims.find((claim) => claim.id === 'claim-neighbor')?.assessment).toBe('credible');
  });

  it('存在しない人物を参照する主張はエラーにし、案件を変更しない', () => {
    const 不正な証言: Claim = { ...新しい証言, mentionedPersonIds: ['person-unknown'] };

    expect(() => useCaseStore.getState().upsert('claims', 不正な証言)).toThrow(
      '存在しない人物を参照しています: person-unknown'
    );
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
