/**
 * 証言1件の表示
 *
 * 時系列ビューと証言者別ビューで共有します。
 * ユーザーの推測は、人物の発言と見分けられるよう破線の枠と「推測」の表示で区別します。
 * 本文のメンションは、種類ごとに色分けして「@現在の名前」の形で表示します。
 * 発言者と本文のメンションには、エンティティのアイコン（登録した画像。画像の無い人物は1文字）を添えます。
 * 言及している人物は、名前を並べる代わりにアイコンを並べます（名前はアイコンの説明とツールチップで示します）。
 * 見出しのある証言は、見出しを表示し、本文は「本文を表示」を開くまで折りたたみます（長い本文がボードを占めないようにするためです）。
 * カード全体が、証言の詳細ページへのリンクになります。証言の編集は詳細ページに一本化しているため、カードには編集のボタンを置きません。
 * 本文のメンションと言及のアイコンは、その人物・場所の詳細ページへのリンクになります（証言から人物・場所へたどる導線です）。
 * リンク先のURLには、開いているタブ（tab）を「ボードに戻る」の戻り先として引き継ぎます。
 * 詳細を開いている証言のカード（isActive）は、枠を強調し、画面の外にある場合は見える位置までスクロールします。
 * 詳細の関連リンクから別の証言へ移ったときに、ボード上の位置を見失わないようにするためです。
 *
 * カードの下段（述べる場所・言及している人物・資料内の位置）は、項目名を文字で書かずアイコンで示します。
 * 1件のカードに「開く」「述べる場所」「言及」のような短い文字が散らばると、証言そのものより項目名が目に付くためです。
 * 項目名は読み上げのために sr-only の文字として残し、マウスにはツールチップ（title）で示します。
 *
 * 注意: リンクの当たり判定をカード全体に広げています（リンクの after 疑似要素）。カードの中で操作できる要素
 * （メンション・言及のアイコン・「本文を表示」）は、リンクより手前（ABOVE_CARD_LINK）に置いてください。
 */
'use client';

import { AtSign, BookMarked, ChevronRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { claimLabelOf, formatViaLabel, type ClaimView } from '@/domain/case-views';
import type { SegmentKind } from '@/domain/mention';
import { personIconText } from '@/domain/person-icon';
import { EntityAvatar } from '../EntityAvatar';
import { claimHref, mentionHref, personHref, type TabKey } from '../routes';
import { useCaseId } from '../useCaseId';

/** 本文のメンションの色です。種類ごとの意味を持つ色は globals.css のトークンに集約しています。 */
const MENTION_STYLES: Record<SegmentKind, string> = {
  person: 'bg-mention-person text-mention-person-foreground',
  place: 'bg-mention-place text-mention-place-foreground',
  date: 'bg-mention-date text-mention-date-foreground',
};

/** カード全体に広げたリンクの当たり判定より手前に置く要素のクラスです。 */
const ABOVE_CARD_LINK = 'relative z-10';

/** カードの下段の1行です。項目名はアイコンで示し、文字は読み上げとツールチップのために持ちます。 */
function DetailRow({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt title={label} className="flex h-5 items-center text-muted-foreground">
        <span aria-hidden="true">{icon}</span>
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="flex min-h-5 items-center">{children}</dd>
    </>
  );
}

type ClaimCardProps = {
  view: ClaimView;
  /** 発言者名を表示するかどうかです。証言者別ビューではグループ見出しと重複するため非表示にします。 */
  showSpeaker: boolean;
  /** このカードを表示しているタブです。詳細ページへのリンクに、戻り先として引き継ぎます。 */
  tab: TabKey;
  /** この証言の詳細を開いているかどうかです。 */
  isActive?: boolean;
};

export function ClaimCard({ view, showSpeaker, tab, isActive = false }: ClaimCardProps) {
  const { claim } = view;
  const caseId = useCaseId();
  const cardRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    // すでに見えているカードは動かさない（block: 'nearest'）
    if (isActive) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isActive]);

  const isUserSpeculation = claim.speaker.kind === 'user';
  const content = (
    <p className="whitespace-pre-line text-foreground">
      {view.contentSegments.map((segment, index) =>
        segment.type !== 'mention' ? (
          segment.text
        ) : segment.kind === 'date' ? (
          // 日時はケースのエンティティではないため、開く先が無い。リンクにせず、色だけを人物・場所とそろえる
          <span key={index} className={`rounded px-0.5 ${MENTION_STYLES.date}`}>
            @{segment.label}
          </span>
        ) : (
          <Link
            key={index}
            href={mentionHref(caseId, segment.kind, segment.id, tab)}
            className={`${ABOVE_CARD_LINK} rounded px-0.5 hover:underline ${MENTION_STYLES[segment.kind]}`}
          >
            <EntityAvatar imageDataUrl={segment.imageDataUrl} iconText={segment.iconText} size="sm" />@{segment.label}
          </Link>
        )
      )}
    </p>
  );

  return (
    <li
      ref={cardRef}
      className={`relative rounded-lg border p-3 text-sm transition-colors hover:border-foreground/30 ${
        isActive ? 'ring-2 ring-ring' : ''
      } ${isUserSpeculation ? 'border-dashed border-speculation-foreground/40 bg-speculation' : 'bg-card'}`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
        {isUserSpeculation && (
          <span className="rounded bg-speculation-foreground/15 px-1.5 py-0.5 font-medium text-speculation-foreground">
            推測
          </span>
        )}
        {showSpeaker &&
          view.speakerPersons.map((person) => (
            <EntityAvatar key={person.id} imageDataUrl={person.imageDataUrl} iconText={personIconText(person)} size="sm" />
          ))}
        {showSpeaker && <span className="font-semibold">{view.speakerLabel}</span>}
        {view.viaPersons.length > 0 && (
          <span className="text-muted-foreground">{formatViaLabel(view.viaPersons.map((person) => person.name))}</span>
        )}
        <Link
          href={claimHref(caseId, claim.id, tab)}
          aria-current={isActive ? 'true' : undefined}
          aria-label={`「${claimLabelOf(view)}」を開く`}
          className="ml-auto flex text-muted-foreground after:absolute after:inset-0 hover:text-foreground"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {claim.title ? (
        <>
          <p className="font-semibold">{claim.title}</p>
          <details className={`${ABOVE_CARD_LINK} mt-1`}>
            <summary className="cursor-pointer text-xs text-muted-foreground">本文を表示</summary>
            <div className="mt-1">{content}</div>
          </details>
        </>
      ) : (
        content
      )}

      <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {view.place && (
          <DetailRow label="述べる場所" icon={<MapPin className="size-3.5" />}>
            {view.place.name}
          </DetailRow>
        )}
        {view.mentionedPersons.length > 0 && (
          <DetailRow label="言及している人物" icon={<AtSign className="size-3.5" />}>
            <ul aria-label="言及している人物" className="flex flex-wrap gap-1">
              {view.mentionedPersons.map((person) => (
                <li key={person.id} className="flex">
                  <Link
                    href={personHref(caseId, person.id, tab)}
                    // アイコンだけのリンクのため、人物の名前をリンクの名前とツールチップに持たせる
                    aria-label={person.name}
                    title={person.name}
                    className={`${ABOVE_CARD_LINK} flex rounded-full hover:ring-2 hover:ring-ring`}
                  >
                    <EntityAvatar imageDataUrl={person.imageDataUrl} iconText={personIconText(person)} size="row" />
                  </Link>
                </li>
              ))}
            </ul>
          </DetailRow>
        )}
        {claim.locator && (
          <DetailRow label="資料内の位置" icon={<BookMarked className="size-3.5" />}>
            {claim.locator}
          </DetailRow>
        )}
      </dl>
    </li>
  );
}
