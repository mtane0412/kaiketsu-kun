/**
 * ケースのブラウザ保存
 *
 * 複数のケースをLocalStorageに保存し、IDを指定して読み書きします。
 * ケースの本体はケースごとに別のキー（testimony-board-case:<ケースのID>）へ保存し、
 * 一覧（testimony-board-cases）には、ケースを開かずに表示できる情報（名前・証言の件数・更新日時）だけを持たせます。
 * ケースごとに分ける理由は、証言に添えた画像をデータURLで持つため、入力のたびに全ケースを書き直すと重くなるからです。
 *
 * 注意:
 * - 保存データの検証は parseCase が行います。検証に失敗したデータは、黙って捨てずに退避用のキーへ移し、呼び出し元へ例外で伝えます。
 * - LocalStorage はブラウザにしか無いため、この関数群はブラウザ側（クライアントコンポーネント・useEffect の中）からのみ呼び出してください。
 * - キーの接頭辞 `testimony-board-` は、アプリ名を kaiketsu-kun に改めた後も変えていません。
 *   キーを変えると、すでに保存済みのケースが読めなくなるためです。
 */
import { nanoid } from 'nanoid';
import { parseCase } from '@/domain/case-schema';
import type { Case, Id } from '@/domain/types';

/** ケースの本体を保存するキーの接頭辞です。この後ろにケースのIDが続きます。 */
export const CASE_KEY_PREFIX = 'testimony-board-case:';
/** ケースの一覧を保存するキーです。 */
export const INDEX_STORAGE_KEY = 'testimony-board-cases';
/** ケースを1件だけ保存していた頃のキーです。移行のためだけに読み出します。 */
export const LEGACY_STORAGE_KEY = 'testimony-board-case';
/** 検証に失敗した保存データを退避するキーです。ケースごとの退避では、この後ろに「:ケースのID」が続きます。 */
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

/** 空のケースの既定の名前です。 */
const DEFAULT_CASE_NAME = '新しいケース';

/** ケースの本体を保存するキーを組み立てます。 */
function caseKeyOf(caseId: Id): string {
  return `${CASE_KEY_PREFIX}${caseId}`;
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
    timelineOrder: [],
  };
}

/** 一覧の1件が、期待する形をしているかどうかを判定します。 */
function isCaseSummary(value: unknown): value is CaseSummary {
  if (typeof value !== 'object' || value === null) return false;
  const summary = value as Partial<CaseSummary>;
  return (
    typeof summary.id === 'string' &&
    typeof summary.name === 'string' &&
    typeof summary.claimCount === 'number' &&
    typeof summary.updatedAt === 'string'
  );
}

/**
 * ケースの一覧を、更新日時の新しい順で返します。
 * 注意: 一覧はケースの本体から作り直せる補助的なデータのため、読めない場合は例外にせず、空の一覧として扱います。
 */
export function listCaseSummaries(): CaseSummary[] {
  const stored = localStorage.getItem(INDEX_STORAGE_KEY);
  if (stored === null) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isCaseSummary)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

/** ケースの一覧を保存します。 */
function saveCaseSummaries(summaries: CaseSummary[]): void {
  localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(summaries));
}

/** ケースを保存し、一覧の項目（名前・証言の件数・更新日時）を更新します。 */
export function saveCase(target: Case): void {
  localStorage.setItem(caseKeyOf(target.id), JSON.stringify(target));

  const summary: CaseSummary = {
    id: target.id,
    name: target.name,
    claimCount: target.claims.length,
    updatedAt: new Date().toISOString(),
  };
  const others = listCaseSummaries().filter((item) => item.id !== target.id);
  saveCaseSummaries([summary, ...others]);
}

/**
 * IDを指定してケースを読み出します。
 * 保存が無い場合と、保存データが検証に失敗した場合は例外を投げます。
 * 検証に失敗したデータは、次の保存で失われないよう、ケースごとの退避用のキーへ写してから例外を投げます。
 */
export function loadCase(caseId: Id): Case {
  const stored = localStorage.getItem(caseKeyOf(caseId));
  if (stored === null) throw new Error(`ケースが見つかりません: ${caseId}`);

  try {
    return parseCase(JSON.parse(stored));
  } catch (error) {
    localStorage.setItem(`${BACKUP_STORAGE_KEY}:${caseId}`, stored);
    throw error;
  }
}

/** ケースの本体と、一覧の項目を消します。 */
export function deleteCase(caseId: Id): void {
  localStorage.removeItem(caseKeyOf(caseId));
  saveCaseSummaries(listCaseSummaries().filter((summary) => summary.id !== caseId));
}

/**
 * ケースを1件だけ保存していた頃のデータを、1件目のケースとして移行します。
 * 旧データは、移行が誤っていた場合に備えて消しません。同じIDのケースが既にある場合は、二重に移行しないよう何もしません。
 * 移行できなかった場合は、旧データを退避用のキーへ写し、理由を返します。移行の必要が無い場合と成功した場合は null を返します。
 */
export function migrateLegacyCase(): string | null {
  const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (stored === null) return null;

  try {
    // 旧データは zustand の persist が保存した形（{ state: { currentCase } }）です
    const parsed: unknown = JSON.parse(stored);
    const legacyCase = (parsed as { state?: { currentCase?: unknown } } | null)?.state?.currentCase;
    if (legacyCase === undefined) return null;

    const migrated = parseCase(legacyCase);
    if (listCaseSummaries().some((summary) => summary.id === migrated.id)) return null;
    saveCase(migrated);
    return null;
  } catch (error) {
    localStorage.setItem(BACKUP_STORAGE_KEY, stored);
    return error instanceof Error ? error.message : String(error);
  }
}
