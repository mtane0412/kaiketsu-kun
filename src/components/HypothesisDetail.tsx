/**
 * 仮説の詳細・登録
 *
 * ボード（CaseBoard）と入れ替えて表示します。仮説1件について、次の3つをこの1か所で行います。
 * 1. 見出し・説明・状態・否定の理由の編集と、仮説の削除（HypothesisForm）
 * 2. 仮説を支える証言・反する証言のひもづけ。証言を選ぶとすぐにひもづけ、外すボタンですぐに外します
 * 3. 対象の人物ごとに、動機・機会・手段の3つの観点で関連する証言を整理する表。
 *    人物を行、観点を列に並べ、被疑者どうしで、どの観点の証言がそろっているかを見比べられるようにします
 * 証言は時系列の並び順に並べます（導出は src/domain/hypotheses.ts の buildHypothesisDetail）。
 *
 * 仮説の登録（NewHypothesisDetail）は、見出し・説明・状態だけを入力し、保存すると、ひもづけを続けられるよう詳細へ移ります。
 * 登録のURLへ「戻る」で戻ると、同じ仮説を二重に登録しかねないため、履歴は置き換えます。
 *
 * 注意: 同じ証言を支える証言と反する証言の両方にはひもづけられないため、一方にひもづけた証言は、もう一方の選択肢に並べません。
 * ケースに無い仮説のIDが渡された場合（URLの直接入力、削除済みの仮説）は、見つからないことを表示します。
 * 仮説のフォームは初期値を初期化でのみ使用するため、呼び出し側は hypothesisId が変わるたびに key を変えて再マウントしてください。
 * useSearchParams を使うため、ページでは Suspense の中に置いてください。
 */
'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { buildTimeline, claimLabelOf, type ClaimView } from '@/domain/case-views';
import { buildHypothesisDetail, HYPOTHESIS_ASPECTS } from '@/domain/hypotheses';
import { HYPOTHESIS_ASPECT_LABELS } from '@/domain/labels';
import type { Hypothesis, HypothesisAspect, Id } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { ClaimLink } from './ClaimLink';
import { DeleteConfirmButton } from './DeleteConfirmButton';
import { FormError, INPUT_CLASS } from './forms/fields';
import { HypothesisForm } from './forms/HypothesisForm';
import { boardHref, hypothesisHref, parseTab, personHref, TAB_SEARCH_PARAM, type TabKey } from './routes';
import { useCaseId } from './useCaseId';

/** 対象の人物の表の名前です。読み上げのための名前（aria-label）にも使います。 */
const TARGET_TABLE_LABEL = '対象の人物の動機・機会・手段';

/** 詳細を閉じて、ボードへ戻るリンクです。 */
function CloseLink({ tab }: { tab: TabKey }) {
  const caseId = useCaseId();
  return (
    <div className="flex justify-end">
      <Link href={boardHref(caseId, tab)} aria-label="仮説の詳細を閉じる" className="text-xs text-muted-foreground hover:underline">
        閉じる
      </Link>
    </div>
  );
}

type ClaimAddSelectProps = {
  /** 選択欄の名前です（「支える証言を追加」など）。 */
  label: string;
  /** 選択肢に並べる証言です。 */
  candidates: ClaimView[];
  onAdd: (claimId: Id) => void;
};

/** 証言を選ぶと、すぐにひもづける選択欄です。選んだ後は、次の証言を選べるよう、未選択の状態に戻ります。 */
function ClaimAddSelect({ label, candidates, onAdd }: ClaimAddSelectProps) {
  return (
    <select
      aria-label={label}
      value=""
      disabled={candidates.length === 0}
      onChange={(event) => {
        if (event.target.value !== '') onAdd(event.target.value);
      }}
      className={INPUT_CLASS}
    >
      <option value="">{candidates.length === 0 ? 'ひもづけられる証言がありません' : `${label}…`}</option>
      {candidates.map((view) => (
        <option key={view.claim.id} value={view.claim.id}>
          {view.speakerLabel}: {claimLabelOf(view)}
        </option>
      ))}
    </select>
  );
}

type LinkedClaimListProps = {
  views: ClaimView[];
  tab: TabKey;
  /** ひもづけを外すボタンの、読み上げ用の名前に添える、ひもづけ先の名前です（「支える証言」「管理人の手段」など）。 */
  linkLabel: string;
  onRemove: (claimId: Id) => void;
  /** 1件も無いときに示す文です。 */
  emptyMessage: string;
};

/** ひもづけた証言を、証言の詳細へのリンクと、ひもづけを外すボタンの組で並べます。 */
function LinkedClaimList({ views, tab, linkLabel, onRemove, emptyMessage }: LinkedClaimListProps) {
  if (views.length === 0) return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  return (
    <ul className="space-y-1">
      {views.map((view) => (
        <li key={view.claim.id} className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <ClaimLink view={view} tab={tab} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`「${claimLabelOf(view)}」を${linkLabel}から外す`}
            title={`${linkLabel}から外す`}
            onClick={() => onRemove(view.claim.id)}
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function HypothesisDetail({ hypothesisId }: { hypothesisId: Id }) {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const upsert = useCaseStore((state) => state.upsert);
  const remove = useCaseStore((state) => state.remove);
  const router = useRouter();
  const tab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));
  const detail = useMemo(() => buildHypothesisDetail(currentCase, hypothesisId), [currentCase, hypothesisId]);
  const allClaims = useMemo(() => buildTimeline(currentCase).items.map((item) => item.view), [currentCase]);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!detail) {
    return (
      <div className="space-y-4">
        <CloseLink tab={tab} />
        <h2 className="text-lg font-semibold">仮説が見つかりません</h2>
        <p className="text-sm text-muted-foreground">この仮説は削除されたか、URLが誤っています。</p>
      </div>
    );
  }

  const { hypothesis } = detail;

  /** 仮説を書き換えて、すぐに保存します。保存できなかった場合は理由を表示します。 */
  const update = (change: (current: Hypothesis) => Hypothesis) => {
    setError(null);
    try {
      upsert('hypotheses', change(hypothesis));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  /** 証言の一覧から、既にひもづけた証言を除いた選択肢を返します。 */
  const claimsExcept = (claimIds: Id[]) => allClaims.filter((view) => !claimIds.includes(view.claim.id));
  // 同じ証言を支える証言と反する証言の両方にはひもづけられないため、どちらかにひもづけた証言は両方の選択肢から除く
  const linkableClaims = claimsExcept([...hypothesis.supportingClaimIds, ...hypothesis.opposingClaimIds]);
  const targetPersonIds = hypothesis.targets.map((target) => target.personId);
  const personCandidates = currentCase.persons.filter((person) => !targetPersonIds.includes(person.id));

  /** 対象の人物 personId の観点 aspect の証言を書き換えます。 */
  const updateAspect = (personId: Id, aspect: HypothesisAspect, change: (claimIds: Id[]) => Id[]) =>
    update((current) => ({
      ...current,
      targets: current.targets.map((target) =>
        target.personId === personId ? { ...target, claimIds: { ...target.claimIds, [aspect]: change(target.claimIds[aspect]) } } : target
      ),
    }));

  const handleDelete = () => {
    try {
      remove('hypotheses', hypothesisId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    // 削除した仮説のURLへ「戻る」で戻らないよう、履歴を置き換える
    router.replace(boardHref(caseId, tab));
  };

  /** 支える証言・反する証言の節です。 */
  const claimSection = (label: string, key: 'supportingClaimIds' | 'opposingClaimIds', views: ClaimView[]) => (
    <section aria-label={label} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {label}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{views.length}件</span>
      </h3>
      <LinkedClaimList
        views={views}
        tab={tab}
        linkLabel={label}
        onRemove={(claimId) => update((current) => ({ ...current, [key]: current[key].filter((id) => id !== claimId) }))}
        emptyMessage="まだひもづけていません。"
      />
      <ClaimAddSelect
        label={`${label}を追加`}
        candidates={linkableClaims}
        onAdd={(claimId) => update((current) => ({ ...current, [key]: [...current[key], claimId] }))}
      />
    </section>
  );

  return (
    <div className="space-y-6">
      <CloseLink tab={tab} />

      <section aria-label="仮説の編集" className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">{hypothesis.title}</h2>
        <HypothesisForm
          initial={hypothesis}
          onDone={() => setIsSaved(true)}
          actions={
            <div className="mr-auto">
              <DeleteConfirmButton
                label="この仮説を削除"
                title="この仮説を削除しますか？"
                description="この仮説をケースから削除します。この操作は取り消せません。ひもづけた証言は削除しません。否定された仮説を残しておきたい場合は、削除せずに状態を「否定された」にしてください。"
                onConfirm={handleDelete}
              />
            </div>
          }
        />
        {isSaved && (
          <p role="status" className="mt-2 text-right text-xs text-mention-place-foreground">
            保存しました
          </p>
        )}
      </section>

      <FormError message={error} />

      {claimSection('支える証言', 'supportingClaimIds', detail.supporting)}
      {claimSection('反する証言', 'opposingClaimIds', detail.opposing)}

      <section aria-label="対象の人物" className="space-y-2">
        <h3 className="text-sm font-semibold">
          対象の人物
          <span className="ml-2 text-xs font-normal text-muted-foreground">{detail.targets.length}人</span>
        </h3>
        {detail.targets.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            被疑者などを対象の人物に加えると、動機・機会・手段の観点で証言を整理できます。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label={TARGET_TABLE_LABEL} className="w-full min-w-[40rem] table-fixed border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="w-32 border-b p-2 text-left text-xs font-semibold">
                    人物
                  </th>
                  {HYPOTHESIS_ASPECTS.map((aspect) => (
                    <th key={aspect} scope="col" className="border-b p-2 text-left text-xs font-semibold">
                      {HYPOTHESIS_ASPECT_LABELS[aspect]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.targets.map(({ person, claims }) => (
                  <tr key={person.id} className="align-top">
                    <th scope="row" className="border-b p-2 text-left font-normal">
                      <div className="flex items-start gap-1">
                        <Link href={personHref(caseId, person.id, tab)} className="flex-1 font-semibold hover:underline">
                          {person.name}
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${person.name}を対象から外す`}
                          title="対象から外す"
                          onClick={() =>
                            update((current) => ({
                              ...current,
                              targets: current.targets.filter((target) => target.personId !== person.id),
                            }))
                          }
                        >
                          <X />
                        </Button>
                      </div>
                    </th>
                    {HYPOTHESIS_ASPECTS.map((aspect) => {
                      const aspectLabel = `${person.name}の${HYPOTHESIS_ASPECT_LABELS[aspect]}`;
                      return (
                        <td key={aspect} className="space-y-1 border-b p-2">
                          <LinkedClaimList
                            views={claims[aspect]}
                            tab={tab}
                            linkLabel={aspectLabel}
                            onRemove={(claimId) => updateAspect(person.id, aspect, (ids) => ids.filter((id) => id !== claimId))}
                            emptyMessage="証言なし"
                          />
                          <ClaimAddSelect
                            label={`${aspectLabel}に証言を追加`}
                            candidates={claimsExcept(claims[aspect].map((view) => view.claim.id))}
                            onAdd={(claimId) => updateAspect(person.id, aspect, (ids) => [...ids, claimId])}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <select
          aria-label="対象の人物を追加"
          value=""
          disabled={personCandidates.length === 0}
          onChange={(event) => {
            const personId = event.target.value;
            if (personId === '') return;
            update((current) => ({
              ...current,
              targets: [...current.targets, { personId, claimIds: { motive: [], opportunity: [], means: [] } }],
            }));
          }}
          className={INPUT_CLASS}
        >
          <option value="">{personCandidates.length === 0 ? '加えられる人物がいません' : '対象の人物を追加…'}</option>
          {personCandidates.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}

export function NewHypothesisDetail() {
  const caseId = useCaseId();
  const router = useRouter();
  const tab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));

  return (
    <div className="space-y-6">
      <CloseLink tab={tab} />

      <section aria-label="仮説の登録" className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">仮説を登録</h2>
        <HypothesisForm onDone={(id) => router.replace(hypothesisHref(caseId, id, tab))} />
      </section>
    </div>
  );
}
