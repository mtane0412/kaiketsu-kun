/**
 * 人物の詳細の「人物を分ける」節
 *
 * 資料が「弟」とだけ書いていて次男か三男かを決められず、1人の人物として登録した後で、別の人物だと分かったときに使います。
 * 新しい人物の名前を入れ、開いている人物を参照している箇所のうち、新しい人物へ移すものを選びます（src/domain/person-split.ts の splitPerson）。
 * - 参照は、証言の発言者・経由・本文での言及、資料の聴取者・原典の媒体・資料での呼び方、関係、仮説、未了事項、メモでの言及の単位で選べます。
 *   参照ごとに、参照元（証言の見出し・本文の冒頭、資料の名前など）と、参照のしかた（発言者など）を示します。
 * - 選ばなかった参照は、開いている人物に残ります。移す候補は自動では選びません。新しい人物の名前を入れ、参照を1件以上選ぶまで、分けられません
 *   （参照を1件も移さない場合は、人物の登録と変わらないためです）。
 * - 新しい人物の種別（個人・組織など）は、開いている人物と同じにします。名前以外の項目は、分けた後に新しい人物の詳細で入力します。
 * - 取り消せない操作のため、確認の画面で改めて承認を求めます。分けたら、新しい人物の詳細へ移ります。
 */
'use client';

import { nanoid } from 'nanoid';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { describePersonReference, listPersonReferences } from '@/domain/person-split';
import type { Id, PersonKind } from '@/domain/types';
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

/** 節の見出しです。 */
const SECTION_LABEL = '人物を分ける';

type PersonSplitSectionProps = {
  personId: Id;
  personName: string;
  personKind: PersonKind;
  tab: TabKey;
};

export function PersonSplitSection({ personId, personName, personKind, tab }: PersonSplitSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section aria-label={SECTION_LABEL} className="space-y-2">
      <h3 className="text-sm font-semibold">{SECTION_LABEL}</h3>
      <p className="text-xs text-muted-foreground">
        この人物が、実は2人の別の人物だと分かった場合に、新しい人物を作り、選んだ参照（証言の発言者など）だけを新しい人物に移します。
      </p>
      {isOpen ? (
        <PersonSplitter
          personId={personId}
          personName={personName}
          personKind={personKind}
          tab={tab}
          onCancel={() => setIsOpen(false)}
        />
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(true)}>
          分け方を選ぶ
        </Button>
      )}
    </section>
  );
}

type PersonSplitterProps = PersonSplitSectionProps & {
  /** 分けずに、参照の一覧を閉じるときに呼び出します。 */
  onCancel: () => void;
};

/** 新しい人物の名前と、移す参照を選ぶ部分です。開いている間だけ描画し、閉じたら入力を捨てます。 */
function PersonSplitter({ personId, personName, personKind, tab, onCancel }: PersonSplitterProps) {
  const caseId = useCaseId();
  const currentCase = useCurrentCase();
  const splitPerson = useCaseStore((state) => state.splitPerson);
  const router = useRouter();
  const nameFieldId = useId();
  const [newName, setNewName] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 一覧はケース全体を走査して作るため、名前の入力や選択の切り替えのたびに作り直さないよう、ケースと人物が変わったときだけ作る
  const references = useMemo(
    () =>
      listPersonReferences(currentCase, personId).map((reference) => ({
        key: reference.key,
        ...describePersonReference(currentCase, reference),
      })),
    [currentCase, personId]
  );
  // 参照元の種類（証言・資料など）ごとに、一覧の順のまままとめる
  const groups = useMemo(
    () =>
      [...new Set(references.map((reference) => reference.group))].map((group) => ({
        group,
        references: references.filter((reference) => reference.group === group),
      })),
    [references]
  );
  const trimmedName = newName.trim();

  const toggle = (key: string) =>
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleConfirm = () => {
    setIsConfirming(false);
    // 前回の失敗の理由を、今回の結果と取り違えないよう消す
    setError(null);
    const newPersonId = nanoid();
    try {
      splitPerson(personId, { id: newPersonId, name: trimmedName, kind: personKind }, [...selectedKeys]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    // 元の人物は残るため、「戻る」で元の人物の詳細へ戻れるよう、履歴に積む
    router.push(personHref(caseId, newPersonId, tab));
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <label htmlFor={nameFieldId} className={LABEL_CLASS}>
          新しい人物の名前
        </label>
        <input id={nameFieldId} value={newName} onChange={(event) => setNewName(event.target.value)} className={INPUT_CLASS} />
      </div>

      {references.length === 0 ? (
        <p className="text-sm text-muted-foreground">この人物を参照している箇所はありません。</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedKeys(new Set(references.map((reference) => reference.key)))}>
              すべて選ぶ
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedKeys(new Set())}>
              すべて外す
            </Button>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {`${references.length}件のうち${selectedKeys.size}件を移します`}
            </p>
          </div>
          {groups.map(({ group, references: items }) => (
            <fieldset key={group} className="space-y-1">
              <legend className="text-xs font-semibold">{`${group}（${items.length}件）`}</legend>
              {items.map((reference) => (
                <label key={reference.key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedKeys.has(reference.key)}
                    onChange={() => toggle(reference.key)}
                  />
                  <span>
                    <span className="font-medium">{reference.role}</span>
                    {'：'}
                    <span className="break-all">{reference.subject}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}

      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={trimmedName === '' || selectedKeys.size === 0} onClick={() => setIsConfirming(true)}>
          分ける
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          やめる
        </Button>
      </div>

      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`「${personName}」から「${trimmedName}」を分けますか？`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`新しい人物「${trimmedName}」を作り、選んだ${selectedKeys.size}件の参照を「${trimmedName}」に移します。選ばなかった参照は「${personName}」に残ります。この操作は取り消せません。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>やめる</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>分ける</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
