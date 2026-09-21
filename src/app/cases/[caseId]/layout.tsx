/**
 * 案件のボードのレイアウト
 *
 * URL（/cases/<案件のID>）が指す案件を開き（CaseGate）、ボード（CaseBoard）を、
 * ボードのページ（/cases/<案件のID>）と、証言・人物・場所の詳細ページで共有します。
 * レイアウトはページを移っても再マウントされないため、詳細を開閉しても、ボードのスクロール位置や入力中の内容を保ちます。
 * 各ページの内容（children）は、ボードの横に並べる詳細です。
 * ボードはタブをURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
import { Suspense, type ReactNode } from 'react';
import { CaseBoard } from '@/components/CaseBoard';
import { CaseGate } from '@/components/CaseGate';

export default async function BoardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ caseId: string }>;
}) {
  // ルートのパラメータはURLから取り出した値のため、URLの記法を解いてからIDとして扱う
  const { caseId } = await params;

  return (
    <CaseGate caseId={decodeURIComponent(caseId)}>
      <Suspense>
        <CaseBoard>{children}</CaseBoard>
      </Suspense>
    </CaseGate>
  );
}
