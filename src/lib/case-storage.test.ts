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
function freezeClock(start: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(start));
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('createEmptyCase', () => {
  it('毎回異なるIDの、空のケースを作る', () => {
    const firstItem = createEmptyCase();
    const secondItem = createEmptyCase();

    expect(firstItem.id).not.toBe(secondItem.id);
    expect(firstItem.claims).toEqual([]);
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
    const otherCase = createEmptyCase('別のケース');
    saveCase(sampleFictionalCase);
    saveCase(otherCase);

    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${sampleFictionalCase.id}`)).not.toBeNull();
    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${otherCase.id}`)).not.toBeNull();
  });

  it('保存されていないIDを読み出すとエラーにする', () => {
    expect(() => loadCase('case-unknown')).toThrow('ケースが見つかりません');
  });

  it('保存データの形式が正しくない場合は、退避してからエラーにする', () => {
    localStorage.setItem(`${CASE_KEY_PREFIX}case-broken`, '{"id":"case-broken"}');

    expect(() => loadCase('case-broken')).toThrow('ケースデータの形式が正しくありません');
    expect(localStorage.getItem(`${BACKUP_STORAGE_KEY}:case-broken`)).toBe('{"id":"case-broken"}');
  });

  it('ブラウザの保存容量を超えた場合は、理由と対処を日本語で伝えるエラーにし、保存済みのケースを書き換えない', () => {
    // 前提: 長い文字起こしを貼り付けて、LocalStorage の容量を超えた
    saveCase(sampleFictionalCase);
    const storedBefore = localStorage.getItem(`${CASE_KEY_PREFIX}${sampleFictionalCase.id}`);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    expect(() => saveCase({ ...sampleFictionalCase, name: '書き換えたケース' })).toThrow(
      /ブラウザの保存容量を超えたため、保存できませんでした/
    );
    setItem.mockRestore();
    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${sampleFictionalCase.id}`)).toBe(storedBefore);
  });

  it('保存容量の超過以外の失敗は、そのまま伝える', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('予期しない失敗');
    });

    expect(() => saveCase(sampleFictionalCase)).toThrow('予期しない失敗');
    setItem.mockRestore();
  });
});

describe('listCaseSummaries', () => {
  it('保存が無い場合は空の一覧を返す', () => {
    expect(listCaseSummaries()).toEqual([]);
  });

  it('ケース名・証言の件数・更新日時を返す', () => {
    freezeClock('2026-09-21T10:00:00.000Z');
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
    freezeClock('2026-09-21T10:00:00.000Z');
    const olderCase = createEmptyCase('古いケース');
    saveCase(olderCase);
    vi.setSystemTime(new Date('2026-09-21T11:00:00.000Z'));
    const newerCase = createEmptyCase('新しいケース');
    saveCase(newerCase);

    expect(listCaseSummaries().map((summary) => summary.name)).toEqual(['新しいケース', '古いケース']);
  });

  it('同じケースを保存し直しても、一覧には1件だけ載せる', () => {
    freezeClock('2026-09-21T10:00:00.000Z');
    saveCase(sampleFictionalCase);
    vi.setSystemTime(new Date('2026-09-21T12:00:00.000Z'));
    const renamedCase: Case = { ...sampleFictionalCase, name: '改名したケース' };
    saveCase(renamedCase);

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
    const remainingCase = createEmptyCase('残るケース');
    saveCase(sampleFictionalCase);
    saveCase(remainingCase);

    deleteCase(sampleFictionalCase.id);

    expect(listCaseSummaries().map((summary) => summary.id)).toEqual([remainingCase.id]);
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
    const legacyData = JSON.stringify({ state: { currentCase: sampleFictionalCase } });
    localStorage.setItem(LEGACY_STORAGE_KEY, legacyData);

    migrateLegacyCase();

    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(legacyData);
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
