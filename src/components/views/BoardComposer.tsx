/**
 * ボード上の入力欄
 *
 * 時系列ボードの書き足したい位置に開く、主張の1欄入力です。SNSに投稿する感覚で書けるよう、
 * 本文の1欄・「発言者」・投稿ボタンだけを表示します（ClaimForm の compact）。日時は、
 * 投稿後に主張の「詳細」から編集します。
 * 書いた位置から決まる初期値（時系列の並び順の中での位置）は defaults で受け取ります。
 * このコンポーネントは「やめる」と、編集中の主張の削除を加えます。
 */
'use client';

import { useState } from 'react';
import type { Claim } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
import { ClaimForm, type ClaimDefaults } from '../forms/ClaimForm';
import { FormError } from '../forms/fields';

type BoardComposerProps = {
  /** 編集する主張です。省略すると新規の書き足しになります。 */
  initial?: Claim;
  defaults?: ClaimDefaults;
  /** 保存・削除・取り消しのいずれかで入力欄を閉じるときに呼び出します。 */
  onClose: () => void;
};

export function BoardComposer({ initial, defaults, onClose }: BoardComposerProps) {
  const remove = useCaseStore((state) => state.remove);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = (claim: Claim) => {
    // 削除は取り消せないため、実行前に確認する
    if (!window.confirm('この主張を削除しますか？')) return;
    try {
      remove('claims', claim.id);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    onClose();
  };

  return (
    <div className="rounded border border-sky-300 bg-white p-3 shadow-sm">
      <ClaimForm
        initial={initial}
        defaults={defaults}
        onDone={onClose}
        autoFocus
        compact
        actions={
          <>
            {initial && (
              <button type="button" onClick={() => handleDelete(initial)} className="mr-auto text-xs text-red-600 hover:underline">
                この主張を削除
              </button>
            )}
            <button type="button" onClick={onClose} className="text-xs text-slate-600 hover:underline">
              やめる
            </button>
          </>
        }
      />
      <div className="mt-2">
        <FormError message={deleteError} />
      </div>
    </div>
  );
}
