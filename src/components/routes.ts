/**
 * 画面のURLを組み立てる関数
 *
 * ケースは複数を保存できるため、ボードと詳細のURLは、どのケースかを表すケースのID（/cases/<ケースのID>）から始めます。
 * ケースの一覧はトップページ（/）です。
 * 証言・人物・場所の詳細は、それぞれ独立したページ（.../claims/<ID>・.../persons/<ID>・.../places/<ID>）として開きます。
 * 人物・場所を新しく登録するページは、それぞれの一覧の下（.../persons/new・.../places/new）に置きます。
 * 仮説の詳細（.../hypotheses/<ID>）と登録（.../hypotheses/new）、未了事項の詳細（.../tasks/<ID>）と登録（.../tasks/new）も、同じ形で置きます。
 * 資料（聴取）の詳細（.../interviews/<ID>）と登録（.../interviews/new）も、同じ形で置きます。
 * 未了事項の登録ページは、最初からひもづける証言・人物・場所をクエリ（?link=<種類>:<ID>）で受け取ります。
 * 証言・人物・場所の詳細から「未了事項を追加」で開いたときに、その対象をひもづけた状態で始めるためです。
 * 注意: IDがちょうど「new」の人物・場所・仮説・未了事項・資料は、登録のページに隠れて詳細を開けません。
 * Next.js が静的なセグメント（new）を動的なセグメント（[personId] など）より優先するためです。
 * アプリが振るID（nanoid）では起こらず、読み込んだJSONに「new」と書かれていた場合だけ起こりえます。
 * parseDetailKind も、URLの判定を Next.js の優先順位に合わせています。
 * ボード全体の検索結果は、検索語をクエリ（?q=）に持たせたページ（.../search）に置きます。
 * ボードの表示の切り替え（サイドバーの「時系列」「グラフ」「証言者別」「人物の動き」「地図」「仮説」「未了事項」）はURLのクエリ（?tab=）に持たせます。
 * 詳細ページからブラウザの「戻る」や「ボードに戻る」で、元の表示に戻れるようにするためです。詳細ページのURLにも同じクエリを引き継ぎます。
 */
import type { MentionKind } from '@/domain/mention';
import type { TaskLinkKind } from '@/domain/tasks';
import type { Id } from '@/domain/types';

export const TABS = [
  { key: 'timeline', label: '時系列' },
  { key: 'graph', label: 'グラフ' },
  { key: 'speaker', label: '証言者別' },
  { key: 'lanes', label: '人物の動き' },
  { key: 'map', label: '地図' },
  { key: 'hypotheses', label: '仮説' },
  { key: 'tasks', label: '未了事項' },
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
  return `${caseBasePath(caseId)}/persons/new${tabQuery(tab)}`;
}

/** 場所を新しく登録するページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function newPlaceHref(caseId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}/places/new${tabQuery(tab)}`;
}

/** 仮説の詳細ページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function hypothesisHref(caseId: Id, hypothesisId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}/hypotheses/${encodeURIComponent(hypothesisId)}${tabQuery(tab)}`;
}

/** 仮説を新しく登録するページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function newHypothesisHref(caseId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}/hypotheses/new${tabQuery(tab)}`;
}

/** 資料（聴取）の詳細ページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function interviewHref(caseId: Id, interviewId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}/interviews/${encodeURIComponent(interviewId)}${tabQuery(tab)}`;
}

/** 資料（聴取）を新しく登録するページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function newInterviewHref(caseId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}/interviews/new${tabQuery(tab)}`;
}

/** 未了事項の詳細ページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function taskHref(caseId: Id, taskId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}/tasks/${encodeURIComponent(taskId)}${tabQuery(tab)}`;
}

/** 未了事項の登録ページで、最初からひもづける対象を持たせるクエリの名前です。 */
export const TASK_LINK_SEARCH_PARAM = 'link';

/** 未了事項に最初からひもづける対象（証言・人物・場所）です。 */
export type TaskLinkTarget = { kind: TaskLinkKind; id: Id };

/** 未了事項にひもづけられる対象の種類です。URLの値を見分けるために使います。 */
const TASK_LINK_KINDS: readonly TaskLinkKind[] = ['claim', 'person', 'place'];

/**
 * 未了事項を新しく登録するページのURLを返します。tab は「ボードに戻る」の戻り先です。
 * link を渡すと、その対象をひもづけた状態で登録を始めます。
 */
export function newTaskHref(caseId: Id, tab: TabKey, link?: TaskLinkTarget): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_TAB) params.set(TAB_SEARCH_PARAM, tab);
  if (link) params.set(TASK_LINK_SEARCH_PARAM, `${link.kind}:${link.id}`);
  const query = params.toString();
  return `${caseBasePath(caseId)}/tasks/new${query === '' ? '' : `?${query}`}`;
}

/**
 * URLの link の値（<種類>:<ID>）を、未了事項に最初からひもづける対象として読み取ります。
 * 注意: URLはユーザーが自由に書き換えられるため、形の合わない値は例外にせず、undefined として扱います。
 */
export function parseTaskLink(value: string | null): TaskLinkTarget | undefined {
  if (value === null) return undefined;
  const separatorIndex = value.indexOf(':');
  const kind = TASK_LINK_KINDS.find((candidate) => candidate === value.slice(0, separatorIndex));
  const id = value.slice(separatorIndex + 1);
  if (separatorIndex < 0 || kind === undefined || id === '') return undefined;
  return { kind, id };
}

/** 検索語を持たせるクエリの名前です。 */
export const SEARCH_QUERY_PARAM = 'q';

/** ボード全体の検索結果のページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function searchHref(caseId: Id, query: string, tab: TabKey): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_TAB) params.set(TAB_SEARCH_PARAM, tab);
  params.set(SEARCH_QUERY_PARAM, query);
  return `${caseBasePath(caseId)}/search?${params.toString()}`;
}

/**
 * ボードの横に並べる詳細の種類です。「new」で始まる種類は、まだ保存していないエンティティの登録フォームです。
 * search は、ボード全体の検索結果です。
 */
export type DetailKind =
  | 'claim'
  | 'person'
  | 'place'
  | 'hypothesis'
  | 'task'
  | 'interview'
  | 'search'
  | 'newPerson'
  | 'newPlace'
  | 'newHypothesis'
  | 'newTask'
  | 'newInterview';

/**
 * URLのパス（クエリを含まない部分）から、開いている詳細の種類を見分けるための形です。
 * 登録のページ（.../persons/new）を先に並べ、IDが「new」の詳細より優先します。Next.js の優先順位に合わせるためです。
 */
const DETAIL_PATH_PATTERNS: { kind: DetailKind; pattern: RegExp }[] = [
  { kind: 'newPerson', pattern: /^\/cases\/[^/]+\/persons\/new$/ },
  { kind: 'newPlace', pattern: /^\/cases\/[^/]+\/places\/new$/ },
  { kind: 'newHypothesis', pattern: /^\/cases\/[^/]+\/hypotheses\/new$/ },
  { kind: 'newTask', pattern: /^\/cases\/[^/]+\/tasks\/new$/ },
  { kind: 'newInterview', pattern: /^\/cases\/[^/]+\/interviews\/new$/ },
  { kind: 'claim', pattern: /^\/cases\/[^/]+\/claims\/[^/]+$/ },
  { kind: 'person', pattern: /^\/cases\/[^/]+\/persons\/[^/]+$/ },
  { kind: 'place', pattern: /^\/cases\/[^/]+\/places\/[^/]+$/ },
  { kind: 'hypothesis', pattern: /^\/cases\/[^/]+\/hypotheses\/[^/]+$/ },
  { kind: 'task', pattern: /^\/cases\/[^/]+\/tasks\/[^/]+$/ },
  { kind: 'interview', pattern: /^\/cases\/[^/]+\/interviews\/[^/]+$/ },
  { kind: 'search', pattern: /^\/cases\/[^/]+\/search$/ },
];

/**
 * URLのパスから、いま開いている詳細の種類を読み取ります。詳細のURLでない場合は undefined を返します。
 * ボード（CaseBoard）は、この結果で、メインのカラムをボードと詳細のどちらにするかを切り替えます。
 */
export function parseDetailKind(pathname: string): DetailKind | undefined {
  return DETAIL_PATH_PATTERNS.find(({ pattern }) => pattern.test(pathname))?.kind;
}
