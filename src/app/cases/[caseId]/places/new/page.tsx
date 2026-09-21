/**
 * 場所を新しく登録するページ
 * ボードはレイアウト（../../layout.tsx）が描画し、このページの内容（場所の登録フォーム）を、その横に並べます。
 * サイドバーの「場所」の見出しの横の「＋」から開きます。
 * ケースのデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 * 登録フォームは戻り先の表示をURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
'use client';

import { Suspense } from 'react';
import { NewPlaceDetail } from '@/components/EntityDetail';

export default function NewPlacePage() {
  return (
    <Suspense>
      <NewPlaceDetail />
    </Suspense>
  );
}
