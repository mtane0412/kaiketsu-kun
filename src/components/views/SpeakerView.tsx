/**
 * 証言者別ビュー
 *
 * 発言者ごとに主張をまとめ、述べられた時点の早い順に並べます。
 * 同じ人物の証言が時期によって変化していないかを確かめる用途を想定しています。
 */
import { useMemo } from 'react';
import { groupClaimsBySpeaker } from '@/domain/case-views';
import type { Case } from '@/domain/types';
import { ClaimCard } from './ClaimCard';

const KIND_LABELS = { person: '人物', user: 'ユーザー' } as const;

export function SpeakerView({ target }: { target: Case }) {
  const groups = useMemo(() => groupClaimsBySpeaker(target), [target]);

  if (groups.length === 0) {
    return <p className="text-sm text-slate-500">主張がまだ登録されていません。時系列のボードから書き足してください。</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 className="mb-2 flex items-baseline gap-2 text-base font-semibold text-slate-900">
            {group.label}
            <span className="text-xs font-normal text-slate-500">
              {KIND_LABELS[group.kind]}・{group.claims.length}件
            </span>
          </h3>
          <ul className="space-y-2">
            {group.claims.map((view) => (
              <ClaimCard key={view.claim.id} view={view} showSpeaker={false} showEvent />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
