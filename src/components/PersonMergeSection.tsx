/**
 * 人物の詳細の「同じ人物をまとめる」節
 *
 * 資料ごとに別の人物として登録した人物（「男」「村内の男性」など）が、調べた結果、同じ人物だと分かったときに使います。
 * 開いている人物を、選んだ人物（まとめ先）にまとめます（src/domain/person-merge.ts の mergePersons）。
 * - まとめると、開いている人物は削除され、証言・資料・関係・仮説・未了事項からの参照は、まとめ先の人物に付け替わります。
 *   開いている人物の名前と別名は、まとめ先の人物の別名に残します。
 * - 取り消せない操作のため、確認の画面で改めて承認を求めます。
 * - まとめられない場合（2人の間に関係がある場合など）は、理由を示し、ケースを変えません。
 * - まとめたら、開いている人物のURLは無くなるため、まとめ先の人物の詳細へ移ります（履歴は置き換えます）。
 *
 * 1人の人物を2人に分ける操作は、同じ詳細の「人物を分ける」節（src/components/PersonSplitSection.tsx）にあります。
 */
'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { Id } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { FormError, INPUT_CLASS, LABEL_CLASS } from './forms/fields';
import { personHref, type TabKey } from './routes';
import { useCaseId } from './useCaseId';

/** まとめ先を選んでいない場合の、選択肢の値です。 */
const UNSELECTED = '';

/** 節の見出しです。 */
const SECTION_LABEL = '同じ人物をまとめる';

type PersonMergeSectionProps = {
  personId: Id;
  personName: string;
  tab: TabKey;
};

export function PersonMergeSection({ personId, personName, tab }: PersonMergeSectionProps) {
  const caseId = useCaseId();
  const currentCase = useCurrentCase();
  const mergePersons = useCaseStore((state) => state.mergePersons);
  const router = useRouter();
  const fieldId = useId();
  const [intoId, setIntoId] = useState<Id>(UNSELECTED);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = currentCase.persons.filter((person) => person.id !== personId);
  const intoName = others.find((person) => person.id === intoId)?.name;

  const handleConfirm = () => {
    setIsConfirming(false);
    try {
      mergePersons(personId, intoId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    // まとめた人物のURLへ「戻る」で戻らないよう、履歴を置き換える
    router.replace(personHref(caseId, intoId, tab));
  };

  return (
    <section aria-label={SECTION_LABEL} className="space-y-2">
      <h3 className="text-sm font-semibold">{SECTION_LABEL}</h3>
      <p className="text-xs text-muted-foreground">
        この人物が、ほかの人物と同じだと分かった場合に、まとめ先の人物に統合します。証言などの参照はまとめ先に付け替わり、この人物の名前はまとめ先の別名に残ります。
      </p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor={fieldId} className={LABEL_CLASS}>
            まとめ先の人物
          </label>
          <select id={fieldId} value={intoId} onChange={(event) => setIntoId(event.target.value)} className={INPUT_CLASS}>
            <option value={UNSELECTED}>選んでください</option>
            {others.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={intoName === undefined} onClick={() => setIsConfirming(true)}>
          まとめる
        </Button>
      </div>
      <FormError message={error} />

      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`「${personName}」を「${intoName ?? ''}」にまとめますか？`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`「${personName}」への参照をすべて「${intoName ?? ''}」に付け替え、「${personName}」を削除します。この操作は取り消せません。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>やめる</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>まとめる</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
