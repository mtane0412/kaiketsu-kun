/**
 * 論点の一覧ビュー（ボードの「論点」タブ）
 *
 * 同じ事柄を述べる証言を束ねた論点（Dispute）を並べ、どの食い違いがまだ解けていないかを見失わないようにします。
 * 未解決の論点と解決済みの論点を別の一覧に分け、解決済みの論点は控えめな見た目で並べます
 * （導出は src/domain/disputes.ts の buildDisputeList）。
 * 各論点は、名前を論点の詳細ページへのリンクにし、束ねた証言の件数と発言者を添えます。
 *
 * 注意: 論点の登録・編集と、束ねた証言を見比べる表は、論点の詳細ページ（DisputeDetail）で行います。
 */
'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { buildDisputeList, type DisputeListItem } from '@/domain/disputes';
import type { Case } from '@/domain/types';
import { buttonVariants } from '@/components/ui/button';
import { disputeHref, newDisputeHref } from '../routes';
import { useCaseId } from '../useCaseId';

/** このビューのタブです。リンク先のURLに、戻り先として引き継ぎます。 */
const TAB = 'disputes';

type DisputeListViewProps = {
  target: Case;
};

/** 論点1件の行です。 */
function DisputeItem({ item }: { item: DisputeListItem }) {
  const caseId = useCaseId();
  const { dispute, speakerLabels } = item;
  const meta = [`証言${dispute.claimIds.length}件`, ...(speakerLabels.length > 0 ? [speakerLabels.join('・')] : [])];

  return (
    <li
      className={`space-y-1 rounded-lg border p-3 ${dispute.resolved ? 'bg-muted/40 text-muted-foreground' : 'bg-card'}`}
    >
      <Link href={disputeHref(caseId, dispute.id, TAB)} className="font-semibold hover:underline">
        {dispute.title}
      </Link>
      <p className="text-xs text-muted-foreground">{meta.join('：')}</p>
    </li>
  );
}

export function DisputeListView({ target }: DisputeListViewProps) {
  const caseId = useCaseId();
  const { open, resolved } = useMemo(() => buildDisputeList(target), [target]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link href={newDisputeHref(caseId, TAB)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <Plus aria-hidden="true" />
          論点を追加
        </Link>
      </div>

      {open.length === 0 && resolved.length === 0 && (
        <p className="text-sm text-muted-foreground">
          まだ論点がありません。同じ事柄について3件以上の証言が食い違うときは、「論点を追加」から論点を作り、証言を束ねて表で見比べられます。証言の詳細や照合からも作れます。
        </p>
      )}

      {open.length > 0 && (
        <ul aria-label="未解決の論点の一覧" className="space-y-2">
          {open.map((item) => (
            <DisputeItem key={item.dispute.id} item={item} />
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <section aria-label="解決済みの論点" className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            解決済みの論点
            <span className="ml-2 text-xs font-normal">{resolved.length}件</span>
          </h3>
          <ul aria-label="解決済みの論点の一覧" className="space-y-2">
            {resolved.map((item) => (
              <DisputeItem key={item.dispute.id} item={item} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
