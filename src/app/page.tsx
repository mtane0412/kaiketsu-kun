/**
 * ホームページ
 * 案件のデータはブラウザ内にのみ保存するため、ボード全体をクライアントコンポーネントとして描画します。
 */
import { CaseBoard } from '@/components/CaseBoard';

export default function HomePage() {
  return <CaseBoard />;
}
