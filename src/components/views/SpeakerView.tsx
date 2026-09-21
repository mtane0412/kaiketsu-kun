/**
 * 証言者別ビュー
 *
 * 発言者ごとに証言をまとめ、時系列ボードの並び順で並べます。
 * 同じ人物が何をどう述べているかをまとめて読む用途を想定しています。
 */
import { useMemo } from 'react';
import { groupClaimsBySpeaker } from '@/domain/case-views';
import type { Case } from '@/domain/types';
import { EntityAvatar } from '../EntityAvatar';
import { ClaimCard } from './ClaimCard';

const KIND_LABELS = { person: '人物', user: 'ユーザー' } as const;

type SpeakerViewProps = {
  target: Case;
};

export function SpeakerView({ target }: SpeakerViewProps) {
  const groups = useMemo(() => groupClaimsBySpeaker(target), [target]);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">証言がまだ登録されていません。時系列のボードから書き足してください。</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label} className="rounded-lg border bg-muted/40 p-3">
          <h3 className="mb-2 flex items-center gap-2 text-base font-semibold">
            <EntityAvatar imageDataUrl={group.imageDataUrl} iconText={group.iconText} size="md" />
            {group.label}
            <span className="text-xs font-normal text-muted-foreground">
              {KIND_LABELS[group.kind]}・{group.claims.length}件
            </span>
          </h3>
          <ul className="space-y-2">
            {group.claims.map((view) => (
              <ClaimCard
                key={view.claim.id}
                view={view}
                showSpeaker={false}
                tab="speaker"
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
