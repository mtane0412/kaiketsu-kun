/**
 * 証言への反応の入力フォーム
 *
 * 証言の詳細の「照合」（CrossCheckSection）から開き、ある証言に対して別の人物が示した反応
 * （「それは違う」「自分もそう見た」など）を、1回の保存で記録します。
 * 反応は、反応した人物の証言（Claim）と、元の証言との照合（CrossCheck）の2つとして保存します。
 * 反応を証言とは別の型にしないのは、反応も「誰が・いつ・どの聴取で述べたか」を持つ発言であり、
 * 供述の変遷・伝聞の経路・仮説のひもづけ・照合・検索で、他の証言と同じように扱えるようにするためです。
 *
 * 入力は、照合の種類と、証言のフォーム（ClaimForm）の見出し・本文・「発言者」です。
 * 反応の多くは否定のため、種類の初期値は「食い違う」にします。
 * 反応は別の人物の反応を記録するものであり、ユーザーの推測にはしないため、発言者を必須にします。
 * 反応の本文が一致・食い違いの中身を表すため、照合の理由は持たせません。
 * 反応の証言は、時系列の並び順で元の証言の直後に置きます（見比べやすくするためです）。
 *
 * 注意: 証言・照合・並び順の移動は同じ1回の保存で書き込み、いずれかが反映できない場合は何も保存しません
 * （ClaimForm の withEntries と defaults.insertIndex）。
 */
'use client';

import { nanoid } from 'nanoid';
import { useState } from 'react';
import { resolveTimelineOrder, timelineKeyOf } from '@/domain/timeline-order';
import type { CrossCheckKind, Id } from '@/domain/types';
import { useCurrentCase } from '@/stores/useCaseStore';
import { ClaimForm } from './ClaimForm';
import { CrossCheckKindField } from './CrossCheckForm';

type ReactionFormProps = {
  /** 反応の対象の証言のIDです。 */
  claimId: Id;
  /** 保存できたときに呼び出します。 */
  onDone: () => void;
  /** 入力をやめたときに呼び出します。 */
  onCancel: () => void;
};

export function ReactionForm({ claimId, onDone, onCancel }: ReactionFormProps) {
  const currentCase = useCurrentCase();
  const [kind, setKind] = useState<CrossCheckKind>('contradicts');

  // 元の証言の直後の位置です。元の証言がボードに無い場合は、位置を指定しません
  const originalIndex = resolveTimelineOrder(currentCase).indexOf(timelineKeyOf(claimId));
  const insertIndex = originalIndex === -1 ? undefined : originalIndex + 1;

  return (
    <div className="space-y-3">
      <CrossCheckKindField value={kind} onChange={setKind} />
      <ClaimForm
        defaults={{ insertIndex }}
        onDone={onDone}
        speakerRequiredMessage="反応した人物を発言者に選んでください"
        withEntries={(reactionClaimId) => [
          { key: 'crossChecks', entity: { id: nanoid(), claimIds: [claimId, reactionClaimId], kind } },
        ]}
        autoFocus
        compact
        actions={
          <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:underline">
            やめる
          </button>
        }
      />
    </div>
  );
}
