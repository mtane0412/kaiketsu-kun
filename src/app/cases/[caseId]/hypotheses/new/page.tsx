/**
 * 仮説を新しく登録するページ
 * ボードはレイアウト（../../layout.tsx）が描画し、このページの内容（仮説の登録フォーム）を、ボードと入れ替えて表示します。
 * ボードの「仮説」タブの「仮説を追加」から開きます。
 * ケースのデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 * 登録フォームは戻り先の表示をURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
'use client';

import { Suspense } from 'react';
import { NewHypothesisDetail } from '@/components/HypothesisDetail';

export default function NewHypothesisPage() {
  return (
    <Suspense>
      <NewHypothesisDetail />
    </Suspense>
  );
}
