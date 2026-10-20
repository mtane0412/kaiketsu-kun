/**
 * 論点を新しく登録するページ
 * ボードはレイアウト（../../layout.tsx）が描画し、このページの内容（論点の登録フォーム）を、ボードと入れ替えて表示します。
 * ボードの「論点」タブの「論点を追加」と、証言の詳細の「この証言から論点を作る」、照合の「論点を作る」から開きます。
 * ケースのデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 * 登録フォームは戻り先の表示と束ねる証言をURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
'use client';

import { Suspense } from 'react';
import { NewDisputeDetail } from '@/components/DisputeDetail';

export default function NewDisputePage() {
  return (
    <Suspense>
      <NewDisputeDetail />
    </Suspense>
  );
}
