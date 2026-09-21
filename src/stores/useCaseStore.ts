/**
 * 案件ストア
 *
 * 現在編集中の案件（Case）を1件だけ保持し、LocalStorageに自動保存します。
 * 追加・更新・削除のたびに参照の整合性を検証し、違反する操作は例外を投げて案件を変更しません。
 * 主張の追加・更新・削除で時系列ボードの並び順が日時と矛盾した場合は、該当する項目を最も近い矛盾しない位置へ動かします。
 *
 * 注意:
 * - この段階はドメインモデルの検証が目的のため、スキーマのマイグレーションは実装していません。
 *   モデルを変更して保存済みデータが検証に失敗した場合は、データを退避用のキーに保管し、
 *   loadError に理由を設定します（黙って空の案件に差し替えることはしません）。
 * - Next.jsのサーバー描画と食い違わないよう、skipHydration を有効にしています。
 *   ブラウザ側で useCaseStore.persist.rehydrate() を呼び出して復元してください。
 */
import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { findCaseViolations, parseCase } from '@/domain/case-schema';
import { moveTimelineItem, settleTimelineItems, timelineKeyOf, type TimelineKey } from '@/domain/timeline-order';
import type { Case, Id } from '@/domain/types';

/** 案件を保存するLocalStorageのキーです。 */
export const STORAGE_KEY = 'testimony-board-case';
/** 検証に失敗した保存データを退避するLocalStorageのキーです。 */
export const BACKUP_STORAGE_KEY = 'testimony-board-case-backup';

/** 案件が持つ一覧の名前です。 */
export type CollectionKey = 'persons' | 'places' | 'claims' | 'relationships';

/** 一覧の名前と、その一覧に保存する要素の組です。 */
export type UpsertEntry = { [K in CollectionKey]: { key: K; entity: Case[K][number] } }[CollectionKey];

type CaseStore = {
  currentCase: Case;
  /** 保存済みデータの復元に失敗した理由です。失敗していない場合は null です。 */
  loadError: string | null;
  /** 案件名を変更します。 */
  renameCase: (name: string) => void;
  /** 同じIDの要素があれば置き換え、無ければ追加します。参照の整合性に違反する場合は例外を投げます。 */
  upsert: <K extends CollectionKey>(key: K, entity: Case[K][number]) => void;
  /**
   * 複数の要素をまとめて保存します。すべてを反映した状態で参照の整合性を1回だけ検証するため、
   * 新しい人物と、その人物に言及する主張を同時に保存できます。違反がある場合は例外を投げ、どの要素も保存しません。
   */
  upsertMany: (entries: UpsertEntry[]) => void;
  /** 要素を削除します。他のデータから参照されている場合は例外を投げます。 */
  remove: (key: CollectionKey, id: Id) => void;
  /**
   * 時系列ボードの項目を動かします。toIndex は、動かした後の並び順の中での位置（0始まり）です。
   * 日時と矛盾する位置を指定した場合は例外を投げ、案件を変更しません。
   */
  moveTimelineItem: (key: TimelineKey, toIndex: number) => void;
  /** 読み込んだデータを検証し、案件全体を置き換えます。検証に失敗した場合は例外を投げます。 */
  replaceCase: (data: unknown) => void;
  /** 空の案件に置き換えます。 */
  resetCase: () => void;
};

/** 空の案件を作成します。 */
function createEmptyCase(): Case {
  return {
    id: nanoid(),
    name: '新しい案件',
    persons: [],
    places: [],
    claims: [],
    relationships: [],
    timelineOrder: [],
  };
}

export const useCaseStore = create<CaseStore>()(
  persist(
    (set, get) => ({
      currentCase: createEmptyCase(),
      loadError: null,

      renameCase: (name) => set({ currentCase: { ...get().currentCase, name } }),

      upsert: (key, entity) => get().upsertMany([{ key, entity } as UpsertEntry]),

      upsertMany: (entries) => {
        const { currentCase } = get();
        let nextCase = currentCase;
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
        set({ currentCase: nextCase });
      },

      remove: (key, id) => {
        const { currentCase } = get();
        const items = currentCase[key] as { id: Id }[];
        const nextCase = { ...currentCase, [key]: items.filter((item) => item.id !== id) } as Case;

        const violations = findCaseViolations(nextCase);
        if (violations.length > 0) {
          throw new Error(`他のデータから参照されているため削除できません\n${violations.join('\n')}`);
        }
        set({ currentCase: nextCase });
      },

      moveTimelineItem: (key, toIndex) => {
        const { currentCase } = get();
        set({ currentCase: { ...currentCase, timelineOrder: moveTimelineItem(currentCase, key, toIndex) } });
      },

      replaceCase: (data) => set({ currentCase: parseCase(data), loadError: null }),

      resetCase: () => set({ currentCase: createEmptyCase(), loadError: null }),
    }),
    {
      name: STORAGE_KEY,
      skipHydration: true,
      partialize: (state) => ({ currentCase: state.currentCase }),
      merge: (persistedState, currentState) => {
        // 保存データが無い初回起動でも merge は呼ばれるため、その場合は空の案件のまま始める
        if (persistedState === undefined || persistedState === null) return currentState;

        const persistedCase = (persistedState as { currentCase?: unknown } | undefined)?.currentCase;
        try {
          return { ...currentState, currentCase: parseCase(persistedCase), loadError: null };
        } catch (error) {
          // 次の自動保存で上書きされて失われないよう、検証に失敗したデータを退避する
          localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(persistedCase));
          return { ...currentState, loadError: error instanceof Error ? error.message : String(error) };
        }
      },
    }
  )
);
