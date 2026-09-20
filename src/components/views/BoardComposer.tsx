/**
 * ボード上の入力欄
 *
 * 時系列ボードの書き足したい位置に開く、主張の1欄入力です。入力の中身は ClaimForm で、
 * このコンポーネントは「やめる」と、編集中の主張の削除を加えます。
 * 書いた位置から決まる初期値（出来事・日時）は defaults で受け取ります。
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
      <ClaimForm initial={initial} defaults={defaults} onDone={onClose} autoFocus />
      <div className="mt-2 flex items-center justify-between text-xs">
        <button type="button" onClick={onClose} className="text-slate-600 hover:underline">
          やめる
        </button>
        {initial && (
          <button type="button" onClick={() => handleDelete(initial)} className="text-red-600 hover:underline">
            この主張を削除
          </button>
        )}
      </div>
      <div className="mt-2">
        <FormError message={deleteError} />
      </div>
    </div>
  );
}
