/**
 * 仮説の詳細ページ
 * ボードはレイアウト（../../layout.tsx）が描画し、このページの内容（仮説の詳細）を、ボードと入れ替えて表示します。
 * ケースのデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 * 詳細は戻り先のタブをURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
'use client';

import { Suspense, use } from 'react';
import { HypothesisDetail } from '@/components/HypothesisDetail';

export default function HypothesisPage({ params }: { params: Promise<{ hypothesisId: string }> }) {
  const { hypothesisId } = use(params);

  return (
    <Suspense>
      {/* 仮説のフォームは初期値を初期化でのみ使用するため、対象が変わるたびに再マウントする */}
      <HypothesisDetail key={hypothesisId} hypothesisId={decodeURIComponent(hypothesisId)} />
    </Suspense>
  );
}
