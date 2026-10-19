/**
 * 照合（証言同士の突き合わせの結果）から表示用の情報を導出するロジック
 *
 * 照合は、読み手が2件の証言を見比べて見つけた判断（裏付ける・食い違う・同じ事柄を述べている）を記録した一次データです。
 * このファイルは、照合から次の4つを導出します。いずれも保存しません。
 * - 証言の詳細に並べる、照合した相手の証言と理由（buildClaimCrossChecks）
 * - 裏付ける照合を1件も持たない証言の一覧（findUncorroboratedClaims）
 * - 時系列ボードのカードに示す、証言ごとの照合の件数（countCrossChecksByClaim）
 *
 * - 証言の詳細で、開いている証言から見た照合の名前（crossCheckLabelFor）
 *
 * 照合は向きを持たないため、claimIds のどちらに置かれた証言からも、もう一方を相手としてたどれます。
 * ただし撤回・訂正（revises）は向きを持ち、claimIds の1件目が撤回・訂正した証言、2件目が撤回・訂正された証言です。
 * 撤回・訂正の照合も、どちらの証言からもたどれます。開いている証言がどちらの側かは、照合の名前で示します。
 * 並べる順は、証言の詳細と同じく時系列の並び順（buildTimeline）です。
 * 注意: どちらの証言が正しいかは判定しません。裏付けの有無は「読み手が裏付けを記録したか」であり、証言の真偽ではありません。
 */
import { buildTimeline, type ClaimView } from './case-views';
import { CROSS_CHECK_KIND_LABELS } from './labels';
import type { Case, CrossCheck, CrossCheckKind, Id } from './types';

/** 照合の種類を、画面に並べる順（入力の選択肢・カードの件数）に並べたものです。 */
export const CROSS_CHECK_KINDS: readonly CrossCheckKind[] = ['supports', 'contradicts', 'sameSubject', 'revises'];

/** 照合の件数が0件の状態です。証言ごとの件数を数えるときの初期値に使います。 */
const EMPTY_CROSS_CHECK_COUNTS: CrossCheckCounts = { supports: 0, contradicts: 0, sameSubject: 0, revises: 0 };

/** 証言の詳細に並べる照合1件です。 */
export type ClaimCrossCheckView = {
  crossCheck: CrossCheck;
  /** 照合した相手の証言です。 */
  other: ClaimView;
};

/** 証言ごとの、種類別の照合の件数です。 */
export type CrossCheckCounts = Record<CrossCheckKind, number>;

/** 時系列の並び順に並べた、証言の表示用の情報です。 */
function timelineViewsOf(target: Case): ClaimView[] {
  return buildTimeline(target).items.map((item) => item.view);
}

/**
 * 証言 claimId を含む照合を、相手の証言と組にして返します。
 * 相手の証言の時系列の並び順に並べます。照合が無い場合は空の配列を返します。
 */
export function buildClaimCrossChecks(target: Case, claimId: Id): ClaimCrossCheckView[] {
  const views = timelineViewsOf(target);
  const indexById = new Map(views.map((view, index) => [view.claim.id, index]));

  return target.crossChecks
    .filter((crossCheck) => crossCheck.claimIds.includes(claimId))
    .map((crossCheck) => {
      const [first, second] = crossCheck.claimIds;
      const otherId = first === claimId ? second : first;
      const other = views[indexById.get(otherId) ?? -1];
      // 参照の整合性は findCaseViolations で担保する前提のため、相手が見つからない場合はデータ破損として扱う
      if (!other) throw new Error(`証言が見つかりません: ${otherId}`);
      return { crossCheck, other };
    })
    .sort((a, b) => (indexById.get(a.other.claim.id) ?? 0) - (indexById.get(b.other.claim.id) ?? 0));
}

/**
 * 裏付ける照合（kind が supports）を1件も持たない証言を、時系列の並び順に返します。
 * 食い違う・同じ事柄を述べている照合しか持たない証言も、裏付けの無い証言に含めます。
 */
export function findUncorroboratedClaims(target: Case): ClaimView[] {
  const corroboratedIds = new Set(
    target.crossChecks.filter((crossCheck) => crossCheck.kind === 'supports').flatMap((crossCheck) => crossCheck.claimIds)
  );
  return timelineViewsOf(target).filter((view) => !corroboratedIds.has(view.claim.id));
}

/** 証言ごとに、照合の件数を種類別に数えます。照合が1件も無い証言は結果に含めません。 */
export function countCrossChecksByClaim(target: Case): Map<Id, CrossCheckCounts> {
  const counts = new Map<Id, CrossCheckCounts>();
  for (const crossCheck of target.crossChecks) {
    for (const claimId of crossCheck.claimIds) {
      const current = counts.get(claimId) ?? EMPTY_CROSS_CHECK_COUNTS;
      counts.set(claimId, { ...current, [crossCheck.kind]: current[crossCheck.kind] + 1 });
    }
  }
  return counts;
}

/**
 * 開いている証言 claimId から見た、照合の名前を返します。証言の詳細の照合の一覧で、相手の証言の上に示します。
 * 撤回・訂正の照合は向きを持つため、開いている証言が撤回・訂正した側か、された側かで名前を変えます。
 * 他の種類の照合は向きを持たないため、種類の名前をそのまま返します。
 */
export function crossCheckLabelFor(crossCheck: CrossCheck, claimId: Id): string {
  if (crossCheck.kind !== 'revises') return CROSS_CHECK_KIND_LABELS[crossCheck.kind];
  return crossCheck.claimIds[0] === claimId ? 'この証言が撤回・訂正した証言' : 'この証言を撤回・訂正した証言';
}
