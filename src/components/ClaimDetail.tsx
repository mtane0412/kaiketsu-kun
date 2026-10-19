/**
 * 証言の詳細
 *
 * ボード（CaseBoard）の横に並べて表示します。幅が狭い画面では、ボードの代わりに、これだけを表示します。
 * 証言1件の編集（見出し・本文・発言者・日時）と削除を、この1か所で行います。
 * 詳細を開いた人が最も見たいのは、本文・出典（資料・経由・引用）・照合のため、これらを先に並べます。
 * 編集のフォームは「編集」を押したときだけ、本文の表示の代わりに開きます。フォームは本文の欄にフォーカスを置いて開き、
 * 保存したら「保存しました」と伝えて読む表示に戻ります。保存・「やめる」で閉じたときは、フォーカスを「編集」に戻します。
 * 編集中は出典の欄を閉じます。1つ目の出典の引用はフォームにも示すため、同じ引用を2回表示しないためです。
 * 証言を削除すると、その証言を含む照合もあわせて削除されるため、確認の画面で照合の件数を伝えます。
 * 仮説にひもづいた証言を削除すると、仮説からひもづけを外すため、確認の画面で仮説の件数を伝えます。
 * 読み手が他の証言と突き合わせた結果（照合）の一覧と登録・編集・削除は、CrossCheckSection が担います。
 * この証言を使っている仮説（支える・反する・対象の人物の動機・機会・手段）へのリンクは、HypothesisUsageSection が担います。
 * この証言をひもづけた未了事項の一覧と、未了事項を追加する導線は、TaskLinkSection が担います。
 * 未了事項にひもづいた証言を削除すると、未了事項からひもづけを外すため、確認の画面で未了事項の件数を伝えます。
 * あわせて、証言から連想して次の証言へ進めるよう、時系列の前後の証言と、
 * 同じ人物・場所に触れている他の証言へのリンクを表示します（導出は buildClaimDetail を参照）。
 * 時系列の前後はボード上の並び順のため、日時を持たない証言には、日時が無く並び順での前後であることを添えます。
 * 人物に経由としてだけ触れている他の証言（記事を転載した媒体を経由にした証言など）は、関係が薄く数も多くなりやすいため、
 * 発言者・言及として触れている証言と分けて折りたたみます。
 * 出典ごとの資料・経由と、聴取の本文から書き起こした引用（原文・動画の位置・元の資料へのリンク）は、SourcesSection が担います。
 * 人物・場所・日時・聴取を多く共有する証言を似ている順に並べる欄は、SimilarClaimsSection が担います。
 * 開いているタブはURLのクエリ（?tab=）から読み取り、詳細を閉じるリンクと、他の証言へのリンクに引き継ぎます。
 *
 * 注意: ケースに無い証言のIDが渡された場合（URLの直接入力、削除済みの証言）は、見つからないことを表示します。
 * 証言のフォームは初期値を初期化でのみ使用するため、呼び出し側は claimId が変わるたびに key を変えて再マウントしてください。
 * useSearchParams を使うため、ページでは Suspense の中に置いてください。
 */
'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildClaimDetail, claimLabelOf, formatViaLabel, type ClaimView } from '@/domain/case-views';
import { findHypothesesUsingClaim } from '@/domain/hypotheses';
import { MENTION_KIND_LABELS } from '@/domain/labels';
import { findTasksLinkedTo } from '@/domain/tasks';
import type { MentionKind } from '@/domain/mention';
import type { Id } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ClaimContentSegments } from './ClaimContentSegments';
import { ClaimLink } from './ClaimLink';
import { CrossCheckSection } from './CrossCheckSection';
import { DeleteConfirmButton } from './DeleteConfirmButton';
import { HypothesisUsageSection } from './HypothesisUsageSection';
import { SimilarClaimsSection } from './SimilarClaimsSection';
import { SourcesSection } from './SourcesSection';
import { TaskLinkSection } from './TaskLinkSection';
import { ClaimForm } from './forms/ClaimForm';
import { FormError } from './forms/fields';
import { boardHref, mentionHref, parseTab, TAB_SEARCH_PARAM } from './routes';
import { useCaseId } from './useCaseId';
import { DetailCloseLink } from './DetailCloseLink';

/** この証言が触れている人物・場所を並べる欄の見出しです。 */
const MENTIONED_ENTITIES_LABEL = 'この証言が触れている人物・場所';

/** 日時を持たない前後の証言のリンクに添える補足です。 */
const UNDATED_NEIGHBOR_NOTE = '日時なし（ボード上の並び順での前後です）';

/** この証言が日時を持たない場合に、時系列の前後の欄に添える説明です。 */
const UNDATED_CLAIM_NOTE = 'この証言は日時を持たないため、前後はボード上の並び順です。';

/** 日時を持たない証言には、前後の証言のリンクに補足を添えます。 */
function neighborNoteOf(view: ClaimView): string | undefined {
  return view.claim.when === undefined ? UNDATED_NEIGHBOR_NOTE : undefined;
}

/** この証言が触れている人物・場所1件と、どの立場で触れているかです。 */
type MentionedEntity = { role: string; kind: MentionKind; id: Id; name: string };

/**
 * 証言が触れている人物・場所を、発言者・経由した人物・言及している人物・場所の順に並べます。
 * 同じ人物が複数の立場で現れる場合は、立場ごとに並べます（どの立場で触れているかを示すためです）。
 */
function mentionedEntitiesOf(view: ClaimView): MentionedEntity[] {
  const persons = (role: string, list: { id: Id; name: string }[]): MentionedEntity[] =>
    list.map((person) => ({ role, kind: 'person', id: person.id, name: person.name }));

  return [
    ...persons('発言者', view.speakerPersons),
    ...persons('経由', view.viaPersons),
    ...persons('言及', view.mentionedPersons),
    ...(view.place ? [{ role: '場所', kind: 'place' as const, id: view.place.id, name: view.place.name }] : []),
  ];
}

export function ClaimDetail({ claimId }: { claimId: Id }) {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const remove = useCaseStore((state) => state.remove);
  const router = useRouter();
  const tab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));
  const detail = useMemo(() => buildClaimDetail(currentCase, claimId), [currentCase, claimId]);
  const [isSaved, setIsSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  /** フォームを閉じたあとに、フォーカスを「編集」に戻すかどうかです（フォームと一緒にフォーカスのある要素が消えるため）。 */
  const shouldRestoreFocusRef = useRef(false);

  useEffect(() => {
    if (isEditing || !shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    editButtonRef.current?.focus();
  }, [isEditing]);

  const openEditor = () => {
    setIsSaved(false);
    setIsEditing(true);
  };
  const closeEditor = (saved: boolean) => {
    shouldRestoreFocusRef.current = true;
    setIsSaved(saved);
    setIsEditing(false);
  };

  const closeLink = (
    <DetailCloseLink href={boardHref(caseId, tab)} label="証言の詳細を閉じる" />
  );

  if (!detail) {
    return (
      <div className="space-y-4">
        {closeLink}
        <h2 className="text-lg font-semibold">証言が見つかりません</h2>
        <p className="text-sm text-muted-foreground">この証言は削除されたか、URLが誤っています。</p>
      </div>
    );
  }

  const { view, previous, next, relatedClaimGroups } = detail;
  const mentionedEntities = mentionedEntitiesOf(view);
  const crossCheckCount = currentCase.crossChecks.filter((crossCheck) => crossCheck.claimIds.includes(claimId)).length;
  const hypothesisCount = findHypothesesUsingClaim(currentCase, claimId).length;
  const taskCount = findTasksLinkedTo(currentCase, 'claim', claimId).length;
  // 証言の削除は照合・仮説・未了事項も巻き込むため、消える照合と、ひもづけが外れる仮説・未了事項があることを確認の画面で伝える
  const deleteDescription = [
    'この証言をケースから削除します。',
    ...(crossCheckCount > 0 ? [`この証言を含む照合${crossCheckCount}件も削除します。`] : []),
    ...(hypothesisCount > 0 ? [`この証言をひもづけた仮説${hypothesisCount}件から、ひもづけを外します。`] : []),
    ...(taskCount > 0 ? [`この証言をひもづけた未了事項${taskCount}件から、ひもづけを外します。`] : []),
    'この操作は取り消せません。',
  ].join('');

  const handleDelete = () => {
    try {
      remove('claims', claimId);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    // 削除した証言のURLへ「戻る」で戻らないよう、履歴を置き換える
    router.replace(boardHref(caseId, tab));
  };

  return (
    <div className="space-y-6">
      {closeLink}

      <section aria-label="証言" className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">{claimLabelOf(view)}</h2>
        {isEditing ? (
          <ClaimForm
            initial={view.claim}
            autoFocus
            onDone={() => closeEditor(true)}
            actions={
              <div className="mr-auto">
                <Button type="button" variant="ghost" size="sm" onClick={() => closeEditor(false)}>
                  やめる
                </Button>
              </div>
            }
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {view.speakerLabel}
              {formatViaLabel(view.viaChains.map((chain) => chain.map((person) => person.name)))}
            </p>
            <p className="whitespace-pre-line text-sm">
              <ClaimContentSegments segments={view.contentSegments} tab={tab} />
            </p>
            <div className="flex items-center justify-end gap-2">
              <div className="mr-auto">
                <DeleteConfirmButton
                  label="この証言を削除"
                  title="この証言を削除しますか？"
                  description={deleteDescription}
                  onConfirm={handleDelete}
                />
              </div>
              <Button ref={editButtonRef} type="button" variant="outline" size="sm" aria-label="この証言を編集" onClick={openEditor}>
                編集
              </Button>
            </div>
          </div>
        )}
        {isSaved && (
          <p role="status" className="mt-2 text-right text-xs text-mention-place-foreground">
            保存しました
          </p>
        )}
        <div className="mt-2">
          <FormError message={deleteError} />
        </div>
      </section>

      {/* 編集中は、1つ目の出典の引用をフォームに示すため、出典の欄を閉じる（同じ引用を2回表示しないため） */}
      {!isEditing && <SourcesSection claimId={claimId} />}

      <CrossCheckSection claimId={claimId} tab={tab} />

      {mentionedEntities.length > 0 && (
        <nav aria-label={MENTIONED_ENTITIES_LABEL} className="space-y-2">
          <h3 className="text-sm font-semibold">{MENTIONED_ENTITIES_LABEL}</h3>
          <ul className="flex flex-wrap gap-1">
            {mentionedEntities.map((entity) => (
              <li key={`${entity.role}:${entity.kind}:${entity.id}`}>
                <Link
                  href={mentionHref(caseId, entity.kind, entity.id, tab)}
                  // どの立場で触れているかを読み上げにも伝えるため、リンクの名前に立場と名前を明示する
                  aria-label={`${entity.role} ${entity.name}`}
                  className="flex items-baseline gap-1 rounded-lg border bg-card px-2 py-1 text-sm transition-colors hover:border-foreground/30"
                >
                  <span className="text-xs text-muted-foreground">{entity.role}</span>
                  <span>{entity.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <HypothesisUsageSection claimId={claimId} tab={tab} />

      <TaskLinkSection kind="claim" id={claimId} tab={tab} />

      {(previous || next) && (
        <nav aria-label="時系列の前後の証言" className="space-y-2">
          <h3 className="text-sm font-semibold">時系列の前後</h3>
          {view.claim.when === undefined && <p className="text-xs text-muted-foreground">{UNDATED_CLAIM_NOTE}</p>}
          {previous && <ClaimLink view={previous} tab={tab} prefix="前の証言" note={neighborNoteOf(previous)} />}
          {next && <ClaimLink view={next} tab={tab} prefix="次の証言" note={neighborNoteOf(next)} />}
        </nav>
      )}

      <SimilarClaimsSection claimId={claimId} tab={tab} />

      {relatedClaimGroups.map((group) => {
        const label = `「${group.label}」に触れている他の証言`;
        return (
          <section key={`${group.kind}:${group.id}`} aria-label={label} className="space-y-2">
            <h3 className="text-sm font-semibold">
              「
              <Link href={mentionHref(caseId, group.kind, group.id, tab)} className="underline underline-offset-2 hover:no-underline">
                {group.label}
              </Link>
              」に触れている他の証言
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {MENTION_KIND_LABELS[group.kind]}・{group.claims.length}件
              </span>
            </h3>
            {group.claims.length > 0 && (
              <ul className="space-y-1">
                {group.claims.map((claimView) => (
                  <li key={claimView.claim.id}>
                    <ClaimLink view={claimView} tab={tab} />
                  </li>
                ))}
              </ul>
            )}
            {group.viaOnlyClaims.length > 0 && (
              // 経由としてだけ触れている証言は関係が薄く、数も多くなりやすいため、開くまで並べない
              <Collapsible>
                <CollapsibleTrigger className="text-xs text-muted-foreground hover:underline">
                  経由としてだけ触れている証言（{group.viaOnlyClaims.length}件）
                </CollapsibleTrigger>
                <CollapsibleContent render={<ul />} className="mt-1 space-y-1">
                  {group.viaOnlyClaims.map((claimView) => (
                    <li key={claimView.claim.id}>
                      <ClaimLink view={claimView} tab={tab} />
                    </li>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </section>
        );
      })}
    </div>
  );
}
