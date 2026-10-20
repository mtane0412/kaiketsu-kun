/**
 * 保存の失敗の知らせ
 *
 * 変更をブラウザに保存できなかったことを、ケースごとに1件ずつ示します（src/stores/useCaseStore.ts の saveErrors）。
 * ケースの画面（CaseGate）と、ケースの一覧（CaseList）の両方で使います。
 *
 * 注意:
 * - 変更が画面に残っている間（discarded が false）は、JSON を書き出すまで示し続けるため、閉じるボタンを出しません。
 * - 変更が画面から失われた知らせ（discarded が true）は、利用者が読んだら閉じられるようにします。閉じないと、どの画面にも残り続けるためです。
 */
'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { describeSaveError, useCaseStore } from '@/stores/useCaseStore';

/**
 * 保存の失敗の知らせを、ケースごとに並べます。失敗が無い場合は何も描きません。
 *
 * @param className 知らせを並べる枠に足すクラスです（画面の上部に固定する、など）。
 */
export function SaveErrorNotices({ className }: { className?: string }) {
  const saveErrors = useCaseStore((state) => state.saveErrors);
  const dismissSaveError = useCaseStore((state) => state.dismissSaveError);
  if (saveErrors.length === 0) return null;

  return (
    <div className={cn('space-y-1', className)}>
      {saveErrors.map((saveError) => (
        <div
          key={saveError.caseId}
          role="alert"
          className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive"
        >
          <p className="flex-1">{describeSaveError(saveError)}</p>
          {saveError.discarded && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`ケース「${saveError.caseName}」を保存できなかったことの表示を閉じる`}
              onClick={() => dismissSaveError(saveError.caseId)}
            >
              <X />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
