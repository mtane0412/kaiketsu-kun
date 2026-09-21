/**
 * ケースの一覧
 *
 * ブラウザに保存されているケースを並べ、開くケースを選びます（トップページ）。
 * ケースをまたぐ操作（新しいケース・JSONの読み込み・架空のサンプルの読み込み・ケースの削除）は、この画面が担います。
 * ケースを1件だけ保存していた頃のデータがある場合は、一覧を読む前に1件目のケースとして移行します。
 *
 * 1件だけ保存していた頃のデータを移行できなかった場合は、その理由もこの画面で伝えます（移行は起動のたびに試みるため、一覧が入口になります）。
 *
 * 注意: LocalStorage はブラウザにしか無いため、一覧の読み込みはマウント後（useEffect）に行います。
 * 読み込みが終わるまではケースが0件に見えるため、「ケースがありません」という案内は、読み込みが終わってから表示します。
 */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent } from 'react';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Id } from '@/domain/types';
import { initializeCaseStore, useCaseStore } from '@/stores/useCaseStore';
import { boardHref } from './routes';

const BUTTON_CLASS = 'rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50';

/** 更新日時を「2026/09/21 19:30」の形で表示します。 */
function formatUpdatedAt(updatedAt: string): string {
  return new Date(updatedAt).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CaseList() {
  const summaries = useCaseStore((state) => state.summaries);
  const createCase = useCaseStore((state) => state.createCase);
  const importCase = useCaseStore((state) => state.importCase);
  const deleteCase = useCaseStore((state) => state.deleteCase);
  const closeCase = useCaseStore((state) => state.closeCase);
  /** 1件だけ保存していた頃のデータを移行できなかった場合の理由です。 */
  const loadError = useCaseStore((state) => state.loadError);
  const router = useRouter();
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 一覧ではケースを開かないため、前に開いていたケースを閉じる
    closeCase();
    initializeCaseStore();
    setIsLoaded(true);
  }, [closeCase]);

  /** 作った・読み込んだケースのボードへ移ります。 */
  const openBoard = (caseId: Id) => router.push(boardHref(caseId, 'timeline'));

  const handleCreate = () => {
    setError(null);
    openBoard(createCase());
  };

  const handleLoadSample = () => {
    setError(null);
    openBoard(importCase(sampleFictionalCase));
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを続けて選び直せるよう、選択状態を戻す
    event.target.value = '';
    if (!file) return;

    try {
      openBoard(importCase(JSON.parse(await file.text())));
      setError(null);
    } catch (caught) {
      setError(`「${file.name}」を読み込めませんでした\n${caught instanceof Error ? caught.message : String(caught)}`);
    }
  };

  const handleDelete = (caseId: Id, name: string) => {
    // 削除は取り消せないため、実行前に確認する
    if (!window.confirm(`ケース「${name}」を削除しますか？この操作は取り消せません。`)) return;
    deleteCase(caseId);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-bold text-slate-900">ケース</h1>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleCreate} className={BUTTON_CLASS}>
          新しいケース
        </button>
        <label className={`${BUTTON_CLASS} cursor-pointer`}>
          JSONを読み込む
          <input type="file" accept="application/json,.json" onChange={handleImport} className="sr-only" />
        </label>
        <button type="button" onClick={handleLoadSample} className={BUTTON_CLASS}>
          架空のサンプルを読み込む
        </button>
      </div>

      {(error ?? loadError) !== null && (
        <p role="alert" className="whitespace-pre-line rounded bg-red-50 px-2 py-1.5 text-sm text-red-700">
          {error ?? loadError}
        </p>
      )}

      <ul className="space-y-2">
        {summaries.map((summary) => (
          <li key={summary.id} className="flex items-center gap-2">
            <Link
              href={boardHref(summary.id, 'timeline')}
              className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-3 py-2 hover:border-sky-400"
            >
              <span className="block truncate font-semibold text-slate-900">{summary.name}</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                証言{summary.claimCount}件・最終更新 {formatUpdatedAt(summary.updatedAt)}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => handleDelete(summary.id, summary.name)}
              aria-label={`「${summary.name}」を削除`}
              className="text-xs text-red-600 hover:underline"
            >
              削除
            </button>
          </li>
        ))}
      </ul>

      {isLoaded && summaries.length === 0 && <p className="text-sm text-slate-600">保存されているケースはありません。</p>}
    </div>
  );
}
