/**
 * ページ（window）のスクロールに合わせて、長いリストのうち画面に見える分の項目だけを描画するフック
 *
 * 時系列ボード（TimelineView）と証言者別（SpeakerView）で使います。証言が1万件近いケースで全項目を描画すると、
 * DOM の要素が数十万になり、表示の切り替え・詳細の開閉・証言の保存のたびに画面が数秒固まるためです（#125）。
 * 仮想化には @tanstack/react-virtual の useWindowVirtualizer を使い、次の2点をこのフックで補います。
 *
 * - リストの位置（scrollMargin）: ページの先頭からリストの先頭までの距離です。リストの上の要素（絞り込みの欄など）の高さが
 *   変わっても追従するよう、描画のたびに測り直します。
 * - 隠れている間の計測: 詳細を開いている間、ボードは HTML の hidden で隠します（src/components/CaseBoard.tsx）。
 *   隠れた項目の高さは0と計測されるため、そのまま覚えると、ボードに戻ったときにリスト全体が縮み、スクロール位置を復元できません。
 *   そこで、隠れている（描画されていない）間は計測せず、前に測った高さ（無ければ見積もり）を使い続けます。
 *   リストの位置も、隠れている間は測り直しません。
 *
 * 項目は、リスト（position: relative）の中に、virtualItemStyle が返す絶対位置で並べてください。
 * 項目を通常のフローに置かず top で位置を決めるのは、ドラッグで並べ替える項目に dnd-kit が付ける transform と競合させないためです。
 * 各項目の要素には data-index（仮想化の位置）を付け、ref に measureElement を渡してください。
 *
 * 注意: jsdom（テスト）では要素が描画されず、すべての項目が「隠れている」扱いになるため、高さはつねに見積もり（estimateSize）を使います。
 */
'use client';

import { useWindowVirtualizer, type Range, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

/** 画面の外に、上下それぞれ余分に描画しておく項目の数です。速くスクロールしたときに空白が見えにくくします。 */
const OVERSCAN = 6;

type WindowListVirtualizerOptions = {
  /** 項目の数です。 */
  count: number;
  /** 項目の高さの見積もり（px）です。まだ描画していない項目の位置の計算に使います。 */
  estimateSize: (index: number) => number;
  /** 項目を識別するキーです。並びが変わっても、同じ項目に測った高さを引き継ぐために使います。 */
  getItemKey: (index: number) => string;
  /** 項目の間の余白（px）です。 */
  gap: number;
  /** 描画する項目の位置を決めます。省略した場合は、画面に見える分（と前後の余分）を描画します。 */
  rangeExtractor?: (range: Range) => number[];
};

/** 要素が描画されているかどうかを返します。hidden の祖先の中にある要素は描画されていません。 */
function isRendered(element: Element): boolean {
  return element.getClientRects().length > 0;
}

/**
 * 項目の高さを測ります。描画されていない項目は測らず、前に測った高さ（無ければ見積もり）を返します。
 * 前に測った高さは、仮想化のキャッシュ（itemSizeCache）から引きます。
 */
function measureRenderedElement(
  element: Element,
  entry: ResizeObserverEntry | undefined,
  instance: Virtualizer<Window, Element>
): number {
  if (isRendered(element)) {
    const box = entry?.borderBoxSize?.[0];
    return Math.round(box ? box.blockSize : element.getBoundingClientRect().height);
  }
  const index = instance.indexFromElement(element);
  return instance.itemSizeCache.get(instance.options.getItemKey(index)) ?? instance.options.estimateSize(index);
}

/**
 * ページのスクロールに合わせてリストを仮想化します。
 *
 * @returns listRef はリストの要素（position: relative）に渡します。virtualizer はリストの高さ（getTotalSize）と、
 * 描画する項目（getVirtualItems）を返します。項目の位置は virtualItemStyle で求めます。
 */
export function useWindowListVirtualizer<TList extends HTMLElement>({
  count,
  estimateSize,
  getItemKey,
  gap,
  rangeExtractor,
}: WindowListVirtualizerOptions): {
  listRef: RefObject<TList | null>;
  virtualizer: Virtualizer<Window, Element>;
  virtualItemStyle: (item: VirtualItem) => CSSProperties;
} {
  const listRef = useRef<TList>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // リストの上の要素の高さは、このコンポーネントの描画と関係なく変わりうるため、依存を指定せず描画のたびに測り直す。
  // 値が変わったときだけ状態を更新するため、描画が繰り返し続くことはない
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null || !isRendered(list)) return;
    const top = Math.round(list.getBoundingClientRect().top + window.scrollY);
    if (top !== scrollMargin) setScrollMargin(top);
  });

  const virtualizer = useWindowVirtualizer({
    count,
    estimateSize,
    getItemKey,
    gap,
    overscan: OVERSCAN,
    scrollMargin,
    measureElement: measureRenderedElement,
    ...(rangeExtractor === undefined ? {} : { rangeExtractor }),
  });

  const virtualItemStyle = (item: VirtualItem): CSSProperties => ({
    position: 'absolute',
    top: item.start - scrollMargin,
    left: 0,
    right: 0,
  });

  return { listRef, virtualizer, virtualItemStyle };
}
