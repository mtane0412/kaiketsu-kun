/**
 * ボード全体の検索結果のページ
 * ボードはレイアウト（../layout.tsx）が描画し、このページの内容（検索結果）を、ボードと入れ替えて表示します。
 * ケースのデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 * 検索結果は検索語と戻り先のタブをURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
'use client';

import { Suspense } from 'react';
import { SearchDetail } from '@/components/SearchDetail';

export default function SearchPage() {
  return (
    <Suspense>
      <SearchDetail />
    </Suspense>
  );
}
