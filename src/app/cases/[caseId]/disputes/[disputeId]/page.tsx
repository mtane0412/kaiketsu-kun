/**
 * 論点の詳細ページ
 * ボードはレイアウト（../../layout.tsx）が描画し、このページの内容（論点の詳細）を、ボードと入れ替えて表示します。
 * ケースのデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 * 詳細は戻り先のタブをURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
'use client';

import { Suspense, use } from 'react';
import { DisputeDetail } from '@/components/DisputeDetail';

export default function DisputePage({ params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = use(params);

  return (
    <Suspense>
      {/* 論点のフォームは初期値を初期化でのみ使用するため、対象が変わるたびに再マウントする */}
      <DisputeDetail key={disputeId} disputeId={decodeURIComponent(disputeId)} />
    </Suspense>
  );
}
