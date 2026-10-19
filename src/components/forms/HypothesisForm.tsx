/**
 * 仮説の入力フォーム
 *
 * 仮説の詳細（HypothesisDetail）と登録（NewHypothesisDetail）で使い、仮説（Hypothesis）の見出し・説明・主唱者・唱えた時期・状態・否定の理由を入力します。
 * 主唱者の初期値は「読み手（自分）」です。主唱者に人物を選ぶと第三者の説になり、唱えた時期の欄を表示します。
 * 主唱者を「読み手（自分）」に戻して保存するときは、唱えた時期を取り除きます（読み手自身の仮説は唱えた時期を持てないためです）。
 * 否定の理由の欄は、状態に「否定された」を選んだときだけ表示し、入力を必須にします。
 * 否定以外の状態で保存するときは、否定の理由を取り除きます（否定されていない仮説は否定の理由を持てないためです）。
 *
 * 支える証言・反する証言・対象の人物・主唱者の立場の変化は、このフォームでは入力しません（仮説の詳細で、1件ずつすぐに保存します）。
 * 保存するときは、フォームを開いた後でひもづけが変わっていても失わないよう、ストアにある最新の仮説のひもづけを引き継ぎます。
 *
 * 注意: 見出しが空白だけの仮説などの規則違反は、ストアの検証（findCaseViolations）が例外で知らせ、フォームはその理由を表示します。
 * フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { parseDateInput } from '@/domain/date-input';
import { HYPOTHESIS_STATUSES } from '@/domain/hypotheses';
import { HYPOTHESIS_STATUS_LABELS } from '@/domain/labels';
import type { Hypothesis, HypothesisStatus, Id } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { FormError, INPUT_CLASS, LABEL_CLASS, SubmitButton, TextField } from './fields';

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
  /** 主唱者の人物のIDです。空文字列は、読み手自身の仮説（主唱者なし）を表します。 */
  const [proponentPersonId, setProponentPersonId] = useState<Id>(initial?.proponentPersonId ?? '');
  const [proposedAt, setProposedAt] = useState(initial?.proposedAt ?? '');
  /** 唱えた時期の表記を解釈できなかったかどうかです。欄を誤りとして示し、エラー表示と結び付けるために持ちます。 */
  const [isProposedAtInvalid, setIsProposedAtInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = `${formId}-error`;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setIsProposedAtInvalid(false);
    // 唱えた時期は、第三者の説（主唱者あり）でだけ持たせる。空欄なら持たせない
    const hasProponent = proponentPersonId !== '';
    const parsedProposedAt = hasProponent && proposedAt.trim() !== '' ? parseDateInput(proposedAt) : undefined;
    if (parsedProposedAt === null) {
      setError(`唱えた時期を解釈できません: ${proposedAt.trim()}（例: 2018、2018年5月）`);
      setIsProposedAtInvalid(true);
      return;
    }
    // フォームを開いた後に詳細でひもづけた証言・対象の人物・立場の変化を上書きしないよう、最新の仮説から引き継ぐ
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
      ...(hasProponent ? { proponentPersonId } : {}),
      ...(parsedProposedAt !== undefined ? { proposedAt: parsedProposedAt } : {}),
      ...(latest?.stanceChanges !== undefined ? { stanceChanges: latest.stanceChanges } : {}),
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

      <div className="grid gap-1.5">
        <label htmlFor={`${formId}-proponent`} className={LABEL_CLASS}>
          主唱者
        </label>
        <select
          id={`${formId}-proponent`}
          value={proponentPersonId}
          onChange={(event) => setProponentPersonId(event.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">読み手（自分）</option>
          {currentCase.persons.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>

      {proponentPersonId !== '' && (
        <TextField
          label="唱えた時期（任意）"
          value={proposedAt}
          onChange={setProposedAt}
          placeholder="2018、2018年5月 など"
          invalid={isProposedAtInvalid}
          describedBy={isProposedAtInvalid ? errorId : undefined}
        />
      )}

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

      <FormError message={error} id={errorId} />
      <div className="flex items-center justify-end gap-2">
        {actions}
        <SubmitButton label="仮説を保存" />
      </div>
    </form>
  );
}
