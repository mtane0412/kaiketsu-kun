/**
 * Vitestセットアップファイル
 * Testing Libraryのカスタムマッチャーを読み込み、各テスト後にDOMとLocalStorageを初期化します。
 * jsdom には scrollIntoView が無いため、何もしない代役を用意します（開いている証言のカードへのスクロールで使用します）。
 * jsdom には matchMedia も無いため、常に「一致しない」を返す代役を用意します。
 * サイドバー（src/components/ui/sidebar.tsx）が画面幅の判定に使うため、テストでは常に広い画面として扱われます。
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

Element.prototype.scrollIntoView = vi.fn();

window.matchMedia = vi.fn((query: string) => ({
  media: query,
  matches: false,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});
