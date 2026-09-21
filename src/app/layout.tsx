/**
 * ルートレイアウト
 *
 * ケースのデータはブラウザ内にのみ保存します。どのケースを開くかはURL（/cases/<ケースのID>）が決めるため、
 * ケースを開く処理は、ケースのボードのレイアウト（src/app/cases/[caseId]/layout.tsx）の CaseGate が担います。
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
