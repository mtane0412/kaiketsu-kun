/**
 * 保存データの復元を待つ枠
 *
 * ブラウザに保存済みの案件を復元してから、中の画面を表示します。すべてのページで共有するため、ルートレイアウトに置きます。
 * 復元に失敗した場合は、理由と、保存されていたデータの退避先を、どのページでも表示します。
 *
 * 注意: ストアは skipHydration を有効にしているため、このコンポーネントがマウント時に復元を実行します。
 * 復元が終わるまでは、空の案件が一瞬表示されて保存データを上書きすることを避けるため、何も描画しません。
 */
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { BACKUP_STORAGE_KEY, useCaseStore } from '@/stores/useCaseStore';

export function CaseStoreGate({ children }: { children: ReactNode }) {
  const loadError = useCaseStore((state) => state.loadError);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let isActive = true;
    Promise.resolve(useCaseStore.persist.rehydrate()).then(() => {
      if (isActive) setIsHydrated(true);
    });
    return () => {
      isActive = false;
    };
  }, []);

  if (!isHydrated) return null;

  return (
    <>
      {loadError && (
        <div role="alert" className="mx-auto mt-4 max-w-5xl rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">保存済みの案件を復元できませんでした</p>
          <p className="mt-1">
            保存されていたデータは、ブラウザのLocalStorageのキー <code>{BACKUP_STORAGE_KEY}</code> に退避しました。
            データモデルの変更が原因の場合は、退避したデータを変換して「JSONを読み込む」から読み込んでください。
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs">{loadError}</pre>
        </div>
      )}
      {children}
    </>
  );
}
