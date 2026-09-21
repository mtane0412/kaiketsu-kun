/**
 * ボード上の入力欄
 *
 * 時系列ボードの書き足したい位置に開く、証言の1欄入力です。SNSに投稿する感覚で書けるよう、
 * 本文の1欄・「発言者」・投稿ボタンだけを表示します（ClaimForm の compact）。日時は、
 * 投稿後に証言の詳細ページ（ClaimDetail）で編集します。
 * 書いた位置から決まる初期値（時系列の並び順の中での位置）は defaults で受け取ります。
 * このコンポーネントは「やめる」を加えます。新規の書き足し専用で、登録済みの証言の編集には使いません。
 */
'use client';

import { ClaimForm, type ClaimDefaults } from '../forms/ClaimForm';

type BoardComposerProps = {
  defaults?: ClaimDefaults;
  /** 保存・取り消しのいずれかで入力欄を閉じるときに呼び出します。 */
  onClose: () => void;
};

export function BoardComposer({ defaults, onClose }: BoardComposerProps) {
  return (
    <div className="rounded-lg border border-ring bg-card p-3 shadow-sm">
      <ClaimForm
        defaults={defaults}
        onDone={onClose}
        autoFocus
        compact
        actions={
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:underline">
            やめる
          </button>
        }
      />
    </div>
  );
}
