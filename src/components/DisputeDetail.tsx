/**
 * 論点の詳細・登録
 *
 * ボード（CaseBoard）と入れ替えて表示します。論点1件について、次の4つをこの1か所で行います。
 * 1. 論点の名前・解決したかどうか・両立できる読み方を読む表示と、「編集」で開くフォーム（DisputeForm）、論点の削除
 * 2. 束ねた証言を見比べる表。列は発言者・経由・資料（資料の格を含む）・日時・本文・引用で、時系列の並び順に並べます
 *    （導出は src/domain/disputes.ts の buildDisputeTable）。
 *    証言が複数の出典を持つ場合、経由・資料・引用の列は、出典ごとに「出典1」「出典2」の番号を添えて縦に並べ、列をまたいで対応が分かるようにします。
 * 3. 証言を束ねる・外す操作。選ぶとすぐに束ね、表の「論点から外す」ですぐに外します
 * 4. この論点をひもづけた未了事項（「この食い違いを解くために探す資料」など）と、その追加（TaskLinkSection）
 *
 * 編集のフォームは「編集」を押したときだけ、読む表示の代わりに開きます（証言の詳細と同じ形です）。
 * フォームは名前の欄にフォーカスを置いて開き、保存したら「保存しました」と伝えて読む表示に戻ります。
 * 保存・「やめる」で閉じたときは、フォーカスを「編集」に戻します。
 *
 * 表は列が多いため、狭い画面では表だけを横にスクロールして読みます。キーボードでもスクロールできるよう、表の枠にフォーカスを置けるようにします。
 * 表の枠は relative にします。列の見出しの読み上げ専用の文字（sr-only）は絶対配置のため、枠を基準にしないと枠の外に置かれ、ページ全体が横にはみ出すためです。
 *
 * 論点の登録（NewDisputeDetail）は、名前・両立できる読み方・解決したかどうかを入力し、保存すると、証言を束ね続けられるよう詳細へ移ります。
 * 証言の詳細の「この証言から論点を作る」や、照合の「論点を作る」から開いた場合は、その証言（URLの ?claim=）を束ねた状態で登録します。
 * 登録のURLへ「戻る」で戻ると、同じ論点を二重に登録しかねないため、履歴は置き換えます。
 *
 * 注意: ケースに無い論点のIDが渡された場合（URLの直接入力、削除済みの論点）は、見つからないことを表示します。
 * URLで指定された証言がケースに無い場合は、その証言を束ねずに登録します（URLはユーザーが自由に書き換えられるためです）。
 * 論点のフォームは初期値を初期化でのみ使用するため、呼び出し側は disputeId が変わるたびに key を変えて再マウントしてください。
 * useSearchParams を使うため、ページでは Suspense の中に置いてください。
 */
'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildTimeline, claimLabelOf, type ClaimView } from '@/domain/case-views';
import { buildDisputeTable, type DisputeSourceCell, type DisputeTableRow } from '@/domain/disputes';
import { formatQuoteSeconds } from '@/domain/transcript';
import type { Dispute, Id } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClaimContentSegments } from './ClaimContentSegments';
import { DeleteConfirmButton } from './DeleteConfirmButton';
import { DetailCloseLink } from './DetailCloseLink';
import { DisputeForm } from './forms/DisputeForm';
import { FormError, INPUT_CLASS } from './forms/fields';
import {
  boardHref,
  claimHref,
  DISPUTE_CLAIM_SEARCH_PARAM,
  disputeHref,
  interviewHref,
  parseDisputeClaimIds,
  parseTab,
  TAB_SEARCH_PARAM,
  type TabKey,
} from './routes';
import { TaskLinkSection } from './TaskLinkSection';
import { useCaseId } from './useCaseId';

/** 見比べる表の名前です。表の枠（スクロールの領域）と表の両方の読み上げ名にします。 */
const TABLE_LABEL = '束ねた証言の比較';

/** 見比べる表の列の見出しです。 */
const TABLE_HEADERS = ['発言者', '経由', '資料', '日時', '本文', '引用', '操作'] as const;

/** 見比べるのに必要な、束ねた証言の最少の件数です。これより少ない論点では、証言を束ねるよう案内します。 */
const MIN_COMPARED_CLAIMS = 2;

/** 表のセルに値が無いことを示す表記です。 */
const EMPTY_CELL = '—';

/** 詳細を閉じて、ボードへ戻るリンクです。 */
function CloseLink({ tab }: { tab: TabKey }) {
  const caseId = useCaseId();
  return <DetailCloseLink href={boardHref(caseId, tab)} label="論点の詳細を閉じる" />;
}

/** 証言の選択肢の表示名を「発言者: 見出し」の形で返します。 */
function claimOptionLabelOf(view: ClaimView): string {
  return `${view.speakerLabel}: ${claimLabelOf(view)}`;
}

/**
 * 出典ごとの値を、セルの中に縦に並べます。出典が2つ以上ある場合は、列をまたいで対応が分かるよう「出典1」などの番号を添えます。
 * 値の無い出典は「—」で示し、番号の並びを崩さないようにします。
 */
function SourceValues({ sources, render }: { sources: DisputeSourceCell[]; render: (source: DisputeSourceCell) => ReactNode }) {
  if (sources.length === 0) return <span className="text-muted-foreground">{EMPTY_CELL}</span>;
  if (sources.length === 1) return <>{render(sources[0]!) ?? <span className="text-muted-foreground">{EMPTY_CELL}</span>}</>;
  return (
    <ol className="space-y-1">
      {sources.map((source, index) => (
        <li key={index}>
          <span className="mr-1 text-xs text-muted-foreground">出典{index + 1}</span>
          {render(source) ?? <span className="text-muted-foreground">{EMPTY_CELL}</span>}
        </li>
      ))}
    </ol>
  );
}

type DisputeRowProps = {
  row: DisputeTableRow;
  tab: TabKey;
  onRemove: (claimId: Id) => void;
};

/** 見比べる表の1行（証言1件）です。 */
function DisputeRow({ row, tab, onRemove }: DisputeRowProps) {
  const caseId = useCaseId();
  const { view, whenLabel, sources } = row;
  const claimLabel = claimLabelOf(view);

  return (
    <tr className="border-t align-top">
      <th scope="row" className="px-2 py-2 text-left font-semibold">
        {view.speakerLabel}
      </th>
      <td className="px-2 py-2">
        <SourceValues sources={sources} render={(source) => (source.viaLabel === '' ? undefined : source.viaLabel)} />
      </td>
      <td className="px-2 py-2">
        <SourceValues
          sources={sources}
          render={(source) =>
            source.interviewId === undefined ? undefined : (
              <Link href={interviewHref(caseId, source.interviewId, tab)} className="underline underline-offset-2 hover:no-underline">
                {source.interviewLabel}
              </Link>
            )
          }
        />
      </td>
      <td className="px-2 py-2 whitespace-nowrap">{whenLabel ?? <span className="text-muted-foreground">日時なし</span>}</td>
      <td className="px-2 py-2">
        <p className="whitespace-pre-line">
          <ClaimContentSegments segments={view.contentSegments} tab={tab} />
        </p>
        <Link
          href={claimHref(caseId, view.claim.id, tab)}
          aria-label={`「${claimLabel}」を開く`}
          className="mt-1 inline-block text-xs text-muted-foreground underline underline-offset-2 hover:no-underline"
        >
          証言を開く
        </Link>
      </td>
      <td className="px-2 py-2">
        <SourceValues
          sources={sources}
          render={(source) =>
            source.quote === undefined ? undefined : (
              <q className="whitespace-pre-line">
                {source.quote.seconds !== undefined && (
                  <span className="mr-1 text-xs text-muted-foreground">{formatQuoteSeconds(source.quote.seconds)}</span>
                )}
                {source.quote.text}
              </q>
            )
          }
        />
      </td>
      <td className="px-2 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`「${claimLabel}」を論点から外す`}
          title="論点から外す"
          onClick={() => onRemove(view.claim.id)}
        >
          <X />
        </Button>
      </td>
    </tr>
  );
}

export function DisputeDetail({ disputeId }: { disputeId: Id }) {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const upsert = useCaseStore((state) => state.upsert);
  const remove = useCaseStore((state) => state.remove);
  const router = useRouter();
  const tab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));
  const table = useMemo(() => buildDisputeTable(currentCase, disputeId), [currentCase, disputeId]);
  const claimViews = useMemo(() => buildTimeline(currentCase).items.map((item) => item.view), [currentCase]);
  const [isSaved, setIsSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  /** フォームを閉じたあとに、フォーカスを「編集」に戻すかどうかです（フォームと一緒にフォーカスのある要素が消えるため）。 */
  const shouldRestoreFocusRef = useRef(false);

  useEffect(() => {
    if (isEditing || !shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    editButtonRef.current?.focus();
  }, [isEditing]);

  if (!table) {
    return (
      <div className="space-y-4">
        <CloseLink tab={tab} />
        <h2 className="text-lg font-semibold">論点が見つかりません</h2>
        <p className="text-sm text-muted-foreground">この論点は削除されたか、URLが誤っています。</p>
      </div>
    );
  }

  const { dispute, rows } = table;

  const openEditor = () => {
    setIsSaved(false);
    setIsEditing(true);
  };
  const closeEditor = (saved: boolean) => {
    shouldRestoreFocusRef.current = true;
    setIsSaved(saved);
    setIsEditing(false);
  };

  /**
   * 束ねた証言を書き換えて、すぐに保存します。保存できなかった場合は理由を表示します。
   * 再描画を待たずに続けて操作しても前の変更を上書きしないよう、描画時点ではなくストアにある最新の論点を書き換えます。
   */
  const updateClaims = (change: (claimIds: Id[]) => Id[]) => {
    setError(null);
    const latest: Dispute =
      useCaseStore.getState().currentCase?.disputes.find((candidate) => candidate.id === disputeId) ?? dispute;
    try {
      upsert('disputes', { ...latest, claimIds: change(latest.claimIds) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const handleDelete = () => {
    try {
      remove('disputes', disputeId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    // 削除した論点のURLへ「戻る」で戻らないよう、履歴を置き換える
    router.replace(boardHref(caseId, tab));
  };

  const candidates = claimViews.filter((view) => !dispute.claimIds.includes(view.claim.id));

  return (
    <div className="space-y-6">
      <CloseLink tab={tab} />

      <section aria-label="論点" className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">{dispute.title}</h2>
        {isEditing ? (
          <DisputeForm
            initial={dispute}
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
            <Badge variant={dispute.resolved ? 'outline' : 'secondary'}>{dispute.resolved ? '解決済み' : '未解決'}</Badge>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground">両立できる読み方</h3>
              {dispute.reconciliation ? (
                <p className="whitespace-pre-line text-sm">{dispute.reconciliation}</p>
              ) : (
                <p className="text-sm text-muted-foreground">まだ書いていません。「編集」から、束ねた証言を矛盾なく読めるかを書けます。</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <div className="mr-auto">
                <DeleteConfirmButton
                  label="この論点を削除"
                  title="この論点を削除しますか？"
                  description="この論点をケースから削除します。この操作は取り消せません。束ねた証言と照合は削除しません。この論点をひもづけた未了事項からは、ひもづけを外します。解決した論点を残しておきたい場合は、削除せずに「解決した」にしてください。"
                  onConfirm={handleDelete}
                />
              </div>
              <Button ref={editButtonRef} type="button" variant="outline" size="sm" aria-label="この論点を編集" onClick={openEditor}>
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
      </section>

      <FormError message={error} />

      <section aria-labelledby="dispute-claims-heading" className="space-y-2">
        <h3 id="dispute-claims-heading" className="text-sm font-semibold">
          束ねた証言
          <span className="ml-2 text-xs font-normal text-muted-foreground">{rows.length}件</span>
        </h3>
        {rows.length < MIN_COMPARED_CLAIMS && (
          <p className="text-xs text-muted-foreground">
            見比べる証言を2件以上束ねてください。下の選択欄から、同じ事柄を述べている証言を選べます。
          </p>
        )}
        {rows.length > 0 && (
          // 狭い画面では表だけを横にスクロールする。キーボードでもスクロールできるよう、枠にフォーカスを置けるようにする
          <div role="region" aria-label={TABLE_LABEL} tabIndex={0} className="relative overflow-x-auto rounded-lg border bg-card">
            <table aria-label={TABLE_LABEL} className="w-full min-w-[56rem] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  {TABLE_HEADERS.map((header) => (
                    <th key={header} scope="col" className="px-2 py-2 text-left font-semibold whitespace-nowrap">
                      {header === '操作' ? <span className="sr-only">{header}</span> : header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <DisputeRow
                    key={row.view.claim.id}
                    row={row}
                    tab={tab}
                    onRemove={(claimId) => updateClaims((claimIds) => claimIds.filter((id) => id !== claimId))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <select
          aria-label="束ねる証言を追加"
          value=""
          disabled={candidates.length === 0}
          onChange={(event) => {
            const claimId = event.target.value;
            if (claimId !== '') updateClaims((claimIds) => [...claimIds, claimId]);
          }}
          className={INPUT_CLASS}
        >
          <option value="">{candidates.length === 0 ? '束ねられる証言がありません' : '束ねる証言を追加…'}</option>
          {candidates.map((view) => (
            <option key={view.claim.id} value={view.claim.id}>
              {claimOptionLabelOf(view)}
            </option>
          ))}
        </select>
      </section>

      <TaskLinkSection kind="dispute" id={disputeId} tab={tab} />
    </div>
  );
}

export function NewDisputeDetail() {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get(TAB_SEARCH_PARAM));
  // 登録中にケースが変わっても、開いたときに指定された証言で束ねるよう、最初の描画で決めた値を使う。
  // ケースに無い証言は束ねない（URLはユーザーが自由に書き換えられるため）。並びは時系列の並び順にそろえる
  const [initialViews] = useState(() => {
    const requested = parseDisputeClaimIds(searchParams.getAll(DISPUTE_CLAIM_SEARCH_PARAM));
    return buildTimeline(currentCase)
      .items.map((item) => item.view)
      .filter((view) => requested.includes(view.claim.id));
  });

  return (
    <div className="space-y-6">
      <CloseLink tab={tab} />

      <section aria-label="論点の登録" className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">論点を登録</h2>
        {initialViews.length > 0 && (
          <div className="mb-3 space-y-1">
            <p className="text-sm text-muted-foreground">束ねる証言:</p>
            <ul aria-label="束ねる証言" className="list-disc space-y-0.5 pl-5 text-sm">
              {initialViews.map((view) => (
                <li key={view.claim.id}>{claimOptionLabelOf(view)}</li>
              ))}
            </ul>
          </div>
        )}
        <DisputeForm
          autoFocus
          initialClaimIds={initialViews.map((view) => view.claim.id)}
          onDone={(id) => router.replace(disputeHref(caseId, id, tab))}
        />
      </section>
    </div>
  );
}
