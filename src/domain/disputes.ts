/**
 * 論点（同じ事柄を述べる証言の束）から表示用の情報を導出するロジック
 *
 * 論点は、読み手が「この事柄について、どの証言が何と述べているか」を束ねた一次データです（src/domain/types.ts の Dispute）。
 * このファイルは、論点から次の3つを導出します。いずれも保存しません。
 * - 論点の一覧（buildDisputeList）。未解決のものと解決済みのものを分けます
 * - 論点の束ねた証言を見比べる表（buildDisputeTable）。証言ごとに、発言者・日時・本文と、出典ごとの資料・経由・引用を並べます
 * - 証言の詳細に並べる、その証言を束ねた論点（findDisputesWithClaim）
 * あわせて、証言を削除するときに論点から証言を外す操作（detachClaimFromDisputes）を持ちます。
 *
 * 注意: 束ねた証言は、登録した順ではなく時系列の並び順（buildTimeline）に並べます。
 * 食い違いを見比べるときは、述べている内容の時刻の順に並んでいる方が読みやすいためです。
 */
import { buildTimeline, type ClaimView } from './case-views';
import { formatInterviewSourceLabel } from './interviews';
import { formatTimeRef } from './time-ref';
import type { Case, ClaimQuote, Dispute, Id } from './types';

/** 論点の一覧の1件です。 */
export type DisputeListItem = {
  dispute: Dispute;
  /** 束ねた証言の発言者の表示名です。時系列の並び順に、重複なく並びます。 */
  speakerLabels: string[];
};

/** 論点の一覧です。解決済みの論点は、区別して表示できるよう別に分けます。 */
export type DisputeList = {
  /** 未解決の論点です。登録した順に並びます。 */
  open: DisputeListItem[];
  /** 解決済みの論点です。登録した順に並びます。 */
  resolved: DisputeListItem[];
};

/** 見比べる表の、証言1件の出典1つです。 */
export type DisputeSourceCell = {
  /** 出典の資料のIDです。資料にひもづかない出典（経由だけの出典）では undefined です。 */
  interviewId: Id | undefined;
  /** 資料の短い表示（媒体・日付・資料の格）です（src/domain/interviews.ts の formatInterviewSourceLabel）。 */
  interviewLabel: string | undefined;
  /** 経由した人物の名前を、伝えた順に「 → 」でつないだものです。経由が無い場合は空文字列です。 */
  viaLabel: string;
  /** 資料の本文からの引用です。 */
  quote: ClaimQuote | undefined;
};

/** 見比べる表の1行（証言1件）です。 */
export type DisputeTableRow = {
  view: ClaimView;
  /** 証言が述べる内容の日時の表示です。日時を持たない証言では undefined です。 */
  whenLabel: string | undefined;
  /** 出典です。出典の順に並びます。出典を持たない証言では空の配列です。 */
  sources: DisputeSourceCell[];
};

/** 論点と、束ねた証言を見比べる表です。 */
export type DisputeTable = {
  dispute: Dispute;
  /** 束ねた証言です。時系列の並び順に並びます。 */
  rows: DisputeTableRow[];
};

/** 経由の人物の名前の区切りです。証言のカードの経由の表示（formatViaLabel）と同じ向きの矢印を使います。 */
const VIA_SEPARATOR = ' → ';

/** 時系列の並び順に並べた、証言の表示用の形です。 */
function timelineViews(target: Case): ClaimView[] {
  return buildTimeline(target).items.map((item) => item.view);
}

/** 論点の一覧を返します。 */
export function buildDisputeList(target: Case): DisputeList {
  const views = timelineViews(target);
  const toItem = (dispute: Dispute): DisputeListItem => ({
    dispute,
    speakerLabels: [
      ...new Set(views.filter((view) => dispute.claimIds.includes(view.claim.id)).map((view) => view.speakerLabel)),
    ],
  });
  return {
    open: target.disputes.filter((dispute) => !dispute.resolved).map(toItem),
    resolved: target.disputes.filter((dispute) => dispute.resolved).map(toItem),
  };
}

/** 人物のIDから名前を返します。参照の整合性は findCaseViolations で担保する前提のため、見つからない場合はデータ破損として扱います。 */
function personNameOf(target: Case, personId: Id): string {
  const person = target.persons.find((candidate) => candidate.id === personId);
  if (person === undefined) throw new Error(`人物が見つかりません: ${personId}`);
  return person.name;
}

/** 証言の出典を、見比べる表の出典の形にします。 */
function toSourceCells(target: Case, view: ClaimView): DisputeSourceCell[] {
  return view.claim.sources.map((source) => {
    const interview =
      source.interviewId === undefined
        ? undefined
        : target.interviews.find((candidate) => candidate.id === source.interviewId);
    if (source.interviewId !== undefined && interview === undefined) {
      throw new Error(`証言が存在しない資料を参照しています: ${source.interviewId}`);
    }
    return {
      interviewId: source.interviewId,
      interviewLabel: interview === undefined ? undefined : formatInterviewSourceLabel(target, interview),
      viaLabel: source.viaPersonIds.map((id) => personNameOf(target, id)).join(VIA_SEPARATOR),
      quote: source.quote,
    };
  });
}

/** 論点と、束ねた証言を見比べる表を返します。ケースに無い論点のIDには undefined を返します。 */
export function buildDisputeTable(target: Case, disputeId: Id): DisputeTable | undefined {
  const dispute = target.disputes.find((candidate) => candidate.id === disputeId);
  if (dispute === undefined) return undefined;
  return {
    dispute,
    rows: timelineViews(target)
      .filter((view) => dispute.claimIds.includes(view.claim.id))
      .map((view) => ({
        view,
        whenLabel: view.claim.when === undefined ? undefined : formatTimeRef(view.claim.when),
        sources: toSourceCells(target, view),
      })),
  };
}

/** 証言 claimId を束ねた論点を、ケースに登録した順に返します。 */
export function findDisputesWithClaim(target: Case, claimId: Id): Dispute[] {
  return target.disputes.filter((dispute) => dispute.claimIds.includes(claimId));
}

/**
 * 論点から、証言 claimId を外した一覧を返します。
 * 証言を削除するときに使います。論点そのものは、束ねた証言が減っても事柄の記録として残します。
 */
export function detachClaimFromDisputes(disputes: Dispute[], claimId: Id): Dispute[] {
  return disputes.map((dispute) => ({ ...dispute, claimIds: dispute.claimIds.filter((id) => id !== claimId) }));
}
