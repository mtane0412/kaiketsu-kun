/**
 * 資料（聴取）の詳細ページ
 * ボードはレイアウト（../../layout.tsx）が描画し、このページの内容（資料の詳細）を、ボードと入れ替えて表示します。
 * ケースのデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 * 詳細は戻り先のタブをURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
'use client';

import { Suspense, use } from 'react';
import { InterviewDetail } from '@/components/InterviewDetail';

export default function InterviewPage({ params }: { params: Promise<{ interviewId: string }> }) {
  const { interviewId } = use(params);

  return (
    <Suspense>
      {/* 資料のフォームは初期値を初期化でのみ使用するため、対象が変わるたびに再マウントする */}
      <InterviewDetail key={interviewId} interviewId={decodeURIComponent(interviewId)} />
    </Suspense>
  );
}
