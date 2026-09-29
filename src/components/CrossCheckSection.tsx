/**
 * 証言の詳細に並べる「照合」
 *
 * 開いている証言を含む照合（CrossCheck）の一覧と、登録・編集・削除をまとめます。
 * 照合は、読み手が証言同士を見比べて見つけた判断（裏付ける・食い違う・同じ事柄を述べている）を記録した一次データです。
 * 自動では判定しません。どちらの証言が正しいかも判定しません。
 *
 * 各行には、照合の種類・相手の証言へのリンク・理由を並べます。相手の証言へのリンクで「証言 → 照合 → 相手の証言」とたどれます。
 * 並びは相手の証言の時系列の並び順です（導出は src/domain/cross-checks.ts の buildClaimCrossChecks）。
 * 開いているタブ（tab）はリンク先のURLに引き継ぎます。
 *
 * 注意: 照合の入力は、この一覧の中でフォームを開いて行います（CrossCheckForm）。
 * 編集対象を切り替えるたびにフォームを作り直せるよう、フォームには対象のIDを key に渡します。
 */
'use client';

import { useState } from 'react';
import { claimLabelOf } from '@/domain/case-views';
import { buildClaimCrossChecks, type ClaimCrossCheckView } from '@/domain/cross-checks';
import { CROSS_CHECK_KIND_LABELS } from '@/domain/labels';
import type { Id } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { ClaimLink } from './ClaimLink';
import { DeleteConfirmButton } from './DeleteConfirmButton';
import { CrossCheckForm } from './forms/CrossCheckForm';
import { FormError } from './forms/fields';
import type { TabKey } from './routes';

/** この節の見出しです。読み上げのための名前（aria-label）にも使います。 */
const SECTION_LABEL = '照合';

/**
 * 編集・削除のボタンの、読み上げ用の名前を組み立てます。
 * 1件の証言が複数の照合を持つため、ボタンの名前には相手の証言の名前を含めて、どの照合への操作かを区別できるようにします。
 */
function actionLabelOf(view: ClaimCrossCheckView, action: string): string {
  return `「${claimLabelOf(view.other)}」との照合を${action}`;
}

/** 入力フォームの状態です。編集の場合は、対象の照合のIDを持ちます。 */
type FormState = { kind: 'closed' } | { kind: 'new' } | { kind: 'edit'; crossCheckId: Id };

type CrossCheckSectionProps = {
  claimId: Id;
  /** リンク先のURLに引き継ぐ、開いているタブです。 */
  tab: TabKey;
};

export function CrossCheckSection({ claimId, tab }: CrossCheckSectionProps) {
  const currentCase = useCurrentCase();
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
          {crossChecks.map((view) => (
            <li key={view.crossCheck.id} className="space-y-2 rounded-lg border bg-card p-3">
              <p className="text-xs font-semibold">{CROSS_CHECK_KIND_LABELS[view.crossCheck.kind]}</p>
              <ClaimLink view={view.other} tab={tab} />
              <p className="whitespace-pre-line text-sm">{view.crossCheck.reason}</p>

              <div className="flex items-center justify-end gap-2">
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
          ))}
        </ul>
      )}

      <FormError message={deleteError} />

      {form.kind === 'new' ? (
        <section aria-label="照合の登録" className="rounded-lg border bg-card p-3">
          <CrossCheckForm claimId={claimId} onDone={closeForm} onCancel={closeForm} />
        </section>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setForm({ kind: 'new' })}>
          照合を追加
        </Button>
      )}
    </section>
  );
}
