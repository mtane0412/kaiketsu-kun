/**
 * ボードのスクロール位置を、詳細から戻ったときに復元するフックのテスト
 *
 * jsdom はレイアウトを計算しないため、スクロール位置（window.scrollY）は値を直接書き換え、
 * スクロールの発生は scroll イベントを送って再現します。復元は window.scrollTo の呼び出しで確かめます。
 */
import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabKey } from './routes';
import { useBoardScrollRestoration } from './useBoardScrollRestoration';

/** ボードに見立てた要素に、フックを取り付けるだけのコンポーネントです。 */
function Board({ isVisible, tab }: { isVisible: boolean; tab: TabKey }) {
  const boardRef = useRef<HTMLDivElement>(null);
  useBoardScrollRestoration(boardRef, isVisible, tab);
  return <div ref={boardRef} hidden={!isVisible} />;
}

/** ページを指定した位置までスクロールしたことにします。 */
function スクロールする(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  fireEvent.scroll(window);
}

const scrollTo = vi.fn();

beforeEach(() => {
  vi.stubGlobal('scrollTo', scrollTo);
  スクロールする(0);
  scrollTo.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useBoardScrollRestoration', () => {
  it('詳細を開いて閉じると、詳細を開く前のボードのスクロール位置に戻す', () => {
    const { rerender } = render(<Board isVisible tab="timeline" />);
    スクロールする(1200);

    rerender(<Board isVisible={false} tab="timeline" />);
    // 詳細を開くと、ボードが隠れてページが短くなるため、スクロール位置が変わる
    スクロールする(0);
    rerender(<Board isVisible tab="timeline" />);

    expect(scrollTo).toHaveBeenLastCalledWith(0, 1200);
  });

  it('詳細を閉じて別の表示に戻った場合は、元の表示のスクロール位置を持ち込まない', () => {
    const { rerender } = render(<Board isVisible tab="timeline" />);
    スクロールする(1200);

    rerender(<Board isVisible={false} tab="timeline" />);
    rerender(<Board isVisible tab="speaker" />);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('表示を切り替えたあと、スクロールせずに詳細を開いて閉じても、切り替えたときの位置に戻す', () => {
    const { rerender } = render(<Board isVisible tab="timeline" />);
    スクロールする(1200);

    // 表示を切り替えても、スクロールのイベントは起きない
    rerender(<Board isVisible tab="speaker" />);
    rerender(<Board isVisible={false} tab="speaker" />);
    スクロールする(0);
    rerender(<Board isVisible tab="speaker" />);

    expect(scrollTo).toHaveBeenLastCalledWith(0, 1200);
  });

  it('ボードを表示したまま表示を切り替えただけでは、スクロール位置を動かさない', () => {
    const { rerender } = render(<Board isVisible tab="timeline" />);
    スクロールする(1200);

    rerender(<Board isVisible tab="speaker" />);

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
