/**
 * 人物どうしの関係の入力フォーム
 *
 * 人物の詳細の「関係」（RelationshipSection）から開き、1件の関係（Relationship）を登録・編集します。
 * 入力するのは、相手の人物・関係の名前・向き・根拠の証言の4つです。
 *
 * 向きは「双方向」と「片方向」の2択です。片方向の選択肢には、どちらからどちらへ向くかを人物の名前で示します。
 * 向きを反転する操作は持ちません。関係は、登録した人物を from として保存し、編集では from と to を保ったまま
 * 相手だけを差し替えます。指し示されている側の人物の詳細から編集したときに、向きが黙って入れ替わらないようにするためです。
 * 向きを逆にしたい場合は、関係を削除して、反対側の人物から登録し直してください。
 *
 * 根拠の証言は、関係に関わる2人（編集中の人物と、選んだ相手）のいずれかが関わる証言に絞って並べます
 * （選択肢の導出は src/domain/person-relationships.ts の buildBasisClaimCandidates を参照）。
 * 根拠を1件も選ばない関係も保存できます。根拠がまだ見つかっていない見立ても書き留められるようにするためです。
 *
 * 注意: フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは
 * 呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useId, useState, type FormEvent } from 'react';
import { claimLabelOf } from '@/domain/case-views';
import { buildBasisClaimCandidates } from '@/domain/person-relationships';
import type { Id, Relationship } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { FormError, INPUT_CLASS, LABEL_CLASS, SubmitButton, TextField } from './fields';
import { Button } from '@/components/ui/button';

/** 相手をまだ選んでいないときに、向きの選択肢で相手を指す言葉です。 */
const UNSELECTED_OTHER_LABEL = '相手';

type RelationshipFormProps = {
  /** 編集中の人物（この関係の一方の当事者）のIDです。 */
  personId: Id;
  /** 編集中の人物の名前です。向きの選択肢に表示します。 */
  personName: string;
  /** 編集する関係です。省略すると新規登録になります。 */
  initial?: Relationship;
  /** 保存できたときに呼び出します。 */
  onDone: () => void;
  /** 入力をやめたときに呼び出します。 */
  onCancel: () => void;
};

export function RelationshipForm({ personId, personName, initial, onDone, onCancel }: RelationshipFormProps) {
  const currentCase = useCurrentCase();
  const upsert = useCaseStore((state) => state.upsert);
  /** 同じ画面に複数のフォームが並んでも入力欄が混ざらないよう、このフォーム固有の接頭辞を持ちます。 */
  const formId = useId();

  /**
   * 編集中の人物が、この関係の指し示されている側（to）かどうかです。
   * 保存するときに from と to のどちらへ相手を入れるかを、この値で決めます。
   */
  const isIncoming = initial !== undefined && initial.fromPersonId !== personId;

  const [otherPersonId, setOtherPersonId] = useState<Id>(() =>
    initial === undefined ? '' : isIncoming ? initial.fromPersonId : initial.toPersonId
  );
  const [label, setLabel] = useState(initial?.label ?? '');
  const [directed, setDirected] = useState(initial?.directed ?? false);
  const [basisClaimIds, setBasisClaimIds] = useState<Id[]>(initial?.basisClaimIds ?? []);
  const [error, setError] = useState<string | null>(null);

  // 自分自身との関係は登録できないため、選択肢から編集中の人物を外す
  const otherPersonOptions = currentCase.persons.filter((person) => person.id !== personId);
  const otherName = otherPersonOptions.find((person) => person.id === otherPersonId)?.name ?? UNSELECTED_OTHER_LABEL;
  const [fromName, toName] = isIncoming ? [otherName, personName] : [personName, otherName];

  const basisCandidates = buildBasisClaimCandidates(
    currentCase,
    [personId, ...(otherPersonId ? [otherPersonId] : [])],
    basisClaimIds
  );

  const toggleBasisClaim = (claimId: Id) => {
    setBasisClaimIds((current) =>
      current.includes(claimId) ? current.filter((id) => id !== claimId) : [...current, claimId]
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const [fromPersonId, toPersonId] = isIncoming ? [otherPersonId, personId] : [personId, otherPersonId];
    const relationship: Relationship = {
      id: initial?.id ?? nanoid(),
      fromPersonId,
      toPersonId,
      label: label.trim(),
      directed,
      basisClaimIds,
    };

    try {
      upsert('relationships', relationship);
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
          相手の人物
        </label>
        <select
          id={`${formId}-other`}
          value={otherPersonId}
          required
          onChange={(event) => setOtherPersonId(event.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">選んでください</option>
          {otherPersonOptions.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>

      <TextField label="関係の名前" value={label} onChange={setLabel} required placeholder="雇用主、幼なじみ、金銭トラブル？ など" />

      <fieldset>
        <legend className={LABEL_CLASS}>向き</legend>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${formId}-direction`}
              checked={!directed}
              onChange={() => setDirected(false)}
            />
            双方向（{personName}と{otherName}）
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${formId}-direction`}
              checked={directed}
              onChange={() => setDirected(true)}
            />
            片方向（{fromName}から{toName}へ）
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className={LABEL_CLASS}>根拠の証言</legend>
        {basisCandidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">この2人が関わる証言は、まだありません。</p>
        ) : (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {basisCandidates.map((view) => (
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

      <FormError message={error} />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          やめる
        </Button>
        <SubmitButton label="関係を保存" />
      </div>
    </form>
  );
}
