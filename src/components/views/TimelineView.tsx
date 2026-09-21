/**
 * 時系列ビュー（ホワイトボード）
 *
 * 証言を、案件の並び順（相対関係）のとおりに縦に並べます。
 * 日時は任意の付加情報で、位置は決めません。項目はつまみをドラッグして（キーボードではつまみの上で
 * スペースキー → 矢印キー → スペースキー）前後に動かせます。ただし、日時を持つ項目は、
 * 日時と矛盾する位置には動かせません（規則は src/domain/timeline-order.ts を参照）。
 *
 * 入力欄を別の画面に分けず、ボード上の書き足したい位置に入力欄（BoardComposer）を開きます。
 * 書いた位置は、次の規則で証言の初期値になります。
 * - 項目の前: 日時は付けず、並び順のその位置に並べます。
 * - 「ボードに書き足す」: 並び順の末尾に並べます。
 *
 * 証言同士の食い違いは判定しません。並んだ証言を見比べて判断するのは読み手です。
 * 証言の編集・削除・日時の入力は、証言のカードから開く詳細ページ（ClaimDetail）で行います。ボード上では編集しません。
 * 本文のメンションは、エンティティの編集を開く導線（onOpenEntity）です。
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
import { useId, useMemo, useState, type ReactNode } from 'react';
import { buildTimeline, claimLabelOf, type TimelineItem } from '@/domain/case-views';
import type { MentionKind } from '@/domain/mention';
import { allowedIndexRange, type TimelineKey } from '@/domain/timeline-order';
import type { Case, Id } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
import { claimHref } from '../routes';
import { BoardComposer } from './BoardComposer';
import { ClaimCard } from './ClaimCard';

const DRAG_INSTRUCTIONS =
  '項目を動かすには、スペースキーで持ち上げ、上下の矢印キーで位置を選び、もう一度スペースキーで置きます。やめるにはエスケープキーを押します。';

/** 開いている入力欄の位置です。入力欄は同時に1つだけ開きます。 */
type ComposerTarget =
  | { type: 'free' }
  /** 時系列の index 番目の項目の前です。 */
  | { type: 'before'; index: number };

type TimelineViewProps = {
  target: Case;
  /** 本文のメンションが選ばれたときに呼び出します。 */
  onOpenEntity?: (kind: MentionKind, id: Id) => void;
};

/** ボードの項目の名前を返します。ボタンの名前と読み上げに使います。 */
function labelOf(item: TimelineItem): string {
  return claimLabelOf(item.view);
}

/**
 * ドラッグで動かせるボードの1項目です。つまみだけがドラッグの起点になり、本文の選択やボタンの操作を妨げません。
 */
function SortableItem({ id, label, dimmed, children }: { id: TimelineKey; label: string; dimmed: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-start gap-2 ${isDragging ? 'relative z-10 rounded bg-white shadow-lg' : ''} ${dimmed ? 'opacity-40' : ''}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`「${label}」を動かす`}
        className="mt-0.5 cursor-grab touch-none rounded px-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
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

export function TimelineView({ target, onOpenEntity }: TimelineViewProps) {
  const timeline = useMemo(() => buildTimeline(target), [target]);
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

  const keys = timeline.items.map((item) => item.key);
  /** ドラッグ中の項目を置ける位置の範囲です。範囲の外の項目は薄く表示します。 */
  const allowedRange = useMemo(
    () => (draggingKey === null ? null : allowedIndexRange(target, draggingKey)),
    [target, draggingKey]
  );
  const isAllowedIndex = (index: number) => allowedRange === null || (index >= allowedRange.min && index <= allowedRange.max);
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

  /** ボードの1項目（証言）を表示します。述べる日時を持つ証言は、カードの上に日時を示します。 */
  const renderItem = ({ view }: TimelineItem) => (
    <>
      {view.claim.when && <p className="mb-1 text-xs font-medium text-sky-700">{view.claim.when.text}</p>}
      <ul>
        <ClaimCard view={view} showSpeaker onOpenEntity={onOpenEntity} href={claimHref(view.claim.id, 'timeline')} />
      </ul>
    </>
  );

  /**
   * 時系列の index 番目の項目の前の差し込み口を表示します。
   * ドラッグ中は、項目の位置がずれないよう、場所を保ったまま見えなくします。
   */
  const renderSlot = (item: TimelineItem, index: number) => (
    <li key={`slot:${item.key}`} className={draggingKey === null ? undefined : 'invisible'}>
      {composer?.type === 'before' && composer.index === index ? (
        <BoardComposer defaults={{ insertIndex: index }} onClose={closeComposer} />
      ) : (
        <AddButton label={`「${labelOf(item)}」の前に書き足す`} onClick={() => setComposer({ type: 'before', index })}>
          ＋ ここに書き足す
        </AddButton>
      )}
    </li>
  );

  const isEmpty = timeline.items.length === 0;

  return (
    <div className="space-y-6">
      {isEmpty && (
        <p className="text-sm text-slate-500">まだ何も書かれていません。「ボードに書き足す」から書き始めてください。</p>
      )}

      {timeline.items.length > 0 && (
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
          <SortableContext items={keys} strategy={verticalListSortingStrategy}>
            <ol aria-label="時系列" className="space-y-2 border-l-2 border-slate-200 pl-2">
              {timeline.items.flatMap((item, index) => [
                renderSlot(item, index),
                <SortableItem key={item.key} id={item.key} label={labelOf(item)} dimmed={item.key !== draggingKey && !isAllowedIndex(index)}>
                  {renderItem(item)}
                </SortableItem>,
              ])}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {notice && (
        <p role="status" className="text-sm text-amber-700">
          {notice}
        </p>
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
