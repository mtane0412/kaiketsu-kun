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

import { FlaskConical, Plus, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent } from 'react';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Id } from '@/domain/types';
import { initializeCaseStore, useCaseStore } from '@/stores/useCaseStore';
import { Button, buttonVariants } from '@/components/ui/button';
import { DeleteConfirmButton } from './DeleteConfirmButton';
import { FormError } from './forms/fields';
import { boardHref } from './routes';

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

  const handleDelete = (caseId: Id) => deleteCase(caseId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">ケース</h1>
        <p className="text-sm text-muted-foreground">
          調べたい出来事ごとにケースを作り、証言・人物・場所を1つのボードに集めます。
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={handleCreate}>
          <Plus />
          新しいケース
        </Button>
        {/* ファイル選択は input が担うため、label にボタンの見た目だけを借りる（ボタンの役割を持たせると、input を入れ子にできない）。
            input は見えないため、input にフォーカスがあるときは、label の側にフォーカスの枠を出す */}
        <label
          className={buttonVariants({
            variant: 'outline',
            size: 'sm',
            className: 'cursor-pointer has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
          })}
        >
          <Upload />
          JSONを読み込む
          <input type="file" accept="application/json,.json" onChange={handleImport} className="sr-only" />
        </label>
        <Button type="button" variant="outline" size="sm" onClick={handleLoadSample}>
          <FlaskConical />
          架空のサンプルを読み込む
        </Button>
      </div>

      <FormError message={error ?? loadError} />

      <ul className="space-y-2">
        {summaries.map((summary) => (
          <li key={summary.id} className="flex items-center gap-2">
            <Link
              href={boardHref(summary.id, 'timeline')}
              className="min-w-0 flex-1 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-foreground/30"
            >
              <span className="block truncate font-semibold">{summary.name}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                証言{summary.claimCount}件・最終更新 {formatUpdatedAt(summary.updatedAt)}
              </span>
            </Link>
            <DeleteConfirmButton
              label={`「${summary.name}」を削除`}
              title={`ケース「${summary.name}」を削除しますか？`}
              description="このケースの証言・人物・場所をすべて削除します。この操作は取り消せません。"
              onConfirm={() => handleDelete(summary.id)}
              iconOnly
            />
          </li>
        ))}
      </ul>

      {isLoaded && summaries.length === 0 && (
        <section
          aria-labelledby="empty-cases-heading"
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center"
        >
          <h2 id="empty-cases-heading" className="text-sm font-semibold">
            保存されているケースはありません
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            「新しいケース」から書き始めるか、架空の事件のサンプルで、証言を時系列・グラフ・地図で見比べる流れを試せます。
          </p>
          <Button type="button" variant="outline" size="sm" onClick={handleLoadSample}>
            <FlaskConical />
            サンプルで使い方を見る
          </Button>
        </section>
      )}
    </div>
  );
}
