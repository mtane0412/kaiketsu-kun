/**
 * 仮説の詳細に並べる「主唱者の立場の変化」
 *
 * 第三者の説（主唱者を持つ仮説）について、主唱者が説を撤回・修正・再び主張したことを、根拠の証言とともに記録した順に並べます。
 * 各行には、種類・時期・メモと、根拠の証言へのリンクを並べ、記録を削除するボタンを置きます。
 * 「立場の変化を記録」から、入力フォーム（HypothesisStanceChangeForm）を開いて1件ずつ記録します。
 *
 * 立場の変化は主唱者の行動の記録であり、読み手の判断（仮説の状態）とは別に持ちます。
 * 読み手自身の仮説（主唱者を持たない仮説）は立場の変化を持てないため、呼び出し側はこの節を表示しません。
 *
 * 注意: 書き込みは、再描画を待たずに続けて操作しても前の変更を上書きしないよう、呼び出し側の update（ストアにある最新の仮説を書き換える）に任せます。
 */
'use client';

import { useState } from 'react';
import type { HypothesisStanceChangeView } from '@/domain/hypotheses';
import { HYPOTHESIS_STANCE_CHANGE_KIND_LABELS } from '@/domain/labels';
import { formatTimeRef } from '@/domain/time-ref';
import type { Hypothesis, HypothesisStanceChange, Id } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { ClaimLink } from './ClaimLink';
import { DeleteConfirmButton } from './DeleteConfirmButton';
import { HypothesisStanceChangeForm } from './forms/HypothesisStanceChangeForm';
import type { TabKey } from './routes';

/** この節の見出しです。読み上げのための名前（aria-label）にも使います。 */
const SECTION_LABEL = '主唱者の立場の変化';

/** 立場の変化の名前（「撤回（2020年5月）」など）を返します。一覧の見出しと、削除ボタンの読み上げ用の名前に使います。 */
function stanceChangeNameOf(change: HypothesisStanceChange): string {
  const kindLabel = HYPOTHESIS_STANCE_CHANGE_KIND_LABELS[change.kind];
  return change.at === undefined ? kindLabel : `${kindLabel}（${formatTimeRef(change.at)}）`;
}

type HypothesisStanceSectionProps = {
  stanceChanges: HypothesisStanceChangeView[];
  tab: TabKey;
  /** 仮説を書き換えて保存します。 */
  update: (change: (current: Hypothesis) => Hypothesis) => void;
};

export function HypothesisStanceSection({ stanceChanges, tab, update }: HypothesisStanceSectionProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);

  const handleSave = (change: HypothesisStanceChange) => {
    update((current) => ({ ...current, stanceChanges: [...(current.stanceChanges ?? []), change] }));
    setIsFormOpen(false);
  };

  /** 立場の変化を1件削除します。最後の1件を削除したときは、立場の変化の項目ごと取り除きます。 */
  const handleDelete = (id: Id) =>
    update((current) => {
      const { stanceChanges: currentChanges = [], ...rest } = current;
      const remaining = currentChanges.filter((change) => change.id !== id);
      return remaining.length === 0 ? rest : { ...rest, stanceChanges: remaining };
    });

  return (
    <section aria-label={SECTION_LABEL} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {SECTION_LABEL}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{stanceChanges.length}件</span>
      </h3>

      {stanceChanges.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          主唱者が説を撤回・修正した場合は、「立場の変化を記録」から根拠の証言とともに残せます。
        </p>
      ) : (
        <ul className="space-y-2">
          {stanceChanges.map(({ change, basis }) => (
            <li key={change.id} className="space-y-2 rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold">{stanceChangeNameOf(change)}</p>
                <DeleteConfirmButton
                  iconOnly
                  label={`${stanceChangeNameOf(change)}の記録を削除`}
                  title="この立場の変化の記録を削除しますか？"
                  description="この立場の変化の記録を仮説から削除します。この操作は取り消せません。根拠の証言は削除しません。"
                  onConfirm={() => handleDelete(change.id)}
                />
              </div>
              {change.note && <p className="whitespace-pre-line text-sm">{change.note}</p>}
              {basis.length === 0 ? (
                <p className="text-xs text-muted-foreground">根拠の証言は未登録です。</p>
              ) : (
                <ul className="space-y-1">
                  {basis.map((view) => (
                    <li key={view.claim.id}>
                      <ClaimLink view={view} tab={tab} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {isFormOpen ? (
        <section aria-label="立場の変化の記録" className="rounded-lg border bg-card p-3">
          <HypothesisStanceChangeForm onSave={handleSave} onCancel={() => setIsFormOpen(false)} />
        </section>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setIsFormOpen(true)}>
          立場の変化を記録
        </Button>
      )}
    </section>
  );
}
