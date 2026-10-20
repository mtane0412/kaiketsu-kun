/**
 * 証言の詳細に並べる「この証言を束ねた論点」
 *
 * 開いている証言を束ねた論点（Dispute）を並べ、証言から、その事柄を述べる他の証言との比較の表へたどれるようにします。
 * 各行には、論点の名前を論点の詳細へのリンクにして並べ、解決済みの論点にはその旨を添えます。
 * 節の末尾には、この証言を既存の論点に加える選択欄と、この証言を束ねた新しい論点を作るページへのリンクを置きます。
 * 並びの導出は src/domain/disputes.ts の findDisputesWithClaim です。
 *
 * 注意: 論点に加える操作は、選んだ時点ですぐに保存します。保存できなかった場合は理由を表示します。
 */
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { findDisputesWithClaim } from '@/domain/disputes';
import type { Id } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { FormError, INPUT_CLASS } from './forms/fields';
import { disputeHref, newDisputeHref, type TabKey } from './routes';
import { useCaseId } from './useCaseId';

/** この節の見出しです。読み上げのための名前（aria-label）にも使います。 */
const SECTION_LABEL = 'この証言を束ねた論点';

type DisputeMembershipSectionProps = {
  claimId: Id;
  /** リンク先のURLに引き継ぐ、開いているタブです。 */
  tab: TabKey;
};

export function DisputeMembershipSection({ claimId, tab }: DisputeMembershipSectionProps) {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const upsert = useCaseStore((state) => state.upsert);
  const [error, setError] = useState<string | null>(null);
  const disputes = findDisputesWithClaim(currentCase, claimId);
  const candidates = currentCase.disputes.filter((dispute) => !dispute.claimIds.includes(claimId));

  /** 論点 disputeId に、この証言を束ねます。描画時点ではなく、ストアにある最新の論点に加えます。 */
  const addToDispute = (disputeId: Id) => {
    setError(null);
    const latest = useCaseStore.getState().currentCase?.disputes.find((dispute) => dispute.id === disputeId);
    if (latest === undefined) {
      setError(`論点が見つかりません: ${disputeId}`);
      return;
    }
    try {
      upsert('disputes', { ...latest, claimIds: [...latest.claimIds, claimId] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <section aria-label={SECTION_LABEL} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {SECTION_LABEL}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{disputes.length}件</span>
      </h3>
      {disputes.length > 0 && (
        <ul className="space-y-1">
          {disputes.map((dispute) => (
            <li key={dispute.id} className="rounded-lg border bg-card px-3 py-2 text-sm">
              {dispute.resolved && <span className="mr-2 text-xs text-muted-foreground">解決済み</span>}
              <Link href={disputeHref(caseId, dispute.id, tab)} className="underline underline-offset-2 hover:no-underline">
                {dispute.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <select
          aria-label="この証言を論点に加える"
          value=""
          onChange={(event) => {
            if (event.target.value !== '') addToDispute(event.target.value);
          }}
          className={INPUT_CLASS}
        >
          <option value="">この証言を論点に加える…</option>
          {candidates.map((dispute) => (
            <option key={dispute.id} value={dispute.id}>
              {dispute.title}
            </option>
          ))}
        </select>
      )}
      <FormError message={error} />
      <Link
        href={newDisputeHref(caseId, tab, [claimId])}
        className="text-xs text-muted-foreground underline underline-offset-2 hover:no-underline"
      >
        この証言から論点を作る
      </Link>
    </section>
  );
}
