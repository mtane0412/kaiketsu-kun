/**
 * ケースストア
 *
 * 複数のケースのうち、いま開いているケースを1件だけ保持し、変更のたびにブラウザへ保存します（src/lib/case-storage.ts）。
 * どのケースを開くかはURL（/cases/<ケースのID>）が決めるため、このストアはケースの切り替えをURLから受け取ります（openCase）。
 * ケースの一覧（summaries）は、ケースを開かずに一覧ページへ表示するために保持します。
 * 追加・更新・削除のたびに参照の整合性を検証し、違反する操作は例外を投げてケースを変更しません。
 * 証言の追加・更新・削除で時系列ボードの並び順が日時と矛盾した場合は、該当する項目を最も近い矛盾しない位置へ動かします。
 *
 * 注意:
 * - LocalStorage を読み書きするため、ケースを開く（openCase）・一覧を読む（refreshSummaries）操作は、
 *   ブラウザ側（useEffect の中）から呼び出してください。サーバー描画との食い違いを避けるためです。
 * - この段階はドメインモデルの検証が目的のため、スキーマのマイグレーションは実装していません。
 *   モデルを変更して保存済みデータが検証に失敗した場合は、ケースを開かずに loadError へ理由を設定します
 *   （黙って空のケースに差し替えることはしません）。
 */
import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { findCaseViolations, parseCase } from '@/domain/case-schema';
import { moveTimelineItem, settleTimelineItems, timelineKeyOf, type TimelineKey } from '@/domain/timeline-order';
import type { Case, Id } from '@/domain/types';
import {
  createEmptyCase,
  deleteCase as deleteStoredCase,
  listCaseSummaries,
  loadCase,
  migrateLegacyCase,
  saveCase,
  type CaseSummary,
} from '@/lib/case-storage';

/** ケースが持つ一覧の名前です。 */
export type CollectionKey = 'persons' | 'places' | 'claims' | 'relationships';

/** 一覧の名前と、その一覧に保存する要素の組です。 */
export type UpsertEntry = { [K in CollectionKey]: { key: K; entity: Case[K][number] } }[CollectionKey];

type CaseStore = {
  /** いま開いているケースです。開いていない場合は null です。 */
  currentCase: Case | null;
  /** 保存済みのケースの一覧です。更新日時の新しい順に並びます。 */
  summaries: CaseSummary[];
  /** ケースを開けなかった理由です。開けている場合は null です。 */
  loadError: string | null;
  /** IDを指定してケースを開きます。開けない場合はケースを開かず、loadError に理由を設定します。 */
  openCase: (caseId: Id) => void;
  /** 開いているケースを閉じます。ケースの一覧ページへ移るときに使います。 */
  closeCase: () => void;
  /** 保存済みのケースの一覧を読み直します。 */
  refreshSummaries: () => void;
  /** 空のケースを作って保存し、そのIDを返します。開いているケースは切り替えません。 */
  createCase: (name?: string) => Id;
  /**
   * 型の保証が無いデータを検証し、新しいケースとして保存して、そのIDを返します。
   * 保存済みのケースとIDが重なる場合は、元のケースを上書きしないよう、新しいIDを振ります。
   * 検証に失敗した場合は例外を投げ、ケースを追加しません。
   */
  importCase: (data: unknown) => Id;
  /** ケースを保存から消します。開いているケースを消した場合は、開いているケースを空にします。 */
  deleteCase: (caseId: Id) => void;
  /** 開いているケースの名前を変更します。 */
  renameCase: (name: string) => void;
  /** 同じIDの要素があれば置き換え、無ければ追加します。参照の整合性に違反する場合は例外を投げます。 */
  upsert: <K extends CollectionKey>(key: K, entity: Case[K][number]) => void;
  /**
   * 複数の要素をまとめて保存します。すべてを反映した状態で参照の整合性を1回だけ検証するため、
   * 新しい人物と、その人物に言及する証言を同時に保存できます。違反がある場合は例外を投げ、どの要素も保存しません。
   */
  upsertMany: (entries: UpsertEntry[]) => void;
  /** 要素を削除します。他のデータから参照されている場合は例外を投げます。 */
  remove: (key: CollectionKey, id: Id) => void;
  /**
   * 時系列ボードの項目を動かします。toIndex は、動かした後の並び順の中での位置（0始まり）です。
   * 日時と矛盾する位置を指定した場合は例外を投げ、ケースを変更しません。
   */
  moveTimelineItem: (key: TimelineKey, toIndex: number) => void;
};

/** ケースを開いていない状態で、ケースを変更しようとしたときのメッセージです。 */
const NO_OPEN_CASE_MESSAGE = 'ケースが開かれていません';

export const useCaseStore = create<CaseStore>()((set, get) => {
  /**
   * 開いているケースを、与えられた関数の結果で置き換えて保存します。
   * ケースを開いていない場合は例外を投げます（どのケースへ書き込むべきか決められないため）。
   */
  const updateCurrentCase = (update: (current: Case) => Case): void => {
    const { currentCase } = get();
    if (currentCase === null) throw new Error(NO_OPEN_CASE_MESSAGE);

    const nextCase = update(currentCase);
    if (nextCase === currentCase) return;
    saveCase(nextCase);
    set({ currentCase: nextCase, summaries: listCaseSummaries() });
  };

  return {
    currentCase: null,
    summaries: [],
    loadError: null,

    openCase: (caseId) => {
      try {
        set({ currentCase: loadCase(caseId), loadError: null });
      } catch (error) {
        set({ currentCase: null, loadError: error instanceof Error ? error.message : String(error) });
      }
    },

    closeCase: () => set({ currentCase: null, loadError: null }),

    refreshSummaries: () => set({ summaries: listCaseSummaries() }),

    createCase: (name) => {
      const created = createEmptyCase(name);
      saveCase(created);
      set({ summaries: listCaseSummaries() });
      return created.id;
    },

    importCase: (data) => {
      const parsed = parseCase(data);
      // 同じケースを2回読み込んだ場合に、先に読み込んだケースを失わないよう、IDが重なるときは新しいIDを振る
      const isDuplicated = listCaseSummaries().some((summary) => summary.id === parsed.id);
      const imported: Case = isDuplicated ? { ...parsed, id: nanoid() } : parsed;
      saveCase(imported);
      set({ summaries: listCaseSummaries() });
      return imported.id;
    },

    deleteCase: (caseId) => {
      deleteStoredCase(caseId);
      const { currentCase } = get();
      set({
        summaries: listCaseSummaries(),
        currentCase: currentCase?.id === caseId ? null : currentCase,
      });
    },

    renameCase: (name) => updateCurrentCase((current) => ({ ...current, name })),

    upsert: (key, entity) => get().upsertMany([{ key, entity } as UpsertEntry]),

    upsertMany: (entries) =>
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
        if (touchedKeys.length > 0) {
          nextCase = { ...nextCase, timelineOrder: settleTimelineItems(nextCase, touchedKeys) };
        }
        return nextCase;
      }),

    remove: (key, id) =>
      updateCurrentCase((current) => {
        const items = current[key] as { id: Id }[];
        const nextCase = { ...current, [key]: items.filter((item) => item.id !== id) } as Case;

        const violations = findCaseViolations(nextCase);
        if (violations.length > 0) {
          throw new Error(`他のデータから参照されているため削除できません\n${violations.join('\n')}`);
        }
        return nextCase;
      }),

    moveTimelineItem: (key, toIndex) =>
      updateCurrentCase((current) => ({ ...current, timelineOrder: moveTimelineItem(current, key, toIndex) })),
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

/**
 * 保存済みのデータを読み込む準備を行い、ケースの一覧を読み直します。
 * 1件だけ保存していた頃のデータがあれば、1件目のケースとして移行します（移行できなかった場合は loadError に理由を設定します）。
 * ブラウザ側（useEffect の中）から呼び出してください。
 */
export function initializeCaseStore(): void {
  const migrationError = migrateLegacyCase();
  useCaseStore.setState({
    summaries: listCaseSummaries(),
    ...(migrationError === null ? {} : { loadError: migrationError }),
  });
}
