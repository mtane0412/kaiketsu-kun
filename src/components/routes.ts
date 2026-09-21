/**
 * 画面のURLを組み立てる関数
 *
 * ケースは複数を保存できるため、ボードと詳細のURLは、どのケースかを表すケースのID（/cases/<ケースのID>）から始めます。
 * ケースの一覧はトップページ（/）です。
 * 証言・人物・場所の詳細は、それぞれ独立したページ（.../claims/<ID>・.../persons/<ID>・.../places/<ID>）として開きます。
 * 人物・場所を新しく登録するページは、登録済みの詳細とURLの形が重ならないよう、別の前置き（.../new/person・.../new/place）に置きます。
 * 読み込んだJSONのIDが「person」のような語であっても、登録のページと取り違えないようにするためです。
 * ボードの表示の切り替え（サイドバーの「時系列」「証言者別」「地図」）はURLのクエリ（?tab=）に持たせます。
 * 詳細ページからブラウザの「戻る」や「ボードに戻る」で、元の表示に戻れるようにするためです。詳細ページのURLにも同じクエリを引き継ぎます。
 */
import type { MentionKind } from '@/domain/mention';
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

/** ケースのボードのURLの、共通の前半（/cases/<ケースのID>）を組み立てます。 */
function caseBasePath(caseId: Id): string {
  return `/cases/${encodeURIComponent(caseId)}`;
}

/** ケースの一覧ページのURLを返します。 */
export function casesHref(): string {
  return '/';
}

/** ケースのボードのURLを返します。 */
export function boardHref(caseId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}${tabQuery(tab)}`;
}

/** 証言の詳細ページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function claimHref(caseId: Id, claimId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}/claims/${encodeURIComponent(claimId)}${tabQuery(tab)}`;
}

/** 人物の詳細ページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function personHref(caseId: Id, personId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}/persons/${encodeURIComponent(personId)}${tabQuery(tab)}`;
}

/** 場所の詳細ページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function placeHref(caseId: Id, placeId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}/places/${encodeURIComponent(placeId)}${tabQuery(tab)}`;
}

/** メンションの種類（人物・場所）に応じた、詳細ページのURLを返します。証言の本文のメンションからたどるために使います。 */
export function mentionHref(caseId: Id, kind: MentionKind, id: Id, tab: TabKey): string {
  return kind === 'person' ? personHref(caseId, id, tab) : placeHref(caseId, id, tab);
}

/** 人物を新しく登録するページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function newPersonHref(caseId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}/new/person${tabQuery(tab)}`;
}

/** 場所を新しく登録するページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function newPlaceHref(caseId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}/new/place${tabQuery(tab)}`;
}

/** ボードの横に並べる詳細の種類です。「new」で始まる種類は、まだ保存していないエンティティの登録フォームです。 */
export type DetailKind = 'claim' | 'person' | 'place' | 'newPerson' | 'newPlace';

/** URLのパス（クエリを含まない部分）から、開いている詳細の種類を見分けるための形です。 */
const DETAIL_PATH_PATTERNS: { kind: DetailKind; pattern: RegExp }[] = [
  { kind: 'newPerson', pattern: /^\/cases\/[^/]+\/new\/person$/ },
  { kind: 'newPlace', pattern: /^\/cases\/[^/]+\/new\/place$/ },
  { kind: 'claim', pattern: /^\/cases\/[^/]+\/claims\/[^/]+$/ },
  { kind: 'person', pattern: /^\/cases\/[^/]+\/persons\/[^/]+$/ },
  { kind: 'place', pattern: /^\/cases\/[^/]+\/places\/[^/]+$/ },
];

/**
 * URLのパスから、ボードの横に開いている詳細の種類を読み取ります。詳細のURLでない場合は undefined を返します。
 * ボード（CaseBoard）は、この結果で2ペインの表示に切り替えます。
 */
export function parseDetailKind(pathname: string): DetailKind | undefined {
  return DETAIL_PATH_PATTERNS.find(({ pattern }) => pattern.test(pathname))?.kind;
}

/**
 * URLのパスに、表示するタブのクエリを付け直します。
 * 詳細を開いたまま表示だけを切り替えるために、いま開いているパスへ新しいタブを付けて使います。
 */
export function withTab(pathname: string, tab: TabKey): string {
  return `${pathname}${tabQuery(tab)}`;
}
