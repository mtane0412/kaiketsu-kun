/**
 * テスト用の next/navigation の代役
 *
 * App Router のルーターはテスト環境（jsdom）には存在しないため、URLを1つ持つだけの最小の代役を用意します。
 * router.push・router.replace で URL を書き換えると、useSearchParams・useParams を使うコンポーネントが再描画されます。
 * useParams は、詳細ページのURL（/claims/<証言のID>・/persons/<人物のID>・/places/<場所のID>）から、
 * それぞれ claimId・personId・placeId を読み取ります。
 *
 * 使い方: テストファイルの先頭で vi.mock('next/navigation', () => import('@/test/mock-navigation')) を呼び、
 * beforeEach で resetMockNavigation() を呼んでください。
 */
import { useSyncExternalStore } from 'react';
import { vi } from 'vitest';

const ORIGIN = 'http://localhost';

let currentUrl = new URL('/', ORIGIN);
const listeners = new Set<() => void>();

function navigate(href: string) {
  currentUrl = new URL(href, ORIGIN);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** router.push・router.replace の呼び出しを検証するための代役です。 */
export const mockRouter = {
  push: vi.fn((href: string) => navigate(href)),
  replace: vi.fn((href: string) => navigate(href)),
};

/** URLを初期値（または指定したパス）に戻し、呼び出しの記録を消します。 */
export function resetMockNavigation(href = '/') {
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  navigate(href);
}

export function useRouter() {
  return mockRouter;
}

export function useSearchParams() {
  const search = useSyncExternalStore(subscribe, () => currentUrl.search);
  return new URLSearchParams(search);
}

/** 詳細ページのURLから、対象のIDを取り出すための形です。ルートごとに、本物のルーターが渡すパラメータの名前を対応させます。 */
const DETAIL_PATH_PATTERNS: { name: 'claimId' | 'personId' | 'placeId'; pattern: RegExp }[] = [
  { name: 'claimId', pattern: /^\/claims\/([^/]+)$/ },
  { name: 'personId', pattern: /^\/persons\/([^/]+)$/ },
  { name: 'placeId', pattern: /^\/places\/([^/]+)$/ },
];

export function useParams(): { claimId?: string; personId?: string; placeId?: string } {
  const pathname = useSyncExternalStore(subscribe, () => currentUrl.pathname);
  for (const { name, pattern } of DETAIL_PATH_PATTERNS) {
    const id = pattern.exec(pathname)?.[1];
    if (id !== undefined) return { [name]: id };
  }
  return {};
}
