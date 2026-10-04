/**
 * 証言の詳細に並べる「似ている証言」を、決定的な点数で導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { sampleFictionalCase } from './sample-fictional-case';
import { findSimilarClaims, MAX_SIMILAR_CLAIMS } from './similar-claims';
import type { Case, Claim } from './types';

/** 似ている証言の、証言のIDだけを並べます。 */
function similarIdsOf(target: Case, claimId: string): string[] {
  return findSimilarClaims(target, claimId).map((similar) => similar.view.claim.id);
}

describe('findSimilarClaims', () => {
  it('共有する人物・場所・日時の近さを合わせた点数の高い順に並べる', () => {
    // 前提: 隣家の住人の証言（21:00・湖畔の別荘）に対して、
    // 管理人の証言は場所が同じで日時も近く、防犯カメラの記録は日時が近く人物を2人共有し、
    // 新聞の記事は人物だけを多く共有し、ユーザーの推測は人物だけを一部共有する
    expect(similarIdsOf(sampleFictionalCase, 'claim-neighbor')).toEqual([
      'claim-caretaker',
      'claim-police-camera',
      'claim-report',
      'claim-user-guess',
    ]);
  });

  it('似ている理由として、共有する人物・同じ場所・日時の近さを返す', () => {
    const caretaker = findSimilarClaims(sampleFictionalCase, 'claim-neighbor').find(
      (similar) => similar.view.claim.id === 'claim-caretaker'
    );

    expect(caretaker?.reasons).toEqual([
      { kind: 'sharedPersons', persons: [expect.objectContaining({ name: '別荘の持ち主' })] },
      { kind: 'samePlace', place: expect.objectContaining({ name: '湖畔の別荘' }) },
      // 19:00 の1分間の終わりから 21:00 までの間隔です
      { kind: 'nearTime', gapMs: 2 * 60 * 60 * 1000 - 60 * 1000 + 1 },
    ]);
  });

  it('日時の区間が重なる証言には、日時が重なるという理由を返す', () => {
    const target: Case = {
      ...sampleFictionalCase,
      claims: sampleFictionalCase.claims.map((claim) =>
        claim.id === 'claim-report' ? { ...claim, when: '1998-08-12' } : claim
      ),
    };

    const report = findSimilarClaims(target, 'claim-neighbor').find((similar) => similar.view.claim.id === 'claim-report');

    expect(report?.reasons).toContainEqual({ kind: 'overlappingTime' });
  });

  it('同じ聴取で得た証言には、同じ聴取という理由を返す', () => {
    const secondClaim: Claim = {
      id: 'claim-caretaker-second',
      speaker: { kind: 'person', personIds: ['person-caretaker'] },
      viaPersonIds: [],
      content: '鍵は自分しか持っていない。',
      mentionedPersonIds: [],
      interviewId: 'interview-caretaker',
    };
    const target: Case = {
      ...sampleFictionalCase,
      interviews: [{ id: 'interview-caretaker', title: '管理人への聴取' }],
      claims: [
        ...sampleFictionalCase.claims.map((claim) =>
          claim.id === 'claim-caretaker' ? { ...claim, interviewId: 'interview-caretaker' } : claim
        ),
        secondClaim,
      ],
    };

    const second = findSimilarClaims(target, 'claim-caretaker').find(
      (similar) => similar.view.claim.id === 'claim-caretaker-second'
    );

    expect(second?.reasons).toContainEqual({ kind: 'sameInterview' });
  });

  it('何も共有しない証言は含めない', () => {
    const target: Case = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-unrelated',
          speaker: { kind: 'user' },
          viaPersonIds: [],
          content: '湖の水位は例年どおりだった。',
          mentionedPersonIds: [],
        },
      ],
    };

    expect(similarIdsOf(target, 'claim-neighbor')).not.toContain('claim-unrelated');
  });

  it(`点数の高い順に、最大 ${MAX_SIMILAR_CLAIMS} 件まで返す`, () => {
    const extraClaims: Claim[] = Array.from({ length: MAX_SIMILAR_CLAIMS }, (_, index) => ({
      id: `claim-extra-${index}`,
      speaker: { kind: 'person', personIds: ['person-neighbor'] },
      viaPersonIds: ['person-newspaper'],
      content: `別荘の持ち主を見かけた（${index + 1}件目）。`,
      mentionedPersonIds: ['person-owner'],
      when: '1998-08-12T21:00',
      placeId: 'place-villa',
    }));
    const target: Case = { ...sampleFictionalCase, claims: [...sampleFictionalCase.claims, ...extraClaims] };

    const similarIds = similarIdsOf(target, 'claim-neighbor');

    expect(similarIds).toHaveLength(MAX_SIMILAR_CLAIMS);
    expect(similarIds.every((id) => id.startsWith('claim-extra-'))).toBe(true);
  });

  it('照合と仮説は点数に混ぜず、目印として返す', () => {
    // 前提: 隣家の住人の証言は、防犯カメラの記録と「裏付ける」、管理人の証言と「食い違う」照合を持つ。
    // 仮説「持ち主は19時より前に別荘を離れた」は、隣家の住人・防犯カメラ・管理人の3件の証言をひもづけている
    const similars = findSimilarClaims(sampleFictionalCase, 'claim-neighbor');
    const byId = new Map(similars.map((similar) => [similar.view.claim.id, similar]));

    expect(byId.get('claim-police-camera')?.crossCheckKinds).toEqual(['supports']);
    expect(byId.get('claim-caretaker')?.crossCheckKinds).toEqual(['contradicts']);
    expect(byId.get('claim-report')?.crossCheckKinds).toEqual([]);
    expect(byId.get('claim-caretaker')?.sharedHypotheses.map((hypothesis) => hypothesis.id)).toEqual(['hypothesis-left-early']);
    expect(byId.get('claim-report')?.sharedHypotheses).toEqual([]);
  });

  it('照合や仮説でつながっているだけで、何も共有しない証言は含めない', () => {
    const target: Case = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-unrelated',
          speaker: { kind: 'user' },
          viaPersonIds: [],
          content: '湖の水位は例年どおりだった。',
          mentionedPersonIds: [],
        },
      ],
      crossChecks: [
        ...sampleFictionalCase.crossChecks,
        { id: 'cross-check-unrelated', claimIds: ['claim-neighbor', 'claim-unrelated'], kind: 'sameSubject' },
      ],
    };

    expect(similarIdsOf(target, 'claim-neighbor')).not.toContain('claim-unrelated');
  });

  it('ケースに無い証言のIDには、空の配列を返す', () => {
    expect(findSimilarClaims(sampleFictionalCase, 'claim-missing')).toEqual([]);
  });
});
