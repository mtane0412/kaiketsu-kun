/**
 * 人物の動きビュー
 *
 * 行に証言（時系列ボードの並び順）、列に人物を取った表で、各人物が発言した証言と言及された証言を並べます。
 * 列を縦に読むと、その人物が、いつ・どこで・何をしていたと語られているかを追えます。
 * 行を横に読むと、1件の証言に誰が関わっているかが分かります。
 * 1件の証言は、関わる人物の数だけ、それぞれの列に同じカードとして現れます。
 * 列ごとに「発言」（本人の発言）か「言及」（他者の発言や推測の中で語られた）かを示し、本人の言い分と周りの証言を見分けられるようにします。
 * 動きを追いやすいよう、カードの上部に述べる場所を示します（ClaimCard の emphasizePlace）。
 * 列は、見出しのつまみをドラッグして（キーボードではつまみの上でスペースキー → 左右の矢印キー → スペースキー）左右に動かせます。
 * 並び順はケースに保存します（Case.personLaneOrder、src/domain/person-lane-order.ts）。
 *
 * 注意: 列は人物の数だけ増えるため、表は枠の中で縦横にスクロールします。見出しの行（人物）と列（日時）は、
 * スクロールしても見えるよう枠に貼り付けます。枠の高さを画面に収めているのは、縦にスクロールしたときにも人物の見出しを残すためです。
 * ドラッグ中に動くのは見出しだけで、列のカードは置いたときに移ります。
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
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useId, useMemo } from 'react';
import { buildPersonLanes, type LaneRole, type PersonLane } from '@/domain/case-views';
import { formatTimeRef } from '@/domain/time-ref';
import type { Case } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
import { EntityAvatar } from '../EntityAvatar';
import { ClaimCard } from './ClaimCard';

const DRAG_INSTRUCTIONS =
  '列を動かすには、スペースキーで持ち上げ、左右の矢印キーで位置を選び、もう一度スペースキーで置きます。やめるにはエスケープキーを押します。';

/**
 * つまみにカーソルを乗せたときに出る案内です。
 * 読み上げには DRAG_INSTRUCTIONS が届きますが、マウスの利用者には届かないため、つまみの title で同じことを短く示します。
 */
const DRAG_HINT = 'ドラッグ、またはスペースキーを押してから左右の矢印キーで動かします';

/** 列の人物にとっての証言の役割の表示です。 */
const ROLE_LABELS: Record<LaneRole, string> = { speaker: '発言', mentioned: '言及' };

/** 役割の表示の色です。本人の発言を濃く、言及を控えめにします。 */
const ROLE_STYLES: Record<LaneRole, string> = {
  speaker: 'bg-foreground text-background',
  mentioned: 'border text-muted-foreground',
};

/** 日時を述べない証言の、行の見出しです。 */
const UNKNOWN_WHEN_LABEL = '日時不明';

type PersonLaneViewProps = {
  target: Case;
};

/** ドラッグで動かせる、列の見出し（人物）です。つまみだけがドラッグの起点になります。 */
function SortableLaneHeader({ lane }: { lane: PersonLane }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: lane.personId,
  });

  return (
    <th
      ref={setNodeRef}
      scope="col"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // ドラッグ中の見出しは、隣の見出しより手前に出す
      className={`sticky top-0 w-64 min-w-64 border-b bg-muted p-2 text-sm font-semibold ${isDragging ? 'z-40 shadow-lg' : 'z-20'}`}
    >
      <span className="flex items-center gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`「${lane.label}」の列を動かす`}
          title={DRAG_HINT}
          className="-ml-1 flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:bg-accent hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <EntityAvatar imageDataUrl={lane.imageDataUrl} iconText={lane.iconText} size="md" />
        {lane.label}
      </span>
    </th>
  );
}

export function PersonLaneView({ target }: PersonLaneViewProps) {
  const { lanes, rows } = useMemo(() => buildPersonLanes(target), [target]);
  const movePersonLane = useCaseStore((state) => state.movePersonLane);
  // サーバー描画とブラウザで dnd-kit が振るIDが食い違わないよう、IDを明示する
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const labelOfId = (id: UniqueIdentifier) => lanes.find((lane) => lane.personId === id)?.label ?? '';

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    movePersonLane(String(active.id), String(over.id));
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `「${labelOfId(active.id)}」の列を持ち上げました。`,
    onDragOver: ({ active, over }) =>
      over ? `「${labelOfId(active.id)}」の列は「${labelOfId(over.id)}」の列の位置にあります。` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `「${labelOfId(active.id)}」の列を「${labelOfId(over.id)}」の列の位置に置きました。`
        : `「${labelOfId(active.id)}」の列を元の位置に戻しました。`,
    onDragCancel: ({ active }) => `「${labelOfId(active.id)}」の列を動かすのをやめました。`,
  };

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        人物が登場する証言がまだありません。証言の発言者を選ぶか、本文で人物に言及してください。
      </p>
    );
  }

  return (
    // 読み上げ用の要素（div）を表の外に描画させるため、DndContext は表の外側に置く（thead の中に div は置けない）
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements, screenReaderInstructions: { draggable: DRAG_INSTRUCTIONS } }}
      onDragEnd={handleDragEnd}
    >
      {/* ヘッダー（h-14）と余白のぶんを除いた高さに収め、見出しを枠の上端・左端に貼り付ける */}
      <div className="max-h-[calc(100svh-6rem)] overflow-auto rounded-lg border">
        <table aria-label="人物の動き" className="border-separate border-spacing-0 text-left">
          <thead>
            <SortableContext items={lanes.map((lane) => lane.personId)} strategy={horizontalListSortingStrategy}>
              <tr>
                <th scope="col" className="sticky left-0 top-0 z-30 border-b border-r bg-muted p-2 text-xs font-medium">
                  日時
                </th>
                {lanes.map((lane) => (
                  <SortableLaneHeader key={lane.personId} lane={lane} />
                ))}
              </tr>
            </SortableContext>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 w-28 min-w-28 border-b border-r bg-background p-2 align-top text-xs font-medium text-muted-foreground"
                >
                  {row.view.claim.when ? formatTimeRef(row.view.claim.when) : UNKNOWN_WHEN_LABEL}
                </th>
                {lanes.map((lane) => {
                  const role = row.roles[lane.personId];
                  return (
                    <td key={lane.personId} className="border-b p-2 align-top">
                      {role && (
                        <>
                          <span className={`mb-1 inline-block rounded px-1.5 py-0.5 text-xs ${ROLE_STYLES[role]}`}>
                            {ROLE_LABELS[role]}
                          </span>
                          <ul>
                            <ClaimCard view={row.view} showSpeaker={role === 'mentioned'} tab="lanes" emphasizePlace />
                          </ul>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DndContext>
  );
}
