/**
 * ケースのブラウザ保存
 *
 * 複数のケースを IndexedDB（データベース kaiketsu-kun）に保存し、IDを指定して読み書きします。
 * ストアは次の5つです。
 * - cases: ケースの本体（キーはケースのID）。資料の本文（Interview.transcript）は取り除いて保存します。
 * - transcripts: 資料の本文（キーは [ケースのID, 資料のID]）。ケースの一覧を、本文を読まずに表示するために分けます。
 * - summaries: ケースを開かずに一覧へ表示する情報（名前・証言の件数・更新日時。キーはケースのID）。
 * - backups: 検証に失敗した保存データの退避先（キーはケースのID）。
 * - revisions: ケースを最後に保存したときに振った版（キーはケースのID）。別のタブが同じケースを保存したことに気付くために使います。
 * 1件の保存は、本体・本文・一覧・版を1つのトランザクションで書き換えます。途中で失敗した場合は、どのストアも書き換わりません。
 *
 * 以前は LocalStorage（容量はおよそ5MB）に保存していました。資料の本文が数百件になると容量を超えるため、IndexedDB へ移しました。
 * LocalStorage に残っているケースは migrateLocalStorageCases が IndexedDB へ移し、移せたことを確かめてから LocalStorage から消します。
 *
 * 注意:
 * - 保存データの検証は parseCase が行います。検証に失敗したデータは、黙って捨てずに退避用のストアへ写し、呼び出し元へ例外で伝えます。
 * - IndexedDB はブラウザにしか無いため、この関数群はブラウザ側（クライアントコンポーネント・useEffect の中）からのみ呼び出してください。
 * - LocalStorage のキーの接頭辞 `testimony-board-` は、アプリ名を kaiketsu-kun に改めた後も変えていません。
 *   移行のために、以前の版が保存したキーを読み出すためです。
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { nanoid } from 'nanoid';
import { parseCase } from '@/domain/case-schema';
import { withoutTranscripts } from '@/domain/transcript-separation';
import type { Case, Id } from '@/domain/types';
import { inTransaction } from './idb-transaction';

/** ケースを保存する IndexedDB のデータベース名です。 */
export const DATABASE_NAME = 'kaiketsu-kun';
/** データベースの版です。ストアの構成を変えるときに上げます。 */
const DATABASE_VERSION = 1;

/** LocalStorage に保存していた頃の、ケースの本体のキーの接頭辞です。この後ろにケースのIDが続きます。移行のためだけに読み出します。 */
export const CASE_KEY_PREFIX = 'testimony-board-case:';
/** LocalStorage に保存していた頃の、ケースの一覧のキーです。移行のためだけに読み出します。 */
export const INDEX_STORAGE_KEY = 'testimony-board-cases';
/** ケースを1件だけ保存していた頃のキーです。移行のためだけに読み出します。 */
export const LEGACY_STORAGE_KEY = 'testimony-board-case';
/**
 * 1件だけ保存していた頃のデータを移し終えたことを示すキーです。
 * 旧データは移行が誤っていた場合に備えて消さないため、移したケースを削除した後の起動で、もう一度移さないように使います。
 */
export const LEGACY_MIGRATED_STORAGE_KEY = 'testimony-board-case-legacy-migrated';
/** LocalStorage から移せなかったデータを退避するキーです。ケースごとの退避では、この後ろに「:ケースのID」が続きます。 */
export const BACKUP_STORAGE_KEY = 'testimony-board-case-backup';

/** ケースを開かずに一覧へ表示するための情報です。 */
export type CaseSummary = {
  id: Id;
  name: string;
  /** ケースに含まれる証言の件数です。 */
  claimCount: number;
  /** 最後に保存した日時（ISO 8601形式）です。 */
  updatedAt: string;
};

/** 資料の本文のストアの1件です。 */
type StoredTranscript = { caseId: Id; interviewId: Id; text: string };

/** 検証に失敗した保存データの退避の1件です。data は読み出したままの値です。 */
type StoredBackup = { id: Id; data: unknown };

/**
 * データベースのストアの構成です。
 * 注意: cases の値は、検証前の保存データを読み出すことがあるため unknown で扱い、parseCase を通してから Case にします。
 */
interface CaseDatabaseSchema extends DBSchema {
  cases: { key: Id; value: unknown };
  transcripts: { key: [Id, Id]; value: StoredTranscript };
  summaries: { key: Id; value: CaseSummary };
  backups: { key: Id; value: StoredBackup };
  revisions: { key: Id; value: string };
}

type CaseDatabase = IDBPDatabase<CaseDatabaseSchema>;

/** ケースが保存されていないことを表すエラーです。保存データの形式が正しくない場合と見分けるために使います。 */
export class CaseNotFoundError extends Error {
  constructor(caseId: Id) {
    super(`ケースが見つかりません: ${caseId}`);
    this.name = 'CaseNotFoundError';
  }
}

/** 保存データが検証に失敗したことを表すエラーです。保存データは退避用のストアへ写してあります。 */
export class InvalidStoredCaseError extends Error {
  constructor(message: string, options: { cause: unknown }) {
    super(message, options);
    this.name = 'InvalidStoredCaseError';
  }
}

/** 空のケースの既定の名前です。 */
const DEFAULT_CASE_NAME = '新しいケース';

/** 開いているデータベースの接続です。最初に使うときに開き、以後は使い回します。 */
let databasePromise: Promise<CaseDatabase> | null = null;

/** このタブが最後に保存した（または読み出した）ケースの版と、そのときの資料の本文（資料のID → 本文）です。 */
type WrittenTranscripts = { revision: string | undefined; transcripts: Map<Id, string> };

/**
 * ケースごとに、このタブが最後に保存した（または読み出した）資料の本文です。
 * 入力のたびにケースを保存するため、変わっていない本文まで毎回書き直さないよう、変わった本文だけを書くために使います。
 * 注意: 保存するときにデータベースの版がここに持つ版と異なる場合は、別のタブが保存したものとして、本文のストアを丸ごと書き直します。
 * 持っていないケースも同じく丸ごと書き直します。
 */
const writtenTranscripts = new Map<Id, WrittenTranscripts>();

/**
 * データベースを開きます。初めて開く場合は、ストアを作ります。
 * 開けなかった場合と、ブラウザが接続を閉じた場合は、次の呼び出しで開き直します（一時的な障害で、以後の保存がすべて失敗しないためです）。
 */
function openCaseDatabase(): Promise<CaseDatabase> {
  if (databasePromise !== null) return databasePromise;
  const opening = openDB<CaseDatabaseSchema>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      database.createObjectStore('cases');
      database.createObjectStore('transcripts', { keyPath: ['caseId', 'interviewId'] });
      database.createObjectStore('summaries', { keyPath: 'id' });
      database.createObjectStore('backups', { keyPath: 'id' });
      database.createObjectStore('revisions');
    },
    // 別のタブが新しい版でデータベースを開こうとした場合は、その妨げにならないよう接続を閉じる（次に使うときに開き直す）
    blocking() {
      void closeCaseDatabase();
    },
    // ブラウザが接続を閉じた場合（保存領域の削除など）は、閉じた接続を使い回さない
    terminated() {
      if (databasePromise === opening) forgetDatabase();
    },
  });
  databasePromise = opening;
  opening.catch(() => {
    if (databasePromise === opening) forgetDatabase();
  });
  return opening;
}

/** 開いた接続と、接続に結び付いた本文の記録を忘れます。次に使うときに開き直します。 */
function forgetDatabase(): void {
  databasePromise = null;
  writtenTranscripts.clear();
}

/**
 * データベースの接続を閉じます。次に保存・読み出しをするときに開き直します。
 * 別のタブがデータベースの版を上げる場合と、テストでデータベースを空に戻す場合に使います。
 */
export async function closeCaseDatabase(): Promise<void> {
  const opening = databasePromise;
  forgetDatabase();
  if (opening === null) return;
  (await opening).close();
}

/** ケースの資料の本文が入る、本文のストアのキーの範囲です。配列のキーは文字列より後に並ぶため、[ケースのID, []] を上限にします。 */
function transcriptRangeOf(caseId: Id): IDBKeyRange {
  return IDBKeyRange.bound([caseId], [caseId, []]);
}

/** 新しいIDを振った、空のケースを作ります。保存はしません。 */
export function createEmptyCase(name: string = DEFAULT_CASE_NAME): Case {
  return {
    id: nanoid(),
    name,
    persons: [],
    places: [],
    claims: [],
    relationships: [],
    interviews: [],
    crossChecks: [],
    hypotheses: [],
    tasks: [],
    disputes: [],
    timelineOrder: [],
    personLaneOrder: [],
  };
}

/** ケースの一覧を、更新日時の新しい順で返します。資料の本文は読み出しません。 */
export async function listCaseSummaries(): Promise<CaseSummary[]> {
  const database = await openCaseDatabase();
  const summaries = await database.getAll('summaries');
  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

/** ケースの資料の本文を、資料のID → 本文の対応にします。本文の無い資料は含めません。 */
function transcriptsOf(target: Case): Map<Id, string> {
  const transcripts = new Map<Id, string>();
  for (const interview of target.interviews) {
    if (interview.transcript !== undefined) transcripts.set(interview.id, interview.transcript);
  }
  return transcripts;
}

/**
 * ケースを保存し、一覧の項目（名前・証言の件数・更新日時）を更新して、その項目を返します。
 * 資料の本文は本文のストアに分けて保存し、前回の保存から変わった本文だけを書き込みます。
 *
 * @param updatedAt 一覧に載せる更新日時です。省略すると現在の日時です（LocalStorage からの移行で、元の日時を引き継ぐために指定します）。
 * 注意: 本体・本文・一覧・版を1つのトランザクションで書き込むため、失敗した場合はどれも書き換わりません。
 */
export async function saveCase(target: Case, updatedAt: string = new Date().toISOString()): Promise<CaseSummary> {
  const database = await openCaseDatabase();
  const transcripts = transcriptsOf(target);
  const summary: CaseSummary = { id: target.id, name: target.name, claimCount: target.claims.length, updatedAt };
  const revision = nanoid();

  const transaction = database.transaction(['cases', 'transcripts', 'summaries', 'revisions'], 'readwrite');
  const transcriptStore = transaction.objectStore('transcripts');
  const revisionStore = transaction.objectStore('revisions');
  await inTransaction(transaction, async (track) => {
    const storedRevision = await track(revisionStore.get(target.id));
    track(transaction.objectStore('cases').put(withoutTranscripts(target), target.id));
    track(transaction.objectStore('summaries').put(summary));
    const written = writtenTranscripts.get(target.id);
    if (written === undefined || written.revision !== storedRevision) {
      // 前回の内容が分からない（このタブで保存・読み出しをしていない、または別のタブが保存した）ため、本文をすべて書き直す
      track(transcriptStore.delete(transcriptRangeOf(target.id)));
      for (const [interviewId, text] of transcripts) track(transcriptStore.put({ caseId: target.id, interviewId, text }));
    } else {
      for (const [interviewId, text] of transcripts) {
        if (written.transcripts.get(interviewId) !== text) track(transcriptStore.put({ caseId: target.id, interviewId, text }));
      }
      for (const interviewId of written.transcripts.keys()) {
        if (!transcripts.has(interviewId)) track(transcriptStore.delete([target.id, interviewId]));
      }
    }
    track(revisionStore.put(revision, target.id));
  });
  writtenTranscripts.set(target.id, { revision, transcripts });
  return summary;
}

/**
 * IDを指定してケースを読み出します。資料の本文も、本文のストアから戻します。
 * 保存が無い場合は CaseNotFoundError を、保存データが検証に失敗した場合は InvalidStoredCaseError を投げます。
 * 検証に失敗したデータは、退避用のストアへ写してから例外を投げます。
 */
export async function loadCase(caseId: Id): Promise<Case> {
  const database = await openCaseDatabase();
  const transaction = database.transaction(['cases', 'transcripts', 'revisions'], 'readonly');
  const [stored, storedTranscripts, revision] = await Promise.all([
    transaction.objectStore('cases').get(caseId),
    transaction.objectStore('transcripts').getAll(transcriptRangeOf(caseId)),
    transaction.objectStore('revisions').get(caseId),
    transaction.done,
  ]);
  if (stored === undefined) throw new CaseNotFoundError(caseId);

  let parsed: Case;
  try {
    parsed = parseCase(stored);
  } catch (error) {
    await database.put('backups', { id: caseId, data: stored });
    throw new InvalidStoredCaseError(messageOf(error), { cause: error });
  }

  const transcripts = new Map(storedTranscripts.map((item) => [item.interviewId, item.text]));
  writtenTranscripts.set(caseId, { revision, transcripts });
  return {
    ...parsed,
    interviews: parsed.interviews.map((interview) => {
      const transcript = transcripts.get(interview.id);
      return transcript === undefined ? interview : { ...interview, transcript };
    }),
  };
}

/** ケースの本体・資料の本文・一覧の項目を消します。 */
export async function deleteCase(caseId: Id): Promise<void> {
  const database = await openCaseDatabase();
  const transaction = database.transaction(['cases', 'transcripts', 'summaries', 'revisions'], 'readwrite');
  await Promise.all([
    transaction.objectStore('cases').delete(caseId),
    transaction.objectStore('transcripts').delete(transcriptRangeOf(caseId)),
    transaction.objectStore('summaries').delete(caseId),
    transaction.objectStore('revisions').delete(caseId),
    transaction.done,
  ]);
  writtenTranscripts.delete(caseId);
}

/** エラーを、利用者へ伝える文字列にします。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** IDを指定したケースが IndexedDB に保存されているかどうかを返します。 */
async function hasStoredCase(caseId: Id): Promise<boolean> {
  const database = await openCaseDatabase();
  return (await database.getKey('cases', caseId)) !== undefined;
}

/** LocalStorage に保存していた頃の一覧から、ケースごとの更新日時を読み出します。一覧が読めない場合は空にします（更新日時は移行の時点に置き換わるだけのため）。 */
function readLocalStorageUpdatedAt(): Map<Id, string> {
  const updatedAt = new Map<Id, string>();
  const stored = localStorage.getItem(INDEX_STORAGE_KEY);
  if (stored === null) return updatedAt;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return updatedAt;
    for (const item of parsed) {
      const summary = item as Partial<CaseSummary> | null;
      if (typeof summary?.id === 'string' && typeof summary.updatedAt === 'string') updatedAt.set(summary.id, summary.updatedAt);
    }
  } catch {
    // 一覧はケースの本体から作り直せる補助的なデータのため、読めなくても移行は続ける
  }
  return updatedAt;
}

/** 値が、配列ではないオブジェクトかどうかを返します。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** オブジェクトの、値が undefined ではない項目の名前です。JSON に書き出すと undefined の項目は消えるため、無い項目と同じに扱います。 */
function definedKeysOf(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => value[key] !== undefined);
}

/**
 * 2つの値が、JSON として同じ内容かどうかを返します。オブジェクトの項目の並びは比べません。
 * 移行の照合に使います。読み出すときに資料の本文を資料の末尾に付け直すため、項目の並びは元の内容と変わることがあるためです。
 * 注意: 配列は要素の並びも比べます（証言の並び・時系列の並び順などは、並びに意味があるためです）。
 */
function isSameData(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => isSameData(item, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = definedKeysOf(left);
    return leftKeys.length === definedKeysOf(right).length && leftKeys.every((key) => isSameData(left[key], right[key]));
  }
  return Object.is(left, right);
}

/**
 * LocalStorage のケース1件を IndexedDB へ移し、移せたことを読み出して確かめてから、LocalStorage から消します。
 * 読み出した内容が元の内容と一致しない場合は、移した側を消してから例外を投げます（LocalStorage の側は残します）。
 * そのため IndexedDB に同じIDのケースが既にある場合は、前回の移行で確かめ終えた後、LocalStorage から消す前に画面が閉じられたものとして、
 * 上書きせずに LocalStorage の側だけを消します。
 */
async function migrateLocalStorageCase(caseId: Id, stored: string, updatedAt: string | undefined): Promise<void> {
  const key = `${CASE_KEY_PREFIX}${caseId}`;
  if (await hasStoredCase(caseId)) {
    localStorage.removeItem(key);
    return;
  }

  let migrated: Case;
  try {
    migrated = parseCase(JSON.parse(stored));
  } catch (error) {
    localStorage.setItem(`${BACKUP_STORAGE_KEY}:${caseId}`, stored);
    throw error;
  }
  await saveCase(migrated, updatedAt);
  const reloaded = await loadCase(caseId);
  if (!isSameData(reloaded, migrated)) {
    await deleteCase(caseId);
    throw new Error('移した内容を読み出して確かめたところ、元の内容と一致しませんでした');
  }
  localStorage.removeItem(key);
}

/**
 * ケースを1件だけ保存していた頃のデータを、ケースとして IndexedDB へ移します。
 * 旧データは、移行が誤っていた場合に備えて消しません。代わりに、移し終えたことを LEGACY_MIGRATED_STORAGE_KEY に残し、二度目は移しません
 * （移したケースを削除した後の起動で、削除したケースが戻らないようにするためです）。同じIDのケースが既にある場合も、二重に移行しないよう何もしません。
 * 移行できなかった場合は、旧データを退避用のキーへ写してから例外を投げます。
 */
async function migrateSingleLegacyCase(stored: string): Promise<void> {
  if (localStorage.getItem(LEGACY_MIGRATED_STORAGE_KEY) !== null) return;
  try {
    // 旧データは zustand の persist が保存した形（{ state: { currentCase } }）です
    const parsed: unknown = JSON.parse(stored);
    const legacyCase = (parsed as { state?: { currentCase?: unknown } } | null)?.state?.currentCase;
    if (legacyCase === undefined) return;

    const migrated = parseCase(legacyCase);
    if (!(await hasStoredCase(migrated.id))) await saveCase(migrated);
    localStorage.setItem(LEGACY_MIGRATED_STORAGE_KEY, new Date().toISOString());
  } catch (error) {
    localStorage.setItem(BACKUP_STORAGE_KEY, stored);
    throw error;
  }
}

/**
 * LocalStorage から移せなかったデータ1件です。
 * caseId は、移せなかったケースのIDです。1件だけ保存していた頃のデータは、読めないとIDも分からないため null です。
 */
export type MigrationFailure = { caseId: Id | null; message: string };

/**
 * LocalStorage に保存していた頃のケースを、IndexedDB へ移します。
 * 移せなかったケースは LocalStorage に残し（退避用のキーにも写します）、ケースごとの理由を返します。移行の必要が無い場合と、すべて移せた場合は空の配列を返します。
 * すべてのケースを移し終えたら、LocalStorage の一覧のキーも消します。
 */
export async function migrateLocalStorageCases(): Promise<MigrationFailure[]> {
  const errors: MigrationFailure[] = [];

  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy !== null) {
    try {
      await migrateSingleLegacyCase(legacy);
    } catch (error) {
      errors.push({ caseId: null, message: messageOf(error) });
    }
  }

  const caseIds: Id[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(CASE_KEY_PREFIX)) caseIds.push(key.slice(CASE_KEY_PREFIX.length));
  }
  const updatedAt = readLocalStorageUpdatedAt();
  let remaining = 0;
  for (const caseId of caseIds) {
    const stored = localStorage.getItem(`${CASE_KEY_PREFIX}${caseId}`);
    if (stored === null) continue;
    try {
      await migrateLocalStorageCase(caseId, stored, updatedAt.get(caseId));
    } catch (error) {
      remaining += 1;
      errors.push({
        caseId,
        message: `ケース ${caseId} を新しい保存先へ移せませんでした（LocalStorage のキー ${CASE_KEY_PREFIX}${caseId} に残しています）: ${messageOf(error)}`,
      });
    }
  }
  if (remaining === 0) localStorage.removeItem(INDEX_STORAGE_KEY);
  return errors;
}
