/**
 * ボードの絞り込み（日時の範囲・人物・資料・論点）
 *
 * 証言が千件規模になると、時系列・グラフ・人物の動きで目的の証言にたどり着けなくなるため、
 * 表示する証言を条件で絞り込みます。条件は次の4つで、指定した条件をすべて満たす証言だけを残します（AND）。
 *
 * - 日時の範囲（when）: 証言が述べる日時（Claim.when）の区間が、範囲と一部でも重なる証言を残します。
 *   日時を持たない証言は、範囲に入るかどうかを決められないため、既定では除きます。includeUndated を true にすると残します。
 *   除いた件数は、画面で「日時の無い証言N件は除いています」と示すために返します。
 * - 人物（personId）: 発言者・経由（どの出典の経由でも）・言及のどれかとしてその人物が関わる証言を残します。
 *   関わり方（personRole）を選ぶと、その関わり方の証言だけを残します。
 * - 資料（interviewId）: その資料を出典に持つ証言を残します。
 * - 論点（disputeId）: その論点が束ねた証言を残します。
 *
 * 絞り込みは表示の都合のため、ケースには保存しません（条件はURLに持たせます。src/components/routes.ts）。
 * 絞り込んだ結果は、証言だけを減らしたケース（target）として返します。人物・場所・資料などは減らしません。
 * 証言の本文のメンションや出典の表示が、絞り込みで消えた人物を参照しても解決できるようにするためです。
 */
import { interviewIdsOf, viaPersonIdsOf } from './claim-sources';
import { intervalsOverlap, toInterval } from './time-ref';
import type { Case, Claim, Id, TimeRef } from './types';

/** 人物で絞り込むときの、証言への関わり方です。any は発言者・経由・言及のどれでもよいことを表します。 */
export const BOARD_PERSON_ROLES = ['any', 'speaker', 'via', 'mentioned'] as const;

export type BoardPersonRole = (typeof BOARD_PERSON_ROLES)[number];

/** ボードの絞り込みの条件です。省略した条件では絞り込みません。 */
export type BoardFilter = {
  /** 日時の範囲です。この範囲と一部でも重なる日時を述べる証言を残します。 */
  when?: TimeRef;
  /** 日時の範囲で絞り込むときに、日時を持たない証言も残すかどうかです。when が無い間は意味を持ちません。 */
  includeUndated: boolean;
  /** 関わる人物です。 */
  personId?: Id;
  /** 人物の関わり方です。personId が無い間は意味を持ちません。 */
  personRole: BoardPersonRole;
  /** 出典に持つ資料です。 */
  interviewId?: Id;
  /** 証言を束ねた論点です。 */
  disputeId?: Id;
};

/** 何も絞り込まない条件です。 */
export const EMPTY_BOARD_FILTER: BoardFilter = { includeUndated: false, personRole: 'any' };

/** 絞り込みの結果です。 */
export type BoardFilterResult = {
  /** 実際に使った条件です。ケースに無い人物・資料・論点の指定を外したもの（resolveBoardFilter）です。 */
  filter: BoardFilter;
  /** 証言を、条件を満たすものだけに減らしたケースです。絞り込んでいない場合は、渡したケースそのものです。 */
  target: Case;
  /** 残した証言のIDです。絞り込んでいない場合は undefined です（すべての証言を表示することを表します）。 */
  shownClaimIds: ReadonlySet<Id> | undefined;
  /** 残した証言の件数です。 */
  shownCount: number;
  /** 絞り込む前の証言の件数です。 */
  totalCount: number;
  /** 日時の範囲以外の条件は満たすが、日時を持たないために除いた証言の件数です。 */
  undatedExcludedCount: number;
};

/** 条件を1つでも指定しているかどうかを判定します。 */
export function isBoardFilterActive(filter: BoardFilter): boolean {
  return filter.when !== undefined || filter.personId !== undefined || filter.interviewId !== undefined || filter.disputeId !== undefined;
}

/**
 * ケースに無い人物・資料・論点の指定を外した条件を返します。
 * 注意: 条件はURLから読むため、削除した人物のIDなどが残っていることがあります。例外にはせず、指定していないものとして扱い、
 * 画面の選択欄（「指定なし」）と、実際の絞り込みを一致させます。
 */
export function resolveBoardFilter(target: Case, filter: BoardFilter): BoardFilter {
  const { personId, interviewId, disputeId, ...rest } = filter;
  const resolved: BoardFilter = { ...rest };
  if (personId !== undefined && target.persons.some((person) => person.id === personId)) resolved.personId = personId;
  if (interviewId !== undefined && target.interviews.some((interview) => interview.id === interviewId)) {
    resolved.interviewId = interviewId;
  }
  if (disputeId !== undefined && target.disputes.some((dispute) => dispute.id === disputeId)) resolved.disputeId = disputeId;
  return resolved;
}

/** 証言に、人物が指定の関わり方で関わっているかどうかを判定します。 */
function involvesPerson(claim: Claim, personId: Id, role: BoardPersonRole): boolean {
  const isSpeaker = claim.speaker.kind === 'person' && claim.speaker.personIds.includes(personId);
  const isVia = viaPersonIdsOf(claim).includes(personId);
  const isMentioned = claim.mentionedPersonIds.includes(personId);
  switch (role) {
    case 'any':
      return isSpeaker || isVia || isMentioned;
    case 'speaker':
      return isSpeaker;
    case 'via':
      return isVia;
    case 'mentioned':
      return isMentioned;
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

/**
 * 証言を条件で絞り込みます。条件は、この関数の中で resolveBoardFilter を通し、ケースに無い指定を外してから使います。
 * 外した後の条件は、結果の filter で返します。画面の選択欄を、実際の絞り込みとそろえるためです。
 * 証言の並び（Case.claims の順）は変えません。時系列ボードの並び順（Case.timelineOrder）も、そのまま残します。
 */
export function applyBoardFilter(target: Case, filter: BoardFilter): BoardFilterResult {
  const totalCount = target.claims.length;
  const resolved = resolveBoardFilter(target, filter);
  if (!isBoardFilterActive(resolved)) {
    return {
      filter: resolved,
      target,
      shownClaimIds: undefined,
      shownCount: totalCount,
      totalCount,
      undatedExcludedCount: 0,
    };
  }

  const range = resolved.when === undefined ? undefined : toInterval(resolved.when);
  const disputeClaimIds =
    resolved.disputeId === undefined
      ? undefined
      : new Set(target.disputes.find((dispute) => dispute.id === resolved.disputeId)?.claimIds ?? []);

  /** 日時の範囲以外の条件を満たすかどうかです。 */
  const matchesOtherConditions = (claim: Claim) =>
    (resolved.personId === undefined || involvesPerson(claim, resolved.personId, resolved.personRole)) &&
    (resolved.interviewId === undefined || interviewIdsOf(claim).includes(resolved.interviewId)) &&
    (disputeClaimIds === undefined || disputeClaimIds.has(claim.id));

  let undatedExcludedCount = 0;
  const claims = target.claims.filter((claim) => {
    if (!matchesOtherConditions(claim)) return false;
    if (range === undefined) return true;
    if (claim.when === undefined) {
      if (resolved.includeUndated) return true;
      undatedExcludedCount += 1;
      return false;
    }
    return intervalsOverlap(toInterval(claim.when), range);
  });

  return {
    filter: resolved,
    target: { ...target, claims },
    shownClaimIds: new Set(claims.map((claim) => claim.id)),
    shownCount: claims.length,
    totalCount,
    undatedExcludedCount,
  };
}
