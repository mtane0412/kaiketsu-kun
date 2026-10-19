/**
 * 第三者の説の、主唱者の立場の変化の入力フォーム
 *
 * 仮説の詳細の「主唱者の立場の変化」（HypothesisStanceSection）から開き、立場の変化（HypothesisStanceChange）を1件記録します。
 * 入力するのは、種類（撤回・修正・再び主張）・時期・根拠の証言・メモです。時期・根拠の証言・メモは任意です。
 * 根拠の証言の選択肢は、ケースのすべての証言を時系列の並び順に並べます（主唱者が撤回を表明した発言などを選びます）。
 *
 * 保存したときは、作った立場の変化を onSave に渡します。仮説への書き込みは呼び出し側が行います
 * （再描画を待たずに続けて操作しても前の変更を上書きしないよう、呼び出し側がストアにある最新の仮説を書き換えるためです）。
 * 時期の表記を解釈できない場合は、理由を示して onSave を呼びません。
 */
'use client';

import { nanoid } from 'nanoid';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { buildTimeline, claimLabelOf } from '@/domain/case-views';
import { parseDateInput } from '@/domain/date-input';
import { HYPOTHESIS_STANCE_CHANGE_KIND_LABELS } from '@/domain/labels';
import type { HypothesisStanceChange, HypothesisStanceChangeKind, Id } from '@/domain/types';
import { useCurrentCase } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { FormError, LABEL_CLASS, SubmitButton, TextField } from './fields';

/** 立場の変化の種類を、入力の選択肢に並べる順に並べたものです。 */
const STANCE_CHANGE_KINDS: readonly HypothesisStanceChangeKind[] = ['withdrawn', 'revised', 'reaffirmed'];

type HypothesisStanceChangeFormProps = {
  /** 保存したときに、作った立場の変化で呼び出します。 */
  onSave: (change: HypothesisStanceChange) => void;
  /** 入力をやめたときに呼び出します。 */
  onCancel: () => void;
};

export function HypothesisStanceChangeForm({ onSave, onCancel }: HypothesisStanceChangeFormProps) {
  const currentCase = useCurrentCase();
  /** 同じ画面に複数のフォームが並んでも入力欄が混ざらないよう、このフォーム固有の接頭辞を持ちます。 */
  const formId = useId();
  const errorId = `${formId}-error`;

  const [kind, setKind] = useState<HypothesisStanceChangeKind>('withdrawn');
  const [at, setAt] = useState('');
  const [basisClaimIds, setBasisClaimIds] = useState<Id[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const claimOptions = useMemo(() => buildTimeline(currentCase).items.map((item) => item.view), [currentCase]);

  const toggleBasisClaim = (claimId: Id) => {
    setBasisClaimIds((current) =>
      current.includes(claimId) ? current.filter((id) => id !== claimId) : [...current, claimId]
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsedAt = at.trim() === '' ? undefined : parseDateInput(at);
    if (parsedAt === null) {
      setError(`時期を解釈できません: ${at.trim()}（例: 2020、2020年5月）`);
      return;
    }
    // 未入力の時期・メモはキーごと持たせない（JSONの書き出しと読み込みで形が変わらないようにするため）
    const trimmedNote = note.trim();
    onSave({
      id: nanoid(),
      kind,
      ...(parsedAt !== undefined ? { at: parsedAt } : {}),
      basisClaimIds,
      ...(trimmedNote !== '' ? { note: trimmedNote } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <fieldset>
        <legend className={LABEL_CLASS}>種類</legend>
        <div className="flex flex-wrap gap-4">
          {STANCE_CHANGE_KINDS.map((candidate) => (
            <label key={candidate} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${formId}-kind`}
                checked={kind === candidate}
                onChange={() => setKind(candidate)}
              />
              {HYPOTHESIS_STANCE_CHANGE_KIND_LABELS[candidate]}
            </label>
          ))}
        </div>
      </fieldset>

      <TextField
        label="時期（任意）"
        value={at}
        onChange={setAt}
        placeholder="2020、2020年5月 など"
        invalid={error !== null}
        describedBy={error !== null ? errorId : undefined}
      />

      <fieldset>
        <legend className={LABEL_CLASS}>根拠の証言（任意）</legend>
        {claimOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">証言がまだありません。</p>
        ) : (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {claimOptions.map((view) => (
              <label key={view.claim.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={basisClaimIds.includes(view.claim.id)}
                  onChange={() => toggleBasisClaim(view.claim.id)}
                />
                <span className="min-w-0">
                  <span className="mr-1 text-xs text-muted-foreground">{view.speakerLabel}</span>
                  {claimLabelOf(view)}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <TextField label="メモ（任意）" value={note} onChange={setNote} multiline placeholder="謝罪とともに撤回した、など" />

      <FormError message={error} id={errorId} />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          やめる
        </Button>
        <SubmitButton label="立場の変化を保存" />
      </div>
    </form>
  );
}
