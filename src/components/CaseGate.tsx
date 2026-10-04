/**
 * ケースを開く枠
 *
 * URL（/cases/<ケースのID>）が指すケースをブラウザの保存から開いてから、中の画面（ボードと詳細）を表示します。
 * ケースを開けなかった場合は、理由と、ケースの一覧への導線を表示します。
 * 理由は2通りに分けて伝えます。保存が無い（URLが誤っている・削除済み）場合は「見つからない」ことだけを伝え、
 * 保存データの形式が正しくない場合だけ、データの退避先と対処を伝えます（無関係な対処へ誘導しないためです）。
 * 1件だけ保存していた頃のデータがある場合は、開く前に1件目のケースとして移行します。
 *
 * 注意: LocalStorage はブラウザにしか無いため、ケースを開く処理はマウント後（useEffect）に行います。
 * 開き終えるまでは、ケースが無い状態で中の画面が描かれないよう、何も描画しません。
 */
'use client';

import { ArrowLeft, FileWarning, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import type { Id } from '@/domain/types';
import { BACKUP_STORAGE_KEY, hasStoredCase } from '@/lib/case-storage';
import { initializeCaseStore, useCaseStore } from '@/stores/useCaseStore';
import { buttonVariants } from '@/components/ui/button';
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
    const isMissing = !hasStoredCase(caseId);
    const Icon = isMissing ? SearchX : FileWarning;
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
        <div role="alert" className="space-y-3">
          <Icon aria-hidden="true" className="size-8 text-muted-foreground" />
          <h1 className="text-xl font-semibold tracking-tight">
            {isMissing ? 'ケースが見つかりません' : 'ケースを開けませんでした'}
          </h1>
          {isMissing ? (
            <p className="text-sm text-muted-foreground">
              URLが誤っているか、このブラウザからケースが削除されています。ケースのデータはブラウザごとに保存されるため、
              別のブラウザで作ったケースは、そのブラウザで書き出したJSONを読み込んでください。
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                保存データの形式が正しくないため、そのデータをブラウザのLocalStorageのキー{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                  {BACKUP_STORAGE_KEY}:{caseId}
                </code>{' '}
                に退避しました。データモデルの変更が原因の場合は、退避したデータを変換して、ケースの一覧から「JSONを読み込む」で読み込んでください。
              </p>
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
                {loadError}
              </pre>
            </>
          )}
        </div>
        <div>
          <Link href={casesHref()} className={buttonVariants()}>
            <ArrowLeft />
            ケースの一覧へ
          </Link>
        </div>
      </div>
    );
  }

  // ケースを開く前と、開いているケースを削除して一覧へ移る間は、中の画面を描かない
  if (currentCase === null) return null;

  return <>{children}</>;
}
