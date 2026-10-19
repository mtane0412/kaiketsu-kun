/**
 * ケースのブラウザ保存（IndexedDB）のテスト
 *
 * IndexedDB は jsdom に無いため、fake-indexeddb で代用します（src/test/setup.ts がテストごとに空のデータベースへ戻します）。
 */
import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case } from '@/domain/types';
import {
  BACKUP_STORAGE_KEY,
  CASE_KEY_PREFIX,
  CaseNotFoundError,
  createEmptyCase,
  DATABASE_NAME,
  deleteCase,
  INDEX_STORAGE_KEY,
  InvalidStoredCaseError,
  LEGACY_STORAGE_KEY,
  listCaseSummaries,
  loadCase,
  migrateLocalStorageCases,
  saveCase,
} from './case-storage';

/** 更新日時の比較が安定するよう、日時だけを固定します（IndexedDB の代用が使うタイマーは止めません）。 */
function freezeClock(start: string): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(start));
}

afterEach(() => {
  vi.useRealTimers();
});

/** 資料の本文を持つケースを作ります。本文はケースの本体とは別のストアに保存されることを確かめるために使います。 */
function caseWithTranscripts(): Case {
  return {
    ...createEmptyCase('本文を持つケース'),
    interviews: [
      { id: 'interview-newspaper', title: '湖畔新聞の記事', transcript: '別荘の管理人は、午後9時ごろに車の音を聞いたと話した。' },
      { id: 'interview-video', title: '地元局の動画', transcript: '0:12 近所の人は、夜中に明かりが点いていたと話した。' },
      { id: 'interview-memo', title: '本文の無いメモ' },
    ],
  };
}

/** データベースのストアの中身を、本番のコードを通さずに直接読み出します。 */
async function readStore(storeName: string): Promise<unknown[]> {
  const database = await openDB(DATABASE_NAME);
  try {
    return await database.getAll(storeName);
  } finally {
    database.close();
  }
}

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
  it('保存したケースを、IDを指定して読み出せる', async () => {
    await saveCase(sampleFictionalCase);

    expect(await loadCase(sampleFictionalCase.id)).toEqual(sampleFictionalCase);
  });

  it('資料の本文はケースの本体とは別のストアに保存し、読み出すときに戻す', async () => {
    const target = caseWithTranscripts();
    await saveCase(target);

    const [storedBody] = (await readStore('cases')) as Case[];
    expect(storedBody!.interviews.map((interview) => interview.transcript)).toEqual([undefined, undefined, undefined]);
    expect(await readStore('transcripts')).toHaveLength(2);
    expect(await loadCase(target.id)).toEqual(target);
  });

  it('本文を書き換えた・消した資料は、次の保存で本文のストアにも反映する', async () => {
    const target = caseWithTranscripts();
    await saveCase(target);
    await loadCase(target.id);
    const edited: Case = {
      ...target,
      interviews: [
        { ...target.interviews[0]!, transcript: '管理人は、午後10時ごろに車の音を聞いたと訂正した。' },
        { ...target.interviews[1]!, transcript: undefined },
        target.interviews[2]!,
      ],
    };

    await saveCase(edited);

    expect(await readStore('transcripts')).toHaveLength(1);
    expect(await loadCase(target.id)).toEqual(edited);
  });

  it('5MBを超えるケースも保存して読み出せる', async () => {
    // 前提: LocalStorage（およそ5MB）では保存できなかった大きさの本文
    const longTranscript = '管理人の証言の書き起こし。'.repeat(500_000);
    const target: Case = {
      ...createEmptyCase('大きなケース'),
      interviews: [{ id: 'interview-long', title: '長い文字起こし', transcript: longTranscript }],
    };
    expect(JSON.stringify(target).length).toBeGreaterThan(5 * 1024 * 1024);

    await saveCase(target);

    expect((await loadCase(target.id)).interviews[0]!.transcript).toBe(longTranscript);
  });

  it('保存されていないIDを読み出すと、見つからないことを示すエラーにする', async () => {
    await expect(loadCase('case-unknown')).rejects.toBeInstanceOf(CaseNotFoundError);
    await expect(loadCase('case-unknown')).rejects.toThrow('ケースが見つかりません');
  });

  it('保存データの形式が正しくない場合は、退避用のストアへ写してからエラーにする', async () => {
    // 前提: データモデルの変更などで、保存済みのデータが検証に通らなくなった
    await listCaseSummaries();
    const database = await openDB(DATABASE_NAME);
    await database.put('cases', { id: 'case-broken' }, 'case-broken');
    database.close();

    await expect(loadCase('case-broken')).rejects.toBeInstanceOf(InvalidStoredCaseError);
    await expect(loadCase('case-broken')).rejects.toThrow('ケースデータの形式が正しくありません');
    expect(await readStore('backups')).toEqual([{ id: 'case-broken', data: { id: 'case-broken' } }]);
  });
});

describe('listCaseSummaries', () => {
  it('保存が無い場合は空の一覧を返す', async () => {
    expect(await listCaseSummaries()).toEqual([]);
  });

  it('ケース名・証言の件数・更新日時を返す', async () => {
    freezeClock('2026-09-21T10:00:00.000Z');
    await saveCase(sampleFictionalCase);

    expect(await listCaseSummaries()).toEqual([
      {
        id: sampleFictionalCase.id,
        name: sampleFictionalCase.name,
        claimCount: sampleFictionalCase.claims.length,
        updatedAt: '2026-09-21T10:00:00.000Z',
      },
    ]);
  });

  it('更新日時の新しいケースから順に並べる', async () => {
    freezeClock('2026-09-21T10:00:00.000Z');
    await saveCase(createEmptyCase('古いケース'));
    vi.setSystemTime(new Date('2026-09-21T11:00:00.000Z'));
    await saveCase(createEmptyCase('新しいケース'));

    expect((await listCaseSummaries()).map((summary) => summary.name)).toEqual(['新しいケース', '古いケース']);
  });

  it('同じケースを保存し直しても、一覧には1件だけ載せる', async () => {
    freezeClock('2026-09-21T10:00:00.000Z');
    await saveCase(sampleFictionalCase);
    vi.setSystemTime(new Date('2026-09-21T12:00:00.000Z'));
    await saveCase({ ...sampleFictionalCase, name: '改名したケース' });

    expect(await listCaseSummaries()).toEqual([
      {
        id: sampleFictionalCase.id,
        name: '改名したケース',
        claimCount: sampleFictionalCase.claims.length,
        updatedAt: '2026-09-21T12:00:00.000Z',
      },
    ]);
  });
});

describe('deleteCase', () => {
  it('ケースの本体・資料の本文・一覧の項目を消す', async () => {
    const target = caseWithTranscripts();
    await saveCase(target);

    await deleteCase(target.id);

    await expect(loadCase(target.id)).rejects.toBeInstanceOf(CaseNotFoundError);
    expect(await readStore('transcripts')).toEqual([]);
    expect(await listCaseSummaries()).toEqual([]);
  });

  it('他のケースは残す', async () => {
    const remainingCase = caseWithTranscripts();
    await saveCase(sampleFictionalCase);
    await saveCase(remainingCase);

    await deleteCase(sampleFictionalCase.id);

    expect((await listCaseSummaries()).map((summary) => summary.id)).toEqual([remainingCase.id]);
    expect(await loadCase(remainingCase.id)).toEqual(remainingCase);
  });
});

describe('migrateLocalStorageCases', () => {
  /** LocalStorage に保存していた頃の形（ケースごとのキーと一覧）で、ケースを書き込みます。 */
  function storeInLocalStorage(...cases: Case[]): void {
    for (const item of cases) localStorage.setItem(`${CASE_KEY_PREFIX}${item.id}`, JSON.stringify(item));
    const summaries = cases.map((item) => ({
      id: item.id,
      name: item.name,
      claimCount: item.claims.length,
      updatedAt: '2026-09-01T00:00:00.000Z',
    }));
    localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(summaries));
  }

  it('LocalStorage のケースを IndexedDB へ移し、移せたことを確かめてから LocalStorage から消す', async () => {
    const withTranscripts = caseWithTranscripts();
    storeInLocalStorage(sampleFictionalCase, withTranscripts);

    expect(await migrateLocalStorageCases()).toEqual([]);

    expect(await loadCase(sampleFictionalCase.id)).toEqual(sampleFictionalCase);
    expect(await loadCase(withTranscripts.id)).toEqual(withTranscripts);
    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${sampleFictionalCase.id}`)).toBeNull();
    expect(localStorage.getItem(INDEX_STORAGE_KEY)).toBeNull();
  });

  it('移したケースの更新日時は、LocalStorage の一覧の日時を引き継ぐ', async () => {
    storeInLocalStorage(sampleFictionalCase);

    await migrateLocalStorageCases();

    expect((await listCaseSummaries())[0]!.updatedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('読めないケースは移さずに LocalStorage に残し、退避用のキーへ写して理由を返す', async () => {
    storeInLocalStorage(sampleFictionalCase);
    localStorage.setItem(`${CASE_KEY_PREFIX}case-broken`, '{"id":"case-broken"}');

    const errors = await migrateLocalStorageCases();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('case-broken');
    expect(errors[0]).toContain('ケースデータの形式が正しくありません');
    expect(localStorage.getItem(`${CASE_KEY_PREFIX}case-broken`)).toBe('{"id":"case-broken"}');
    expect(localStorage.getItem(`${BACKUP_STORAGE_KEY}:case-broken`)).toBe('{"id":"case-broken"}');
    expect((await listCaseSummaries()).map((summary) => summary.id)).toEqual([sampleFictionalCase.id]);
  });

  it('IndexedDB に同じIDのケースがある場合は上書きせず、LocalStorage の側を消す', async () => {
    // 前提: 前回の移行で IndexedDB へ移した後、LocalStorage から消す前に画面が閉じられた
    await saveCase({ ...sampleFictionalCase, name: '移行後に改名したケース' });
    storeInLocalStorage(sampleFictionalCase);

    await migrateLocalStorageCases();

    expect((await loadCase(sampleFictionalCase.id)).name).toBe('移行後に改名したケース');
    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${sampleFictionalCase.id}`)).toBeNull();
  });

  it('1件だけ保存していた頃のデータを、ケースとして移行する。元のデータは消さない', async () => {
    const legacyData = JSON.stringify({ state: { currentCase: sampleFictionalCase } });
    localStorage.setItem(LEGACY_STORAGE_KEY, legacyData);

    expect(await migrateLocalStorageCases()).toEqual([]);

    expect(await loadCase(sampleFictionalCase.id)).toEqual(sampleFictionalCase);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(legacyData);
  });

  it('1件だけ保存していた頃のデータを移行済みの場合は、二重に移行しない', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ state: { currentCase: sampleFictionalCase } }));
    await migrateLocalStorageCases();
    await saveCase({ ...sampleFictionalCase, name: '移行後に改名したケース' });

    await migrateLocalStorageCases();

    expect((await listCaseSummaries()).map((summary) => summary.name)).toEqual(['移行後に改名したケース']);
  });

  it('1件だけ保存していた頃のデータを読めない場合は、退避して理由を返す', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ state: { currentCase: { id: 'case-broken' } } }));

    const errors = await migrateLocalStorageCases();

    expect(errors[0]).toContain('ケースデータの形式が正しくありません');
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).not.toBeNull();
    expect(await listCaseSummaries()).toEqual([]);
  });

  it('移すデータが無い場合は、何もしない', async () => {
    expect(await migrateLocalStorageCases()).toEqual([]);
    expect(await listCaseSummaries()).toEqual([]);
  });
});
