/**
 * ケースストア
 *
 * 複数のケースのうち、いま開いているケースを1件だけ保持し、変更のたびにブラウザ（IndexedDB）へ保存します（src/lib/case-storage.ts）。
 * 変更はまずメモリ上のケースへ同期的に反映し、保存は順番待ちの列に積んで非同期に行います。IndexedDB の読み書きは非同期のためです。
 * 保存に失敗した場合は、変更を画面に残したまま saveErrors にケースごとの理由を加えます。
 * 同じ編集（ケースを開いてから、別のケースを開く・閉じるまで）の中で、後に積んだ保存が成功すれば消えます。保存はケース全体を書き直すためです。
 * 保存に失敗したまま別のケースを開いた・一覧へ戻った場合は、保存できなかった変更は画面からも失われるため、そのことを示したまま残します（dismissSaveError で消します）。
 * 開いているケースを削除している間は、変更を受け付けません。受け付けると、削除の後に保存され、削除したケースが戻ってしまうためです。
 * どのケースを開くかはURL（/cases/<ケースのID>）が決めるため、このストアはケースの切り替えをURLから受け取ります（openCase）。
 * ケースの一覧（summaries）は、ケースを開かずに一覧ページへ表示するために保持します。
 * 追加・更新・削除のたびに参照の整合性を検証し、違反する操作は例外を投げてケースを変更しません。
 * 証言を削除すると、その証言を含む照合（CrossCheck）もあわせて削除します。照合は2件の証言がそろって初めて意味を持つためです。
 * あわせて、仮説（Hypothesis）からも、その証言のひもづけを外します。仮説は証言が減っても見立てとして残るためです。
 * あわせて、論点（Dispute）からも、その証言を外します。論点は束ねた証言が減っても、事柄の記録として残るためです。
 * 証言・人物・場所・論点を削除すると、未了事項（Task）から、そのひもづけを外します。未了事項は対象が無くなっても、確認すべきこととして残るためです。
 * 証言の追加・更新・削除で時系列ボードの並び順が日時と矛盾した場合は、該当する項目を最も近い矛盾しない位置へ動かします。
 *
 * 注意:
 * - IndexedDB を読み書きするため、ケースを開く（openCase）・一覧を読む（refreshSummaries）操作は、
 *   ブラウザ側（useEffect の中）から呼び出してください。サーバー描画との食い違いを避けるためです。
 * - この段階はドメインモデルの検証が目的のため、スキーマのマイグレーションは実装していません。
 *   モデルを変更して保存済みデータが検証に失敗した場合は、ケースを開かずに loadError へ理由を設定します
 *   （黙って空のケースに差し替えることはしません）。
 */
import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { findCaseViolations, parseCase } from '@/domain/case-schema';
import { detachClaimFromDisputes } from '@/domain/disputes';
import { detachClaimFromHypotheses } from '@/domain/hypotheses';
import type { MentionKind } from '@/domain/mention';
import { movePersonLane } from '@/domain/person-lane-order';
import { mergePersons } from '@/domain/person-merge';
import { splitPerson } from '@/domain/person-split';
import { detachFromTasks, type TaskLinkKind } from '@/domain/tasks';
import { moveTimelineItem, placeTimelineItem, settleTimelineItems, timelineKeyOf, type TimelineKey } from '@/domain/timeline-order';
import type { Case, Id, Person } from '@/domain/types';
import {
  CaseNotFoundError,
  createEmptyCase,
  InvalidStoredCaseError,
  deleteCase as deleteStoredCase,
  listCaseSummaries,
  loadCase,
  migrateLocalStorageCases,
  saveCase,
  type CaseSummary,
  type MigrationFailure,
} from '@/lib/case-storage';

/** ケースが持つ一覧の名前です。 */
export type CollectionKey =
  | 'persons'
  | 'places'
  | 'claims'
  | 'relationships'
  | 'interviews'
  | 'crossChecks'
  | 'hypotheses'
  | 'tasks'
  | 'disputes';

/**
 * メンションで参照できるエンティティの種類（人物・場所）に対応する、ケースの一覧の名前です。
 * 本文のメンションや詳細ページの種類から、更新・削除する一覧を決めるために使います。
 */
export const COLLECTION_KEY_BY_MENTION_KIND: Record<MentionKind, CollectionKey> = {
  person: 'persons',
  place: 'places',
};

/** 一覧の名前と、その一覧に保存する要素の組です。 */
/** upsertMany で要素とあわせて反映する、時系列ボードの項目の移動です。toIndex は、動かした後の並び順の中での位置（0始まり）です。 */
export type TimelineMove = { key: TimelineKey; toIndex: number };

export type UpsertEntry = { [K in CollectionKey]: { key: K; entity: Case[K][number] } }[CollectionKey];

/**
 * ケースを開けなかった理由です。
 * - missing: 保存が無い（URLが誤っている・削除済み）
 * - invalid: 保存データの形式が正しくない（退避用のストアへ写しています）
 * - migration: LocalStorage に保存していた頃のデータを移せなかった
 * - storage: ブラウザの保存領域（IndexedDB）を読み書きできなかった（プライベートブラウズで使えない場合など）
 */
export type CaseLoadError = { kind: 'missing' | 'invalid' | 'migration' | 'storage'; message: string };

/**
 * 変更をブラウザに保存できなかったことの記録です。
 * - caseId / caseName: 保存できなかったケースです。別のケースを開いた後も、どのケースの変更が失われたかを示すために持ちます。
 * - reason: 保存できなかった理由です。
 * - discarded: 保存できなかった変更を、画面（メモリ）からも失ったかどうかです。別のケースを開いた・一覧へ戻った場合は true です。
 *   false の間は、開いているケースに変更が残っているため、JSON を書き出せば変更を失わずに済みます。
 */
export type SaveError = { caseId: Id; caseName: string; reason: string; discarded: boolean };

/** 保存できなかったことを、利用者へ示す文にします。変更が画面に残っているかどうかで、取るべき対処が異なります。 */
export function describeSaveError(error: SaveError): string {
  if (error.discarded) {
    return `ケース「${error.caseName}」の変更をブラウザに保存できませんでした。保存できなかった変更は、画面を移ったため失われています（${error.reason}）`;
  }
  return `変更をブラウザに保存できませんでした。画面を閉じる前に、ケース設定から JSON を書き出してください（${error.reason}）`;
}

/** 保存に失敗したまま開いているケースを手放す（別のケースを開く・閉じる）ときに、失敗の記録を「変更が失われた」ものに改めます。 */
function discardSaveErrors(errors: SaveError[]): SaveError[] {
  return errors.some((error) => !error.discarded) ? errors.map((error) => ({ ...error, discarded: true })) : errors;
}

/** 保存の失敗の記録を、ケースごとに1件だけになるよう差し替える（無ければ末尾に加える）。 */
function withSaveError(errors: SaveError[], added: SaveError): SaveError[] {
  return errors.some((error) => error.caseId === added.caseId)
    ? errors.map((error) => (error.caseId === added.caseId ? added : error))
    : [...errors, added];
}

/** ケースの保存の失敗の記録を取り除きます。 */
function withoutSaveError(errors: SaveError[], caseId: Id): SaveError[] {
  return errors.filter((error) => error.caseId !== caseId);
}

/** ケースを開けなかったエラーの種類を判定します。 */
function loadErrorKindOf(error: unknown): CaseLoadError['kind'] {
  if (error instanceof CaseNotFoundError) return 'missing';
  if (error instanceof InvalidStoredCaseError) return 'invalid';
  return 'storage';
}

type CaseStore = {
  /** いま開いているケースです。開いていない場合は null です。 */
  currentCase: Case | null;
  /** 保存済みのケースの一覧です。更新日時の新しい順に並びます。 */
  summaries: CaseSummary[];
  /** ケースを開けなかった理由です。開けている場合は null です。 */
  loadError: CaseLoadError | null;
  /** 保存に失敗したことの記録です。ケースごとに1件までで、失敗した順に並びます。保存できている場合と、利用者が表示を閉じた場合は空です。 */
  saveErrors: SaveError[];
  /**
   * LocalStorage に保存していた頃のデータを、移せなかった理由です。すべて移せた場合は null です。
   * ケースの一覧の画面で示します。移せなかったケースそのものを開こうとした場合は、loadError にも理由を設定します（openCase）。
   */
  migrationError: string | null;
  /**
   * IDを指定してケースを開きます。開けない場合はケースを開かず、loadError に理由を設定します。
   * 読み出しの途中で別のケースを開いた場合は、後から開いた方だけを反映します。
   */
  openCase: (caseId: Id) => Promise<void>;
  /** 開いているケースを閉じます。ケースの一覧ページへ移るときに使います。 */
  closeCase: () => void;
  /** ケースの保存に失敗したことの表示を閉じます。 */
  dismissSaveError: (caseId: Id) => void;
  /** 保存済みのケースの一覧を読み直します。 */
  refreshSummaries: () => Promise<void>;
  /** 空のケースを作って保存し、そのIDを返します。開いているケースは切り替えません。 */
  createCase: (name?: string) => Promise<Id>;
  /**
   * 型の保証が無いデータを検証し、新しいケースとして保存して、そのIDを返します。
   * 保存済みのケースとIDが重なる場合は、元のケースを上書きしないよう、新しいIDを振ります。
   * 検証に失敗した場合は例外を投げ、ケースを追加しません。
   */
  importCase: (data: unknown) => Promise<Id>;
  /**
   * ケースを保存から消します。開いているケースを消した場合は、開いているケースを空にします。
   * 開いているケースを消す間は、そのケースへの変更を受け付けません（例外を投げます）。削除に失敗した場合は、再び受け付けます。
   */
  deleteCase: (caseId: Id) => Promise<void>;
  /** 開いているケースの名前を変更します。 */
  renameCase: (name: string) => void;
  /** 同じIDの要素があれば置き換え、無ければ追加します。参照の整合性に違反する場合は例外を投げます。 */
  upsert: <K extends CollectionKey>(key: K, entity: Case[K][number]) => void;
  /**
   * 複数の要素をまとめて保存します。すべてを反映した状態で参照の整合性を1回だけ検証するため、
   * 新しい人物と、その人物に言及する証言を同時に保存できます。違反がある場合は例外を投げ、どの要素も保存しません。
   * timelineMove を渡すと、保存した後の並び順で時系列ボードの項目を動かし、要素と並び順を1回で保存します
   * （新しい証言を書いた位置に並べるためです）。指定した位置が日時と矛盾する場合は、拒否せずに、最も近い矛盾しない位置に置きます
   * （placeTimelineItem）。
   */
  upsertMany: (entries: UpsertEntry[], timelineMove?: TimelineMove) => void;
  /**
   * 要素を削除します。他のデータから参照されている場合は例外を投げます。
   * 証言を削除する場合は、その証言を含む照合もあわせて削除し、仮説からはその証言のひもづけを外します
   * （照合・仮説は削除を妨げる参照として扱いません）。
   * 証言・人物・場所を削除する場合は、未了事項からそのひもづけを外します（未了事項も削除を妨げる参照として扱いません）。
   */
  remove: (key: CollectionKey, id: Id) => void;
  /**
   * 時系列ボードの項目を動かします。toIndex は、動かした後の並び順の中での位置（0始まり）です。
   * 日時と矛盾する位置を指定した場合は例外を投げ、ケースを変更しません。
   */
  moveTimelineItem: (key: TimelineKey, toIndex: number) => void;
  /**
   * 人物の動きビューで、人物 personId の列を、人物 overPersonId の列の位置へ動かします。
   * どちらかの人物が存在しない場合は例外を投げ、ケースを変更しません。
   */
  movePersonLane: (personId: Id, overPersonId: Id) => void;
  /**
   * 人物 fromId を人物 intoId にまとめます（src/domain/person-merge.ts）。参照をすべて付け替え、fromId の人物を削除します。
   * まとめられない場合（同じ人物・存在しない人物・2人の間に関係がある場合など）は例外を投げ、ケースを変更しません。
   */
  mergePersons: (fromId: Id, intoId: Id) => void;
  /**
   * 人物 fromId を参照している箇所のうち、moveKeys で選んだ参照だけを新しい人物 newPerson に移します（src/domain/person-split.ts）。
   * 新しい人物はケースに足し、選ばなかった参照は fromId の人物に残します。
   * 分けられない場合（存在しない人物・既にあるIDの新しい人物・参照していない箇所を選んだ場合など）は例外を投げ、ケースを変更しません。
   */
  splitPerson: (fromId: Id, newPerson: Person, moveKeys: string[]) => void;
};

/** ケースを開いていない状態で、ケースを変更しようとしたときのメッセージです。 */
const NO_OPEN_CASE_MESSAGE = 'ケースが開かれていません';

/** 未了事項にひもづけられる対象の一覧の名前と、その対象の種類の組です。削除するときに、未了事項からひもづけを外すために使います。 */
const TASK_LINK_KIND_BY_COLLECTION_KEY: Partial<Record<CollectionKey, TaskLinkKind>> = {
  claims: 'claim',
  persons: 'person',
  places: 'place',
  disputes: 'dispute',
};

/**
 * 保存の順番待ちの列の末尾です。保存・削除・一覧の読み出しは、この列に積んで1件ずつ順に行います。
 * 先に積んだ保存が終わる前に後の保存が終わり、古い内容で上書きされることを防ぐためです。
 */
let pendingWrites: Promise<void> = Promise.resolve();

/** 保存の順番待ちの列に処理を積み、その処理の結果を返します。前の処理が失敗しても、後の処理は行います。 */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = pendingWrites.then(task);
  pendingWrites = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/** 積んである保存がすべて終わるまで待ちます。保存した内容を読み出して確かめる前（テストなど）に使います。 */
export function flushPendingSaves(): Promise<void> {
  return pendingWrites;
}

/**
 * 削除している途中のケースのIDと、そのケースに対して終わっていない削除の数です。削除が終わるまで、そのケースへの変更を受け付けないために使います。
 * 数で持つのは、同じケースの削除が重なった場合に、先に終わった削除が、後の削除の終わる前に受け付けを再開しないためです。
 */
const deletingCaseIds = new Map<Id, number>();

/**
 * 開いているケースを置き換える（別のケースを開く・閉じる・削除する）たびに1つ進める番号です。
 * 保存が、どの編集（画面上に持っていた変更）から積まれたかを見分けます。
 */
let editingSession = 0;

/** 積んだ保存の通し番号です。同じ編集の中で、保存の前後を比べるために使います。 */
let saveSequence = 0;

/** ケースごとの、最後に失敗した保存の編集の番号と通し番号です。後に積んだ保存の成功で、失敗した変更を取り戻せたかを判定するために使います。 */
const lastFailedSaves = new Map<Id, { session: number; sequence: number }>();

/** 最後に開こうとしたケースのIDです。読み出しの途中で別のケースを開いた場合に、先の読み出しの結果を捨てるために使います。 */
let latestOpenRequest: Id | null = null;

/** エラーを、利用者へ伝える文字列にします。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** LocalStorage から移せなかったデータです。移せなかったケースを開こうとしたときに、「見つからない」ではなく理由を示すために使います。 */
let migrationFailures: MigrationFailure[] = [];

/** 一覧の項目を1件だけ差し替え、更新日時の新しい順に並べ直します（保存のたびに一覧を全件読み直さないためです）。 */
function withSummary(summaries: CaseSummary[], summary: CaseSummary): CaseSummary[] {
  return [summary, ...summaries.filter((item) => item.id !== summary.id)].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

export const useCaseStore = create<CaseStore>()((set, get) => {
  /** 積んである保存が終わった後の、ケースの一覧を読み直します。 */
  const reloadSummaries = async (): Promise<void> => {
    set({ summaries: await enqueue(listCaseSummaries) });
  };

  /**
   * 開いているケースを、与えられた関数の結果で置き換え、保存を順番待ちの列に積みます。
   * ケースを開いていない場合は例外を投げます（どのケースへ書き込むべきか決められないため）。
   * 注意: 保存の完了は待ちません。保存に失敗した場合は saveErrors に理由を加えます。
   */
  const updateCurrentCase = (update: (current: Case) => Case): void => {
    const { currentCase } = get();
    if (currentCase === null) throw new Error(NO_OPEN_CASE_MESSAGE);

    if (deletingCaseIds.has(currentCase.id)) throw new Error('ケースを削除しているため、変更できません');

    const nextCase = update(currentCase);
    if (nextCase === currentCase) return;
    set({ currentCase: nextCase });
    const session = editingSession;
    saveSequence += 1;
    const sequence = saveSequence;
    void enqueue(async () => {
      try {
        const summary = await saveCase(nextCase);
        // 保存はケース全体を書き直すため、同じ編集の中で失敗した保存より後に積んだ保存が成功すれば、失敗した変更も保存できている。
        // 別の編集の保存（ケースを開き直した後の保存）では、失われた変更は戻らないため消さない
        const failed = lastFailedSaves.get(nextCase.id);
        const recovered = failed !== undefined && failed.session === session && failed.sequence < sequence;
        if (recovered) lastFailedSaves.delete(nextCase.id);
        set({
          summaries: withSummary(get().summaries, summary),
          ...(recovered ? { saveErrors: withoutSaveError(get().saveErrors, nextCase.id) } : {}),
        });
      } catch (error) {
        lastFailedSaves.set(nextCase.id, { session, sequence });
        set({
          saveErrors: withSaveError(get().saveErrors, {
            caseId: nextCase.id,
            caseName: nextCase.name,
            reason: messageOf(error),
            // 保存を待つ間に別のケースを開いた・閉じた場合は、保存できなかった変更は、もう画面にも無い
            discarded: session !== editingSession,
          }),
        });
      }
    });
  };

  return {
    currentCase: null,
    summaries: [],
    loadError: null,
    saveErrors: [],
    migrationError: null,

    openCase: async (caseId) => {
      latestOpenRequest = caseId;
      // 開いているケースへの保存が終わってから読み出す（保存前の古い内容を開かないため）
      const result = await enqueue(async () => {
        try {
          return { opened: await loadCase(caseId) };
        } catch (error) {
          return { error };
        }
      });
      if (latestOpenRequest !== caseId) return;

      // 開けた場合も開けなかった場合も、前に開いていたケースの変更は画面から失われるため、保存の失敗はそのことを示す形に改める
      editingSession += 1;
      const saveErrors = discardSaveErrors(get().saveErrors);
      if ('opened' in result) {
        set({ currentCase: result.opened, loadError: null, saveErrors });
        return;
      }
      const migrationFailure = migrationFailures.find((failure) => failure.caseId === caseId);
      const loadError: CaseLoadError =
        result.error instanceof CaseNotFoundError && migrationFailure !== undefined
          ? { kind: 'migration', message: migrationFailure.message }
          : { kind: loadErrorKindOf(result.error), message: messageOf(result.error) };
      set({ currentCase: null, loadError, saveErrors });
    },

    closeCase: () => {
      latestOpenRequest = null;
      editingSession += 1;
      set({ currentCase: null, loadError: null, saveErrors: discardSaveErrors(get().saveErrors) });
    },

    dismissSaveError: (caseId) => {
      lastFailedSaves.delete(caseId);
      set({ saveErrors: withoutSaveError(get().saveErrors, caseId) });
    },

    refreshSummaries: reloadSummaries,

    createCase: async (name) => {
      const created = createEmptyCase(name);
      await enqueue(() => saveCase(created));
      await reloadSummaries();
      return created.id;
    },

    importCase: async (data) => {
      const parsed = parseCase(data);
      const imported = await enqueue(async () => {
        // 同じケースを2回読み込んだ場合に、先に読み込んだケースを失わないよう、IDが重なるときは新しいIDを振る
        const isDuplicated = (await listCaseSummaries()).some((summary) => summary.id === parsed.id);
        const target: Case = isDuplicated ? { ...parsed, id: nanoid() } : parsed;
        await saveCase(target);
        return target;
      });
      await reloadSummaries();
      return imported.id;
    },

    deleteCase: async (caseId) => {
      deletingCaseIds.set(caseId, (deletingCaseIds.get(caseId) ?? 0) + 1);
      try {
        await enqueue(() => deleteStoredCase(caseId));
      } finally {
        const remaining = (deletingCaseIds.get(caseId) ?? 1) - 1;
        if (remaining > 0) deletingCaseIds.set(caseId, remaining);
        else deletingCaseIds.delete(caseId);
      }
      // 削除したケースの変更を保存できなかったことは、もう伝える意味が無い
      lastFailedSaves.delete(caseId);
      const { currentCase, saveErrors } = get();
      if (currentCase?.id === caseId) {
        editingSession += 1;
        set({ currentCase: null });
      }
      set({ saveErrors: withoutSaveError(saveErrors, caseId) });
      await reloadSummaries();
    },

    renameCase: (name) => updateCurrentCase((current) => ({ ...current, name })),

    upsert: (key, entity) => get().upsertMany([{ key, entity } as UpsertEntry]),

    upsertMany: (entries, timelineMove) =>
      updateCurrentCase((current) => {
        let nextCase = current;
        /** 日時が変わった可能性のあるボードの項目です。 */
        const touchedKeys: TimelineKey[] = [];
        for (const { key, entity } of entries) {
          if (key === 'claims') touchedKeys.push(timelineKeyOf(entity.id));
          const items = nextCase[key] as { id: Id }[];
          const exists = items.some((item) => item.id === entity.id);
          const nextItems = exists ? items.map((item) => (item.id === entity.id ? entity : item)) : [...items, entity];
          nextCase = { ...nextCase, [key]: nextItems } as Case;
        }

        const violations = findCaseViolations(nextCase);
        if (violations.length > 0) {
          throw new Error(violations.join('\n'));
        }
        // 並び順の移動で置く項目は、直後の placeTimelineItem が位置を決め直すため、ここでは寄せない
        const keysToSettle = touchedKeys.filter((key) => key !== timelineMove?.key);
        if (keysToSettle.length > 0) {
          nextCase = { ...nextCase, timelineOrder: settleTimelineItems(nextCase, keysToSettle) };
        }
        if (timelineMove !== undefined) {
          nextCase = { ...nextCase, timelineOrder: placeTimelineItem(nextCase, timelineMove.key, timelineMove.toIndex) };
        }
        return nextCase;
      }),

    remove: (key, id) =>
      updateCurrentCase((current) => {
        const items = current[key] as { id: Id }[];
        let nextCase = { ...current, [key]: items.filter((item) => item.id !== id) } as Case;
        if (key === 'claims') {
          nextCase = {
            ...nextCase,
            crossChecks: nextCase.crossChecks.filter((crossCheck) => !crossCheck.claimIds.includes(id)),
            hypotheses: detachClaimFromHypotheses(nextCase.hypotheses, id),
            disputes: detachClaimFromDisputes(nextCase.disputes, id),
          };
        }
        const taskLinkKind = TASK_LINK_KIND_BY_COLLECTION_KEY[key];
        if (taskLinkKind !== undefined) {
          nextCase = { ...nextCase, tasks: detachFromTasks(nextCase.tasks, taskLinkKind, id) };
        }

        const violations = findCaseViolations(nextCase);
        if (violations.length > 0) {
          throw new Error(`他のデータから参照されているため削除できません\n${violations.join('\n')}`);
        }
        return nextCase;
      }),

    moveTimelineItem: (key, toIndex) =>
      updateCurrentCase((current) => ({ ...current, timelineOrder: moveTimelineItem(current, key, toIndex) })),

    mergePersons: (fromId, intoId) =>
      updateCurrentCase((current) => {
        const merged = mergePersons(current, fromId, intoId);
        // まとめた結果が、ケースの規則に反する場合は、保存せずに理由を示す（domain の mergePersons が守らない規則の取りこぼしに備える）
        const violations = findCaseViolations(merged);
        if (violations.length > 0) throw new Error(`人物をまとめられません\n${violations.join('\n')}`);
        return merged;
      }),

    splitPerson: (fromId, newPerson, moveKeys) =>
      updateCurrentCase((current) => {
        const split = splitPerson(current, fromId, newPerson, moveKeys);
        // 分けた結果が、ケースの規則に反する場合は、保存せずに理由を示す（domain の splitPerson が守らない規則の取りこぼしに備える）
        const violations = findCaseViolations(split);
        if (violations.length > 0) throw new Error(`人物を分けられません\n${violations.join('\n')}`);
        return split;
      }),

    movePersonLane: (personId, overPersonId) =>
      updateCurrentCase((current) => ({ ...current, personLaneOrder: movePersonLane(current, personId, overPersonId) })),
  };
});

/**
 * 開いているケースを返します。
 * ケースのボードと詳細は、ケースを開けた場合だけ描画する（CaseStoreGate）ため、これらのコンポーネントからはこのフックを使います。
 * ケースを開いていない場合に呼び出すことは誤りのため、例外を投げます。
 */
export function useCurrentCase(): Case {
  const currentCase = useCaseStore((state) => state.currentCase);
  if (currentCase === null) throw new Error(NO_OPEN_CASE_MESSAGE);
  return currentCase;
}

/** LocalStorage からの移行の結果です。画面を開くたびに移行を繰り返さないよう、1回目の結果を使い回します。 */
let migration: Promise<MigrationFailure[]> | null = null;

/**
 * 保存済みのデータを読み込む準備を行い、ケースの一覧を読み直します。
 * LocalStorage に保存していた頃のケースがあれば、IndexedDB へ移します（移せなかった場合は migrationError に理由を設定します）。
 * ブラウザの保存領域を開けなかった場合も、例外にせず loadError に理由を設定します（画面に理由を示すためです）。
 * ブラウザ側（useEffect の中）から呼び出してください。
 */
export async function initializeCaseStore(): Promise<void> {
  const running = (migration ??= enqueue(migrateLocalStorageCases));
  try {
    migrationFailures = await running;
    // 移せなかったことは一覧の画面で示す。ケースを開けなかったこと（loadError）にすると、移せたケースを開くたびに、開けなかったという画面が出てしまう
    const migrationError = migrationFailures.length > 0 ? migrationFailures.map((failure) => failure.message).join('\n') : null;
    useCaseStore.setState({ migrationError });
    await useCaseStore.getState().refreshSummaries();
  } catch (error) {
    // 保存領域を開けなかった場合は、次に画面を開いたときに移行をやり直す
    if (migration === running) migration = null;
    useCaseStore.setState({ loadError: { kind: 'storage', message: messageOf(error) } });
  }
}

/**
 * LocalStorage からの移行を、次の initializeCaseStore でもう一度行うようにし、保存の失敗・削除の途中の記録も忘れます。
 * テストで保存を空に戻すときに使います（前のテストの記録が、次のテストの判定に混ざらないためです）。
 */
export function resetCaseStoreInitialization(): void {
  migration = null;
  migrationFailures = [];
  lastFailedSaves.clear();
  deletingCaseIds.clear();
}
