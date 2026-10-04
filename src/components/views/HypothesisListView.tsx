/**
 * 仮説の一覧ビュー（ボードの「仮説」タブ）
 *
 * 読み手の見立て（仮説）を並べ、複数の見立てを同時に見比べられるようにします。
 * 否定されていない仮説は、有力・検討中の順に並べます。否定された仮説は削除せずに残し、
 * 別の一覧に、否定の理由とともに控えめな見た目で並べます（導出は src/domain/hypotheses.ts の buildHypothesisList）。
 * 各仮説は、見出しを仮説の詳細ページへのリンクにし、状態・支える証言と反する証言の件数・対象の人物を添えます。
 *
 * 注意: 仮説の登録・編集は、仮説の詳細ページ（HypothesisDetail）で行います。
 */
'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { buildHypothesisList, type HypothesisListItem } from '@/domain/hypotheses';
import { HYPOTHESIS_STATUS_LABELS } from '@/domain/labels';
import type { Case } from '@/domain/types';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { hypothesisHref, newHypothesisHref } from '../routes';
import { useCaseId } from '../useCaseId';

/** このビューのタブです。リンク先のURLに、戻り先として引き継ぎます。 */
const TAB = 'hypotheses';

type HypothesisListViewProps = {
  target: Case;
};

/** 仮説1件の行です。 */
function HypothesisItem({ item }: { item: HypothesisListItem }) {
  const caseId = useCaseId();
  const { hypothesis, targetPersons } = item;
  const isRejected = hypothesis.status === 'rejected';

  return (
    <li className={`space-y-1 rounded-lg border p-3 ${isRejected ? 'bg-muted/40 text-muted-foreground' : 'bg-card'}`}>
      <div className="flex items-center gap-2">
        <Badge variant={hypothesis.status === 'likely' ? 'default' : isRejected ? 'outline' : 'secondary'}>
          {HYPOTHESIS_STATUS_LABELS[hypothesis.status]}
        </Badge>
        <Link
          href={hypothesisHref(caseId, hypothesis.id, TAB)}
          className={`font-semibold hover:underline ${isRejected ? 'line-through' : ''}`}
        >
          {hypothesis.title}
        </Link>
      </div>
      {hypothesis.description && <p className="whitespace-pre-line text-sm">{hypothesis.description}</p>}
      {isRejected && hypothesis.rejectionReason && (
        <p className="whitespace-pre-line text-sm">
          <span className="mr-1 text-xs font-semibold">否定の理由</span>
          {hypothesis.rejectionReason}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        支える証言 {hypothesis.supportingClaimIds.length}件・反する証言 {hypothesis.opposingClaimIds.length}件
        {targetPersons.length > 0 && `・対象: ${targetPersons.map((person) => person.name).join('、')}`}
      </p>
    </li>
  );
}

export function HypothesisListView({ target }: HypothesisListViewProps) {
  const caseId = useCaseId();
  const { active, rejected } = useMemo(() => buildHypothesisList(target), [target]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link href={newHypothesisHref(caseId, TAB)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <Plus aria-hidden="true" />
          仮説を追加
        </Link>
      </div>

      {active.length === 0 && rejected.length === 0 && (
        <p className="text-sm text-muted-foreground">
          まだ仮説がありません。「仮説を追加」から見立てを登録し、支える証言・反する証言をひもづけられます。
        </p>
      )}

      {active.length > 0 && (
        <ul aria-label="仮説の一覧" className="space-y-2">
          {active.map((item) => (
            <HypothesisItem key={item.hypothesis.id} item={item} />
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <section aria-label="否定された仮説" className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            否定された仮説
            <span className="ml-2 text-xs font-normal">{rejected.length}件</span>
          </h3>
          <ul aria-label="否定された仮説の一覧" className="space-y-2">
            {rejected.map((item) => (
              <HypothesisItem key={item.hypothesis.id} item={item} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
