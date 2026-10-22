/**
 * 証言者別ビュー
 *
 * 発言者ごとに証言をまとめ、時系列ボードの並び順で並べます。
 * 同じ人物が何をどう述べているかをまとめて読む用途を想定しています。
 *
 * 発言者の見出しと証言のカードを1列の1本のリストに並べ、画面に見える分だけを描画します（useWindowListVirtualizer）。
 * 1人で千件を超える証言を持つ発言者もいるため、発言者ごとの枠を2列に並べる以前の表示では、すべてのカードを描画するしかなかったためです（#125）。
 * 発言者の見出しは、その発言者の証言を読んでいる間、画面の上（ページの見出しの下）に重ねて示します。
 * 重ねた見出しは見た目のためのもので、読み上げにはリストの中の見出しが届きます。
 *
 * 注意: 画面に見えていない証言は描画しないため、ブラウザのページ内検索では見つかりません。証言はサイドバーの検索で探します。
 */
'use client';

import { useMemo } from 'react';
import { groupClaimsBySpeaker, type ClaimView, type SpeakerGroup } from '@/domain/case-views';
import type { Case } from '@/domain/types';
import { EntityAvatar } from '../EntityAvatar';
import { ClaimCard } from './ClaimCard';
import { BoardEmptyState } from './BoardEmptyState';
import { useWindowListVirtualizer } from './useWindowListVirtualizer';

const KIND_LABELS = { person: '人物', user: 'ユーザー' } as const;

/** 行（見出し・カード）の間の余白（px）です。Tailwind の space-y-2 と同じ 0.5rem です。 */
const ROW_GAP = 8;

/** 発言者の見出しの行の高さの見積もり（px）です。描画した後は、実際の高さで位置を計算し直します。 */
const HEADING_SIZE_ESTIMATE = 48;

/** 証言のカードの行の高さの見積もり（px）です。描画した後は、実際の高さで位置を計算し直します。 */
const CARD_SIZE_ESTIMATE = 130;

/**
 * 重ねた見出しを置く、画面の上からの距離（px）です。ページの見出し（src/components/CaseBoard.tsx の header の h-14 = 3.5rem）の高さです。
 * ページの見出しの高さを変える場合は、ここと、重ねた見出しの top-14 も合わせて変えてください。
 */
const PAGE_HEADER_HEIGHT = 56;

/** リストの1行です。発言者の見出しか、証言のカードです。 */
type SpeakerRow =
  | { kind: 'heading'; key: string; group: SpeakerGroup }
  | { kind: 'claim'; key: string; group: SpeakerGroup; view: ClaimView };

type SpeakerViewProps = {
  target: Case;
};

/** 発言者の見出しの中身です。リストの中の見出しと、画面の上に重ねた見出しで共有します。 */
function SpeakerHeadingContent({ group }: { group: SpeakerGroup }) {
  return (
    <>
      <EntityAvatar imageDataUrl={group.imageDataUrl} iconText={group.iconText} size="md" />
      {group.label}
      <span className="text-xs font-normal text-muted-foreground">
        {KIND_LABELS[group.kind]}・{group.claims.length}件
      </span>
    </>
  );
}

/** 発言者の見出しの見た目です。 */
const HEADING_CLASS = 'flex items-center gap-2 rounded-lg border bg-muted px-3 py-2 text-base font-semibold';

export function SpeakerView({ target }: SpeakerViewProps) {
  const rows = useMemo(
    () =>
      groupClaimsBySpeaker(target).flatMap((group): SpeakerRow[] => [
        { kind: 'heading', key: `heading:${group.key}`, group },
        ...group.claims.map((view): SpeakerRow => ({ kind: 'claim', key: `${group.key}:${view.claim.id}`, group, view })),
      ]),
    [target]
  );
  const { listRef, virtualizer, virtualItemStyle } = useWindowListVirtualizer<HTMLOListElement>({
    count: rows.length,
    estimateSize: (index) => (rows[index]!.kind === 'heading' ? HEADING_SIZE_ESTIMATE : CARD_SIZE_ESTIMATE),
    getItemKey: (index) => rows[index]!.key,
    gap: ROW_GAP,
  });

  if (rows.length === 0) {
    return <BoardEmptyState message="証言がまだ登録されていません。時系列のボードから書き足してください。" />;
  }

  const virtualItems = virtualizer.getVirtualItems();
  // ページの見出しのすぐ下の位置にある行の発言者を、画面の上に重ねて示す。リストより上を見ている間は示さない
  const topLine = (virtualizer.scrollOffset ?? 0) + PAGE_HEADER_HEIGHT;
  const topItem = virtualItems.find((item) => item.end > topLine);
  const stickyGroup = topItem !== undefined && topLine > virtualizer.options.scrollMargin ? rows[topItem.index]!.group : undefined;

  return (
    <div>
      {/* 高さを持たない枠を画面の上に貼り付け、その中に見出しを重ねる。リストの位置をずらさないためである */}
      {stickyGroup !== undefined && (
        <div aria-hidden="true" className="sticky top-14 z-20 h-0">
          <div className={HEADING_CLASS}>
            <SpeakerHeadingContent group={stickyGroup} />
          </div>
        </div>
      )}
      <ol ref={listRef} aria-label="証言者別" className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualItems.map((virtualItem) => {
          const row = rows[virtualItem.index]!;
          return (
            <li key={row.key} ref={virtualizer.measureElement} data-index={virtualItem.index} style={virtualItemStyle(virtualItem)}>
              {row.kind === 'heading' ? (
                <h3 className={HEADING_CLASS}>
                  <SpeakerHeadingContent group={row.group} />
                </h3>
              ) : (
                <ul>
                  <ClaimCard view={row.view} showSpeaker={false} tab="speaker" />
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
