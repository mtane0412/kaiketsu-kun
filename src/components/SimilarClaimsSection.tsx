/**
 * 証言の詳細に並べる「似ている証言」
 *
 * 開いている証言と、触れている人物・場所・日時・聴取を多く共有する証言を、似ている順にリンクで並べます。
 * 各行には、なぜ似ているのか（共有する人物・同じ場所・日時の近さ・同じ聴取）を添えます。
 * 照合の種類と、両方の証言をひもづけている仮説は、読み手の判断であるため順位には使わず、目印として添えるだけにします。
 * 並びと理由の導出は src/domain/similar-claims.ts の findSimilarClaims です。
 * 似ている証言が1件も無い場合は、何も表示しません。
 */
'use client';

import { CROSS_CHECK_KIND_SHORT_LABELS } from '@/domain/labels';
import { findSimilarClaims, type SimilarityReason } from '@/domain/similar-claims';
import { HOUR_MS, MINUTE_MS } from '@/domain/time-ref';
import type { Id } from '@/domain/types';
import { useCurrentCase } from '@/stores/useCaseStore';
import { ClaimLink } from './ClaimLink';
import type { TabKey } from './routes';

/** この節の見出しです。読み上げのための名前（aria-label）にも使います。 */
const SECTION_LABEL = '似ている証言';

/** 日時の間隔を、1時間未満は分、それ以上は時間に丸めた「約◯◯差」の表記にします。 */
function formatGap(gapMs: number): string {
  if (gapMs < HOUR_MS) return `約${Math.max(1, Math.round(gapMs / MINUTE_MS))}分差`;
  return `約${Math.round(gapMs / HOUR_MS)}時間差`;
}

/** 似ている理由の表示名を返します。 */
function reasonLabelOf(reason: SimilarityReason): string {
  switch (reason.kind) {
    case 'sharedPersons':
      return `人物: ${reason.persons.map((person) => person.name).join('・')}`;
    case 'samePlace':
      return `同じ場所: ${reason.place.name}`;
    case 'overlappingTime':
      return '日時が重なる';
    case 'nearTime':
      return `日時が近い（${formatGap(reason.gapMs)}）`;
    case 'sameInterview':
      return '同じ資料';
  }
}

type SimilarClaimsSectionProps = {
  claimId: Id;
  /** リンク先のURLに引き継ぐ、開いているタブです。 */
  tab: TabKey;
};

export function SimilarClaimsSection({ claimId, tab }: SimilarClaimsSectionProps) {
  const currentCase = useCurrentCase();
  const similars = findSimilarClaims(currentCase, claimId);

  if (similars.length === 0) return null;

  return (
    <section aria-label={SECTION_LABEL} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {SECTION_LABEL}
        <span className="ml-2 text-xs font-normal text-muted-foreground">共有する人物・場所・日時・資料から計算</span>
      </h3>
      <ul className="space-y-2">
        {similars.map(({ view, reasons, crossCheckKinds, sharedHypotheses }) => (
          <li key={view.claim.id} className="space-y-1">
            <ClaimLink view={view} tab={tab} />
            <p className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
              {reasons.map((reason) => (
                <span key={reason.kind}>{reasonLabelOf(reason)}</span>
              ))}
              {crossCheckKinds.map((kind) => (
                <span key={`cross-check:${kind}`} className="font-semibold text-foreground">
                  照合: {CROSS_CHECK_KIND_SHORT_LABELS[kind]}
                </span>
              ))}
              {sharedHypotheses.map((hypothesis) => (
                <span key={`hypothesis:${hypothesis.id}`} className="font-semibold text-foreground">
                  仮説: {hypothesis.title}
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
