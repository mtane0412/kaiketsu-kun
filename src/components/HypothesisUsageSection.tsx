/**
 * 証言の詳細に並べる「この証言を使っている仮説」
 *
 * 開いている証言をひもづけている仮説を並べ、証言から仮説へたどれるようにします。
 * 各行には、仮説の詳細へのリンク・仮説の状態・この証言をひもづけている立場（支える証言・反する証言・「管理人の動機」など）を並べます。
 * 並びと立場の導出は src/domain/hypotheses.ts の findHypothesesUsingClaim です。
 * どの仮説にも使われていない証言では、何も表示しません。
 */
'use client';

import Link from 'next/link';
import { findHypothesesUsingClaim, type HypothesisClaimUse } from '@/domain/hypotheses';
import { HYPOTHESIS_ASPECT_LABELS, HYPOTHESIS_STATUS_LABELS } from '@/domain/labels';
import type { Id } from '@/domain/types';
import { useCurrentCase } from '@/stores/useCaseStore';
import { hypothesisHref, type TabKey } from './routes';
import { useCaseId } from './useCaseId';

/** この節の見出しです。読み上げのための名前（aria-label）にも使います。 */
const SECTION_LABEL = 'この証言を使っている仮説';

/** 証言をひもづけている立場の表示名を返します。 */
function claimUseLabelOf(use: HypothesisClaimUse): string {
  if (use.kind === 'supporting') return '支える証言';
  if (use.kind === 'opposing') return '反する証言';
  return `${use.personName}の${HYPOTHESIS_ASPECT_LABELS[use.aspect]}`;
}

type HypothesisUsageSectionProps = {
  claimId: Id;
  /** リンク先のURLに引き継ぐ、開いているタブです。 */
  tab: TabKey;
};

export function HypothesisUsageSection({ claimId, tab }: HypothesisUsageSectionProps) {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const usages = findHypothesesUsingClaim(currentCase, claimId);

  if (usages.length === 0) return null;

  return (
    <section aria-label={SECTION_LABEL} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {SECTION_LABEL}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{usages.length}件</span>
      </h3>
      <ul className="space-y-1">
        {usages.map(({ hypothesis, uses }) => (
          <li key={hypothesis.id} className="rounded-lg border bg-card px-3 py-2 text-sm">
            <span className="mr-2 text-xs text-muted-foreground">{HYPOTHESIS_STATUS_LABELS[hypothesis.status]}</span>
            <Link
              href={hypothesisHref(caseId, hypothesis.id, tab)}
              className={`underline underline-offset-2 hover:no-underline ${hypothesis.status === 'rejected' ? 'line-through' : ''}`}
            >
              {hypothesis.title}
            </Link>
            <span className="ml-2 text-xs text-muted-foreground">{uses.map(claimUseLabelOf).join('・')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
