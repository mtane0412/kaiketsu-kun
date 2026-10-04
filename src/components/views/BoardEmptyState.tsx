/**
 * ボードの表示が空のときの案内
 *
 * グラフ・証言者別・人物の動きなど、時系列のボードに書き足した証言から組み立てる表示で、
 * まだ表示できるものが無いときに、理由と、書き足す場所（時系列のボード）へ移るリンクを並べます。
 * 案内の文だけでは、どこから書き足せばよいかを探す手間が残るため、次の一歩をリンクで示します。
 */
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { boardHref } from '../routes';
import { useCaseId } from '../useCaseId';

export function BoardEmptyState({ message }: { message: string }) {
  const caseId = useCaseId();
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed px-4 py-6">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link href={boardHref(caseId, 'timeline')} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        時系列のボードで書き足す
        <ArrowRight aria-hidden="true" />
      </Link>
    </div>
  );
}
