/**
 * トップページ（案件の一覧）
 * 保存されている案件を並べ、開く案件を選びます。案件のデータはブラウザ内にのみ保存するため、クライアントコンポーネントとして描画します。
 */
'use client';

import { CaseList } from '@/components/CaseList';

export default function CasesPage() {
  return <CaseList />;
}
