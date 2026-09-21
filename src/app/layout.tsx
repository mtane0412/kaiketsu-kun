/**
 * ルートレイアウト
 *
 * 案件のデータはブラウザ内にのみ保存するため、すべてのページを、保存データの復元を待つ枠（CaseStoreGate）の中に描画します。
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CaseStoreGate } from '@/components/CaseStoreGate';
import './globals.css';

export const metadata: Metadata = {
  title: 'testimony-board',
  description: '誰が何を述べたかを起点に、人物・場所を時系列で整理する調査ボード',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <CaseStoreGate>{children}</CaseStoreGate>
      </body>
    </html>
  );
}
