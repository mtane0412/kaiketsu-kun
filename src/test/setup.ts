/**
 * Vitestセットアップファイル
 * Testing Libraryのカスタムマッチャーを読み込み、各テスト後にDOMとLocalStorageとIndexedDBを初期化します。
 * jsdom には IndexedDB が無いため、fake-indexeddb で代用します（ケースの保存先です。src/lib/case-storage.ts）。
 * テストごとに、保存層のデータベースの接続を閉じてから、空の IndexedDB に差し替えます。
 * jsdom には scrollIntoView が無いため、何もしない代役を用意します（開いている証言のカードへのスクロールで使用します）。
 * jsdom には matchMedia も無いため、常に「一致しない」を返す代役を用意します。
 * サイドバー（src/components/ui/sidebar.tsx）が画面幅の判定に使うため、テストでは常に広い画面として扱われます。
 * サーバー側の処理のテスト（先頭に `// @vitest-environment node` を書いたもの）には DOM が無いため、DOM の準備をしません。
 */
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, vi } from 'vitest';
import { closeCaseDatabase, createEmptyCase, saveCase } from '@/lib/case-storage';
import { flushPendingSaves, resetCaseStoreInitialization, useCaseStore } from '@/stores/useCaseStore';

/** DOM のある環境（jsdom）で動いているかどうかです。 */
const hasDom = typeof window !== 'undefined';

if (hasDom) {
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

  // fake-indexeddb は最初の読み書きに時間がかかるため、テストの時間に含めないよう、先に1回読み書きしておく
  beforeAll(async () => {
    await saveCase(createEmptyCase('準備のためのケース'));
    await closeCaseDatabase();
    globalThis.indexedDB = new IDBFactory();
  });

  afterEach(async () => {
    cleanup();
    localStorage.clear();
    // 前のテストの保存が、次のテストのデータベースへ書き込まないよう、保存を終えてから空に戻す
    await flushPendingSaves();
    await closeCaseDatabase();
    resetCaseStoreInitialization();
    useCaseStore.setState({ currentCase: null, summaries: [], loadError: null, saveError: null, migrationError: null });
    globalThis.indexedDB = new IDBFactory();
  });
}
