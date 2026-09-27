/**
 * ボードのスクロール位置を、詳細から戻ったときに復元するフック
 *
 * ボード（CaseBoard）は、詳細を開いている間、HTMLの hidden で隠します。隠すとページが短くなり、
 * ページ（window）のスクロール位置が失われるため、詳細を閉じると、ボードが一番上から表示されていました。
 * そこで、ボードを表示している間のスクロール位置を覚えておき、詳細からボードに戻ったときに復元します。
 *
 * 注意: 覚えたスクロール位置は、そのときの表示（タブ）のものです。詳細から別の表示に戻った場合は、
 * 位置の意味が異なるため復元しません。ボードを表示したまま表示を切り替えた場合も、これまでどおり何もしません。
 */
'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { TabKey } from './routes';

/**
 * @param boardRef ボードを描画している要素です。隠れている間のスクロールを記録しないために参照します。
 * @param isBoardVisible ボードを表示しているか（詳細を開いていないか）です。
 * @param tab いま開いている表示です。
 */
export function useBoardScrollRestoration(
  boardRef: RefObject<HTMLElement | null>,
  isBoardVisible: boolean,
  tab: TabKey
): void {
  const savedRef = useRef<{ tab: TabKey; y: number } | null>(null);
  const wasVisibleRef = useRef(isBoardVisible);

  useEffect(() => {
    const handleScroll = () => {
      // ボードを隠した直後に、ページが短くなってスクロール位置が変わる。その位置で上書きしないよう、隠れている間は記録しない
      if (boardRef.current?.hidden) return;
      savedRef.current = { tab, y: window.scrollY };
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [boardRef, tab]);

  // 描画の前に戻さないと、一番上のボードが一瞬見えてしまうため、レイアウトの確定直後に復元する
  useLayoutEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = isBoardVisible;
    if (wasVisible || !isBoardVisible) return;

    const saved = savedRef.current;
    if (saved?.tab === tab) window.scrollTo(0, saved.y);
  }, [isBoardVisible, tab]);
}
