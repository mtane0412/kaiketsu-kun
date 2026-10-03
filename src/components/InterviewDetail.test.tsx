/**
 * 資料（聴取）の詳細・登録ページ（相手の人物と証言の一覧、資料の編集・削除、サイドバーの「＋」から開く登録）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case, Interview } from '@/domain/types';
import { mockRouter, resetMockNavigation } from '@/test/mock-navigation';
import { openedCase, openTestCase } from '@/test/open-case';
import { InterviewDetail, NewInterviewDetail } from './InterviewDetail';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** 20年後の、書籍の著者による管理人への取材です（管理人の証言をひもづけています）。 */
const bookInterview: Interview = {
  id: 'interview-book',
  subjectPersonIds: ['person-caretaker'],
  interviewerPersonId: 'person-book',
  at: '2018-05',
};

/** 管理人と隣家の住人がそろって応じた記者会見です（証言はまだひもづけていません）。 */
const pressConference: Interview = {
  id: 'interview-press',
  subjectPersonIds: ['person-caretaker', 'person-neighbor'],
  at: '1998-08-14',
};

/** 2件の資料を登録し、書籍の取材に管理人の証言をひもづけたケースです。 */
const caseWithInterviews: Case = {
  ...sampleFictionalCase,
  interviews: [bookInterview, pressConference],
  claims: sampleFictionalCase.claims.map((claim) =>
    claim.id === 'claim-caretaker' ? { ...claim, interviewId: bookInterview.id } : claim
  ),
};

beforeEach(() => {
  localStorage.clear();
  openTestCase(caseWithInterviews);
  resetMockNavigation('/cases/case-lakeside/interviews/interview-book?tab=graph');
});

describe('InterviewDetail', () => {
  it('資料の名前を見出しにし、相手の人物を人物の詳細へのリンクで、ひもづく証言を証言の詳細へのリンクで並べる', () => {
    render(<InterviewDetail interviewId="interview-book" />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('管理人・2018年5月・湖畔の夏 20年目の証言（架空の書籍）');
    const subjects = screen.getByRole('region', { name: '相手' });
    expect(within(subjects).getByRole('link', { name: '管理人' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/persons/person-caretaker?tab=graph'
    );
    expect(
      screen.getAllByRole('link').some((link) => link.getAttribute('href') === '/cases/case-lakeside/claims/claim-caretaker?tab=graph')
    ).toBe(true);
  });

  it('相手が複数の資料では、相手の全員を並べる', () => {
    render(<InterviewDetail interviewId="interview-press" />);

    const subjects = screen.getByRole('region', { name: '相手' });
    expect(within(subjects).getAllByRole('link').map((link) => link.textContent)).toEqual(['管理人', '隣家の住人']);
    // 検証: 相手は「相手」の欄に並べるため、資料のカードでは繰り返さない
    expect(screen.queryByText('相手: 管理人、隣家の住人')).not.toBeInTheDocument();
  });

  it('資料を編集して、相手を足せる', async () => {
    const user = userEvent.setup();
    render(<InterviewDetail interviewId="interview-book" />);

    await user.click(screen.getByRole('button', { name: '2018年5月の資料を編集' }));
    const editSection = screen.getByRole('region', { name: '資料の編集' });
    await user.click(within(within(editSection).getByRole('group', { name: '相手' })).getByRole('checkbox', { name: '隣家の住人' }));
    await user.click(within(editSection).getByRole('button', { name: '資料を保存' }));

    expect(openedCase().interviews.find((interview) => interview.id === bookInterview.id)?.subjectPersonIds).toEqual([
      'person-caretaker',
      'person-neighbor',
    ]);
  });

  it('資料を削除すると、ケースから取り除き、ボードへ戻る', async () => {
    const user = userEvent.setup();
    render(<InterviewDetail interviewId="interview-press" />);

    await user.click(screen.getByRole('button', { name: '1998年8月14日の資料を削除' }));
    await user.click(screen.getByRole('button', { name: '削除する' }));

    expect(openedCase().interviews.map((interview) => interview.id)).toEqual([bookInterview.id]);
    expect(mockRouter.replace).toHaveBeenCalledWith('/cases/case-lakeside?tab=graph');
  });

  it('ケースに無い資料では、見つからないことを示す', () => {
    render(<InterviewDetail interviewId="interview-gone" />);

    expect(screen.getByRole('heading', { name: '資料が見つかりません' })).toBeInTheDocument();
  });
});

describe('NewInterviewDetail', () => {
  beforeEach(() => {
    resetMockNavigation('/cases/case-lakeside/interviews/new?tab=graph');
  });

  it('相手を選んで保存すると、資料をケースに追加し、その資料の詳細へ移る', async () => {
    const user = userEvent.setup();
    render(<NewInterviewDetail />);

    const registerSection = screen.getByRole('region', { name: '資料の登録' });
    await user.click(within(within(registerSection).getByRole('group', { name: '相手' })).getByRole('checkbox', { name: '隣家の住人' }));
    await user.type(within(registerSection).getByLabelText('日時（任意）'), '1998-08-20');
    await user.click(within(registerSection).getByRole('button', { name: '資料を保存' }));

    const added = openedCase().interviews.at(-1);
    expect(added).toEqual({ id: expect.any(String), subjectPersonIds: ['person-neighbor'], at: '1998-08-20' });
    // 検証: 登録のURLへ「戻る」で戻ると二重に登録しかねないため、履歴は置き換える
    expect(mockRouter.replace).toHaveBeenCalledWith(`/cases/case-lakeside/interviews/${added?.id}?tab=graph`);
  });

  it('「やめる」を押すと、保存せずにボードへ戻る', async () => {
    const user = userEvent.setup();
    render(<NewInterviewDetail />);

    await user.click(screen.getByRole('button', { name: 'やめる' }));

    expect(openedCase().interviews).toHaveLength(2);
    expect(mockRouter.push).toHaveBeenCalledWith('/cases/case-lakeside?tab=graph');
  });
});
