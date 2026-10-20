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
  closeCaseDatabase,
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

describe('保存の途中で失敗した場合', () => {
  it('一覧の項目を書けなかった場合は、ケースの本体も書き換えずにエラーにする', async () => {
    // 前提: 保存済みのケースを改名して保存し直す途中で、一覧の項目の書き込みだけが失敗する
    await saveCase(sampleFictionalCase);
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === 'summaries') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return originalPut.call(this, value, key);
    });

    await expect(saveCase({ ...sampleFictionalCase, name: '改名したケース' })).rejects.toThrow('quota');
    put.mockRestore();

    // 検証: 本体だけが新しい名前になって、一覧と食い違うことがない
    expect((await loadCase(sampleFictionalCase.id)).name).toBe(sampleFictionalCase.name);
    expect((await listCaseSummaries()).map((summary) => summary.name)).toEqual([sampleFictionalCase.name]);
  });

  it('書き込みの途中でトランザクションが中断された場合は、エラーにし、処理されない失敗を残さない', async () => {
    // 前提: 版を読み出すときに、ブラウザがトランザクションを中断する（保存領域の不足などで起こる）
    const unhandled: unknown[] = [];
    const recordUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', recordUnhandled);
    const originalGet = IDBObjectStore.prototype.get;
    const get = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, query) {
      const request = originalGet.call(this, query);
      if (this.name === 'revisions') this.transaction.abort();
      return request;
    });

    try {
      await expect(saveCase(sampleFictionalCase)).rejects.toBeInstanceOf(DOMException);
      // 処理されない Promise の失敗は、後のタスクで報告されるため、報告を待つ
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      get.mockRestore();
      process.off('unhandledRejection', recordUnhandled);
    }

    expect(unhandled).toEqual([]);
    await expect(loadCase(sampleFictionalCase.id)).rejects.toBeInstanceOf(CaseNotFoundError);
  });
});

describe('別のタブとの書き込みの重なり', () => {
  it('別のタブが本文を書き換えて保存した後に、このタブで保存すると、本体と本文をこのタブの内容にそろえる', async () => {
    // 前提: このタブで本文 a を保存した後、別のタブが同じ資料の本文を b に書き換えて保存した
    const target = caseWithTranscripts();
    await saveCase(target);
    const otherTab = await openDB(DATABASE_NAME);
    await otherTab.put('transcripts', { caseId: target.id, interviewId: 'interview-newspaper', text: '別のタブで書き換えた本文' });
    await otherTab.put('revisions', 'revision-other-tab', target.id);
    otherTab.close();

    // このタブで、本文とは関係の無い変更を保存する
    await saveCase({ ...target, name: 'このタブで改名したケース' });

    // 検証: 本体だけがこのタブの内容になり、本文が別のタブの内容のまま残る、という食い違いを起こさない
    await closeCaseDatabase();
    expect(await loadCase(target.id)).toEqual({ ...target, name: 'このタブで改名したケース' });
  });
});

describe('データベースを開けなかった場合', () => {
  it('一度開けなくても、次の呼び出しで開き直す', async () => {
    // 前提: 一時的な障害で、最初の1回だけデータベースを開けない
    vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('一時的に開けません', 'UnknownError');
    });

    await expect(listCaseSummaries()).rejects.toThrow('一時的に開けません');
    expect(await listCaseSummaries()).toEqual([]);
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

  it('本文の後ろに資料の格を持つ資料も、項目の並びに関わらず、移せたと確かめて LocalStorage から消す', async () => {
    // 前提: 読み出すときに本文を資料の末尾に付け直すため、本文の後ろに項目を持つ資料は、読み出す前と項目の並びが変わる
    const withGrade: Case = {
      ...createEmptyCase('格を持つ資料のケース'),
      interviews: [{ id: 'interview-newspaper', title: '湖畔新聞の記事', transcript: '管理人は車の音を聞いたと話した。', grade: 'majorReport' }],
    };
    storeInLocalStorage(withGrade);

    expect(await migrateLocalStorageCases()).toEqual([]);

    expect(await loadCase(withGrade.id)).toEqual(withGrade);
    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${withGrade.id}`)).toBeNull();
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
    expect(errors[0]!.caseId).toBe('case-broken');
    expect(errors[0]!.message).toContain('ケースデータの形式が正しくありません');
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

    expect(errors[0]!.message).toContain('ケースデータの形式が正しくありません');
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).not.toBeNull();
    expect(await listCaseSummaries()).toEqual([]);
  });

  it('移した内容を読み出して元の内容と一致しない場合は、移した側を取り消し、LocalStorage に残して理由を返す', async () => {
    // 前提: IndexedDB への書き込みで、本文が壊れて保存されてしまう
    const withTranscripts = caseWithTranscripts();
    storeInLocalStorage(withTranscripts);
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      const corrupted = this.name === 'transcripts' ? { ...(value as object), text: '壊れた本文' } : value;
      return originalPut.call(this, corrupted, key);
    });

    const errors = await migrateLocalStorageCases();
    put.mockRestore();

    expect(errors[0]!.message).toContain('一致しませんでした');
    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${withTranscripts.id}`)).not.toBeNull();
    // 検証: 次の起動で「移し終えたもの」として、確かめずに LocalStorage から消すことのないよう、移した側を残さない
    await expect(loadCase(withTranscripts.id)).rejects.toBeInstanceOf(CaseNotFoundError);
    expect(await migrateLocalStorageCases()).toEqual([]);
    expect(await loadCase(withTranscripts.id)).toEqual(withTranscripts);
  });

  it('1件だけ保存していた頃のデータから移したケースを削除しても、次の起動で戻さない', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ state: { currentCase: sampleFictionalCase } }));
    await migrateLocalStorageCases();
    await deleteCase(sampleFictionalCase.id);

    await migrateLocalStorageCases();

    expect(await listCaseSummaries()).toEqual([]);
  });

  it('移すデータが無い場合は、何もしない', async () => {
    expect(await migrateLocalStorageCases()).toEqual([]);
    expect(await listCaseSummaries()).toEqual([]);
  });
});
