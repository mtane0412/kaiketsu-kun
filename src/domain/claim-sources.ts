/**
 * 証言の出典（Claim.sources）を読む・書き足す関数
 *
 * 証言は、資料・経由・引用の組（出典）を複数持てます（src/domain/types.ts の ClaimSource）。
 * 表示や絞り込みでは、出典ごとの違いを気にせず「どの資料に載っているか」「誰を経由したか」を知りたい場面が多いため、
 * その読み方をここにまとめます。出典の配列を直接たどる処理を、画面や他のモジュールに散らばらせないためです。
 */
import type { Claim, ClaimSource, Id } from './types';

/**
 * 出典ごとの経由（伝えた順の人物のID）を、出典の順に返します。
 * 経由の無い出典（直接の供述）は含めません。同じ経由の出典が複数ある場合（同じ投稿者の別の回など）は1つにまとめます。
 */
export function viaChainsOf(claim: Claim): Id[][] {
  const chains = new Map<string, Id[]>();
  for (const source of claim.sources) {
    if (source.viaPersonIds.length === 0) continue;
    // 人物のIDに含まれない区切りで連結し、同じ並びの経由を見分ける
    chains.set(source.viaPersonIds.join('\n'), source.viaPersonIds);
  }
  return [...chains.values()];
}

/** すべての出典の経由の人物のIDを、最初に現れた順に重複なく返します。 */
export function viaPersonIdsOf(claim: Claim): Id[] {
  return [...new Set(claim.sources.flatMap((source) => source.viaPersonIds))];
}

/** 証言が載っている資料（聴取）のIDを、出典の順に返します。資料を持たない出典は含めません。 */
export function interviewIdsOf(claim: Claim): Id[] {
  return claim.sources.flatMap((source) => (source.interviewId === undefined ? [] : [source.interviewId]));
}

/** 指定した資料の出典を返します。その資料を出典に持たない場合は undefined を返します。 */
export function sourceForInterview(claim: Claim, interviewId: Id): ClaimSource | undefined {
  return claim.sources.find((source) => source.interviewId === interviewId);
}

/**
 * 証言の出典の末尾に、出典を書き足した証言を返します（元の証言は変えません）。
 * 資料から抽出した候補が既存の証言と同じだった場合に、新しい証言を作らずに資料と引用を書き足すために使います。
 *
 * 注意: 同じ資料の出典をすでに持つ場合と、ユーザーの推測に経由のある出典を書き足す場合は、例外を投げます
 * （どちらもケースの検証で受け付けない形のためです。src/domain/case-schema.ts）。
 */
export function addClaimSource(claim: Claim, source: ClaimSource): Claim {
  if (source.interviewId !== undefined && sourceForInterview(claim, source.interviewId) !== undefined) {
    throw new Error('この証言は、すでにこの資料を出典に持っています');
  }
  if (claim.speaker.kind === 'user' && source.viaPersonIds.length > 0) {
    throw new Error('ユーザーの推測に経由は指定できません');
  }
  return { ...claim, sources: [...claim.sources, source] };
}
