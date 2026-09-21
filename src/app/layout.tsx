/**
 * ルートレイアウト
 *
 * 案件のデータはブラウザ内にのみ保存します。どの案件を開くかはURL（/cases/<案件のID>）が決めるため、
 * 案件を開く処理は、案件のボードのレイアウト（src/app/cases/[caseId]/layout.tsx）の CaseGate が担います。
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'testimony-board',
  description: '誰が何を述べたかを起点に、人物・場所を時系列で整理する調査ボード',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
