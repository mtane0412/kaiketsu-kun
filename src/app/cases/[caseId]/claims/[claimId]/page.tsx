/**
 * 証言の詳細ページ
 * ボードはレイアウト（../../layout.tsx）が描画し、このページの内容（証言の詳細）を、その横に並べます。
 * ケースのデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 * 詳細は戻り先のタブをURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
'use client';

import { Suspense, use } from 'react';
import { ClaimDetail } from '@/components/ClaimDetail';

export default function ClaimPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = use(params);

  return (
    <Suspense>
      {/* 証言のフォームは初期値を初期化でのみ使用するため、対象が変わるたびに再マウントする */}
      <ClaimDetail key={claimId} claimId={decodeURIComponent(claimId)} />
    </Suspense>
  );
}
