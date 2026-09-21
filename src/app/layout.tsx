/**
 * ルートレイアウト
 *
 * ケースのデータはブラウザ内にのみ保存します。どのケースを開くかはURL（/cases/<ケースのID>）が決めるため、
 * ケースを開く処理は、ケースのボードのレイアウト（src/app/cases/[caseId]/layout.tsx）の CaseGate が担います。
 *
 * 画面の文字には Geist を使います。Geist は欧文のみのため、日本語は端末の既定のフォントにフォールバックします。
 * ツールチップは画面のどこでも使えるよう、ここで TooltipProvider を置きます（shadcn/ui の要求）。
 */
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'kaiketsu-kun',
  description: '誰が何を述べたかを起点に、人物・場所を時系列で整理する調査ボード',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={cn('font-sans', geist.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
