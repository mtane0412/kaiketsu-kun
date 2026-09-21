/**
 * 案件ツールバー
 *
 * 開いている案件の名前の変更、JSONの書き出し、案件の削除と、案件の一覧への導線を持ちます。
 * 案件の追加（新しい案件・JSONの読み込み・架空のサンプル）は、案件をまたぐ操作のため、案件の一覧（CaseList）が担います。
 *
 * 注意: この段階ではスキーマのマイグレーションが無いため、JSONの書き出しが入力済みデータを守る唯一の手段です。
 * 案件の削除は取り消せないため、実行前に確認します。
 */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { casesHref } from './routes';

const BUTTON_CLASS = 'rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50';

export function CaseToolbar() {
  const currentCase = useCurrentCase();
  const renameCase = useCaseStore((state) => state.renameCase);
  const deleteCase = useCaseStore((state) => state.deleteCase);
  const router = useRouter();

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(currentCase, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${currentCase.name}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // 一部のブラウザはダウンロードの開始前にURLが破棄されると失敗するため、破棄は次のタスクまで遅らせる
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleDelete = () => {
    // 削除は取り消せないため、実行前に確認する
    if (!window.confirm(`案件「${currentCase.name}」を削除しますか？この操作は取り消せません。`)) return;
    deleteCase(currentCase.id);
    // 削除した案件のURLへ「戻る」で戻らないよう、履歴を置き換える
    router.replace(casesHref());
  };

  return (
    <div className="space-y-2">
      <Link href={casesHref()} className="inline-block text-xs text-slate-600 hover:underline">
        案件の一覧
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          aria-label="案件名"
          value={currentCase.name}
          onChange={(event) => renameCase(event.target.value)}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xl font-bold text-slate-900 hover:border-slate-300 focus:border-sky-500 focus:bg-white focus:outline-none"
        />
        <button type="button" onClick={handleExport} className={BUTTON_CLASS}>
          JSONを書き出す
        </button>
        <button type="button" onClick={handleDelete} className={`${BUTTON_CLASS} text-red-600`}>
          この案件を削除
        </button>
      </div>
    </div>
  );
}
