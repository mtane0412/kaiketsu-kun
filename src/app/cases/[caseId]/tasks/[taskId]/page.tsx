/**
 * 未了事項の詳細ページ
 * ボードはレイアウト（../../layout.tsx）が描画し、このページの内容（未了事項の詳細）を、ボードと入れ替えて表示します。
 * ケースのデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 * 詳細は戻り先のタブをURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
'use client';

import { Suspense, use } from 'react';
import { TaskDetail } from '@/components/TaskDetail';

export default function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = use(params);

  return (
    <Suspense>
      {/* 未了事項のフォームは初期値を初期化でのみ使用するため、対象が変わるたびに再マウントする */}
      <TaskDetail key={taskId} taskId={decodeURIComponent(taskId)} />
    </Suspense>
  );
}
