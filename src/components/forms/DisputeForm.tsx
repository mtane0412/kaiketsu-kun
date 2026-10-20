/**
 * 論点の入力フォーム
 *
 * 論点の詳細（DisputeDetail）と登録（NewDisputeDetail）で使い、論点（Dispute）の名前・両立できる読み方・解決したかどうかを入力します。
 * 両立できる読み方は任意で、空のまま保存すると項目ごと取り除きます（JSONの書き出しと読み込みで形が変わらないようにするためです）。
 *
 * 束ねた証言は、このフォームでは入力しません（論点の詳細で、1件ずつすぐに保存します）。
 * 保存するときは、フォームを開いた後で束ねた証言が変わっていても失わないよう、ストアにある最新の論点の証言を引き継ぎます。
 * 新規登録では、initialClaimIds に渡した証言を束ねて登録します（証言の詳細や照合の「論点を作る」から開いた場合です）。
 *
 * 注意: 名前が空白だけの論点などの規則違反は、ストアの検証（findCaseViolations）が例外で知らせ、フォームはその理由を表示します。
 * フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Dispute, Id } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
import { FormError, SubmitButton, TextField } from './fields';

type DisputeFormProps = {
  /** 編集する論点です。省略すると新規登録になります（未解決から始めます）。 */
  initial?: Dispute;
  /** 新規登録のときに、最初から束ねる証言です。編集では使いません。 */
  initialClaimIds?: Id[];
  /** 保存できたときに、保存した論点のIDで呼び出します。 */
  onDone: (id: Id) => void;
  /** 保存ボタンの横に並べる操作です（「やめる」など）。 */
  actions?: ReactNode;
  /** 開いたときに、名前の欄へフォーカスを置くかどうかです。 */
  autoFocus?: boolean;
};

export function DisputeForm({ initial, initialClaimIds = [], onDone, actions, autoFocus }: DisputeFormProps) {
  const upsert = useCaseStore((state) => state.upsert);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [reconciliation, setReconciliation] = useState(initial?.reconciliation ?? '');
  const [resolved, setResolved] = useState(initial?.resolved ?? false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // 開いたときだけ名前の欄へ移る。TextField は ref を受け取らないため、フォームの最初の入力欄を探す
  useEffect(() => {
    if (autoFocus) formRef.current?.querySelector('input')?.focus();
  }, [autoFocus]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    // フォームを開いた後に詳細で束ねた証言を上書きしないよう、ストアにある最新の論点から引き継ぐ
    const latest = useCaseStore.getState().currentCase?.disputes.find((dispute) => dispute.id === initial?.id);
    const trimmedReconciliation = reconciliation.trim();
    const dispute: Dispute = {
      id: initial?.id ?? nanoid(),
      title: title.trim(),
      claimIds: latest?.claimIds ?? initialClaimIds,
      // 未入力の任意項目はキーごと持たせない
      ...(trimmedReconciliation !== '' ? { reconciliation: trimmedReconciliation } : {}),
      resolved,
    };

    try {
      upsert('disputes', dispute);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    setError(null);
    onDone(dispute.id);
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <TextField label="名前" value={title} onChange={setTitle} required placeholder="物損事故の時刻" />
      <TextField
        label="両立できる読み方"
        value={reconciliation}
        onChange={setReconciliation}
        multiline
        placeholder="21:00は通報の時刻、21:40は現場に着いた時刻と読めば、両立する"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={resolved} onChange={(event) => setResolved(event.target.checked)} />
        解決した
      </label>
      <FormError message={error} />
      <div className="flex items-center justify-end gap-2">
        {actions}
        <SubmitButton label="論点を保存" />
      </div>
    </form>
  );
}
