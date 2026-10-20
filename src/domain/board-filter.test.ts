/**
 * ボードの絞り込み（日時の範囲・人物・資料・論点）のテスト
 */
import { describe, expect, it } from 'vitest';
import {
  applyBoardFilter,
  EMPTY_BOARD_FILTER,
  isBoardFilterActive,
  resolveBoardFilter,
  type BoardFilter,
} from './board-filter';
import type { Case, Claim } from './types';

/** 証言を、テストに要る項目だけで作ります。 */
function claimOf(id: string, overrides: Partial<Claim> = {}): Claim {
  return {
    id,
    speaker: { kind: 'user' },
    sources: [],
    content: `${id}の本文`,
    mentionedPersonIds: [],
    ...overrides,
  };
}

/**
 * テスト用のケースです。
 * - 隣人の目撃: 隣人が述べ、管理人に言及する。1998年8月12日19時。資料は隣人の聴取
 * - 新聞の記事: 県警の発表を新聞が報じた（県警が発言者、新聞が経由）。1998年8月13日。資料は新聞の記事
 * - 管理人の話: 管理人が述べる。日時なし。資料は隣人の聴取と新聞の記事の2つ
 * - 読み手の推測: 発言者はユーザー。日時なし。資料なし
 * 論点「目撃の時刻の食い違い」は、隣人の目撃と管理人の話を束ねる
 */
const caseData: Case = {
  id: 'case-1',
  name: 'テストのケース',
  persons: [
    { id: 'neighbor', name: '隣人', kind: 'individual' },
    { id: 'caretaker', name: '管理人', kind: 'individual' },
    { id: 'police', name: '県警', kind: 'organization' },
    { id: 'newspaper', name: '新聞', kind: 'record' },
  ],
  places: [],
  claims: [
    claimOf('claim-neighbor', {
      speaker: { kind: 'person', personIds: ['neighbor'] },
      mentionedPersonIds: ['caretaker'],
      when: '1998-08-12T19:00',
      sources: [{ interviewId: 'interview-neighbor', viaPersonIds: [] }],
    }),
    claimOf('claim-report', {
      speaker: { kind: 'person', personIds: ['police'] },
      when: '1998-08-13',
      sources: [{ interviewId: 'interview-article', viaPersonIds: ['newspaper'] }],
    }),
    claimOf('claim-caretaker', {
      speaker: { kind: 'person', personIds: ['caretaker'] },
      sources: [
        { interviewId: 'interview-neighbor', viaPersonIds: [] },
        { interviewId: 'interview-article', viaPersonIds: ['newspaper'] },
      ],
    }),
    claimOf('claim-guess'),
  ],
  relationships: [],
  interviews: [
    { id: 'interview-neighbor', title: '隣人の聴取' },
    { id: 'interview-article', title: '新聞の記事' },
  ],
  crossChecks: [],
  hypotheses: [],
  tasks: [],
  disputes: [
    { id: 'dispute-time', title: '目撃の時刻の食い違い', claimIds: ['claim-neighbor', 'claim-caretaker'], resolved: false },
  ],
  timelineOrder: [],
  personLaneOrder: [],
};

/** 絞り込みの結果に残った証言のIDを、ケースの登録順で返します。 */
function shownIdsOf(filter: Partial<BoardFilter>): string[] {
  return applyBoardFilter(caseData, { ...EMPTY_BOARD_FILTER, ...filter }).target.claims.map((claim) => claim.id);
}

describe('isBoardFilterActive', () => {
  it('条件を何も指定していない場合は、絞り込んでいないとみなす', () => {
    expect(isBoardFilterActive(EMPTY_BOARD_FILTER)).toBe(false);
  });

  it('日時・人物・資料・論点のどれか1つでも指定していれば、絞り込んでいるとみなす', () => {
    expect(isBoardFilterActive({ ...EMPTY_BOARD_FILTER, when: '1998-08-12' })).toBe(true);
    expect(isBoardFilterActive({ ...EMPTY_BOARD_FILTER, personId: 'neighbor' })).toBe(true);
    expect(isBoardFilterActive({ ...EMPTY_BOARD_FILTER, interviewId: 'interview-neighbor' })).toBe(true);
    expect(isBoardFilterActive({ ...EMPTY_BOARD_FILTER, disputeId: 'dispute-time' })).toBe(true);
  });
});

describe('applyBoardFilter', () => {
  it('絞り込んでいない場合は、ケースをそのまま返す', () => {
    const result = applyBoardFilter(caseData, EMPTY_BOARD_FILTER);

    expect(result.target).toBe(caseData);
    expect(result.shownCount).toBe(4);
    expect(result.totalCount).toBe(4);
    // 絞り込んでいない場合は、表示する証言を限らないことを undefined で表す
    expect(result.shownClaimIds).toBeUndefined();
  });

  it('日時の範囲と一部でも重なる証言を残す', () => {
    // 前提: 8月12日（1日全体）は、隣人の目撃（12日19時）と重なり、新聞の記事（13日）とは重ならない
    expect(shownIdsOf({ when: '1998-08-12' })).toEqual(['claim-neighbor']);
    // 前提: 8月は、12日19時と13日の両方を含む
    expect(shownIdsOf({ when: '1998-08' })).toEqual(['claim-neighbor', 'claim-report']);
  });

  it('日時の範囲で絞り込むと、日時を持たない証言は既定では除き、除いた件数を返す', () => {
    const result = applyBoardFilter(caseData, { ...EMPTY_BOARD_FILTER, when: '1998-08-12' });

    expect(result.undatedExcludedCount).toBe(2);
  });

  it('「日時の無い証言も含める」を選ぶと、日時を持たない証言も残す', () => {
    expect(shownIdsOf({ when: '1998-08-12', includeUndated: true })).toEqual(['claim-neighbor', 'claim-caretaker', 'claim-guess']);
  });

  it('人物で絞り込むと、発言者・経由・言及のどれかとしてその人物が関わる証言を残す', () => {
    // 管理人は、隣人の目撃に言及され、管理人の話の発言者である
    expect(shownIdsOf({ personId: 'caretaker' })).toEqual(['claim-neighbor', 'claim-caretaker']);
    // 新聞は、2件の証言の出典の経由である（管理人の話は2つ目の出典の経由）
    expect(shownIdsOf({ personId: 'newspaper' })).toEqual(['claim-report', 'claim-caretaker']);
  });

  it('人物の関わり方を選ぶと、その関わり方の証言だけを残す', () => {
    expect(shownIdsOf({ personId: 'caretaker', personRole: 'speaker' })).toEqual(['claim-caretaker']);
    expect(shownIdsOf({ personId: 'caretaker', personRole: 'mentioned' })).toEqual(['claim-neighbor']);
    expect(shownIdsOf({ personId: 'caretaker', personRole: 'via' })).toEqual([]);
    expect(shownIdsOf({ personId: 'newspaper', personRole: 'via' })).toEqual(['claim-report', 'claim-caretaker']);
  });

  it('資料で絞り込むと、その資料を出典に持つ証言を残す', () => {
    expect(shownIdsOf({ interviewId: 'interview-neighbor' })).toEqual(['claim-neighbor', 'claim-caretaker']);
  });

  it('論点で絞り込むと、その論点が束ねた証言を残す', () => {
    expect(shownIdsOf({ disputeId: 'dispute-time' })).toEqual(['claim-neighbor', 'claim-caretaker']);
  });

  it('複数の条件は、すべてを満たす証言だけを残す', () => {
    expect(shownIdsOf({ interviewId: 'interview-article', personId: 'police' })).toEqual(['claim-report']);
  });

  it('日時の範囲で除いていない場合は、日時の無い証言を除いた件数を0とする', () => {
    const result = applyBoardFilter(caseData, { ...EMPTY_BOARD_FILTER, personId: 'caretaker' });

    expect(result.undatedExcludedCount).toBe(0);
    expect(result.shownCount).toBe(2);
  });

  it('残した証言のIDの集合を返す', () => {
    const result = applyBoardFilter(caseData, { ...EMPTY_BOARD_FILTER, personId: 'caretaker' });

    expect([...(result.shownClaimIds ?? [])]).toEqual(['claim-neighbor', 'claim-caretaker']);
  });

  it('ケースに無い人物の指定は外して絞り込み、外した後の条件を返す', () => {
    const result = applyBoardFilter(caseData, { ...EMPTY_BOARD_FILTER, personId: 'deleted-person' });

    expect(result.filter).toEqual(EMPTY_BOARD_FILTER);
    expect(result.shownCount).toBe(4);
  });
});

describe('resolveBoardFilter', () => {
  it('ケースに無い人物・資料・論点の指定は、指定していないものとして扱う', () => {
    // 前提: URLは自由に書き換えられ、削除した人物のIDが残ったリンクを開くこともある
    const resolved = resolveBoardFilter(caseData, {
      ...EMPTY_BOARD_FILTER,
      personId: 'deleted-person',
      interviewId: 'deleted-interview',
      disputeId: 'deleted-dispute',
    });

    expect(resolved.personId).toBeUndefined();
    expect(resolved.interviewId).toBeUndefined();
    expect(resolved.disputeId).toBeUndefined();
  });

  it('ケースにある人物・資料・論点の指定は、そのまま残す', () => {
    const filter: BoardFilter = {
      ...EMPTY_BOARD_FILTER,
      personId: 'neighbor',
      interviewId: 'interview-neighbor',
      disputeId: 'dispute-time',
    };

    expect(resolveBoardFilter(caseData, filter)).toEqual(filter);
  });
});
