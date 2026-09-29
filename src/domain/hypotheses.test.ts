/**
 * 仮説（読み手の見立て）から、一覧・詳細・証言を使っている仮説を導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import {
  buildHypothesisDetail,
  buildHypothesisList,
  detachClaimFromHypotheses,
  findHypothesesUsingClaim,
} from './hypotheses';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case, Hypothesis } from './types';

/** 有力とされた仮説です。サンプルのケースの仮説の後ろに加えて使います。 */
const 有力な仮説: Hypothesis = {
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
const 仮説が3件のケース: Case = { ...sampleFictionalCase, hypotheses: [...sampleFictionalCase.hypotheses, 有力な仮説] };

describe('buildHypothesisList', () => {
  it('否定されていない仮説を有力・検討中の順に並べ、否定された仮説を別に分けて返す', () => {
    const 一覧 = buildHypothesisList(仮説が3件のケース);

    expect(一覧.active.map((item) => item.hypothesis.id)).toEqual(['hypothesis-neighbor-saw', 'hypothesis-caretaker']);
    expect(一覧.rejected.map((item) => item.hypothesis.id)).toEqual(['hypothesis-left-early']);
  });

  it('各仮説に、対象の人物を添える', () => {
    const 一覧 = buildHypothesisList(仮説が3件のケース);

    const 管理人の仮説 = 一覧.active.find((item) => item.hypothesis.id === 'hypothesis-caretaker');
    expect(管理人の仮説?.targetPersons.map((person) => person.name)).toEqual(['管理人']);
  });
});

describe('buildHypothesisDetail', () => {
  it('支える証言・反する証言を、時系列の並び順に並べて返す', () => {
    // 前提: 並び順は 管理人 → 防犯カメラ → 隣家の住人 → 新聞の記事 → ユーザーの推測
    const 詳細 = buildHypothesisDetail(仮説が3件のケース, 'hypothesis-neighbor-saw');

    expect(詳細?.supporting.map((view) => view.claim.id)).toEqual(['claim-police-camera', 'claim-neighbor']);
    expect(詳細?.opposing.map((view) => view.claim.id)).toEqual(['claim-caretaker']);
  });

  it('対象の人物ごとに、動機・機会・手段の証言を返す', () => {
    const 詳細 = buildHypothesisDetail(仮説が3件のケース, 'hypothesis-caretaker');

    expect(詳細?.targets).toHaveLength(1);
    const [管理人] = 詳細!.targets;
    expect(管理人!.person.name).toBe('管理人');
    expect(管理人!.claims.motive.map((view) => view.claim.id)).toEqual(['claim-user-guess']);
    expect(管理人!.claims.opportunity.map((view) => view.claim.id)).toEqual(['claim-caretaker']);
    expect(管理人!.claims.means).toEqual([]);
  });

  it('存在しない仮説のIDには undefined を返す', () => {
    expect(buildHypothesisDetail(仮説が3件のケース, 'hypothesis-gone')).toBeUndefined();
  });
});

describe('findHypothesesUsingClaim', () => {
  it('証言をひもづけている仮説を、どの立場でひもづけているかとともに返す', () => {
    // 前提: 管理人の証言は、管理人の仮説の「管理人の機会」、否定された仮説の「支える」、有力な仮説の「反する」にひもづいている
    const 使っている仮説 = findHypothesesUsingClaim(仮説が3件のケース, 'claim-caretaker');

    expect(使っている仮説.map((usage) => [usage.hypothesis.id, usage.uses])).toEqual([
      ['hypothesis-caretaker', [{ kind: 'aspect', aspect: 'opportunity', personName: '管理人' }]],
      ['hypothesis-left-early', [{ kind: 'supporting' }]],
      ['hypothesis-neighbor-saw', [{ kind: 'opposing' }]],
    ]);
  });

  it('1つの仮説に複数の立場でひもづいている場合は、立場をすべて返す', () => {
    // 前提: ユーザーの推測は、管理人の仮説の「支える」と「管理人の動機」の両方にひもづいている
    const 使っている仮説 = findHypothesesUsingClaim(仮説が3件のケース, 'claim-user-guess');

    expect(使っている仮説.map((usage) => usage.uses)).toEqual([
      [{ kind: 'supporting' }, { kind: 'aspect', aspect: 'motive', personName: '管理人' }],
    ]);
  });

  it('どの仮説にもひもづいていない証言には、空の配列を返す', () => {
    expect(findHypothesesUsingClaim(仮説が3件のケース, 'claim-report')).toEqual([]);
  });
});

describe('detachClaimFromHypotheses', () => {
  it('支える証言・反する証言・対象の人物の観点から、指定した証言のひもづけを外す', () => {
    const 外した後 = detachClaimFromHypotheses(仮説が3件のケース.hypotheses, 'claim-caretaker');

    expect(外した後[0]?.targets[0]?.claimIds.opportunity).toEqual([]);
    expect(外した後[1]?.supportingClaimIds).toEqual([]);
    expect(外した後[2]?.opposingClaimIds).toEqual([]);
    // 検証: 仮説そのものと対象の人物は残す
    expect(外した後.map((hypothesis) => hypothesis.id)).toEqual(仮説が3件のケース.hypotheses.map((hypothesis) => hypothesis.id));
    expect(外した後[0]?.targets.map((target) => target.personId)).toEqual(['person-caretaker']);
  });
});
