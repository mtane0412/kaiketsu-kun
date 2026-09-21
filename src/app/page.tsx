/**
 * トップページ（ケースの一覧）
 * 保存されているケースを並べ、開くケースを選びます。ケースのデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 */
'use client';

import { CaseList } from '@/components/CaseList';

export default function CasesPage() {
  return <CaseList />;
}
