/**
 * 証言の本文の表示
 *
 * 本文を文字列とメンションに分解したもの（src/domain/case-views.ts の ClaimView.contentSegments）を描きます。
 * 証言のカード（ClaimCard）と、証言の詳細（ClaimDetail）の読む表示で共有します。
 * - 人物・場所のメンションは、種類ごとに色分けし、「@現在の名前」の形で、その詳細ページへのリンクにします。
 *   エンティティのアイコン（登録した画像。画像の無い人物は1文字）を添えます。
 * - 日時のメンションは、ケースのエンティティではなく開く先が無いため、リンクにせず色だけをそろえます。
 * リンク先のURLには、開いているタブ（tab）を「ボードに戻る」の戻り先として引き継ぎます。
 *
 * 注意: 本文を包む要素（段落など）は呼び出し側が置きます。省略・展開などの見せ方が、カードと詳細で違うためです。
 */
'use client';

import Link from 'next/link';
import type { ContentSegment, SegmentKind } from '@/domain/mention';
import { EntityAvatar } from './EntityAvatar';
import { mentionHref, type TabKey } from './routes';
import { useCaseId } from './useCaseId';

/** 本文のメンションの色です。種類ごとの意味を持つ色は globals.css のトークンに集約しています。 */
export const MENTION_STYLES: Record<SegmentKind, string> = {
  person: 'bg-mention-person text-mention-person-foreground',
  place: 'bg-mention-place text-mention-place-foreground',
  date: 'bg-mention-date text-mention-date-foreground',
};

type ClaimContentSegmentsProps = {
  segments: ContentSegment[];
  /** リンク先のURLに、戻り先として引き継ぐタブです。 */
  tab: TabKey;
  /** メンションのリンクに足すクラスです（カードでは、カード全体のリンクより手前に置くために使います）。 */
  linkClassName?: string;
};

export function ClaimContentSegments({ segments, tab, linkClassName = '' }: ClaimContentSegmentsProps) {
  const caseId = useCaseId();

  return segments.map((segment, index) =>
    segment.type !== 'mention' ? (
      segment.text
    ) : segment.kind === 'date' ? (
      <span key={index} className={`rounded px-0.5 ${MENTION_STYLES.date}`}>
        @{segment.label}
      </span>
    ) : (
      <Link
        key={index}
        href={mentionHref(caseId, segment.kind, segment.id, tab)}
        className={`${linkClassName} rounded px-0.5 underline decoration-current/30 underline-offset-2 hover:decoration-current ${MENTION_STYLES[segment.kind]}`}
      >
        <EntityAvatar imageDataUrl={segment.imageDataUrl} iconText={segment.iconText} size="sm" />@{segment.label}
      </Link>
    )
  );
}
