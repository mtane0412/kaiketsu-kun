/**
 * 論点（同じ事柄を述べる証言の束）から、一覧・見比べる表・証言から見た論点を導出するロジックと、
 * 証言を削除するときに論点から証言を外す操作のテスト
 */
import { describe, expect, it } from 'vitest';
import {
  buildDisputeList,
  buildDisputeTable,
  detachClaimFromDisputes,
  findDisputesWithClaim,
} from './disputes';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case, Dispute, Interview } from './types';

/** 解決済みの論点です。サンプルのケースの論点の後ろに加えて使います。 */
const resolvedDispute: Dispute = {
  id: 'dispute-report-date',
  title: '連絡が取れなくなった日',
  claimIds: ['claim-report'],
  resolved: true,
};

/** 新聞の資料です。原典を持たず、資料の格を持ちます。 */
const newspaperInterview: Interview = {
  id: 'interview-newspaper',
  title: '別荘の持ち主 連絡取れず',
  interviewerPersonId: 'person-newspaper',
  at: '1998-08-14',
  grade: 'majorReport',
};

/** 書籍の資料です。 */
const bookInterview: Interview = {
  id: 'interview-book',
  title: '湖畔の夏 第3章',
  interviewerPersonId: 'person-book',
  at: '2018',
  grade: 'secondaryReport',
};

/**
 * サンプルのケースに、資料2件と解決済みの論点を加え、隣家の住人の証言に2つの出典（新聞・書籍）を持たせたケースです。
 * 前提: サンプルのケースには、未解決の論点「12日夜、持ち主は別荘にいたか」（管理人・防犯カメラ・隣家の住人の証言）がある
 */
const caseWithSources: Case = {
  ...sampleFictionalCase,
  interviews: [newspaperInterview, bookInterview],
  claims: sampleFictionalCase.claims.map((claim) =>
    claim.id === 'claim-neighbor'
      ? {
          ...claim,
          sources: [
            {
              interviewId: 'interview-newspaper',
              viaPersonIds: ['person-newspaper'],
              quote: { text: '明かりがついていて、庭に人影が見えた' },
            },
            { interviewId: 'interview-book', viaPersonIds: ['person-book'] },
          ],
        }
      : claim
  ),
  disputes: [...sampleFictionalCase.disputes, resolvedDispute],
};

describe('buildDisputeList', () => {
  it('未解決の論点と解決済みの論点を分け、それぞれ登録した順に並べる', () => {
    const list = buildDisputeList(caseWithSources);

    expect(list.open.map((item) => item.dispute.id)).toEqual(['dispute-villa-presence']);
    expect(list.resolved.map((item) => item.dispute.id)).toEqual(['dispute-report-date']);
  });

  it('各論点に、束ねた証言の発言者の表示名を、時系列の並び順に重複なく添える', () => {
    const list = buildDisputeList(caseWithSources);

    expect(list.open[0]?.speakerLabels).toEqual(['管理人', '県道の防犯カメラ', '隣家の住人']);
  });
});

describe('buildDisputeTable', () => {
  it('束ねた証言を、登録した順ではなく時系列の並び順に、表の行として並べる', () => {
    const table = buildDisputeTable(caseWithSources, 'dispute-villa-presence');

    expect(table?.rows.map((row) => row.view.claim.id)).toEqual([
      'claim-caretaker',
      'claim-police-camera',
      'claim-neighbor',
    ]);
  });

  it('日時を持つ証言は日時の表示を、持たない証言は undefined を添える', () => {
    const table = buildDisputeTable(caseWithSources, 'dispute-villa-presence');

    expect(table?.rows[0]?.whenLabel).toBe('1998年8月12日 19:00');
    const withoutWhen = buildDisputeTable(
      { ...caseWithSources, disputes: [{ ...resolvedDispute, claimIds: ['claim-report'] }] },
      'dispute-report-date'
    );
    expect(withoutWhen?.rows[0]?.whenLabel).toBeUndefined();
  });

  it('出典ごとに、資料の短い表示（資料の格を含む）・経由・引用を並べる', () => {
    const table = buildDisputeTable(caseWithSources, 'dispute-villa-presence');
    const neighborRow = table?.rows.find((row) => row.view.claim.id === 'claim-neighbor');

    expect(neighborRow?.sources).toEqual([
      {
        interviewId: 'interview-newspaper',
        interviewLabel: '架空日報 朝刊 1998年8月14日・主要報道',
        viaLabel: '架空日報 朝刊',
        quote: { text: '明かりがついていて、庭に人影が見えた' },
      },
      {
        interviewId: 'interview-book',
        interviewLabel: '湖畔の夏 20年目の証言（架空の書籍） 2018年・二次報道',
        viaLabel: '湖畔の夏 20年目の証言（架空の書籍）',
        quote: undefined,
      },
    ]);
  });

  it('資料にひもづかない出典は、資料の表示を持たず、経由だけを並べる', () => {
    const table = buildDisputeTable(caseWithSources, 'dispute-villa-presence');
    const cameraRow = table?.rows.find((row) => row.view.claim.id === 'claim-police-camera');

    expect(cameraRow?.sources).toEqual([
      { interviewId: undefined, interviewLabel: undefined, viaLabel: '県警 → 架空日報 朝刊', quote: undefined },
    ]);
  });

  it('ケースに無い論点のIDには undefined を返す', () => {
    expect(buildDisputeTable(caseWithSources, 'dispute-missing')).toBeUndefined();
  });
});

describe('findDisputesWithClaim', () => {
  it('証言を束ねた論点を、登録した順に返す', () => {
    const target: Case = {
      ...caseWithSources,
      disputes: [...caseWithSources.disputes, { ...resolvedDispute, id: 'dispute-neighbor', claimIds: ['claim-neighbor'] }],
    };

    expect(findDisputesWithClaim(target, 'claim-neighbor').map((dispute) => dispute.id)).toEqual([
      'dispute-villa-presence',
      'dispute-neighbor',
    ]);
  });

  it('どの論点にも束ねていない証言には空の配列を返す', () => {
    expect(findDisputesWithClaim(caseWithSources, 'claim-user-guess')).toEqual([]);
  });
});

describe('detachClaimFromDisputes', () => {
  it('論点から証言を外し、論点そのものは残す', () => {
    const detached = detachClaimFromDisputes(caseWithSources.disputes, 'claim-neighbor');

    expect(detached.map((dispute) => dispute.id)).toEqual(['dispute-villa-presence', 'dispute-report-date']);
    expect(detached[0]?.claimIds).toEqual(['claim-caretaker', 'claim-police-camera']);
  });
});
