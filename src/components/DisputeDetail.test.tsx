/**
 * 論点の詳細・登録ページ（束ねた証言を見比べる表、名前・両立できる読み方・解決したかどうかの編集、
 * 証言を束ねる・外す操作、削除、未了事項へのひもづけ）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case, Dispute } from '@/domain/types';
import { mockRouter, resetMockNavigation } from '@/test/mock-navigation';
import { openedCase, openTestCase } from '@/test/open-case';
import { DisputeDetail, NewDisputeDetail } from './DisputeDetail';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/**
 * サンプルのケースの隣家の住人の証言に、新聞の資料からの出典（引用つき）と、書籍の資料からの出典を持たせたケースです。
 * 前提: 論点「12日夜、持ち主は別荘にいたか」は、管理人・防犯カメラ・隣家の住人の証言を束ねている
 */
const caseWithSources: Case = {
  ...sampleFictionalCase,
  interviews: [
    { id: 'interview-newspaper', title: '別荘の持ち主 連絡取れず', interviewerPersonId: 'person-newspaper', at: '1998-08-14', grade: 'majorReport' },
    { id: 'interview-book', title: '湖畔の夏 第3章', interviewerPersonId: 'person-book', at: '2018' },
  ],
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
};

beforeEach(() => {
  localStorage.clear();
  openTestCase(caseWithSources);
  resetMockNavigation('/cases/case-lakeside/disputes/dispute-villa-presence?tab=disputes');
});

/** 開いているケースから、論点を取り出します。 */
function findDispute(id: string): Dispute {
  const dispute = openedCase().disputes.find((candidate) => candidate.id === id);
  if (!dispute) throw new Error(`論点が見つかりません: ${id}`);
  return dispute;
}

describe('DisputeDetail（見比べる表）', () => {
  it('束ねた証言を、発言者・経由・資料・日時・本文・引用の列の表に、時系列の並び順で並べる', () => {
    render(<DisputeDetail disputeId="dispute-villa-presence" />);

    const table = screen.getByRole('table', { name: '束ねた証言の比較' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual(['発言者', '経由', '資料', '日時', '本文', '引用', '操作']);
    // 検証: 見出しの行を除いた3行が、管理人（19:00）・防犯カメラ（20:10）・隣家の住人（21:00）の順に並ぶ
    const [, caretakerRow, cameraRow, neighborRow] = within(table).getAllByRole('row');
    expect(caretakerRow).toHaveTextContent('管理人');
    expect(caretakerRow).toHaveTextContent('1998年8月12日 19:00');
    expect(cameraRow).toHaveTextContent('県警 → 架空日報 朝刊');
    expect(neighborRow).toHaveTextContent('架空日報 朝刊 1998年8月14日・主要報道');
    expect(neighborRow).toHaveTextContent('明かりがついていて、庭に人影が見えた');
  });

  it('各行に、証言の詳細へのリンクを置く', () => {
    render(<DisputeDetail disputeId="dispute-villa-presence" />);

    const table = screen.getByRole('table', { name: '束ねた証言の比較' });
    expect(within(table).getByRole('link', { name: /見回りをしたとき.*を開く$/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-caretaker?tab=disputes'
    );
  });

  it('論点の両立できる読み方と、解決したかどうかを表示する', () => {
    render(<DisputeDetail disputeId="dispute-villa-presence" />);

    const summary = screen.getByRole('region', { name: '論点' });
    expect(within(summary).getByRole('heading', { name: '12日夜、持ち主は別荘にいたか' })).toBeInTheDocument();
    expect(summary).toHaveTextContent('未解決');
    expect(summary).toHaveTextContent('持ち主が車で別荘へ戻った（20:10）と読めば');
  });

  it('束ねた証言が2件に満たない場合は、証言を束ねるよう案内する', () => {
    openTestCase({
      ...caseWithSources,
      disputes: [{ id: 'dispute-single', title: '連絡が取れなくなった日', claimIds: ['claim-report'], resolved: false }],
      tasks: caseWithSources.tasks.map((task) => ({ ...task, disputeIds: [] })),
    });
    render(<DisputeDetail disputeId="dispute-single" />);

    expect(screen.getByText(/見比べる証言を2件以上束ねてください/)).toBeInTheDocument();
  });
});

describe('DisputeDetail（証言を束ねる・外す）', () => {
  it('証言を選ぶとすぐに束ね、表の「論点から外す」ですぐに外す', async () => {
    const user = userEvent.setup();
    render(<DisputeDetail disputeId="dispute-villa-presence" />);

    await user.selectOptions(screen.getByRole('combobox', { name: '束ねる証言を追加' }), 'claim-report');
    expect(findDispute('dispute-villa-presence').claimIds).toEqual([
      'claim-caretaker',
      'claim-police-camera',
      'claim-neighbor',
      'claim-report',
    ]);

    await user.click(screen.getByRole('button', { name: /^「.*見回りをしたとき.*」を論点から外す$/ }));
    expect(findDispute('dispute-villa-presence').claimIds).toEqual(['claim-police-camera', 'claim-neighbor', 'claim-report']);
  });

  it('既に束ねた証言は、追加の選択肢に並べない', () => {
    render(<DisputeDetail disputeId="dispute-villa-presence" />);

    const select = screen.getByRole('combobox', { name: '束ねる証言を追加' });
    const optionValues = within(select)
      .getAllByRole('option')
      .map((option) => option.getAttribute('value'));
    expect(optionValues).toEqual(['', 'claim-report', 'claim-user-guess']);
  });
});

describe('DisputeDetail（編集・削除）', () => {
  it('「編集」で名前・両立できる読み方・解決したかどうかを変えて保存すると、読む表示に戻る', async () => {
    const user = userEvent.setup();
    render(<DisputeDetail disputeId="dispute-villa-presence" />);

    await user.click(screen.getByRole('button', { name: 'この論点を編集' }));
    const title = screen.getByRole('textbox', { name: '名前' });
    await user.clear(title);
    await user.type(title, '12日夜の持ち主の所在');
    const reconciliation = screen.getByRole('textbox', { name: '両立できる読み方' });
    await user.clear(reconciliation);
    await user.type(reconciliation, '見回りの記録簿で、管理人の見回りは19時だったと確かめた。');
    await user.click(screen.getByRole('checkbox', { name: '解決した' }));
    await user.click(screen.getByRole('button', { name: '論点を保存' }));

    expect(findDispute('dispute-villa-presence')).toMatchObject({
      title: '12日夜の持ち主の所在',
      reconciliation: '見回りの記録簿で、管理人の見回りは19時だったと確かめた。',
      resolved: true,
    });
    expect(screen.getByRole('status')).toHaveTextContent('保存しました');
    expect(screen.queryByRole('textbox', { name: '名前' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'この論点を編集' })).toHaveFocus();
  });

  it('両立できる読み方を空にして保存すると、その項目を取り除く', async () => {
    const user = userEvent.setup();
    render(<DisputeDetail disputeId="dispute-villa-presence" />);

    await user.click(screen.getByRole('button', { name: 'この論点を編集' }));
    await user.clear(screen.getByRole('textbox', { name: '両立できる読み方' }));
    await user.click(screen.getByRole('button', { name: '論点を保存' }));

    expect(findDispute('dispute-villa-presence')).not.toHaveProperty('reconciliation');
  });

  it('削除すると、ケースから取り除き、ボードへ戻る', async () => {
    const user = userEvent.setup();
    render(<DisputeDetail disputeId="dispute-villa-presence" />);

    await user.click(screen.getByRole('button', { name: 'この論点を削除' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '削除する' }));

    expect(openedCase().disputes).toEqual([]);
    expect(mockRouter.replace).toHaveBeenCalledWith('/cases/case-lakeside?tab=disputes');
  });

  it('ケースに無い論点のIDでは、見つからないことを表示する', () => {
    render(<DisputeDetail disputeId="dispute-gone" />);

    expect(screen.getByRole('heading', { name: '論点が見つかりません' })).toBeInTheDocument();
  });
});

describe('DisputeDetail（未了事項）', () => {
  it('この論点をひもづけた未了事項と、この論点の未了事項を追加するリンクを並べる', () => {
    render(<DisputeDetail disputeId="dispute-villa-presence" />);

    const section = screen.getByRole('region', { name: 'この論点の未了事項' });
    expect(within(section).getByRole('link', { name: /19時に見回りをした理由/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/tasks/task-caretaker?tab=disputes'
    );
    expect(within(section).getByRole('link', { name: 'この論点の未了事項を追加' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/tasks/new?tab=disputes&link=dispute%3Adispute-villa-presence'
    );
  });
});

describe('NewDisputeDetail（論点の登録）', () => {
  it('名前を入力して保存すると、未解決の論点を登録し、その詳細へ移る', async () => {
    resetMockNavigation('/cases/case-lakeside/disputes/new?tab=disputes');
    const user = userEvent.setup();
    render(<NewDisputeDetail />);

    await user.type(screen.getByRole('textbox', { name: '名前' }), '連絡が取れなくなった日');
    await user.click(screen.getByRole('button', { name: '論点を保存' }));

    const registered = openedCase().disputes.at(-1);
    expect(registered).toMatchObject({ title: '連絡が取れなくなった日', claimIds: [], resolved: false });
    expect(mockRouter.replace).toHaveBeenCalledWith(`/cases/case-lakeside/disputes/${registered?.id}?tab=disputes`);
  });

  it('URLで指定した証言を、最初から束ねて登録する。ケースに無い証言は束ねない', async () => {
    resetMockNavigation('/cases/case-lakeside/disputes/new?claim=claim-caretaker&claim=claim-gone&claim=claim-neighbor');
    const user = userEvent.setup();
    render(<NewDisputeDetail />);

    expect(screen.getByRole('list', { name: '束ねる証言' })).toHaveTextContent('管理人');
    await user.type(screen.getByRole('textbox', { name: '名前' }), '見回りの時刻');
    await user.click(screen.getByRole('button', { name: '論点を保存' }));

    expect(openedCase().disputes.at(-1)?.claimIds).toEqual(['claim-caretaker', 'claim-neighbor']);
  });
});
