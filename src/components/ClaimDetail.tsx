/**
 * 証言の詳細
 *
 * ボード（CaseBoard）の横に並べて表示します。幅が狭い画面では、ボードの代わりに、これだけを表示します。
 * 証言1件の編集（見出し・本文・発言者・日時）と削除を、この1か所で行います。
 * あわせて、証言から連想して次の証言へ進めるよう、時系列の前後の証言と、
 * 同じ人物・場所に触れている他の証言へのリンクを表示します（導出は buildClaimDetail を参照）。
 * 開いているタブはURLのクエリ（?tab=）から読み取り、詳細を閉じるリンクと、他の証言へのリンクに引き継ぎます。
 *
 * 注意: 案件に無い証言のIDが渡された場合（URLの直接入力、削除済みの証言）は、見つからないことを表示します。
 * 証言のフォームは初期値を初期化でのみ使用するため、呼び出し側は claimId が変わるたびに key を変えて再マウントしてください。
 * useSearchParams を使うため、ページでは Suspense の中に置いてください。
 */
'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { buildClaimDetail, claimLabelOf, formatViaLabel, type ClaimView } from '@/domain/case-views';
import { MENTION_KIND_LABELS } from '@/domain/labels';
import type { Id } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
import { ClaimForm } from './forms/ClaimForm';
import { FormError } from './forms/fields';
import { boardHref, claimHref, parseTab, TAB_SEARCH_PARAM, type TabKey } from './routes';

/** 他の証言へのリンクです。発言者と、証言の名前（見出し、または本文の冒頭）を示します。 */
function ClaimLink({ view, tab, prefix }: { view: ClaimView; tab: TabKey; prefix?: string }) {
  return (
    <Link
      href={claimHref(view.claim.id, tab)}
      className="block rounded border border-slate-200 bg-white px-3 py-2 text-sm hover:border-sky-400"
    >
      {prefix && <span className="mr-2 text-xs text-slate-500">{prefix}</span>}
      <span className="mr-2 text-xs font-semibold text-slate-700">
        {view.speakerLabel}
        {formatViaLabel(view.viaPersons.map((person) => person.name))}
      </span>
      <span className="text-slate-900">{claimLabelOf(view)}</span>
      {view.claim.when && <span className="ml-2 text-xs text-sky-700">{view.claim.when.text}</span>}
    </Link>
  );
}

export function ClaimDetail({ claimId }: { claimId: Id }) {
  const currentCase = useCaseStore((state) => state.currentCase);
  const remove = useCaseStore((state) => state.remove);
  const router = useRouter();
  const tab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));
  const detail = useMemo(() => buildClaimDetail(currentCase, claimId), [currentCase, claimId]);
  const [isSaved, setIsSaved] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeLink = (
    <div className="flex justify-end">
      <Link href={boardHref(tab)} aria-label="証言の詳細を閉じる" className="text-xs text-slate-600 hover:underline">
        閉じる
      </Link>
    </div>
  );

  if (!detail) {
    return (
      <div className="space-y-4">
        {closeLink}
        <h2 className="text-lg font-semibold text-slate-900">証言が見つかりません</h2>
        <p className="text-sm text-slate-600">この証言は削除されたか、URLが誤っています。</p>
      </div>
    );
  }

  const { view, previous, next, relatedClaimGroups } = detail;

  const handleDelete = () => {
    // 削除は取り消せないため、実行前に確認する
    if (!window.confirm('この証言を削除しますか？')) return;
    try {
      remove('claims', claimId);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    // 削除した証言のURLへ「戻る」で戻らないよう、履歴を置き換える
    router.replace(boardHref(tab));
  };

  return (
    <div className="space-y-6">
      {closeLink}

      <section aria-label="証言の編集" className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">{claimLabelOf(view)}</h2>
        <ClaimForm
          initial={view.claim}
          onDone={() => setIsSaved(true)}
          expandDetails
          actions={
            <button type="button" onClick={handleDelete} className="mr-auto text-xs text-red-600 hover:underline">
              この証言を削除
            </button>
          }
        />
        {isSaved && (
          <p role="status" className="mt-2 text-right text-xs text-emerald-700">
            保存しました
          </p>
        )}
        <div className="mt-2">
          <FormError message={deleteError} />
        </div>
      </section>

      {(previous || next) && (
        <nav aria-label="時系列の前後の証言" className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">時系列の前後</h3>
          {previous && <ClaimLink view={previous} tab={tab} prefix="前の証言" />}
          {next && <ClaimLink view={next} tab={tab} prefix="次の証言" />}
        </nav>
      )}

      {relatedClaimGroups.map((group) => {
        const label = `「${group.label}」に触れている他の証言`;
        return (
          <section key={`${group.kind}:${group.id}`} aria-label={label} className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-800">
              {label}
              <span className="ml-2 text-xs font-normal text-slate-500">
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
