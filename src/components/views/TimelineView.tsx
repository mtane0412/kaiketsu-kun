/**
 * 時系列ビュー（ホワイトボード）
 *
 * 証言を、ケースの並び順（相対関係）のとおりに縦に並べます。
 * 日時は任意の付加情報で、位置は決めません。項目はつまみをドラッグして（キーボードではつまみの上で
 * スペースキー → 矢印キー → スペースキー）前後に動かせます。ただし、日時を持つ項目は、
 * 日時と矛盾する位置には動かせません（規則は src/domain/timeline-order.ts を参照）。
 *
 * 入力欄を別の画面に分けず、ボード上の書き足したい位置に入力欄（BoardComposer）を開きます。
 * 書いた位置は、次の規則で証言の初期値になります。
 * - 項目の前: 日時は付けず、並び順のその位置に並べます。
 * - 「ボードに書き足す」: 並び順の末尾に並べます。
 *
 * ボードの絞り込み（src/domain/board-filter.ts）で一部の証言だけを表示する場合は、shownClaimIds に表示する証言のIDを受け取り、
 * それ以外の証言のカードと差し込み口を描きません。並び順の位置（書き足す位置・動かした先）は、絞り込む前の並びで数えます。
 * 隠れた証言を飛ばした位置に書き足したり動かしたりして、並び順が崩れないようにするためです。
 * 注意: 絞り込み中に書き足した証言は、条件を満たさなければボードに表示されません（件数は絞り込みの欄に示します）。
 *
 * 証言同士の食い違いは判定しません。並んだ証言を見比べて判断するのは読み手です。
 * 読み手が記録した照合（CrossCheck）がある証言は、カードに照合の件数を小さく示します。
 * 証言の編集・削除・日時の入力は、証言のカードから開く詳細ページ（ClaimDetail）で行います。ボード上では編集しません。
 * 本文のメンションは、その人物・場所の詳細ページ（EntityDetail）への導線です。
 *
 * 証言が1万件近いケースでも固まらないよう、項目は画面に見える分だけを描画します（useWindowListVirtualizer、#125）。
 * ドラッグ中の項目と、入力欄を開いている差し込み口は、画面の外にあっても描画し続けます。
 * 並べ替えの候補になるのは描画している項目だけですが、キーボードで動かすと画面が追従してスクロールし、先の項目が描画されるため、
 * 画面の外まで続けて動かせます。
 * 注意: 画面に見えていない証言は描画しないため、ブラウザのページ内検索では見つかりません。証言はサイドバーの検索で探します。
 */
'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { defaultRangeExtractor, type Range } from '@tanstack/react-virtual';
import { GripVertical, Plus } from 'lucide-react';
import { useCallback, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { buildTimeline, claimLabelOf, type TimelineItem } from '@/domain/case-views';
import { countCrossChecksByClaim } from '@/domain/cross-checks';
import { formatTimeRef } from '@/domain/time-ref';
import { allowedIndexRange, type TimelineKey } from '@/domain/timeline-order';
import type { Case, Id } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
import { BoardComposer } from './BoardComposer';
import { ClaimCard } from './ClaimCard';
import { useWindowListVirtualizer } from './useWindowListVirtualizer';

const DRAG_INSTRUCTIONS =
  '項目を動かすには、スペースキーで持ち上げ、上下の矢印キーで位置を選び、もう一度スペースキーで置きます。やめるにはエスケープキーを押します。';

/**
 * つまみにカーソルを乗せたときに出る案内です。
 * 読み上げには DRAG_INSTRUCTIONS が届きますが、マウスの利用者には届かないため、つまみの title で同じことを短く示します。
 */
const DRAG_HINT = 'ドラッグ、またはスペースキーを押してから矢印キーで動かします';

/** 時系列の項目（差し込み口・カード）の間の余白（px）です。Tailwind の space-y-2 と同じ 0.5rem です。 */
const ITEM_GAP = 8;

/** 差し込み口の高さの見積もり（px）です。描画した後は、実際の高さで位置を計算し直します。 */
const SLOT_SIZE_ESTIMATE = 24;

/** 証言のカード（日時の行を含む）の高さの見積もり（px）です。描画した後は、実際の高さで位置を計算し直します。 */
const CARD_SIZE_ESTIMATE = 140;

/*
 * 仮想化したリストでは、表示する項目1件につき、差し込み口とカードの2つの位置を順に持ちます（差し込み口が偶数、カードが奇数）。
 * 差し込み口とカードを別々の <li> にしている構造を保ったまま、それぞれの高さを測るためです。
 */
/** 表示する項目の entryIndex 番目の、差し込み口の仮想化したリストでの位置です。 */
const slotIndexOf = (entryIndex: number) => entryIndex * 2;
/** 表示する項目の entryIndex 番目の、カードの仮想化したリストでの位置です。 */
const cardIndexOf = (entryIndex: number) => entryIndex * 2 + 1;
/** 仮想化したリストでの位置から、表示する項目の何番目かを返します。 */
const entryIndexOf = (virtualIndex: number) => Math.floor(virtualIndex / 2);
/** 仮想化したリストでの位置が、差し込み口かどうかを返します。 */
const isSlotIndex = (virtualIndex: number) => virtualIndex % 2 === 0;

/** 開いている入力欄の位置です。入力欄は同時に1つだけ開きます。 */
type ComposerTarget =
  | { type: 'free' }
  /**
   * キーが key の項目の前です。位置（index）ではなく項目で持つのは、絞り込みの条件が変わって表示する項目が入れ替わっても、
   * 入力欄が別の項目の前へ移らないようにするためです。
   */
  | { type: 'before'; key: TimelineKey };

type TimelineViewProps = {
  target: Case;
  /** 表示する証言のIDです。省略した場合は、すべての証言を表示します。 */
  shownClaimIds?: ReadonlySet<Id>;
};

/** ボードの項目の名前を返します。ボタンの名前と読み上げに使います。 */
function labelOf(item: TimelineItem): string {
  return claimLabelOf(item.view);
}

/**
 * ドラッグで動かせるボードの1項目です。つまみだけがドラッグの起点になり、本文の選択やボタンの操作を妨げません。
 *
 * つまみは、カードの左辺に接した、カードと同じ高さの帯です。面積で「この1枚ごと動かせる」ことを示します。
 * カードの表面は詳細ページへのリンクが覆っている（ClaimCard.tsx の after:inset-0）ため、つまみはカードの外に置きます。
 * above は、カードの上に置く付加情報（日時）です。帯の高さをカードにそろえるため、帯と同じ行には入れません。
 */
function SortableItem({
  id,
  label,
  dimmed,
  above,
  virtualIndex,
  positionStyle,
  measureRef,
  children,
}: {
  id: TimelineKey;
  label: string;
  dimmed: boolean;
  above?: ReactNode;
  /** 仮想化したリストでの位置です（data-index）。 */
  virtualIndex: number;
  /** 仮想化したリストの中での位置のスタイルです。 */
  positionStyle: CSSProperties;
  /** 高さを測るための ref です。 */
  measureRef: (node: Element | null) => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  // dnd-kit と仮想化の両方が、同じ要素を参照する
  const setRefs = useCallback(
    (node: HTMLLIElement | null) => {
      setNodeRef(node);
      measureRef(node);
    },
    [setNodeRef, measureRef]
  );

  return (
    <li
      ref={setRefs}
      data-index={virtualIndex}
      style={{ ...positionStyle, transform: CSS.Translate.toString(transform), transition }}
      className={`group ${isDragging ? 'relative z-10 rounded-lg bg-card shadow-lg' : ''} ${dimmed ? 'opacity-40' : ''}`}
    >
      {above}
      <div className="flex items-stretch">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`「${label}」を動かす`}
          title={DRAG_HINT}
          // 既定では帯の地色を敷かず（ボード左の縦線と二重に見えないよう）、行にカーソルを乗せたときに色を乗せる
          className="flex w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-lg text-muted-foreground/50 transition-colors group-hover:bg-accent/50 group-hover:text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </li>
  );
}

/**
 * 項目の前に書き足す位置を示すボタンです。
 *
 * 証言のカードの間ごとに置くため、同じ文言が繰り返されてカードの本文より目立たないようにします（#79）。
 * - 広い画面（md 以上）: 普段は「＋」のアイコンと細い線だけを示し、行にマウスを乗せたとき、
 *   またはキーボードのフォーカスが来たときだけ「ここに書き足す」の文言を示します。
 *   文言を薄い色にする方法は、コントラスト（WCAG 2.2 AA の 4.5:1）を満たさなくなるため取りません。
 * - 狭い画面（タッチ端末）: ホバーが無いため、常に文言を示します。
 * 読み上げには、どの画面でも aria-label の名前が届きます。
 */
function SlotAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="group/add flex min-h-6 w-full items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Plus className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="md:sr-only md:group-hover/add:not-sr-only md:group-focus-visible/add:not-sr-only">ここに書き足す</span>
      {/* 普段の広い画面で、書き足せる位置を示す細い線です。文言を示している間は隠します。 */}
      <span
        aria-hidden="true"
        className="hidden h-px flex-1 bg-border md:block md:group-hover/add:hidden md:group-focus-visible/add:hidden"
      />
    </button>
  );
}

export function TimelineView({ target, shownClaimIds }: TimelineViewProps) {
  const timeline = useMemo(() => buildTimeline(target), [target]);
  /** 表示する項目と、絞り込む前の並びでの位置（index）の組です。 */
  const shownEntries = useMemo(
    () =>
      timeline.items.flatMap((item, index) =>
        shownClaimIds === undefined || shownClaimIds.has(item.view.claim.id) ? [{ item, index }] : []
      ),
    [timeline, shownClaimIds]
  );
  // 照合の件数は照合の一覧だけから数える。証言を保存しても照合が変わらなければ同じ件数のオブジェクトを渡し、カードを描き直さない
  const crossCheckCounts = useMemo(() => countCrossChecksByClaim(target), [target.crossChecks]);
  const moveTimelineItem = useCaseStore((state) => state.moveTimelineItem);
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const closeComposer = () => setComposer(null);
  /** ドラッグ中の項目のキーです。 */
  const [draggingKey, setDraggingKey] = useState<TimelineKey | null>(null);
  /** 動かせなかった理由など、ドラッグの結果の通知です。 */
  const [notice, setNotice] = useState<string | null>(null);
  // サーバー描画とブラウザで dnd-kit が振るIDが食い違わないよう、IDを明示する
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /** 絞り込む前の並びのキーです。動かした先の位置を、絞り込む前の並びで数えるために使います。 */
  const keys = timeline.items.map((item) => item.key);
  const shownKeys = useMemo(() => shownEntries.map(({ item }) => item.key), [shownEntries]);
  /** ドラッグ中の項目を置ける位置の範囲です。範囲の外の項目は薄く表示します。 */
  const allowedRange = useMemo(
    () => (draggingKey === null ? null : allowedIndexRange(target, draggingKey)),
    [target, draggingKey]
  );
  const isAllowedIndex = (index: number) => allowedRange === null || (index >= allowedRange.min && index <= allowedRange.max);

  /**
   * 画面の外にあっても描画し続ける、仮想化したリストでの位置です。
   * - ドラッグ中の項目のカード: ドラッグ中にスクロールして画面の外へ出ても、要素を外すとドラッグが途切れるためです。
   * - 入力欄を開いている差し込み口: 要素を外すと、入力中の内容が失われるためです。
   *   詳細を開いてボードを隠している間も、詳細のスクロールで描画する範囲が変わるため、同じく描画し続けます。
   */
  const pinnedIndexes = useMemo(() => {
    const draggingEntryIndex = draggingKey === null ? -1 : shownKeys.indexOf(draggingKey);
    const composerEntryIndex = composer?.type === 'before' ? shownKeys.indexOf(composer.key) : -1;
    return [
      ...(draggingEntryIndex < 0 ? [] : [cardIndexOf(draggingEntryIndex)]),
      ...(composerEntryIndex < 0 ? [] : [slotIndexOf(composerEntryIndex)]),
    ];
  }, [draggingKey, composer, shownKeys]);
  /** 描画する項目の位置を決めます。画面に見える分（と前後の余分）に、描画し続ける位置を加えます。 */
  const rangeExtractor = useCallback(
    (range: Range) => [...new Set([...defaultRangeExtractor(range), ...pinnedIndexes])].sort((a, b) => a - b),
    [pinnedIndexes]
  );
  // 関数が描画のたびに変わると、仮想化のライブラリが全項目の位置を計算し直すため、並びが変わるまで同じ関数を渡す
  const estimateSize = useCallback((index: number) => (isSlotIndex(index) ? SLOT_SIZE_ESTIMATE : CARD_SIZE_ESTIMATE), []);
  const getItemKey = useCallback(
    (index: number) => {
      const key = shownKeys[entryIndexOf(index)]!;
      return isSlotIndex(index) ? `slot:${key}` : key;
    },
    [shownKeys]
  );
  const { listRef, virtualizer, virtualItemStyle } = useWindowListVirtualizer<HTMLOListElement>({
    count: shownEntries.length * 2,
    estimateSize,
    getItemKey,
    gap: ITEM_GAP,
    rangeExtractor,
  });
  const labelOfKey = (key: UniqueIdentifier) => {
    const item = timeline.items.find((candidate) => candidate.key === key);
    return item ? labelOf(item) : '';
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggingKey(null);
    if (!over || active.id === over.id) return;

    // 重なった項目の位置が、動かした後のこの項目の位置になる
    const toIndex = keys.indexOf(String(over.id));
    if (!isAllowedIndex(toIndex)) {
      setNotice(`「${labelOfKey(active.id)}」は、日時と矛盾するため、その位置には動かせません。`);
      return;
    }
    moveTimelineItem(String(active.id), toIndex);
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `「${labelOfKey(active.id)}」を持ち上げました。`,
    onDragOver: ({ active, over }) =>
      over ? `「${labelOfKey(active.id)}」は「${labelOfKey(over.id)}」の位置にあります。` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `「${labelOfKey(active.id)}」を「${labelOfKey(over.id)}」の位置に置きました。` : `「${labelOfKey(active.id)}」を元の位置に戻しました。`,
    onDragCancel: ({ active }) => `「${labelOfKey(active.id)}」を動かすのをやめました。`,
  };

  /** ボードの1項目（証言）のカードを表示します。 */
  const renderItem = ({ view }: TimelineItem) => (
    <ul>
      <ClaimCard view={view} showSpeaker tab="timeline" crossCheckCounts={crossCheckCounts.get(view.claim.id)} />
    </ul>
  );

  /** 述べる日時を持つ証言に、カードの上に示す日時を返します。日時が無ければ何も返しません。 */
  const renderWhen = ({ view }: TimelineItem) =>
    view.claim.when ? (
      // 帯（つまみ）の幅ぶん右に寄せ、カードの左辺に日時の頭をそろえる
      <p className="mb-1 pl-6 text-xs font-medium text-muted-foreground">{formatTimeRef(view.claim.when)}</p>
    ) : undefined;

  /**
   * 時系列の index 番目の項目の前の差し込み口を表示します。
   * ドラッグ中は、項目の位置がずれないよう、場所を保ったまま見えなくします。
   */
  const renderSlot = (item: TimelineItem, index: number, virtualIndex: number, positionStyle: CSSProperties) => (
    <li
      key={`slot:${item.key}`}
      ref={virtualizer.measureElement}
      data-index={virtualIndex}
      style={positionStyle}
      className={draggingKey === null ? undefined : 'invisible'}
    >
      {composer?.type === 'before' && composer.key === item.key ? (
        <BoardComposer defaults={{ insertIndex: index }} onClose={closeComposer} />
      ) : (
        <SlotAddButton label={`「${labelOf(item)}」の前に書き足す`} onClick={() => setComposer({ type: 'before', key: item.key })} />
      )}
    </li>
  );

  const isEmpty = timeline.items.length === 0;

  return (
    <div className="space-y-6">
      {isEmpty && (
        <p className="text-sm text-muted-foreground">まだ何も書かれていません。「ボードに書き足す」から書き始めてください。</p>
      )}
      {!isEmpty && shownEntries.length === 0 && (
        <p className="text-sm text-muted-foreground">絞り込みの条件に合う証言はありません。</p>
      )}

      {shownEntries.length > 0 && (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{ announcements, screenReaderInstructions: { draggable: DRAG_INSTRUCTIONS } }}
          onDragStart={({ active }) => {
            setNotice(null);
            setDraggingKey(String(active.id));
          }}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDraggingKey(null)}
        >
          <SortableContext items={shownKeys} strategy={verticalListSortingStrategy}>
            {/* 項目は画面に見える分だけを描画し、リストの高さと各項目の位置（top）で全体の長さを保つ（useWindowListVirtualizer）。
                項目は左の縦線（border-l-2）と余白（pl-2）の内側に置くため、ここで余白の分だけ右に寄せる */}
            <div className="border-l-2 pl-2">
              <ol ref={listRef} aria-label="時系列" className="relative" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const { item, index } = shownEntries[entryIndexOf(virtualItem.index)]!;
                  const positionStyle = virtualItemStyle(virtualItem);
                  if (isSlotIndex(virtualItem.index)) {
                    return renderSlot(item, index, virtualItem.index, positionStyle);
                  }
                  return (
                    <SortableItem
                      key={item.key}
                      id={item.key}
                      label={labelOf(item)}
                      dimmed={item.key !== draggingKey && !isAllowedIndex(index)}
                      above={renderWhen(item)}
                      virtualIndex={virtualItem.index}
                      positionStyle={positionStyle}
                      measureRef={virtualizer.measureElement}
                    >
                      {renderItem(item)}
                    </SortableItem>
                  );
                })}
              </ol>
            </div>
          </SortableContext>
        </DndContext>
      )}

      {notice && (
        <p role="status" className="text-sm text-mention-date-foreground">
          {notice}
        </p>
      )}

      {composer?.type === 'free' ? (
        <BoardComposer onClose={closeComposer} />
      ) : (
        <button
          type="button"
          onClick={() => setComposer({ type: 'free' })}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden="true" />
          ボードに書き足す
        </button>
      )}
    </div>
  );
}
