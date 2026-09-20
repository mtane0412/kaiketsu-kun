/**
 * 時系列ビュー（ホワイトボード）
 *
 * 出来事の束と、出来事に束ねていない主張を、主張が述べる日時の早い順に縦に並べます。
 * 入力欄を別の画面に分けず、ボード上の書き足したい位置に入力欄（BoardComposer）を開きます。
 * 書いた位置は、次の規則で主張の初期値になります。
 * - 出来事の束の中: その出来事に束ねた主張になります。
 * - 項目と項目の間: 前後の日時から求めた区間（timeRefBetween）を、主張が述べる日時として自動で付けます。
 * - 「ボードに書き足す」: 初期値を持ちません。日時を入れなければ「時期不明」の枠に並びます。
 *
 * 出来事の見出しには、束ねた主張から導出した日時・場所・言及されている人物を表示し、
 * 同じ出来事に束ねた他の主張と食い違う主張には食い違いの表示を付けます。
 * 入力欄は本文の1欄だけです。日時・評価・ソース内の位置は、主張の「詳細」（onOpenClaimDetails）から編集します。
 * 本文のメンションと出来事の見出しは、エンティティの編集を開く導線（onOpenEntity）です。
 */
'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { buildTimeline, type ClaimView, type TimelineItem } from '@/domain/case-views';
import type { MentionKind } from '@/domain/mention';
import { timeRefBetween } from '@/domain/time-ref';
import type { Case, Id } from '@/domain/types';
import { BoardComposer } from './BoardComposer';
import { ClaimCard } from './ClaimCard';

const UNDATED_LABEL = '時期不明';

/** 開いている入力欄の位置です。入力欄は同時に1つだけ開きます。 */
type ComposerTarget =
  | { type: 'free' }
  | { type: 'event'; eventId: Id }
  /** 時系列の index 番目の項目と、その次の項目の間です。 */
  | { type: 'between'; index: number }
  | { type: 'edit'; claimId: Id };

type TimelineViewProps = {
  target: Case;
  /** 本文のメンションや出来事の見出しが選ばれたときに呼び出します。 */
  onOpenEntity?: (kind: MentionKind, id: Id) => void;
  /** 主張の「詳細」が選ばれたときに呼び出します。日時・評価・ソース内の位置を編集する導線です。 */
  onOpenClaimDetails?: (claimId: Id) => void;
};

/** ボードの項目を一意に識別するキーを返します。 */
function keyOf(item: TimelineItem): string {
  return item.kind === 'event' ? `event:${item.event.id}` : `claim:${item.view.claim.id}`;
}

/** 書き足す位置を示すボタンです。 */
function AddButton({ label, children, onClick }: { label?: string; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-sky-50 hover:text-sky-700"
    >
      {children}
    </button>
  );
}

export function TimelineView({ target, onOpenEntity, onOpenClaimDetails }: TimelineViewProps) {
  const timeline = useMemo(() => buildTimeline(target), [target]);
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const closeComposer = () => setComposer(null);

  /** 主張1件を表示します。編集中の主張は、その場で入力欄に置き換えます。 */
  const renderClaim = (view: ClaimView) =>
    composer?.type === 'edit' && composer.claimId === view.claim.id ? (
      <li key={view.claim.id}>
        <BoardComposer initial={view.claim} onClose={closeComposer} />
      </li>
    ) : (
      <ClaimCard
        key={view.claim.id}
        view={view}
        showSpeaker
        showEvent={false}
        onOpenEntity={onOpenEntity}
        onEdit={() => setComposer({ type: 'edit', claimId: view.claim.id })}
        onOpenDetails={onOpenClaimDetails && (() => onOpenClaimDetails(view.claim.id))}
      />
    );

  /**
   * ボードの1項目（出来事の束、または出来事に束ねていない主張）を表示します。
   * 「時期不明」の枠の中では、枠の見出しと重複するため、日時を持たない項目の日時表示を省きます。
   */
  const renderItem = (item: TimelineItem) => {
    const whenLabel = item.when && <p className="mb-1 text-xs font-medium text-sky-700">{item.when.text}</p>;

    if (item.kind === 'claim') {
      return (
        <>
          {whenLabel}
          <ul>{renderClaim(item.view)}</ul>
        </>
      );
    }

    const { event } = item;
    return (
      <article aria-label={event.title}>
        <header className="mb-2">
          {whenLabel}
          <h3 className="flex items-baseline gap-2 text-base font-semibold text-slate-900">
            {event.title}
            {onOpenEntity && (
              <button
                type="button"
                aria-label={`「${event.title}」を編集`}
                onClick={() => onOpenEntity('event', event.id)}
                className="text-xs font-normal text-sky-700 hover:underline"
              >
                編集
              </button>
            )}
          </h3>
          <p className="text-xs text-slate-500">
            {[item.places.map((place) => place.name).join('、'), item.persons.map((person) => person.name).join('、')]
              .filter(Boolean)
              .join(' ／ ')}
          </p>
          {event.description && <p className="mt-1 text-sm text-slate-700">{event.description}</p>}
        </header>
        <ul className="space-y-2">
          {item.claims.map(renderClaim)}
          <li>
            {composer?.type === 'event' && composer.eventId === event.id ? (
              <BoardComposer defaults={{ eventId: event.id }} onClose={closeComposer} />
            ) : (
              <AddButton label={`「${event.title}」に書き足す`} onClick={() => setComposer({ type: 'event', eventId: event.id })}>
                ＋ この出来事に書き足す
              </AddButton>
            )}
          </li>
        </ul>
      </article>
    );
  };

  /** 時系列の index 番目の項目と、その次の項目の間の差し込み口を表示します。間の日時を求められない場合は表示しません。 */
  const renderSlot = (index: number) => {
    const before = timeline.items[index]?.when;
    const after = timeline.items[index + 1]?.when;
    const between = before && after ? timeRefBetween(before, after) : undefined;
    if (!before || !after || !between) return null;

    return (
      <li key={`slot:${index}`}>
        {composer?.type === 'between' && composer.index === index ? (
          <BoardComposer defaults={{ when: between }} onClose={closeComposer} />
        ) : (
          <AddButton
            label={`「${before.text}」と「${after.text}」の間に書き足す`}
            onClick={() => setComposer({ type: 'between', index })}
          >
            ＋ ここに書き足す
          </AddButton>
        )}
      </li>
    );
  };

  const isEmpty = timeline.items.length === 0 && timeline.undatedItems.length === 0;

  return (
    <div className="space-y-6">
      {isEmpty && (
        <p className="text-sm text-slate-500">まだ何も書かれていません。「ボードに書き足す」から書き始めてください。</p>
      )}

      {timeline.items.length > 0 && (
        <ol aria-label="時系列" className="space-y-4 border-l-2 border-slate-200 pl-4">
          {timeline.items.flatMap((item, index) => [<li key={keyOf(item)}>{renderItem(item)}</li>, renderSlot(index)])}
        </ol>
      )}

      {timeline.undatedItems.length > 0 && (
        <section aria-label={UNDATED_LABEL}>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{UNDATED_LABEL}</h3>
          <ul className="space-y-4">
            {timeline.undatedItems.map((item) => (
              <li key={keyOf(item)}>{renderItem(item)}</li>
            ))}
          </ul>
        </section>
      )}

      {composer?.type === 'free' ? (
        <BoardComposer onClose={closeComposer} />
      ) : (
        <button
          type="button"
          onClick={() => setComposer({ type: 'free' })}
          className="w-full rounded border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-sky-400 hover:text-sky-700"
        >
          <span aria-hidden="true">＋ </span>ボードに書き足す
        </button>
      )}
    </div>
  );
}
