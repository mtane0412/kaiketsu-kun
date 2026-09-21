/**
 * ケースのブラウザ保存（複数ケース）のテスト
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
  it('毎回異なるIDの、空のケースを作る', () => {
    const 一件目 = createEmptyCase();
    const 二件目 = createEmptyCase();

    expect(一件目.id).not.toBe(二件目.id);
    expect(一件目.claims).toEqual([]);
  });

  it('ケース名を指定できる', () => {
    expect(createEmptyCase('別荘の事件').name).toBe('別荘の事件');
  });
});

describe('saveCase と loadCase', () => {
  it('保存したケースを、IDを指定して読み出せる', () => {
    saveCase(sampleFictionalCase);

    expect(loadCase(sampleFictionalCase.id)).toEqual(sampleFictionalCase);
  });

  it('ケースごとに別のキーへ保存する', () => {
    const 別のケース = createEmptyCase('別のケース');
    saveCase(sampleFictionalCase);
    saveCase(別のケース);

    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${sampleFictionalCase.id}`)).not.toBeNull();
    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${別のケース.id}`)).not.toBeNull();
  });

  it('保存されていないIDを読み出すとエラーにする', () => {
    expect(() => loadCase('case-unknown')).toThrow('ケースが見つかりません');
  });

  it('保存データの形式が正しくない場合は、退避してからエラーにする', () => {
    localStorage.setItem(`${CASE_KEY_PREFIX}case-broken`, '{"id":"case-broken"}');

    expect(() => loadCase('case-broken')).toThrow('ケースデータの形式が正しくありません');
    expect(localStorage.getItem(`${BACKUP_STORAGE_KEY}:case-broken`)).toBe('{"id":"case-broken"}');
  });
});

describe('listCaseSummaries', () => {
  it('保存が無い場合は空の一覧を返す', () => {
    expect(listCaseSummaries()).toEqual([]);
  });

  it('ケース名・証言の件数・更新日時を返す', () => {
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

  it('更新日時の新しいケースから順に並べる', () => {
    時計を固定する('2026-09-21T10:00:00.000Z');
    const 古いケース = createEmptyCase('古いケース');
    saveCase(古いケース);
    vi.setSystemTime(new Date('2026-09-21T11:00:00.000Z'));
    const 新しいケース = createEmptyCase('新しいケース');
    saveCase(新しいケース);

    expect(listCaseSummaries().map((summary) => summary.name)).toEqual(['新しいケース', '古いケース']);
  });

  it('同じケースを保存し直しても、一覧には1件だけ載せる', () => {
    時計を固定する('2026-09-21T10:00:00.000Z');
    saveCase(sampleFictionalCase);
    vi.setSystemTime(new Date('2026-09-21T12:00:00.000Z'));
    const 改名したケース: Case = { ...sampleFictionalCase, name: '改名したケース' };
    saveCase(改名したケース);

    expect(listCaseSummaries()).toEqual([
      {
        id: sampleFictionalCase.id,
        name: '改名したケース',
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
  it('ケースの本体と、一覧の項目を消す', () => {
    saveCase(sampleFictionalCase);

    deleteCase(sampleFictionalCase.id);

    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${sampleFictionalCase.id}`)).toBeNull();
    expect(listCaseSummaries()).toEqual([]);
  });

  it('他のケースは残す', () => {
    const 残るケース = createEmptyCase('残るケース');
    saveCase(sampleFictionalCase);
    saveCase(残るケース);

    deleteCase(sampleFictionalCase.id);

    expect(listCaseSummaries().map((summary) => summary.id)).toEqual([残るケース.id]);
  });
});

describe('migrateLegacyCase', () => {
  it('1件だけ保存していた頃のデータを、1件目のケースとして移行する', () => {
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
    saveCase({ ...sampleFictionalCase, name: '移行後に改名したケース' });

    migrateLegacyCase();

    expect(listCaseSummaries().map((summary) => summary.name)).toEqual(['移行後に改名したケース']);
  });

  it('旧データが無い場合は、何もしない', () => {
    migrateLegacyCase();

    expect(listCaseSummaries()).toEqual([]);
  });

  it('旧データを読めない場合は、退避してエラーを返す', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ state: { currentCase: { id: 'case-broken' } } }));

    expect(migrateLegacyCase()).toContain('ケースデータの形式が正しくありません');
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).not.toBeNull();
    expect(listCaseSummaries()).toEqual([]);
  });
});
