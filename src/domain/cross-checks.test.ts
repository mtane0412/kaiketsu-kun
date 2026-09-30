/**
 * 照合（証言同士の突き合わせの結果）から、証言の詳細・裏付けの無い証言・カードの印を導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { buildClaimCrossChecks, countCrossChecksByClaim, findUncorroboratedClaims } from './cross-checks';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case } from './types';

/**
 * サンプルのケースに、新聞の記事と隣家の住人の証言が同じ事柄を述べているという照合を加えたケースです。
 * 前提: サンプルのケースには、防犯カメラ↔隣家の住人（裏付ける）と、管理人↔隣家の住人（食い違う）の照合がある
 */
const caseWithThreeCrossChecks: Case = {
  ...sampleFictionalCase,
  crossChecks: [
    ...sampleFictionalCase.crossChecks,
    {
      id: 'cross-check-report-neighbor',
      claimIds: ['claim-report', 'claim-neighbor'],
      kind: 'sameSubject',
      reason: 'どちらも12日夜の持ち主の様子を述べている。',
    },
  ],
};

describe('buildClaimCrossChecks', () => {
  it('証言を含む照合を、相手の証言と組にして、相手の証言の時系列の並び順に返す', () => {
    // 前提: 並び順は 管理人 → 防犯カメラ → 隣家の住人 → 新聞の記事 → ユーザーの推測
    const crossCheck = buildClaimCrossChecks(caseWithThreeCrossChecks, 'claim-neighbor');

    expect(crossCheck.map((view) => [view.other.claim.id, view.crossCheck.kind])).toEqual([
      ['claim-caretaker', 'contradicts'],
      ['claim-police-camera', 'supports'],
      ['claim-report', 'sameSubject'],
    ]);
  });

  it('照合の2件目に置かれた証言からも、1件目の証言を相手としてたどれる', () => {
    const crossCheck = buildClaimCrossChecks(caseWithThreeCrossChecks, 'claim-police-camera');

    expect(crossCheck).toHaveLength(1);
    expect(crossCheck[0]?.other.claim.id).toBe('claim-neighbor');
    expect(crossCheck[0]?.crossCheck.reason).toContain('時刻の順と行き先が合う');
  });

  it('照合が無い証言では、空の配列を返す', () => {
    expect(buildClaimCrossChecks(caseWithThreeCrossChecks, 'claim-user-guess')).toEqual([]);
  });
});

describe('findUncorroboratedClaims', () => {
  it('裏付ける照合を1件も持たない証言を、時系列の並び順に返す', () => {
    // 食い違う・同じ事柄の照合しか持たない証言（管理人・新聞の記事）も、裏付けの無い証言に含める
    const unsupportedClaim = findUncorroboratedClaims(caseWithThreeCrossChecks);

    expect(unsupportedClaim.map((view) => view.claim.id)).toEqual(['claim-caretaker', 'claim-report', 'claim-user-guess']);
  });
});

describe('countCrossChecksByClaim', () => {
  it('証言ごとに、照合の件数を種類別に数える', () => {
    const count = countCrossChecksByClaim(caseWithThreeCrossChecks);

    expect(count.get('claim-neighbor')).toEqual({ supports: 1, contradicts: 1, sameSubject: 1 });
    expect(count.get('claim-report')).toEqual({ supports: 0, contradicts: 0, sameSubject: 1 });
  });

  it('照合が無い証言は、結果に含めない', () => {
    expect(countCrossChecksByClaim(caseWithThreeCrossChecks).has('claim-user-guess')).toBe(false);
  });
});
