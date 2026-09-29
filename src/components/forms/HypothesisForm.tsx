/**
 * 仮説の入力フォーム
 *
 * 仮説の詳細（HypothesisDetail）と登録（NewHypothesisDetail）で使い、仮説（Hypothesis）の見出し・説明・状態・否定の理由を入力します。
 * 否定の理由の欄は、状態に「否定された」を選んだときだけ表示し、入力を必須にします。
 * 否定以外の状態で保存するときは、否定の理由を取り除きます（否定されていない仮説は否定の理由を持てないためです）。
 *
 * 支える証言・反する証言・対象の人物は、このフォームでは入力しません（仮説の詳細で、1件ずつすぐに保存します）。
 * 保存するときは、フォームを開いた後でひもづけが変わっていても失わないよう、ストアにある最新の仮説のひもづけを引き継ぎます。
 *
 * 注意: 見出しが空白だけの仮説などの規則違反は、ストアの検証（findCaseViolations）が例外で知らせ、フォームはその理由を表示します。
 * フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { HYPOTHESIS_STATUSES } from '@/domain/hypotheses';
import { HYPOTHESIS_STATUS_LABELS } from '@/domain/labels';
import type { Hypothesis, HypothesisStatus, Id } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { FormError, LABEL_CLASS, SubmitButton, TextField } from './fields';

type HypothesisFormProps = {
  /** 編集する仮説です。省略すると新規登録になります（状態は検討中から始めます）。 */
  initial?: Hypothesis;
  /** 保存できたときに、保存した仮説のIDで呼び出します。 */
  onDone: (id: Id) => void;
  /** 保存ボタンの横に並べる操作です（削除ボタンなど）。 */
  actions?: ReactNode;
};

export function HypothesisForm({ initial, onDone, actions }: HypothesisFormProps) {
  const currentCase = useCurrentCase();
  const upsert = useCaseStore((state) => state.upsert);
  /** 同じ画面に複数のフォームが並んでも入力欄が混ざらないよう、このフォーム固有の接頭辞を持ちます。 */
  const formId = useId();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState<HypothesisStatus>(initial?.status ?? 'open');
  const [rejectionReason, setRejectionReason] = useState(initial?.rejectionReason ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    // フォームを開いた後に詳細でひもづけた証言・対象の人物を上書きしないよう、最新の仮説から引き継ぐ
    const latest = currentCase.hypotheses.find((hypothesis) => hypothesis.id === initial?.id);
    const trimmedDescription = description.trim();
    const hypothesis: Hypothesis = {
      id: initial?.id ?? nanoid(),
      title: title.trim(),
      ...(trimmedDescription !== '' ? { description: trimmedDescription } : {}),
      status,
      ...(status === 'rejected' ? { rejectionReason: rejectionReason.trim() } : {}),
      supportingClaimIds: latest?.supportingClaimIds ?? [],
      opposingClaimIds: latest?.opposingClaimIds ?? [],
      targets: latest?.targets ?? [],
    };

    try {
      upsert('hypotheses', hypothesis);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    setError(null);
    onDone(hypothesis.id);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextField label="見出し" value={title} onChange={setTitle} required placeholder="管理人が失踪に関わっている" />
      <TextField label="説明" value={description} onChange={setDescription} multiline />

      <fieldset>
        <legend className={LABEL_CLASS}>状態</legend>
        <div className="flex flex-wrap gap-4">
          {HYPOTHESIS_STATUSES.map((candidate) => (
            <label key={candidate} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${formId}-status`}
                checked={status === candidate}
                onChange={() => setStatus(candidate)}
              />
              {HYPOTHESIS_STATUS_LABELS[candidate]}
            </label>
          ))}
        </div>
      </fieldset>

      {status === 'rejected' && (
        <TextField
          label="否定の理由"
          value={rejectionReason}
          onChange={setRejectionReason}
          required
          multiline
          placeholder="どの証言・記録で否定されたか"
        />
      )}

      <FormError message={error} />
      <div className="flex items-center justify-end gap-2">
        {actions}
        <SubmitButton label="仮説を保存" />
      </div>
    </form>
  );
}
