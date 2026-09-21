/**
 * 案件のブラウザ保存（複数案件）のテスト
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case } from '@/domain/types';
import {
  BACKUP_STORAGE_KEY,
  CASE_KEY_PREFIX,
  createEmptyCase,
  deleteCase,
  INDEX_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  listCaseSummaries,
  loadCase,
  migrateLegacyCase,
  saveCase,
} from './case-storage';

/** 更新日時の比較が安定するよう、保存のたびに進む時計を用意します。 */
function 時計を固定する(開始: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(開始));
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('createEmptyCase', () => {
  it('毎回異なるIDの、空の案件を作る', () => {
    const 一件目 = createEmptyCase();
    const 二件目 = createEmptyCase();

    expect(一件目.id).not.toBe(二件目.id);
    expect(一件目.claims).toEqual([]);
  });

  it('案件名を指定できる', () => {
    expect(createEmptyCase('別荘の事件').name).toBe('別荘の事件');
  });
});

describe('saveCase と loadCase', () => {
  it('保存した案件を、IDを指定して読み出せる', () => {
    saveCase(sampleFictionalCase);

    expect(loadCase(sampleFictionalCase.id)).toEqual(sampleFictionalCase);
  });

  it('案件ごとに別のキーへ保存する', () => {
    const 別の案件 = createEmptyCase('別の案件');
    saveCase(sampleFictionalCase);
    saveCase(別の案件);

    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${sampleFictionalCase.id}`)).not.toBeNull();
    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${別の案件.id}`)).not.toBeNull();
  });

  it('保存されていないIDを読み出すとエラーにする', () => {
    expect(() => loadCase('case-unknown')).toThrow('案件が見つかりません');
  });

  it('保存データの形式が正しくない場合は、退避してからエラーにする', () => {
    localStorage.setItem(`${CASE_KEY_PREFIX}case-broken`, '{"id":"case-broken"}');

    expect(() => loadCase('case-broken')).toThrow('案件データの形式が正しくありません');
    expect(localStorage.getItem(`${BACKUP_STORAGE_KEY}:case-broken`)).toBe('{"id":"case-broken"}');
  });
});

describe('listCaseSummaries', () => {
  it('保存が無い場合は空の一覧を返す', () => {
    expect(listCaseSummaries()).toEqual([]);
  });

  it('案件名・証言の件数・更新日時を返す', () => {
    時計を固定する('2026-09-21T10:00:00.000Z');
    saveCase(sampleFictionalCase);

    expect(listCaseSummaries()).toEqual([
      {
        id: sampleFictionalCase.id,
        name: sampleFictionalCase.name,
        claimCount: sampleFictionalCase.claims.length,
        updatedAt: '2026-09-21T10:00:00.000Z',
      },
    ]);
  });

  it('更新日時の新しい案件から順に並べる', () => {
    時計を固定する('2026-09-21T10:00:00.000Z');
    const 古い案件 = createEmptyCase('古い案件');
    saveCase(古い案件);
    vi.setSystemTime(new Date('2026-09-21T11:00:00.000Z'));
    const 新しい案件 = createEmptyCase('新しい案件');
    saveCase(新しい案件);

    expect(listCaseSummaries().map((summary) => summary.name)).toEqual(['新しい案件', '古い案件']);
  });

  it('同じ案件を保存し直しても、一覧には1件だけ載せる', () => {
    時計を固定する('2026-09-21T10:00:00.000Z');
    saveCase(sampleFictionalCase);
    vi.setSystemTime(new Date('2026-09-21T12:00:00.000Z'));
    const 改名した案件: Case = { ...sampleFictionalCase, name: '改名した案件' };
    saveCase(改名した案件);

    expect(listCaseSummaries()).toEqual([
      {
        id: sampleFictionalCase.id,
        name: '改名した案件',
        claimCount: sampleFictionalCase.claims.length,
        updatedAt: '2026-09-21T12:00:00.000Z',
      },
    ]);
  });

  it('一覧のデータが壊れている場合は、空の一覧として扱う', () => {
    localStorage.setItem(INDEX_STORAGE_KEY, 'これはJSONではありません');

    expect(listCaseSummaries()).toEqual([]);
  });
});

describe('deleteCase', () => {
  it('案件の本体と、一覧の項目を消す', () => {
    saveCase(sampleFictionalCase);

    deleteCase(sampleFictionalCase.id);

    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${sampleFictionalCase.id}`)).toBeNull();
    expect(listCaseSummaries()).toEqual([]);
  });

  it('他の案件は残す', () => {
    const 残る案件 = createEmptyCase('残る案件');
    saveCase(sampleFictionalCase);
    saveCase(残る案件);

    deleteCase(sampleFictionalCase.id);

    expect(listCaseSummaries().map((summary) => summary.id)).toEqual([残る案件.id]);
  });
});

describe('migrateLegacyCase', () => {
  it('1件だけ保存していた頃のデータを、1件目の案件として移行する', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ state: { currentCase: sampleFictionalCase } }));

    migrateLegacyCase();

    expect(listCaseSummaries().map((summary) => summary.id)).toEqual([sampleFictionalCase.id]);
    expect(loadCase(sampleFictionalCase.id)).toEqual(sampleFictionalCase);
  });

  it('移行しても、元のデータは消さない', () => {
    const 旧データ = JSON.stringify({ state: { currentCase: sampleFictionalCase } });
    localStorage.setItem(LEGACY_STORAGE_KEY, 旧データ);

    migrateLegacyCase();

    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(旧データ);
  });

  it('移行済みの場合は、二重に移行しない', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ state: { currentCase: sampleFictionalCase } }));
    migrateLegacyCase();
    saveCase({ ...sampleFictionalCase, name: '移行後に改名した案件' });

    migrateLegacyCase();

    expect(listCaseSummaries().map((summary) => summary.name)).toEqual(['移行後に改名した案件']);
  });

  it('旧データが無い場合は、何もしない', () => {
    migrateLegacyCase();

    expect(listCaseSummaries()).toEqual([]);
  });

  it('旧データを読めない場合は、退避してエラーを返す', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ state: { currentCase: { id: 'case-broken' } } }));

    expect(migrateLegacyCase()).toContain('案件データの形式が正しくありません');
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).not.toBeNull();
    expect(listCaseSummaries()).toEqual([]);
  });
});
