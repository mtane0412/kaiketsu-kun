/**
 * 資料（聴取。Interview）の詳細・登録
 *
 * ボード（CaseBoard）と入れ替えて表示します。サイドバーの「資料」の一覧から開きます。
 * 資料は、記事・動画・調書や、聴き取った機会など、証言の出どころです。1件の資料に何人もの発言が載る場合があるため、相手は複数を持てます。
 * - 詳細（InterviewDetail）: 資料の名前（相手・日時・聴取者）を見出しにし、相手の人物を人物の詳細へのリンクで並べます。
 *   その下に資料のカード（InterviewCard）を置き、本文・ひもづく証言の表示と、編集・削除・証言の書き足しを行います。
 *   削除すると、ボードへ戻ります。
 * - 登録（NewInterviewDetail）: サイドバーの「資料」の「＋」から開きます。相手を選んで保存すると、その資料の詳細へ移ります。
 *   登録のURLへ「戻る」で戻ると、同じ資料を二重に登録しかねないため、履歴は置き換えます。
 *
 * 注意: ケースに無い資料のIDが渡された場合（URLの直接入力、削除済みの資料）は、見つからないことを表示します。
 * useSearchParams を使うため、ページでは Suspense の中に置いてください。
 */
'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { buildInterviewView, formatInterviewLabel } from '@/domain/interviews';
import type { Id } from '@/domain/types';
import { useCurrentCase } from '@/stores/useCaseStore';
import { InterviewForm } from './forms/InterviewForm';
import { InterviewCard } from './InterviewCard';
import { boardHref, interviewHref, parseTab, personHref, TAB_SEARCH_PARAM, type TabKey } from './routes';
import { useCaseId } from './useCaseId';
import { DetailCloseLink } from './DetailCloseLink';

/** 詳細を閉じて、ボードへ戻るリンクです。 */
function CloseLink({ tab }: { tab: TabKey }) {
  const caseId = useCaseId();
  return (
    <DetailCloseLink href={boardHref(caseId, tab)} label="資料の詳細を閉じる" />
  );
}

export function InterviewDetail({ interviewId }: { interviewId: Id }) {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const router = useRouter();
  const tab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));
  const view = buildInterviewView(currentCase, interviewId);

  if (!view) {
    return (
      <div className="space-y-4">
        <CloseLink tab={tab} />
        <h2 className="text-lg font-semibold">資料が見つかりません</h2>
        <p className="text-sm text-muted-foreground">この資料は削除されたか、URLが誤っています。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CloseLink tab={tab} />
      <h2 className="text-lg font-semibold">{formatInterviewLabel(currentCase, view.interview)}</h2>

      <section aria-label="相手" className="space-y-2">
        <h3 className="text-sm font-semibold">相手</h3>
        <ul className="flex flex-wrap gap-2">
          {view.subjects.map((person) => (
            <li key={person.id}>
              <Link
                href={personHref(caseId, person.id, tab)}
                className="block rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:border-foreground/30"
              >
                {person.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <InterviewCard
        view={view}
        tab={tab}
        showsSubjects={false}
        // 削除した資料のURLへ「戻る」で戻らないよう、履歴を置き換える
        onDeleted={() => router.replace(boardHref(caseId, tab))}
      />
    </div>
  );
}

export function NewInterviewDetail() {
  const caseId = useCaseId();
  const router = useRouter();
  const tab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));

  return (
    <div className="space-y-6">
      <CloseLink tab={tab} />

      <section aria-label="資料の登録" className="rounded-lg border bg-card p-4">
        <h2 className="mb-1 text-lg font-semibold">資料を登録</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          記事・動画・調書や、聴き取った機会を登録します。載っている発言の主を、相手としてすべて選んでください。
        </p>
        <InterviewForm
          onDone={(interview) => router.replace(interviewHref(caseId, interview.id, tab))}
          onCancel={() => router.push(boardHref(caseId, tab))}
        />
      </section>
    </div>
  );
}
