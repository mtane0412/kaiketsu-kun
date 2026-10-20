/**
 * 証言の詳細に並べる「照合」
 *
 * 開いている証言を含む照合（CrossCheck）の一覧と、登録・編集・削除をまとめます。
 * 照合は、読み手が証言同士を見比べて見つけた判断（裏付ける・食い違う・同じ事柄を述べている）を記録した一次データです。
 * 自動では判定しません。どちらの証言が正しいかも判定しません。
 *
 * 各行には、照合の種類・相手の証言へのリンク・相手の証言が載っている資料（ある場合）・理由（ある場合）を並べます。
 * 資料は、媒体・日付（転載なら原典の発行日）・資料の格の短い表示で示します（src/domain/interviews.ts の formatClaimSourceLabels）。
 * 同じ媒体が日によって違う内容を報じる場合に、どの資料どうしの照合かを、相手の証言を開かずに見比べられるようにするためです。相手の証言へのリンクで「証言 → 照合 → 相手の証言」とたどれます。
 * 並びは相手の証言の時系列の並び順です（導出は src/domain/cross-checks.ts の buildClaimCrossChecks）。
 * 開いているタブ（tab）はリンク先のURLに引き継ぎます。
 *
 * 各行には「論点を作る」を置き、照合した2件の証言を束ねた論点（Dispute）の登録へ進めます。
 * 同じ事柄で3件目以上の証言が食い違うと分かったときに、照合の組み合わせを増やさずに論点で見比べられるようにするためです。
 *
 * 「反応を記録」からは、この証言に対する別の人物の反応を、反応した人物の証言と照合として1回で記録します（ReactionForm）。
 *
 * 注意: 照合の入力は、この一覧の中でフォームを開いて行います（CrossCheckForm）。
 * 編集対象を切り替えるたびにフォームを作り直せるよう、フォームには対象のIDを key に渡します。
 */
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { claimLabelOf } from '@/domain/case-views';
import { buildClaimCrossChecks, type ClaimCrossCheckView } from '@/domain/cross-checks';
import { formatClaimSourceLabels } from '@/domain/interviews';
import { CROSS_CHECK_KIND_LABELS } from '@/domain/labels';
import type { Id } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { Button, buttonVariants } from '@/components/ui/button';
import { ClaimLink } from './ClaimLink';
import { DeleteConfirmButton } from './DeleteConfirmButton';
import { CrossCheckForm } from './forms/CrossCheckForm';
import { ReactionForm } from './forms/ReactionForm';
import { FormError } from './forms/fields';
import { newDisputeHref, type TabKey } from './routes';
import { useCaseId } from './useCaseId';

/** この節の見出しです。読み上げのための名前（aria-label）にも使います。 */
const SECTION_LABEL = '照合';

/**
 * 編集・削除のボタンの、読み上げ用の名前を組み立てます。
 * 1件の証言が複数の照合を持ち、同じ相手との間にも種類の異なる照合を登録できるため、
 * ボタンの名前には相手の証言の名前と照合の種類を含めて、どの照合への操作かを区別できるようにします。
 */
function actionLabelOf(view: ClaimCrossCheckView, action: string): string {
  return `「${claimLabelOf(view.other)}」との照合（${CROSS_CHECK_KIND_LABELS[view.crossCheck.kind]}）を${action}`;
}

/** 入力フォームの状態です。編集の場合は、対象の照合のIDを持ちます。 */
type FormState = { kind: 'closed' } | { kind: 'new' } | { kind: 'reaction' } | { kind: 'edit'; crossCheckId: Id };

type CrossCheckSectionProps = {
  claimId: Id;
  /** リンク先のURLに引き継ぐ、開いているタブです。 */
  tab: TabKey;
};

export function CrossCheckSection({ claimId, tab }: CrossCheckSectionProps) {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const remove = useCaseStore((state) => state.remove);
  const [form, setForm] = useState<FormState>({ kind: 'closed' });
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const crossChecks = buildClaimCrossChecks(currentCase, claimId);
  const closeForm = () => setForm({ kind: 'closed' });

  const handleDelete = (crossCheckId: Id) => {
    setDeleteError(null);
    try {
      remove('crossChecks', crossCheckId);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <section aria-label={SECTION_LABEL} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {SECTION_LABEL}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{crossChecks.length}件</span>
      </h3>

      {crossChecks.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          「照合を追加」から、この証言を裏付ける・食い違う・同じ事柄を述べている他の証言を記録できます。
        </p>
      ) : (
        <ul className="space-y-2">
          {crossChecks.map((view) => {
            const sourceLabels = formatClaimSourceLabels(currentCase, view.other.claim);
            return (
              <li key={view.crossCheck.id} className="space-y-2 rounded-lg border bg-card p-3">
                <p className="text-xs font-semibold">{CROSS_CHECK_KIND_LABELS[view.crossCheck.kind]}</p>
                <ClaimLink view={view.other} tab={tab} />
                {sourceLabels.length > 0 && <p className="text-xs text-muted-foreground">資料: {sourceLabels.join(' / ')}</p>}
                {view.crossCheck.reason && <p className="whitespace-pre-line text-sm">{view.crossCheck.reason}</p>}

                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={newDisputeHref(caseId, tab, view.crossCheck.claimIds)}
                    aria-label={actionLabelOf(view, 'もとに論点を作る')}
                    className={`mr-auto ${buttonVariants({ variant: 'ghost', size: 'sm' })}`}
                  >
                    論点を作る
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={actionLabelOf(view, '編集')}
                    onClick={() => setForm({ kind: 'edit', crossCheckId: view.crossCheck.id })}
                  >
                    編集
                  </Button>
                  <DeleteConfirmButton
                    iconOnly
                    label={actionLabelOf(view, '削除')}
                    title="この照合を削除しますか？"
                    description="この照合をケースから削除します。この操作は取り消せません。照合した証言は削除しません。"
                    onConfirm={() => handleDelete(view.crossCheck.id)}
                  />
                </div>

                {form.kind === 'edit' && form.crossCheckId === view.crossCheck.id && (
                  <section aria-label="照合の編集" className="border-t pt-3">
                    <CrossCheckForm
                      key={view.crossCheck.id}
                      claimId={claimId}
                      initial={view.crossCheck}
                      onDone={closeForm}
                      onCancel={closeForm}
                    />
                  </section>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <FormError message={deleteError} />

      {form.kind === 'new' && (
        <section aria-label="照合の登録" className="rounded-lg border bg-card p-3">
          <CrossCheckForm claimId={claimId} onDone={closeForm} onCancel={closeForm} />
        </section>
      )}
      {form.kind === 'reaction' && (
        <section aria-label="反応の記録" className="rounded-lg border bg-card p-3">
          <ReactionForm claimId={claimId} onDone={closeForm} onCancel={closeForm} />
        </section>
      )}
      {form.kind !== 'new' && form.kind !== 'reaction' && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setForm({ kind: 'new' })}>
            照合を追加
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setForm({ kind: 'reaction' })}>
            反応を記録
          </Button>
        </div>
      )}
    </section>
  );
}
