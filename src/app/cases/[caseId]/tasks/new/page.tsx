/**
 * 未了事項を新しく登録するページ
 * ボードはレイアウト（../../layout.tsx）が描画し、このページの内容（未了事項の登録フォーム）を、ボードと入れ替えて表示します。
 * ボードの「未了事項」タブの「未了事項を追加」と、証言・人物・場所の詳細の「この〇〇の未了事項を追加」から開きます。
 * ケースのデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 * 登録フォームは戻り先の表示とひもづける対象をURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
'use client';

import { Suspense } from 'react';
import { NewTaskDetail } from '@/components/TaskDetail';

export default function NewTaskPage() {
  return (
    <Suspense>
      <NewTaskDetail />
    </Suspense>
  );
}
