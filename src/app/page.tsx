/**
 * ホームページ
 * 案件のデータはブラウザ内にのみ保存するため、ボード全体をクライアントコンポーネントとして描画します。
 * ボードはタブをURLのクエリから読み取る（useSearchParams）ため、Suspense の中に置きます。
 */
import { Suspense } from 'react';
import { CaseBoard } from '@/components/CaseBoard';

export default function HomePage() {
  return (
    <Suspense>
      <CaseBoard />
    </Suspense>
  );
}
