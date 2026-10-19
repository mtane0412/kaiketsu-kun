/**
 * ケースを開く枠
 *
 * URL（/cases/<ケースのID>）が指すケースをブラウザの保存から開いてから、中の画面（ボードと詳細）を表示します。
 * ケースを開けなかった場合は、理由と、ケースの一覧への導線を表示します。
 * 理由は2通りに分けて伝えます。保存が無い（URLが誤っている・削除済み）場合は「見つからない」ことだけを伝え、
 * 保存データの形式が正しくない場合だけ、データの退避先と対処を伝えます（無関係な対処へ誘導しないためです）。
 * LocalStorage に保存していた頃のデータがある場合は、開く前に新しい保存先（IndexedDB）へ移します。
 * ケースを開いた後に変更を保存できなかった場合は、中の画面を残したまま、上部に理由と対処を示します（saveError）。
 *
 * 注意: IndexedDB はブラウザにしか無いため、ケースを開く処理はマウント後（useEffect）に行います。
 * 開き終えるまでは、ケースが無い状態で中の画面が描かれないよう、何も描画しません。
 */
'use client';

import { ArrowLeft, FileWarning, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import type { Id } from '@/domain/types';
import { CASE_KEY_PREFIX, DATABASE_NAME } from '@/lib/case-storage';
import { initializeCaseStore, useCaseStore, type CaseLoadError } from '@/stores/useCaseStore';
import { buttonVariants } from '@/components/ui/button';
import { casesHref } from './routes';

/** 保存データの場所を示す、等幅の短い表記です。 */
function StorageName({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">{children}</code>;
}

/** ケースを開けなかった理由ごとの、データの在りかと対処の案内です（見つからない場合は呼び出し元が別に案内します）。 */
function LoadErrorGuidance({ kind, caseId }: { kind: Exclude<CaseLoadError['kind'], 'missing'>; caseId: Id }) {
  switch (kind) {
    case 'invalid':
      return (
        <>
          保存データの形式が正しくないため、そのデータをブラウザのIndexedDB（データベース <StorageName>{DATABASE_NAME}</StorageName>{' '}
          のストア <StorageName>backups</StorageName>、キー <StorageName>{caseId}</StorageName>
          ）に退避しました。データモデルの変更が原因の場合は、退避したデータを変換して、ケースの一覧から「JSONを読み込む」で読み込んでください。
        </>
      );
    case 'migration':
      return (
        <>
          このケースを、以前の保存先（LocalStorage）から移せませんでした。データは LocalStorage のキー{' '}
          <StorageName>
            {CASE_KEY_PREFIX}
            {caseId}
          </StorageName>{' '}
          に残しています。データを変換して、ケースの一覧から「JSONを読み込む」で読み込んでください。
        </>
      );
    case 'storage':
      return 'ブラウザの保存領域を読み書きできませんでした。プライベートブラウズでは保存領域を使えない場合があります。';
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function CaseGate({ caseId, children }: { caseId: Id; children: ReactNode }) {
  const currentCase = useCaseStore((state) => state.currentCase);
  const loadError = useCaseStore((state) => state.loadError);
  const saveError = useCaseStore((state) => state.saveError);
  const openCase = useCaseStore((state) => state.openCase);

  useEffect(() => {
    // 移行を終えてから開く（LocalStorage にしか無いケースを「見つからない」としないため）
    void initializeCaseStore().then(() => openCase(caseId));
  }, [caseId, openCase]);

  if (loadError !== null) {
    const { kind } = loadError;
    const isMissing = kind === 'missing';
    const Icon = isMissing ? SearchX : FileWarning;
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
        <div role="alert" className="space-y-3">
          <Icon aria-hidden="true" className="size-8 text-muted-foreground" />
          <h1 className="text-xl font-semibold tracking-tight">
            {isMissing ? 'ケースが見つかりません' : 'ケースを開けませんでした'}
          </h1>
          {kind === 'missing' ? (
            <p className="text-sm text-muted-foreground">
              URLが誤っているか、このブラウザからケースが削除されています。ケースのデータはブラウザごとに保存されるため、
              別のブラウザで作ったケースは、そのブラウザで書き出したJSONを読み込んでください。
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                <LoadErrorGuidance kind={kind} caseId={caseId} />
              </p>
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
                {loadError.message}
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

  return (
    <>
      {saveError !== null && (
        <div role="alert" className="sticky top-0 z-50 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {saveError}
        </div>
      )}
      {children}
    </>
  );
}
