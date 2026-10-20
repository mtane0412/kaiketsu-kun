/**
 * 画面のURLを組み立てる関数
 *
 * ケースは複数を保存できるため、ボードと詳細のURLは、どのケースかを表すケースのID（/cases/<ケースのID>）から始めます。
 * ケースの一覧はトップページ（/）です。
 * 証言・人物・場所の詳細は、それぞれ独立したページ（.../claims/<ID>・.../persons/<ID>・.../places/<ID>）として開きます。
 * 人物・場所を新しく登録するページは、それぞれの一覧の下（.../persons/new・.../places/new）に置きます。
 * 仮説の詳細（.../hypotheses/<ID>）と登録（.../hypotheses/new）、未了事項の詳細（.../tasks/<ID>）と登録（.../tasks/new）も、同じ形で置きます。
 * 資料（聴取）の詳細（.../interviews/<ID>）と登録（.../interviews/new）も、同じ形で置きます。
 * 論点の詳細（.../disputes/<ID>）と登録（.../disputes/new）も、同じ形で置きます。
 * 論点の登録ページは、最初から束ねる証言をクエリ（?claim=<ID>&claim=<ID>）で受け取ります。
 * 証言の詳細の「論点を作る」や、照合の「この2件から論点を作る」から開いたときに、その証言を束ねた状態で始めるためです。
 * 未了事項の登録ページは、最初からひもづける証言・人物・場所をクエリ（?link=<種類>:<ID>）で受け取ります。
 * 証言・人物・場所の詳細から「未了事項を追加」で開いたときに、その対象をひもづけた状態で始めるためです。
 * 注意: IDがちょうど「new」の人物・場所・仮説・未了事項・資料・論点は、登録のページに隠れて詳細を開けません。
 * Next.js が静的なセグメント（new）を動的なセグメント（[personId] など）より優先するためです。
 * アプリが振るID（nanoid）では起こらず、読み込んだJSONに「new」と書かれていた場合だけ起こりえます。
 * parseDetailKind も、URLの判定を Next.js の優先順位に合わせています。
 * ボード全体の検索結果は、検索語をクエリ（?q=）に持たせたページ（.../search）に置きます。
 * ボードの表示の切り替え（サイドバーの「時系列」「グラフ」「証言者別」「人物の動き」「地図」「仮説」「論点」「未了事項」）はURLのクエリ（?tab=）に持たせます。
 * 詳細ページからブラウザの「戻る」や「ボードに戻る」で、元の表示に戻れるようにするためです。詳細ページのURLにも同じクエリを引き継ぎます。
 * ボードの絞り込みの条件（日時の範囲・人物・資料・論点）も、ボードのURLのクエリ（?when=・?person= など）に持たせます。
 * 詳細ページのURLには引き継がず、ボード（CaseBoard）が覚えておいて、ボードに戻ったときにURLへ戻します。
 */
import { BOARD_PERSON_ROLES, EMPTY_BOARD_FILTER, type BoardFilter } from '@/domain/board-filter';
import type { MentionKind } from '@/domain/mention';
import { isValidTimeRef } from '@/domain/time-ref';
import type { TaskLinkKind } from '@/domain/tasks';
import type { Id } from '@/domain/types';

export const TABS = [
  { key: 'timeline', label: '時系列' },
  { key: 'graph', label: 'グラフ' },
  { key: 'speaker', label: '証言者別' },
  { key: 'lanes', label: '人物の動き' },
  { key: 'map', label: '地図' },
  { key: 'hypotheses', label: '仮説' },
  { key: 'disputes', label: '論点' },
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

/**
 * ボードの絞り込みの条件を持たせるクエリの名前です（src/domain/board-filter.ts）。
 * 絞り込んだ表示を、URLで共有・再表示できるようにするために持たせます。
 */
const BOARD_FILTER_PARAMS = {
  when: 'when',
  includeUndated: 'undated',
  personId: 'person',
  personRole: 'role',
  interviewId: 'interview',
  disputeId: 'dispute',
} as const satisfies Record<keyof BoardFilter, string>;

/** 「日時の無い証言も含める」を指定したときの、クエリの値です。 */
const INCLUDE_UNDATED_VALUE = '1';

/** 絞り込みの条件を、クエリに書き込みます。既定値の条件（関わり方「いずれか」など）は書き込みません。URLを短く保つためです。 */
function appendBoardFilter(params: URLSearchParams, filter: BoardFilter): void {
  if (filter.when !== undefined) {
    params.set(BOARD_FILTER_PARAMS.when, filter.when);
    if (filter.includeUndated) params.set(BOARD_FILTER_PARAMS.includeUndated, INCLUDE_UNDATED_VALUE);
  }
  if (filter.personId !== undefined) {
    params.set(BOARD_FILTER_PARAMS.personId, filter.personId);
    if (filter.personRole !== EMPTY_BOARD_FILTER.personRole) params.set(BOARD_FILTER_PARAMS.personRole, filter.personRole);
  }
  if (filter.interviewId !== undefined) params.set(BOARD_FILTER_PARAMS.interviewId, filter.interviewId);
  if (filter.disputeId !== undefined) params.set(BOARD_FILTER_PARAMS.disputeId, filter.disputeId);
}

/**
 * URLのクエリから、ボードの絞り込みの条件を読み取ります。
 * 注意: URLはユーザーが自由に書き換えられるため、日時として解釈できない値や知らない関わり方は、例外にせず、指定していないものとして扱います。
 * ケースに無い人物・資料・論点のIDは、ここでは残します。ケースと照らし合わせて外すのは resolveBoardFilter です。
 */
export function parseBoardFilter(params: Pick<URLSearchParams, 'get'>): BoardFilter {
  const filter: BoardFilter = { ...EMPTY_BOARD_FILTER };
  const when = params.get(BOARD_FILTER_PARAMS.when);
  if (when !== null && isValidTimeRef(when)) {
    filter.when = when;
    filter.includeUndated = params.get(BOARD_FILTER_PARAMS.includeUndated) === INCLUDE_UNDATED_VALUE;
  }
  const personId = params.get(BOARD_FILTER_PARAMS.personId);
  if (personId) {
    filter.personId = personId;
    filter.personRole = BOARD_PERSON_ROLES.find((role) => role === params.get(BOARD_FILTER_PARAMS.personRole)) ?? EMPTY_BOARD_FILTER.personRole;
  }
  const interviewId = params.get(BOARD_FILTER_PARAMS.interviewId);
  if (interviewId) filter.interviewId = interviewId;
  const disputeId = params.get(BOARD_FILTER_PARAMS.disputeId);
  if (disputeId) filter.disputeId = disputeId;
  return filter;
}

/** URLのクエリが、絞り込みの条件を1つでも持つかどうかを判定します。 */
export function hasBoardFilterParams(params: Pick<URLSearchParams, 'has'>): boolean {
  return Object.values(BOARD_FILTER_PARAMS).some((name) => params.has(name));
}

/**
 * 絞り込みの条件だけを、URLのクエリの文字列（先頭の「?」を含まない）にします。条件が無い場合は空文字列です。
 * 同じ条件からは同じ文字列ができるため、条件どうしが等しいかの比較にも使えます。
 */
export function boardFilterQuery(filter: BoardFilter): string {
  const params = new URLSearchParams();
  appendBoardFilter(params, filter);
  return params.toString();
}

/**
 * ケースのボードのURLを返します。
 * filter を渡すと、絞り込みの条件もクエリに持たせます。
 */
export function boardHref(caseId: Id, tab: TabKey, filter: BoardFilter = EMPTY_BOARD_FILTER): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_TAB) params.set(TAB_SEARCH_PARAM, tab);
  appendBoardFilter(params, filter);
  const query = params.toString();
  return `${caseBasePath(caseId)}${query === '' ? '' : `?${query}`}`;
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

/** 論点の詳細ページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function disputeHref(caseId: Id, disputeId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}/disputes/${encodeURIComponent(disputeId)}${tabQuery(tab)}`;
}

/** 論点の登録ページで、最初から束ねる証言を持たせるクエリの名前です。証言ごとに1つずつ並べます。 */
export const DISPUTE_CLAIM_SEARCH_PARAM = 'claim';

/**
 * 論点を新しく登録するページのURLを返します。tab は「ボードに戻る」の戻り先です。
 * claimIds を渡すと、その証言を束ねた状態で登録を始めます。
 */
export function newDisputeHref(caseId: Id, tab: TabKey, claimIds: Id[] = []): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_TAB) params.set(TAB_SEARCH_PARAM, tab);
  for (const claimId of claimIds) params.append(DISPUTE_CLAIM_SEARCH_PARAM, claimId);
  const query = params.toString();
  return `${caseBasePath(caseId)}/disputes/new${query === '' ? '' : `?${query}`}`;
}

/**
 * URLの claim の値（複数）を、論点に最初から束ねる証言のIDとして読み取ります。
 * 注意: URLはユーザーが自由に書き換えられるため、空の値と重複は例外にせず取り除きます。
 * ケースに無い証言のIDは、呼び出し側でケースと照らし合わせて取り除いてください。
 */
export function parseDisputeClaimIds(values: string[]): Id[] {
  return [...new Set(values.filter((value) => value !== ''))];
}

/** 未了事項の詳細ページのURLを返します。tab は「ボードに戻る」の戻り先です。 */
export function taskHref(caseId: Id, taskId: Id, tab: TabKey): string {
  return `${caseBasePath(caseId)}/tasks/${encodeURIComponent(taskId)}${tabQuery(tab)}`;
}

/** 未了事項の登録ページで、最初からひもづける対象を持たせるクエリの名前です。 */
export const TASK_LINK_SEARCH_PARAM = 'link';

/** 未了事項に最初からひもづける対象（証言・人物・場所・論点）です。 */
export type TaskLinkTarget = { kind: TaskLinkKind; id: Id };

/** 未了事項にひもづけられる対象の種類です。URLの値を見分けるために使います。 */
const TASK_LINK_KINDS: readonly TaskLinkKind[] = ['claim', 'person', 'place', 'dispute'];

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
  | 'dispute'
  | 'search'
  | 'newPerson'
  | 'newPlace'
  | 'newHypothesis'
  | 'newTask'
  | 'newInterview'
  | 'newDispute';

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
  { kind: 'newDispute', pattern: /^\/cases\/[^/]+\/disputes\/new$/ },
  { kind: 'claim', pattern: /^\/cases\/[^/]+\/claims\/[^/]+$/ },
  { kind: 'person', pattern: /^\/cases\/[^/]+\/persons\/[^/]+$/ },
  { kind: 'place', pattern: /^\/cases\/[^/]+\/places\/[^/]+$/ },
  { kind: 'hypothesis', pattern: /^\/cases\/[^/]+\/hypotheses\/[^/]+$/ },
  { kind: 'task', pattern: /^\/cases\/[^/]+\/tasks\/[^/]+$/ },
  { kind: 'interview', pattern: /^\/cases\/[^/]+\/interviews\/[^/]+$/ },
  { kind: 'dispute', pattern: /^\/cases\/[^/]+\/disputes\/[^/]+$/ },
  { kind: 'search', pattern: /^\/cases\/[^/]+\/search$/ },
];

/**
 * URLのパスから、いま開いている詳細の種類を読み取ります。詳細のURLでない場合は undefined を返します。
 * ボード（CaseBoard）は、この結果で、メインのカラムをボードと詳細のどちらにするかを切り替えます。
 */
export function parseDetailKind(pathname: string): DetailKind | undefined {
  return DETAIL_PATH_PATTERNS.find(({ pattern }) => pattern.test(pathname))?.kind;
}
