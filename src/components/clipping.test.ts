/**
 * 省略して表示している本文の中で、要素が隠れているかどうかの判定のテスト
 */
import { describe, expect, it } from 'vitest';
import { placeVertically } from '@/test/layout';
import { isClippedBelow } from './clipping';

/** 省略した枠と、その中のリンクを作ります。枠は上端 0・下端 100 に置きます。 */
function createClippedBody() {
  const container = document.createElement('p');
  const link = document.createElement('a');
  container.append(link);
  placeVertically(container, 0, 100);
  return { container, link };
}

describe('isClippedBelow', () => {
  it('枠の中に収まっている要素は、隠れていないとする', () => {
    const { container, link } = createClippedBody();
    placeVertically(link, 60, 80);

    expect(isClippedBelow(link, container)).toBe(false);
  });

  it('下端が枠の下端より下にはみ出す要素は、隠れているとする', () => {
    const { container, link } = createClippedBody();
    placeVertically(link, 90, 110);

    expect(isClippedBelow(link, container)).toBe(true);
  });

  it('フォーカスで枠の中がスクロールされていても、スクロールする前の位置で判定する', () => {
    // 前提: ブラウザは、隠れた要素にフォーカスを移すときに、フォーカスのイベントより先に枠の中をスクロールする
    const { container, link } = createClippedBody();
    Object.defineProperty(container, 'scrollTop', { value: 40 });
    placeVertically(link, 70, 90);

    expect(isClippedBelow(link, container)).toBe(true);
  });
});
