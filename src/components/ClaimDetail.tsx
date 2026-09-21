/**
 * 証言の詳細
 *
 * ボード（CaseBoard）の横に並べて表示します。幅が狭い画面では、ボードの代わりに、これだけを表示します。
 * 証言1件の編集（見出し・本文・発言者・日時）と削除を、この1か所で行います。
 * あわせて、証言から連想して次の証言へ進めるよう、時系列の前後の証言と、
 * 同じ人物・場所に触れている他の証言へのリンクを表示します（導出は buildClaimDetail を参照）。
 * 開いているタブはURLのクエリ（?tab=）から読み取り、詳細を閉じるリンクと、他の証言へのリンクに引き継ぎます。
 *
 * 注意: ケースに無い証言のIDが渡された場合（URLの直接入力、削除済みの証言）は、見つからないことを表示します。
 * 証言のフォームは初期値を初期化でのみ使用するため、呼び出し側は claimId が変わるたびに key を変えて再マウントしてください。
 * useSearchParams を使うため、ページでは Suspense の中に置いてください。
 */
'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { buildClaimDetail, claimLabelOf, type ClaimView } from '@/domain/case-views';
import { MENTION_KIND_LABELS } from '@/domain/labels';
import type { MentionKind } from '@/domain/mention';
import type { Id } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { ClaimLink } from './ClaimLink';
import { DeleteConfirmButton } from './DeleteConfirmButton';
import { ClaimForm } from './forms/ClaimForm';
import { FormError } from './forms/fields';
import { boardHref, mentionHref, parseTab, TAB_SEARCH_PARAM } from './routes';
import { useCaseId } from './useCaseId';

/** この証言が触れている人物・場所を並べる欄の見出しです。 */
const MENTIONED_ENTITIES_LABEL = 'この証言が触れている人物・場所';

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
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeLink = (
    <div className="flex justify-end">
      <Link href={boardHref(caseId, tab)} aria-label="証言の詳細を閉じる" className="text-xs text-muted-foreground hover:underline">
        閉じる
      </Link>
    </div>
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

      <section aria-label="証言の編集" className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">{claimLabelOf(view)}</h2>
        <ClaimForm
          initial={view.claim}
          onDone={() => setIsSaved(true)}
          actions={
            <div className="mr-auto">
              <DeleteConfirmButton
                label="この証言を削除"
                title="この証言を削除しますか？"
                description="この証言をケースから削除します。この操作は取り消せません。"
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
        <div className="mt-2">
          <FormError message={deleteError} />
        </div>
      </section>

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

      {(previous || next) && (
        <nav aria-label="時系列の前後の証言" className="space-y-2">
          <h3 className="text-sm font-semibold">時系列の前後</h3>
          {previous && <ClaimLink view={previous} tab={tab} prefix="前の証言" />}
          {next && <ClaimLink view={next} tab={tab} prefix="次の証言" />}
        </nav>
      )}

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
            <ul className="space-y-1">
              {group.claims.map((claimView) => (
                <li key={claimView.claim.id}>
                  <ClaimLink view={claimView} tab={tab} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
