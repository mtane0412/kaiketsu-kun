/**
 * テストで要素の画面上の位置を与えるための補助
 *
 * jsdom はレイアウトを計算せず、getBoundingClientRect はすべて 0 を返します。
 * 「省略で隠れているかどうか」のように位置で振る舞いが変わる処理を確かめるため、要素の縦の位置を与えます。
 */
import { vi } from 'vitest';

/** 要素の getBoundingClientRect が、上端 top・下端 bottom（ピクセル）の位置を返すようにします。 */
export function placeVertically(element: Element, top: number, bottom: number): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, top, 100, bottom - top));
}
