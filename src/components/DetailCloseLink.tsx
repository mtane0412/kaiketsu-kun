/**
 * 詳細を閉じるリンク
 *
 * 証言・人物・場所・仮説・未了事項・資料の詳細と、検索結果の右上に置く「閉じる」です。
 * 押すと、開く前の表示（URLの ?tab= が指す表示）のボードへ戻ります。
 * Esc キーでも同じ動きをするため（useBoardShortcuts）、画面の広い端末では「Esc」の印を添えます。
 *
 * 注意: 読み上げでは、何を閉じるのかが分かる名前（例: 「証言の詳細を閉じる」）を label で渡してください。
 */
import { X } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

type DetailCloseLinkProps = {
  /** 戻り先のURLです。 */
  href: string;
  /** 読み上げに使う名前です（例: 「証言の詳細を閉じる」）。 */
  label: string;
};

export function DetailCloseLink({ href, label }: DetailCloseLinkProps) {
  return (
    <div className="flex justify-end">
      <Link href={href} aria-label={label} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
        <X aria-hidden="true" />
        閉じる
        <kbd
          aria-hidden="true"
          className="ml-1 hidden rounded border bg-muted px-1 font-sans text-[0.65rem] text-muted-foreground sm:inline"
        >
          Esc
        </kbd>
      </Link>
    </div>
  );
}
