/**
 * 画面のURLを組み立てる関数
 *
 * ボードのタブはURLのクエリ（?tab=）に持たせます。詳細ページからブラウザの「戻る」や
 * 「ボードに戻る」で、元のタブに戻れるようにするためです。詳細ページのURLにも同じクエリを引き継ぎます。
 */
import type { Id } from '@/domain/types';

export const TABS = [
  { key: 'timeline', label: '時系列' },
  { key: 'speaker', label: '証言者別' },
  { key: 'map', label: '地図' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

/** tab のクエリが無いときに表示するタブです。 */
const DEFAULT_TAB: TabKey = 'timeline';

/** タブを持たせるクエリの名前です。 */
export const TAB_SEARCH_PARAM = 'tab';

/**
 * URLの tab の値を、ボードのタブとして読み取ります。
 * 注意: URLはユーザーが自由に書き換えられるため、知らない値は例外にせず、既定のタブとして扱います。
 */
export function parseTab(value: string | null): TabKey {
  return TABS.find((tab) => tab.key === value)?.key ?? DEFAULT_TAB;
}

/** 既定のタブではクエリを付けず、URLを短く保ちます。 */
function tabQuery(tab: TabKey): string {
  return tab === DEFAULT_TAB ? '' : `?${TAB_SEARCH_PARAM}=${tab}`;
}

/** ボードのURLを返します。 */
export function boardHref(tab: TabKey): string {
  return `/${tabQuery(tab)}`;
}

/** 証言の詳細ページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function claimHref(claimId: Id, tab: TabKey): string {
  return `/claims/${encodeURIComponent(claimId)}${tabQuery(tab)}`;
}
