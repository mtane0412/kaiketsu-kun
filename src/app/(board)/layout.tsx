/**
 * ボードのレイアウト
 *
 * ボード（CaseBoard）を、ボードのページ（/）と証言の詳細ページ（/claims/<証言のID>）で共有します。
 * レイアウトはページを移っても再マウントされないため、証言を開閉しても、ボードのスクロール位置や入力中の内容を保ちます。
 * 各ページの内容（children）は、ボードの横に並べる証言の詳細です。
 * ボードはタブをURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
import { Suspense, type ReactNode } from 'react';
import { CaseBoard } from '@/components/CaseBoard';

export default function BoardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <CaseBoard>{children}</CaseBoard>
    </Suspense>
  );
}
