/**
 * 案件ストア
 *
 * 現在編集中の案件（Case）を1件だけ保持し、LocalStorageに自動保存します。
 * 追加・更新・削除のたびに参照の整合性を検証し、違反する操作は例外を投げて案件を変更しません。
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
import type { Case, Id } from '@/domain/types';

/** 案件を保存するLocalStorageのキーです。 */
export const STORAGE_KEY = 'testimony-board-case';
/** 検証に失敗した保存データを退避するLocalStorageのキーです。 */
export const BACKUP_STORAGE_KEY = 'testimony-board-case-backup';

/** 案件が持つ一覧の名前です。 */
export type CollectionKey = 'sources' | 'persons' | 'places' | 'events' | 'claims' | 'relationships';

type CaseStore = {
  currentCase: Case;
  /** 保存済みデータの復元に失敗した理由です。失敗していない場合は null です。 */
  loadError: string | null;
  /** 案件名を変更します。 */
  renameCase: (name: string) => void;
  /** 同じIDの要素があれば置き換え、無ければ追加します。参照の整合性に違反する場合は例外を投げます。 */
  upsert: <K extends CollectionKey>(key: K, entity: Case[K][number]) => void;
  /** 要素を削除します。他のデータから参照されている場合は例外を投げます。 */
  remove: (key: CollectionKey, id: Id) => void;
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
    sources: [],
    persons: [],
    places: [],
    events: [],
    claims: [],
    relationships: [],
  };
}

export const useCaseStore = create<CaseStore>()(
  persist(
    (set, get) => ({
      currentCase: createEmptyCase(),
      loadError: null,

      renameCase: (name) => set({ currentCase: { ...get().currentCase, name } }),

      upsert: (key, entity) => {
        const { currentCase } = get();
        const items = currentCase[key] as { id: Id }[];
        const exists = items.some((item) => item.id === entity.id);
        const nextItems = exists ? items.map((item) => (item.id === entity.id ? entity : item)) : [...items, entity];
        const nextCase = { ...currentCase, [key]: nextItems } as Case;

        const violations = findCaseViolations(nextCase);
        if (violations.length > 0) {
          throw new Error(violations.join('\n'));
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
