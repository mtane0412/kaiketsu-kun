/**
 * Vitestセットアップファイル
 * Testing Libraryのカスタムマッチャーを読み込み、各テスト後にDOMとLocalStorageを初期化します。
 * jsdom には scrollIntoView が無いため、何もしない代役を用意します（開いている証言のカードへのスクロールで使用します）。
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  localStorage.clear();
});
