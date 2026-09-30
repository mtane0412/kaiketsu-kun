/**
 * 照合の入力フォーム
 *
 * 証言の詳細の「照合」（CrossCheckSection）から開き、1件の照合（CrossCheck）を登録・編集します。
 * 入力するのは、相手の証言・照合の種類・理由の3つです。理由は任意です（見比べれば明らかな照合では書かずに済むようにするためです）。
 *
 * 相手の証言の選択肢は、開いている証言を除いたすべての証言を、時系列の並び順に並べます。
 * 照合は向きを持たないため、開いている証言を claimIds の1件目、選んだ相手を2件目として保存します。
 * 編集では、登録済みの照合の claimIds の並びを保ち、相手の側だけを差し替えます。
 *
 * 種類の選択欄（CrossCheckKindField）は、反応の記録（ReactionForm）でも使います。
 *
 * 注意: 同じ証言どうしの照合などの規則違反は、ストアの検証（findCaseViolations）が例外で知らせ、フォームはその理由を表示します。
 * フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { buildTimeline, claimLabelOf } from '@/domain/case-views';
import { CROSS_CHECK_KINDS } from '@/domain/cross-checks';
import { CROSS_CHECK_KIND_LABELS } from '@/domain/labels';
import type { CrossCheck, CrossCheckKind, Id } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { FormError, INPUT_CLASS, LABEL_CLASS, SubmitButton, TextField } from './fields';

type CrossCheckFormProps = {
  /** 開いている証言（この照合の一方）のIDです。 */
  claimId: Id;
  /** 編集する照合です。省略すると新規登録になります。 */
  initial?: CrossCheck;
  /** 保存できたときに呼び出します。 */
  onDone: () => void;
  /** 入力をやめたときに呼び出します。 */
  onCancel: () => void;
};

export function CrossCheckForm({ claimId, initial, onDone, onCancel }: CrossCheckFormProps) {
  const currentCase = useCurrentCase();
  const upsert = useCaseStore((state) => state.upsert);
  /** 同じ画面に複数のフォームが並んでも入力欄が混ざらないよう、このフォーム固有の接頭辞を持ちます。 */
  const formId = useId();

  /** 編集中の照合で、開いている証言が claimIds の2件目に置かれているかどうかです。保存時に並びを保つために使います。 */
  const isSecond = initial !== undefined && initial.claimIds[1] === claimId;

  const [otherClaimId, setOtherClaimId] = useState<Id>(() =>
    initial === undefined ? '' : isSecond ? initial.claimIds[0] : initial.claimIds[1]
  );
  const [kind, setKind] = useState<CrossCheckKind>(initial?.kind ?? 'supports');
  const [reason, setReason] = useState(initial?.reason ?? '');
  const [error, setError] = useState<string | null>(null);

  // 自分自身とは照合できないため、選択肢から開いている証言を外す
  const otherClaimOptions = useMemo(
    () => buildTimeline(currentCase).items.map((item) => item.view).filter((view) => view.claim.id !== claimId),
    [currentCase, claimId]
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    // 未入力の理由はキーごと持たせない（JSONの書き出しと読み込みで形が変わらないようにするため）
    const crossCheck: CrossCheck = {
      id: initial?.id ?? nanoid(),
      claimIds: isSecond ? [otherClaimId, claimId] : [claimId, otherClaimId],
      kind,
    };
    if (reason.trim()) crossCheck.reason = reason.trim();

    try {
      upsert('crossChecks', crossCheck);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-1.5">
        <label htmlFor={`${formId}-other`} className={LABEL_CLASS}>
          相手の証言
        </label>
        <select
          id={`${formId}-other`}
          value={otherClaimId}
          required
          onChange={(event) => setOtherClaimId(event.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">選んでください</option>
          {otherClaimOptions.map((view) => (
            <option key={view.claim.id} value={view.claim.id}>
              {view.speakerLabel}: {claimLabelOf(view)}
            </option>
          ))}
        </select>
      </div>

      <CrossCheckKindField value={kind} onChange={setKind} />

      <TextField
        label="理由（任意）"
        value={reason}
        onChange={setReason}
        multiline
        placeholder="どこがどう一致したか、どう食い違ったか"
      />

      <FormError message={error} />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          やめる
        </Button>
        <SubmitButton label="照合を保存" />
      </div>
    </form>
  );
}

type CrossCheckKindFieldProps = {
  value: CrossCheckKind;
  onChange: (kind: CrossCheckKind) => void;
};

/**
 * 照合の種類（裏付ける・食い違う・同じ事柄を述べている）を選ぶ欄です。
 */
export function CrossCheckKindField({ value, onChange }: CrossCheckKindFieldProps) {
  /** 同じ画面に複数の欄が並んでもラジオボタンの組が混ざらないよう、この欄固有の名前を持ちます。 */
  const name = useId();
  return (
    <fieldset>
      <legend className={LABEL_CLASS}>種類</legend>
      <div className="space-y-1">
        {CROSS_CHECK_KINDS.map((candidate) => (
          <label key={candidate} className="flex items-center gap-2 text-sm">
            <input type="radio" name={name} checked={value === candidate} onChange={() => onChange(candidate)} />
            {CROSS_CHECK_KIND_LABELS[candidate]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
