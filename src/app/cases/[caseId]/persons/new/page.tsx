/**
 * 人物を新しく登録するページ
 * ボードはレイアウト（../../layout.tsx）が描画し、このページの内容（人物の登録フォーム）を、その横に並べます。
 * サイドバーの「人物」の見出しの横の「＋」から開きます。
 * ケースのデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 * 登録フォームは戻り先の表示をURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
'use client';

import { Suspense } from 'react';
import { NewPersonDetail } from '@/components/EntityDetail';

export default function NewPersonPage() {
  return (
    <Suspense>
      <NewPersonDetail />
    </Suspense>
  );
}
