/**
 * 人物・場所の詳細
 *
 * 証言の詳細（ClaimDetail）と同じく、ボード（CaseBoard）の横に並べて表示します。
 * 幅が狭い画面では、ボードの代わりに、これだけを表示します。
 * 人物・場所1件の編集と削除に加えて、「証言 → 人物 → その人物の別の証言」と連想してたどれるよう、
 * その人物・場所から逆引きした証言（導出は buildPersonDetail・buildPlaceDetail を参照）と、
 * メモのメンションでつながった関連するエンティティ（findRelatedEntities）へのリンクを並べます。
 * 開いているタブはURLのクエリ（?tab=）から読み取り、詳細を閉じるリンクと、証言・エンティティへのリンクに引き継ぎます。
 * 人物・場所を新しく登録する画面（NewPersonDetail・NewPlaceDetail）も、同じ場所に並べます。
 * サイドバーの一覧の「＋」から開き、保存できたら、登録したエンティティの詳細へ移ります。
 *
 * 注意: ケースに無いIDが渡された場合（URLの直接入力、削除済みのエンティティ）は、見つからないことを表示します。
 * 人物・場所のフォームは初期値を初期化でのみ使用するため、呼び出し側はIDが変わるたびに key を変えて再マウントしてください。
 * useSearchParams を使うため、ページでは Suspense の中に置いてください。
 */
'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { buildPersonDetail, buildPlaceDetail, type EntityClaimGroup, type RelatedEntity } from '@/domain/case-views';
import { MENTION_KIND_LABELS } from '@/domain/labels';
import type { MentionKind } from '@/domain/mention';
import type { Id } from '@/domain/types';
import { COLLECTION_KEY_BY_MENTION_KIND, useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { ClaimLink } from './ClaimLink';
import { EntityAvatar } from './EntityAvatar';
import { PersonForm, PlaceForm } from './forms/BasicForms';
import { FormError } from './forms/fields';
import { boardHref, mentionHref, parseTab, personHref, placeHref, TAB_SEARCH_PARAM, type TabKey } from './routes';
import { useCaseId } from './useCaseId';

/** 関連するエンティティの一覧の見出しです。 */
const RELATED_ENTITIES_LABEL = '関連するエンティティ';

/** 詳細を閉じて、ボードに戻るリンクです。 */
function CloseLink({ kindLabel, tab }: { kindLabel: string; tab: TabKey }) {
  const caseId = useCaseId();

  return (
    <div className="flex justify-end">
      <Link
        href={boardHref(caseId, tab)}
        aria-label={`${kindLabel}の詳細を閉じる`}
        className="text-xs text-slate-600 hover:underline"
      >
        閉じる
      </Link>
    </div>
  );
}

/** ケースに無いIDが渡された場合の表示です。 */
function NotFound({ kindLabel, tab }: { kindLabel: string; tab: TabKey }) {
  return (
    <div className="space-y-4">
      <CloseLink kindLabel={kindLabel} tab={tab} />
      <h2 className="text-lg font-semibold text-slate-900">{kindLabel}が見つかりません</h2>
      <p className="text-sm text-slate-600">この{kindLabel}は削除されたか、URLが誤っています。</p>
    </div>
  );
}

/** 関連の向きを説明する文を返します。 */
function describeRelation(related: RelatedEntity): string {
  if (related.mentions && related.mentionedBy) return '互いのメモで言及しています';
  return related.mentions ? 'メモで言及しています' : 'メモで言及されています';
}

type EntityDetailShellProps = {
  kind: MentionKind;
  id: Id;
  /** 見出しに示す、エンティティの現在の名前です。 */
  name: string;
  tab: TabKey;
  /** 人物・場所の編集フォームです。 */
  form: (onDone: () => void) => ReactNode;
  claimGroups: EntityClaimGroup[];
  relatedEntities: RelatedEntity[];
};

/** 人物と場所で共通の、詳細の枠組みです。編集フォームと、逆引きした証言・関連するエンティティを並べます。 */
function EntityDetailShell({ kind, id, name, tab, form, claimGroups, relatedEntities }: EntityDetailShellProps) {
  const caseId = useCaseId();
  const remove = useCaseStore((state) => state.remove);
  const router = useRouter();
  const [isSaved, setIsSaved] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const kindLabel = MENTION_KIND_LABELS[kind];

  const handleDelete = () => {
    // 削除は取り消せないため、実行前に確認する
    if (!window.confirm(`「${name}」を削除しますか？`)) return;
    try {
      remove(COLLECTION_KEY_BY_MENTION_KIND[kind], id);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    // 削除したエンティティのURLへ「戻る」で戻らないよう、履歴を置き換える
    router.replace(boardHref(caseId, tab));
  };

  return (
    <div className="space-y-6">
      <CloseLink kindLabel={kindLabel} tab={tab} />

      <section aria-label={`${kindLabel}の編集`} className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">{name}</h2>
        {form(() => setIsSaved(true))}
        {isSaved && (
          <p role="status" className="mt-2 text-right text-xs text-emerald-700">
            保存しました
          </p>
        )}
        <button type="button" onClick={handleDelete} className="mt-2 text-xs text-red-600 hover:underline">
          この{kindLabel}を削除
        </button>
        <div className="mt-2">
          <FormError message={deleteError} />
        </div>
      </section>

      {claimGroups.map((group) => (
        <section key={group.label} aria-label={group.label} className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">
            {group.label}
            <span className="ml-2 text-xs font-normal text-slate-500">{group.claims.length}件</span>
          </h3>
          <ul className="space-y-1">
            {group.claims.map((view) => (
              <li key={view.claim.id}>
                <ClaimLink view={view} tab={tab} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-label={RELATED_ENTITIES_LABEL} className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">{RELATED_ENTITIES_LABEL}</h3>
        {relatedEntities.length === 0 ? (
          <p className="text-xs text-slate-400">メモで「@」を入力すると、他の人物・場所と関連付けられます。</p>
        ) : (
          <ul className="space-y-1">
            {relatedEntities.map((related) => (
              <li key={`${related.kind}:${related.id}`}>
                <Link
                  href={mentionHref(caseId, related.kind, related.id, tab)}
                  className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm hover:border-sky-400"
                >
                  <EntityAvatar imageDataUrl={related.imageDataUrl} iconText={related.iconText} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-slate-500">
                      {MENTION_KIND_LABELS[related.kind]}・{describeRelation(related)}
                    </span>
                    <span className="block truncate">{related.name}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function PersonDetail({ personId }: { personId: Id }) {
  const currentCase = useCurrentCase();
  const tab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));
  const detail = useMemo(() => buildPersonDetail(currentCase, personId), [currentCase, personId]);

  if (!detail) return <NotFound kindLabel={MENTION_KIND_LABELS.person} tab={tab} />;

  return (
    <EntityDetailShell
      kind="person"
      id={personId}
      name={detail.person.name}
      tab={tab}
      form={(onDone) => <PersonForm initial={detail.person} onDone={onDone} />}
      claimGroups={detail.claimGroups}
      relatedEntities={detail.relatedEntities}
    />
  );
}

type NewEntityDetailProps = {
  kind: MentionKind;
  /** 登録フォームです。保存できたら、保存したエンティティのIDで onSaved を呼び出します。 */
  form: (onSaved: (id: Id) => void) => ReactNode;
  /** 保存したエンティティの詳細ページのURLを組み立てます。 */
  href: (caseId: Id, id: Id, tab: TabKey) => string;
};

/**
 * 人物・場所を新しく登録する枠組みです。ボードの横に、登録フォームだけを並べます。
 * 保存できたら、そのまま編集・削除・関連の確認を続けられるよう、登録したエンティティの詳細へ移ります。
 * 登録のURLへ「戻る」で戻ると、保存済みのエンティティを二重に登録しかねないため、履歴は置き換えます。
 */
function NewEntityDetail({ kind, form, href }: NewEntityDetailProps) {
  const caseId = useCaseId();
  const router = useRouter();
  const tab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));
  const kindLabel = MENTION_KIND_LABELS[kind];

  return (
    <div className="space-y-6">
      <CloseLink kindLabel={kindLabel} tab={tab} />

      <section aria-label={`${kindLabel}の登録`} className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">{kindLabel}を登録</h2>
        {form((id) => router.replace(href(caseId, id, tab)))}
      </section>
    </div>
  );
}

export function NewPersonDetail() {
  return (
    <NewEntityDetail kind="person" href={personHref} form={(onSaved) => <PersonForm onDone={onSaved} />} />
  );
}

export function NewPlaceDetail() {
  return <NewEntityDetail kind="place" href={placeHref} form={(onSaved) => <PlaceForm onDone={onSaved} />} />;
}

export function PlaceDetail({ placeId }: { placeId: Id }) {
  const currentCase = useCurrentCase();
  const tab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));
  const detail = useMemo(() => buildPlaceDetail(currentCase, placeId), [currentCase, placeId]);

  if (!detail) return <NotFound kindLabel={MENTION_KIND_LABELS.place} tab={tab} />;

  return (
    <EntityDetailShell
      kind="place"
      id={placeId}
      name={detail.place.name}
      tab={tab}
      form={(onDone) => <PlaceForm initial={detail.place} onDone={onDone} />}
      claimGroups={detail.claimGroups}
      relatedEntities={detail.relatedEntities}
    />
  );
}
