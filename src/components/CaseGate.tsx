/**
 * 案件を開く枠
 *
 * URL（/cases/<案件のID>）が指す案件をブラウザの保存から開いてから、中の画面（ボードと詳細）を表示します。
 * 案件を開けなかった場合は、理由と、案件の一覧への導線を表示します。
 * 1件だけ保存していた頃のデータがある場合は、開く前に1件目の案件として移行します。
 *
 * 注意: LocalStorage はブラウザにしか無いため、案件を開く処理はマウント後（useEffect）に行います。
 * 開き終えるまでは、案件が無い状態で中の画面が描かれないよう、何も描画しません。
 */
'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import type { Id } from '@/domain/types';
import { BACKUP_STORAGE_KEY } from '@/lib/case-storage';
import { initializeCaseStore, useCaseStore } from '@/stores/useCaseStore';
import { casesHref } from './routes';

export function CaseGate({ caseId, children }: { caseId: Id; children: ReactNode }) {
  const currentCase = useCaseStore((state) => state.currentCase);
  const loadError = useCaseStore((state) => state.loadError);
  const openCase = useCaseStore((state) => state.openCase);

  useEffect(() => {
    initializeCaseStore();
    openCase(caseId);
  }, [caseId, openCase]);

  if (loadError !== null) {
    return (
      <div className="mx-auto mt-4 max-w-5xl space-y-3">
        <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">案件を開けませんでした</p>
          <p className="mt-1">
            保存データの形式が正しくない場合、そのデータはブラウザのLocalStorageのキー{' '}
            <code>{BACKUP_STORAGE_KEY}:{caseId}</code> に退避しました。
            データモデルの変更が原因の場合は、退避したデータを変換して、案件の一覧から「JSONを読み込む」で読み込んでください。
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs">{loadError}</pre>
        </div>
        <Link href={casesHref()} className="text-sm text-sky-700 hover:underline">
          案件の一覧へ
        </Link>
      </div>
    );
  }

  // 案件を開く前と、開いている案件を削除して一覧へ移る間は、中の画面を描かない
  if (currentCase === null) return null;

  return <>{children}</>;
}
