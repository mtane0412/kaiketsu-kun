/**
 * 証言の詳細に並べる「似ている証言」を、決定的な点数で導出するロジック
 *
 * 2件の証言が、証言そのものの構造化されたデータ（触れている人物・場所・日時・聴取）をどれだけ共有しているかを点数にし、
 * 点数の高い順に上位 MAX_SIMILAR_CLAIMS 件を返します。同じ入力からは常に同じ結果になります。
 * 点数の内訳は次のとおりです（重みは SIMILARITY_WEIGHTS です）。
 * - 人物: 両方の証言が触れている人物（発言者・経由・言及）の集合の Jaccard 係数 × 重み
 * - 場所: 同じ場所なら重み
 * - 日時: 区間が重なれば重み。重ならなければ、間隔が NEAR_TIME_WINDOW_MS に近づくほど0へ直線的に減らす
 * - 聴取: 同じ聴取で得た証言なら重み
 * 何も共有しない（点数が0の）証言は含めません。
 *
 * 照合（CrossCheck）と仮説（Hypothesis）は読み手の判断であり、証言の一次データではないため、点数には混ぜません。
 * 代わりに、照合の種類と、両方の証言をひもづけている仮説を目印として返します。
 * 注意: 重みは実際のケースで試しながら調整する前提の暫定値です。
 */
import { buildTimeline, personIdsOf, type ClaimView } from './case-views';
import { DAY_MS, intervalsOverlap, toInterval } from './time-ref';
import type { Case, Claim, CrossCheckKind, Hypothesis, Id, Person, Place } from './types';

/** 似ている証言として返す最大の件数です。 */
export const MAX_SIMILAR_CLAIMS = 5;

/** 点数の重みです。実際のケースで試しながら調整します。 */
export const SIMILARITY_WEIGHTS = {
  persons: 3,
  place: 2,
  time: 2,
  interview: 1,
} as const;

/** 日時が重ならない2件の証言を「近い」とみなす間隔の上限です。これ以上離れると日時の点数は0です。 */
export const NEAR_TIME_WINDOW_MS = DAY_MS;

/** 2件の証言が似ている理由1つです。 */
export type SimilarityReason =
  | { kind: 'sharedPersons'; persons: Person[] }
  | { kind: 'samePlace'; place: Place }
  | { kind: 'overlappingTime' }
  | { kind: 'nearTime'; gapMs: number }
  | { kind: 'sameInterview' };

/** 似ている証言1件です。 */
export type SimilarClaim = {
  view: ClaimView;
  /** 点数です。大きいほど似ています。 */
  score: number;
  /** 似ている理由です。人物・場所・日時・聴取の順に並びます。 */
  reasons: SimilarityReason[];
  /** 2件の証言の間の照合の種類です（目印。点数には含みません）。 */
  crossCheckKinds: CrossCheckKind[];
  /** 2件の証言の両方をひもづけている仮説です（目印。点数には含みません）。 */
  sharedHypotheses: Hypothesis[];
};

/** 点数と理由の組です。 */
type ScoredReason = { score: number; reason: SimilarityReason };

/** 両方の証言が触れている人物の重なりを、Jaccard 係数で点数にします。 */
function scorePersons(a: Claim, b: Claim, personById: Map<Id, Person>): ScoredReason | undefined {
  const idsA = new Set(personIdsOf(a));
  const idsB = personIdsOf(b);
  const shared = idsB.filter((id) => idsA.has(id));
  if (shared.length === 0) return undefined;

  const unionSize = new Set([...idsA, ...idsB]).size;
  const persons = shared.map((id) => {
    const person = personById.get(id);
    // 参照の整合性は findCaseViolations で担保する前提のため、見つからない場合はデータ破損として扱う
    if (!person) throw new Error(`人物が見つかりません: ${id}`);
    return person;
  });
  return { score: (shared.length / unionSize) * SIMILARITY_WEIGHTS.persons, reason: { kind: 'sharedPersons', persons } };
}

/** 2件の証言の日時の近さを点数にします。どちらかが日時を持たない場合は点数を付けません。 */
function scoreTime(a: Claim, b: Claim): ScoredReason | undefined {
  if (a.when === undefined || b.when === undefined) return undefined;
  const intervalA = toInterval(a.when);
  const intervalB = toInterval(b.when);
  if (intervalsOverlap(intervalA, intervalB)) {
    return { score: SIMILARITY_WEIGHTS.time, reason: { kind: 'overlappingTime' } };
  }

  // 重ならない区間同士の間隔は、先の区間の終わりから後の区間の始まりまで
  const gapMs = Math.max(intervalA.start, intervalB.start) - Math.min(intervalA.end, intervalB.end);
  if (gapMs >= NEAR_TIME_WINDOW_MS) return undefined;
  return { score: SIMILARITY_WEIGHTS.time * (1 - gapMs / NEAR_TIME_WINDOW_MS), reason: { kind: 'nearTime', gapMs } };
}

/** 仮説が、支える・反する・対象の人物の観点のいずれかでひもづけている証言のIDです。 */
function claimIdsOfHypothesis(hypothesis: Hypothesis): Set<Id> {
  return new Set([
    ...hypothesis.supportingClaimIds,
    ...hypothesis.opposingClaimIds,
    ...hypothesis.targets.flatMap((target) => Object.values(target.claimIds).flat()),
  ]);
}

/**
 * 証言 claimId に似ている証言を、点数の高い順に最大 MAX_SIMILAR_CLAIMS 件返します。
 * 点数が同じ証言は、時系列の並び順に並べます。
 * 注意: ケースに無い証言のIDには空の配列を返します（呼び出し側は証言の詳細で「見つからない」ことを別に扱います）。
 */
export function findSimilarClaims(target: Case, claimId: Id): SimilarClaim[] {
  const views = buildTimeline(target).items.map((item) => item.view);
  const self = views.find((view) => view.claim.id === claimId);
  if (!self) return [];

  const personById = new Map(target.persons.map((person) => [person.id, person]));
  const hypothesesWithSelf = target.hypotheses
    .map((hypothesis) => ({ hypothesis, claimIds: claimIdsOfHypothesis(hypothesis) }))
    .filter(({ claimIds }) => claimIds.has(claimId));

  const similars = views.flatMap((other): SimilarClaim[] => {
    if (other === self) return [];
    const a = self.claim;
    const b = other.claim;
    const scored = [
      scorePersons(a, b, personById),
      self.place && a.placeId === b.placeId
        ? { score: SIMILARITY_WEIGHTS.place, reason: { kind: 'samePlace' as const, place: self.place } }
        : undefined,
      scoreTime(a, b),
      a.interviewId !== undefined && a.interviewId === b.interviewId
        ? { score: SIMILARITY_WEIGHTS.interview, reason: { kind: 'sameInterview' as const } }
        : undefined,
    ].filter((item): item is ScoredReason => item !== undefined);
    if (scored.length === 0) return [];

    return [
      {
        view: other,
        score: scored.reduce((sum, item) => sum + item.score, 0),
        reasons: scored.map((item) => item.reason),
        crossCheckKinds: target.crossChecks
          .filter((crossCheck) => crossCheck.claimIds.includes(claimId) && crossCheck.claimIds.includes(b.id))
          .map((crossCheck) => crossCheck.kind),
        sharedHypotheses: hypothesesWithSelf
          .filter(({ claimIds }) => claimIds.has(b.id))
          .map(({ hypothesis }) => hypothesis),
      },
    ];
  });

  // Array.prototype.sort は安定ソートのため、点数が同じ証言は時系列の並び順のまま残る
  return similars.sort((x, y) => y.score - x.score).slice(0, MAX_SIMILAR_CLAIMS);
}
