/**
 * 仮説（読み手の見立て）から、一覧・詳細・証言を使っている仮説を導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import {
  buildHypothesisDetail,
  buildHypothesisList,
  detachClaimFromHypotheses,
  findHypothesesUsingClaim,
  insertStanceChange,
} from './hypotheses';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case, Hypothesis } from './types';

/** 有力とされた仮説です。サンプルのケースの仮説の後ろに加えて使います。 */
const leadingHypothesis: Hypothesis = {
  id: 'hypothesis-neighbor-saw',
  title: '持ち主は21時ごろまで別荘にいた',
  status: 'likely',
  supportingClaimIds: ['claim-neighbor', 'claim-police-camera'],
  opposingClaimIds: ['claim-caretaker'],
  targets: [],
};

/**
 * サンプルのケースに、有力な仮説を加えたケースです。
 * 前提: サンプルのケースには、検討中の「管理人が失踪に関わっている」と、否定された「持ち主は19時より前に別荘を離れた」がある
 */
const caseWithThreeHypotheses: Case = { ...sampleFictionalCase, hypotheses: [...sampleFictionalCase.hypotheses, leadingHypothesis] };

describe('buildHypothesisList', () => {
  it('否定されていない仮説を有力・検討中の順に並べ、否定された仮説を別に分けて返す', () => {
    const list = buildHypothesisList(caseWithThreeHypotheses);

    expect(list.active.map((item) => item.hypothesis.id)).toEqual(['hypothesis-neighbor-saw', 'hypothesis-caretaker']);
    expect(list.rejected.map((item) => item.hypothesis.id)).toEqual(['hypothesis-left-early']);
  });

  it('各仮説に、対象の人物を添える', () => {
    const list = buildHypothesisList(caseWithThreeHypotheses);

    const caretakerHypothesis = list.active.find((item) => item.hypothesis.id === 'hypothesis-caretaker');
    expect(caretakerHypothesis?.targetPersons.map((person) => person.name)).toEqual(['管理人']);
  });
});

describe('buildHypothesisDetail', () => {
  it('支える証言・反する証言を、時系列の並び順に並べて返す', () => {
    // 前提: 並び順は 管理人 → 防犯カメラ → 隣家の住人 → 新聞の記事 → ユーザーの推測
    const detailRegion = buildHypothesisDetail(caseWithThreeHypotheses, 'hypothesis-neighbor-saw');

    expect(detailRegion?.supporting.map((view) => view.claim.id)).toEqual(['claim-police-camera', 'claim-neighbor']);
    expect(detailRegion?.opposing.map((view) => view.claim.id)).toEqual(['claim-caretaker']);
  });

  it('対象の人物ごとに、動機・機会・手段の証言を返す', () => {
    const detailRegion = buildHypothesisDetail(caseWithThreeHypotheses, 'hypothesis-caretaker');

    expect(detailRegion?.targets).toHaveLength(1);
    const [caretaker] = detailRegion!.targets;
    expect(caretaker!.person.name).toBe('管理人');
    expect(caretaker!.claims.motive.map((view) => view.claim.id)).toEqual(['claim-user-guess']);
    expect(caretaker!.claims.opportunity.map((view) => view.claim.id)).toEqual(['claim-caretaker']);
    expect(caretaker!.claims.means).toEqual([]);
  });

  it('存在しない仮説のIDには undefined を返す', () => {
    expect(buildHypothesisDetail(caseWithThreeHypotheses, 'hypothesis-gone')).toBeUndefined();
  });
});

describe('findHypothesesUsingClaim', () => {
  it('証言をひもづけている仮説を、どの立場でひもづけているかとともに返す', () => {
    // 前提: 管理人の証言は、管理人の仮説の「管理人の機会」、否定された仮説の「支える」、有力な仮説の「反する」にひもづいている
    const usedHypothesis = findHypothesesUsingClaim(caseWithThreeHypotheses, 'claim-caretaker');

    expect(usedHypothesis.map((usage) => [usage.hypothesis.id, usage.uses])).toEqual([
      ['hypothesis-caretaker', [{ kind: 'aspect', aspect: 'opportunity', personName: '管理人' }]],
      ['hypothesis-left-early', [{ kind: 'supporting' }]],
      ['hypothesis-neighbor-saw', [{ kind: 'opposing' }]],
    ]);
  });

  it('1つの仮説に複数の立場でひもづいている場合は、立場をすべて返す', () => {
    // 前提: ユーザーの推測は、管理人の仮説の「支える」と「管理人の動機」の両方にひもづいている
    const usedHypothesis = findHypothesesUsingClaim(caseWithThreeHypotheses, 'claim-user-guess');

    expect(usedHypothesis.map((usage) => usage.uses)).toEqual([
      [{ kind: 'supporting' }, { kind: 'aspect', aspect: 'motive', personName: '管理人' }],
    ]);
  });

  it('どの仮説にもひもづいていない証言には、空の配列を返す', () => {
    expect(findHypothesesUsingClaim(caseWithThreeHypotheses, 'claim-report')).toEqual([]);
  });
});

describe('detachClaimFromHypotheses', () => {
  it('支える証言・反する証言・対象の人物の観点から、指定した証言のひもづけを外す', () => {
    const afterUnlink = detachClaimFromHypotheses(caseWithThreeHypotheses.hypotheses, 'claim-caretaker');

    expect(afterUnlink[0]?.targets[0]?.claimIds.opportunity).toEqual([]);
    expect(afterUnlink[1]?.supportingClaimIds).toEqual([]);
    expect(afterUnlink[2]?.opposingClaimIds).toEqual([]);
    // 検証: 仮説そのものと対象の人物は残す
    expect(afterUnlink.map((hypothesis) => hypothesis.id)).toEqual(caseWithThreeHypotheses.hypotheses.map((hypothesis) => hypothesis.id));
    expect(afterUnlink[0]?.targets.map((target) => target.personId)).toEqual(['person-caretaker']);
  });
});

/**
 * 第三者の説です。架空の書籍が2018年に唱え、2020年5月に撤回した説として、サンプルのケースの仮説の後ろに加えて使います。
 * 撤回の根拠は、新聞の記事の証言（claim-report）です。
 */
const thirdPartyTheory: Hypothesis = {
  id: 'hypothesis-book-theory',
  title: '持ち主は自分で姿を消した',
  status: 'open',
  supportingClaimIds: [],
  opposingClaimIds: [],
  targets: [],
  proponentPersonId: 'person-book',
  proposedAt: '2018',
  stanceChanges: [
    { id: 'stance-withdrawn', kind: 'withdrawn', at: '2020-05', basisClaimIds: ['claim-report'], note: '著者が誤りを認めた' },
  ],
};

/** サンプルのケースに、第三者の説を加えたケースです。 */
const caseWithThirdPartyTheory: Case = {
  ...sampleFictionalCase,
  hypotheses: [...sampleFictionalCase.hypotheses, thirdPartyTheory],
};

describe('第三者の説', () => {
  it('一覧の各仮説に、主唱者の人物を添える。読み手自身の仮説には主唱者を添えない', () => {
    const list = buildHypothesisList(caseWithThirdPartyTheory);

    const bookTheory = list.active.find((item) => item.hypothesis.id === 'hypothesis-book-theory');
    expect(bookTheory?.proponent?.name).toBe('湖畔の夏 20年目の証言（架空の書籍）');
    const readerHypothesis = list.active.find((item) => item.hypothesis.id === 'hypothesis-caretaker');
    expect(readerHypothesis?.proponent).toBeUndefined();
  });

  it('一覧の各仮説に、主唱者の最新の立場の変化を添える', () => {
    const list = buildHypothesisList(caseWithThirdPartyTheory);

    const bookTheory = list.active.find((item) => item.hypothesis.id === 'hypothesis-book-theory');
    expect(bookTheory?.latestStanceChange?.kind).toBe('withdrawn');
    const readerHypothesis = list.active.find((item) => item.hypothesis.id === 'hypothesis-caretaker');
    expect(readerHypothesis?.latestStanceChange).toBeUndefined();
  });

  it('詳細に、主唱者と、立場の変化ごとの根拠の証言を、記録した順に返す', () => {
    const detail = buildHypothesisDetail(caseWithThirdPartyTheory, 'hypothesis-book-theory');

    expect(detail?.proponent?.id).toBe('person-book');
    expect(detail?.stanceChanges.map((view) => [view.change.id, view.basis.map((basis) => basis.claim.id)])).toEqual([
      ['stance-withdrawn', ['claim-report']],
    ]);
  });

  it('立場の変化の根拠にした証言は、証言を使っている仮説に「立場の変化の根拠」として返す', () => {
    const usedHypothesis = findHypothesesUsingClaim(caseWithThirdPartyTheory, 'claim-report');

    expect(usedHypothesis.map((usage) => [usage.hypothesis.id, usage.uses])).toEqual([
      ['hypothesis-book-theory', [{ kind: 'stanceBasis', stanceChangeKind: 'withdrawn' }]],
    ]);
  });

  it('証言を削除するときは、立場の変化の根拠からもひもづけを外し、立場の変化そのものは残す', () => {
    const afterUnlink = detachClaimFromHypotheses(caseWithThirdPartyTheory.hypotheses, 'claim-report');

    const bookTheory = afterUnlink.find((hypothesis) => hypothesis.id === 'hypothesis-book-theory');
    expect(bookTheory?.stanceChanges).toEqual([
      { id: 'stance-withdrawn', kind: 'withdrawn', at: '2020-05', basisClaimIds: [], note: '著者が誤りを認めた' },
    ]);
  });

  it('立場の変化を加えるときは、時期の順の位置に入れ、時期の分からない変化は末尾に加える', () => {
    // 前提: 2020年の「再び主張」を先に記録してあり、後から2019年の「撤回」が見つかった
    const reaffirmed = { id: 'stance-reaffirmed', kind: 'reaffirmed' as const, at: '2020', basisClaimIds: [] };
    const withdrawn = { id: 'stance-withdrawn', kind: 'withdrawn' as const, at: '2019-03', basisClaimIds: [] };
    const undated = { id: 'stance-revised', kind: 'revised' as const, basisClaimIds: [] };

    const afterWithdrawn = insertStanceChange([reaffirmed], withdrawn);
    const afterUndated = insertStanceChange(afterWithdrawn, undated);

    expect(afterWithdrawn.map((change) => change.id)).toEqual(['stance-withdrawn', 'stance-reaffirmed']);
    expect(afterUndated.map((change) => change.id)).toEqual(['stance-withdrawn', 'stance-reaffirmed', 'stance-revised']);
  });

  it('立場の変化を持たない仮説は、証言を削除しても立場の変化の項目を持たないままにする', () => {
    // 前提: サンプルのケースの仮説は、どれも立場の変化を持たない
    const afterUnlink = detachClaimFromHypotheses(sampleFictionalCase.hypotheses, 'claim-caretaker');

    expect(afterUnlink.every((hypothesis) => !('stanceChanges' in hypothesis))).toBe(true);
  });
});
