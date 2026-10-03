/**
 * 資料（聴取）を新しく登録するページ
 * ボードはレイアウト（../../layout.tsx）が描画し、このページの内容（資料の登録フォーム）を、ボードと入れ替えて表示します。
 * サイドバーの「資料」の「＋」から開きます。
 * ケースのデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 * 登録フォームは戻り先の表示をURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
'use client';

import { Suspense } from 'react';
import { NewInterviewDetail } from '@/components/InterviewDetail';

export default function NewInterviewPage() {
  return (
    <Suspense>
      <NewInterviewDetail />
    </Suspense>
  );
}
