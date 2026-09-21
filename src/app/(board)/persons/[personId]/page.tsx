/**
 * 人物の詳細ページ
 * ボードはレイアウト（../../layout.tsx）が描画し、このページの内容（人物の詳細）を、その横に並べます。
 * 案件のデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 * 詳細は戻り先のタブをURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
'use client';

import { Suspense, use } from 'react';
import { PersonDetail } from '@/components/EntityDetail';

export default function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = use(params);

  return (
    <Suspense>
      {/* 人物のフォームは初期値を初期化でのみ使用するため、対象が変わるたびに再マウントする */}
      <PersonDetail key={personId} personId={decodeURIComponent(personId)} />
    </Suspense>
  );
}
