/**
 * 仮説（読み手の見立て・第三者の説）から表示用の情報を導出するロジック
 *
 * 仮説は、読み手が複数の見立てを並べて検討し、証言で1つずつ消していく作業を記録した一次データです。
 * 主唱者（proponentPersonId）を持つ仮説は第三者の説で、主唱者と、主唱者の立場の変化（撤回・修正など）を添えて導出します。
 * このファイルは、仮説から次の3つを導出します。いずれも保存しません。
 * - 仮説の一覧（buildHypothesisList）。否定されていない仮説を有力・検討中の順に並べ、否定された仮説を別に分けます。
 *   第三者の説には、主唱者と、主唱者の最新の立場の変化を添えます
 * - 仮説の詳細に並べる、支える証言・反する証言、対象の人物ごとの動機・機会・手段の証言、主唱者の立場の変化ごとの根拠の証言（buildHypothesisDetail）
 * - 証言の詳細に並べる、その証言を使っている仮説（findHypothesesUsingClaim）
 * あわせて、証言を削除するときに仮説からひもづけを外す操作（detachClaimFromHypotheses）と、
 * 主唱者の立場の変化を時期の順の位置に加える操作（insertStanceChange）を持ちます。
 *
 * 証言を並べる順は、証言の詳細と同じく時系列の並び順（buildTimeline）です。
 * 注意: 判断（有力・否定）は仮説の側に置きます。証言そのものの真偽は判定しません。
 */
import { buildTimeline, type ClaimView } from './case-views';
import { compareTimeRef } from './time-ref';
import type {
  Case,
  Hypothesis,
  HypothesisAspect,
  HypothesisStanceChange,
  HypothesisStanceChangeKind,
  HypothesisStatus,
  Id,
  Person,
} from './types';

/** 仮説の状態を、入力の選択肢に並べる順に並べたものです。 */
export const HYPOTHESIS_STATUSES: readonly HypothesisStatus[] = ['open', 'likely', 'rejected'];

/** 被疑者を検討する観点を、表の列に並べる順に並べたものです。 */
export const HYPOTHESIS_ASPECTS: readonly HypothesisAspect[] = ['motive', 'opportunity', 'means'];

/** 一覧で、否定されていない仮説を並べる順です。有力な仮説を先に並べます。 */
const ACTIVE_STATUS_ORDER: readonly HypothesisStatus[] = ['likely', 'open'];

/** 仮説の一覧の1件です。 */
export type HypothesisListItem = {
  hypothesis: Hypothesis;
  /** 仮説が対象とする人物です。 */
  targetPersons: Person[];
  /** 説を唱えた人物（主唱者）です。読み手自身の仮説では undefined です。 */
  proponent: Person | undefined;
  /** 主唱者の最新の立場の変化です。変化が無い場合と、読み手自身の仮説では undefined です。 */
  latestStanceChange: HypothesisStanceChange | undefined;
};

/** 仮説の一覧です。否定された仮説は、区別して表示できるよう別に分けます。 */
export type HypothesisList = {
  /** 否定されていない仮説です。有力・検討中の順に並びます。 */
  active: HypothesisListItem[];
  /** 否定された仮説です。 */
  rejected: HypothesisListItem[];
};

/** 仮説の詳細に並べる、対象の人物1人と、観点ごとの証言です。 */
export type HypothesisTargetView = {
  person: Person;
  claims: Record<HypothesisAspect, ClaimView[]>;
};

/** 仮説の詳細に並べる、主唱者の立場の変化1件と、その根拠の証言です。 */
export type HypothesisStanceChangeView = {
  change: HypothesisStanceChange;
  /** 根拠の証言です。時系列の並び順に並べます。 */
  basis: ClaimView[];
};

/** 仮説の詳細です。 */
export type HypothesisDetail = {
  hypothesis: Hypothesis;
  supporting: ClaimView[];
  opposing: ClaimView[];
  targets: HypothesisTargetView[];
  /** 説を唱えた人物（主唱者）です。読み手自身の仮説では undefined です。 */
  proponent: Person | undefined;
  /** 主唱者の立場の変化です。記録した順（起きた順）に並べます。 */
  stanceChanges: HypothesisStanceChangeView[];
};

/**
 * 証言が仮説にひもづいている立場です。
 * 対象の人物の観点にひもづいている場合は、観点と人物の名前を持ちます。
 * 主唱者の立場の変化の根拠にひもづいている場合は、立場の変化の種類を持ちます。
 */
export type HypothesisClaimUse =
  | { kind: 'supporting' }
  | { kind: 'opposing' }
  | { kind: 'aspect'; aspect: HypothesisAspect; personName: string }
  | { kind: 'stanceBasis'; stanceChangeKind: HypothesisStanceChangeKind };

/** 証言を使っている仮説1件と、その証言をひもづけている立場です。 */
export type HypothesisUsage = {
  hypothesis: Hypothesis;
  uses: HypothesisClaimUse[];
};

/** 人物を探します。参照の整合性は findCaseViolations で担保する前提のため、見つからない場合はデータ破損として扱います。 */
function personOf(target: Case, personId: Id): Person {
  const person = target.persons.find((candidate) => candidate.id === personId);
  if (!person) throw new Error(`人物が見つかりません: ${personId}`);
  return person;
}

/** 仮説の主唱者を返します。読み手自身の仮説（主唱者を持たない仮説）には undefined を返します。 */
function proponentOf(target: Case, hypothesis: Hypothesis): Person | undefined {
  return hypothesis.proponentPersonId === undefined ? undefined : personOf(target, hypothesis.proponentPersonId);
}

/** 仮説の一覧を返します。同じ状態の仮説は、登録した順に並べます。 */
export function buildHypothesisList(target: Case): HypothesisList {
  const toItem = (hypothesis: Hypothesis): HypothesisListItem => ({
    hypothesis,
    targetPersons: hypothesis.targets.map((hypothesisTarget) => personOf(target, hypothesisTarget.personId)),
    proponent: proponentOf(target, hypothesis),
    latestStanceChange: hypothesis.stanceChanges?.at(-1),
  });

  return {
    active: ACTIVE_STATUS_ORDER.flatMap((status) =>
      target.hypotheses.filter((hypothesis) => hypothesis.status === status).map(toItem)
    ),
    rejected: target.hypotheses.filter((hypothesis) => hypothesis.status === 'rejected').map(toItem),
  };
}

/**
 * 仮説の詳細を返します。存在しない仮説のIDには undefined を返します。
 * 証言は、ひもづけた順ではなく、時系列の並び順に並べます。
 */
export function buildHypothesisDetail(target: Case, hypothesisId: Id): HypothesisDetail | undefined {
  const hypothesis = target.hypotheses.find((candidate) => candidate.id === hypothesisId);
  if (!hypothesis) return undefined;

  const views = buildTimeline(target).items.map((item) => item.view);
  const viewsOf = (claimIds: Id[]) => views.filter((view) => claimIds.includes(view.claim.id));

  return {
    hypothesis,
    supporting: viewsOf(hypothesis.supportingClaimIds),
    opposing: viewsOf(hypothesis.opposingClaimIds),
    targets: hypothesis.targets.map((hypothesisTarget) => ({
      person: personOf(target, hypothesisTarget.personId),
      claims: {
        motive: viewsOf(hypothesisTarget.claimIds.motive),
        opportunity: viewsOf(hypothesisTarget.claimIds.opportunity),
        means: viewsOf(hypothesisTarget.claimIds.means),
      },
    })),
    proponent: proponentOf(target, hypothesis),
    stanceChanges: (hypothesis.stanceChanges ?? []).map((change) => ({ change, basis: viewsOf(change.basisClaimIds) })),
  };
}

/**
 * 証言 claimId をひもづけている仮説を、ケースに登録した順に返します。
 * 立場は、支える・反する・対象の人物の観点（人物の順、動機・機会・手段の順）・主唱者の立場の変化の根拠（記録した順）の順に並べます。
 */
export function findHypothesesUsingClaim(target: Case, claimId: Id): HypothesisUsage[] {
  return target.hypotheses.flatMap((hypothesis) => {
    const uses: HypothesisClaimUse[] = [
      ...(hypothesis.supportingClaimIds.includes(claimId) ? [{ kind: 'supporting' as const }] : []),
      ...(hypothesis.opposingClaimIds.includes(claimId) ? [{ kind: 'opposing' as const }] : []),
      ...hypothesis.targets.flatMap((hypothesisTarget) =>
        HYPOTHESIS_ASPECTS.filter((aspect) => hypothesisTarget.claimIds[aspect].includes(claimId)).map((aspect) => ({
          kind: 'aspect' as const,
          aspect,
          personName: personOf(target, hypothesisTarget.personId).name,
        }))
      ),
      ...(hypothesis.stanceChanges ?? [])
        .filter((change) => change.basisClaimIds.includes(claimId))
        .map((change) => ({ kind: 'stanceBasis' as const, stanceChangeKind: change.kind })),
    ];
    return uses.length > 0 ? [{ hypothesis, uses }] : [];
  });
}

/**
 * 主唱者の立場の変化 change を、時期の順の位置に加えた一覧を返します。
 *
 * 立場の変化は起きた順に並べて持ち、最後の要素を最新の立場として扱います（buildHypothesisList の latestStanceChange）。
 * 後から見つかった古い変化を記録しても順が崩れないよう、時期を持つ変化は、時期がそれより後の最初の変化の前に入れます。
 * 時期の同じ変化の間では、記録した順を保ちます。時期の分からない変化は、起きた順を決められないため末尾に加えます。
 */
export function insertStanceChange(changes: HypothesisStanceChange[], change: HypothesisStanceChange): HypothesisStanceChange[] {
  const { at } = change;
  const index =
    at === undefined ? -1 : changes.findIndex((existing) => existing.at !== undefined && compareTimeRef(existing.at, at) > 0);
  return index === -1 ? [...changes, change] : [...changes.slice(0, index), change, ...changes.slice(index)];
}

/**
 * 仮説の支える証言・反する証言・対象の人物の観点・主唱者の立場の変化の根拠から、証言 claimId のひもづけを外した仮説の一覧を返します。
 * 証言を削除するときに使います。仮説そのもの・対象の人物・立場の変化は残します。
 * 立場の変化を持たない仮説には、立場の変化の項目を足しません（JSONの書き出しと読み込みで形が変わらないようにするためです）。
 */
export function detachClaimFromHypotheses(hypotheses: Hypothesis[], claimId: Id): Hypothesis[] {
  const without = (claimIds: Id[]) => claimIds.filter((id) => id !== claimId);
  return hypotheses.map((hypothesis) => ({
    ...hypothesis,
    supportingClaimIds: without(hypothesis.supportingClaimIds),
    opposingClaimIds: without(hypothesis.opposingClaimIds),
    targets: hypothesis.targets.map((hypothesisTarget) => ({
      ...hypothesisTarget,
      claimIds: {
        motive: without(hypothesisTarget.claimIds.motive),
        opportunity: without(hypothesisTarget.claimIds.opportunity),
        means: without(hypothesisTarget.claimIds.means),
      },
    })),
    ...(hypothesis.stanceChanges === undefined
      ? {}
      : {
          stanceChanges: hypothesis.stanceChanges.map((change) => ({ ...change, basisClaimIds: without(change.basisClaimIds) })),
        }),
  }));
}
