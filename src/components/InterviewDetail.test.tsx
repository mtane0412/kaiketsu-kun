/**
 * 資料（聴取）の詳細・登録ページ（発言者と証言の一覧、本文、資料の編集・削除、サイドバーの「＋」から開くURLだけでの登録）のテスト
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
  title: '湖畔の夏 第3章',
  interviewerPersonId: 'person-book',
  at: '2018-05',
};

/** 記者会見の記事です。URLと本文だけを登録し、証言はまだひもづけていません。 */
const pressConference: Interview = {
  id: 'interview-press',
  url: 'https://news.example.com/press',
  at: '1998-08-14',
  transcript: '管理人は「あの夜は別荘が真っ暗でした」と話した。',
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
  it('資料の名前を見出しにし、証言の発言者を人物の詳細へのリンクで、ひもづく証言を証言の詳細へのリンクで並べる', () => {
    render(<InterviewDetail interviewId="interview-book" />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('湖畔の夏 第3章・2018年5月・湖畔の夏 20年目の証言（架空の書籍）');
    const speakers = screen.getByRole('region', { name: '発言者' });
    expect(within(speakers).getByRole('link', { name: '管理人' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/persons/person-caretaker?tab=graph'
    );
    expect(
      screen.getAllByRole('link').some((link) => link.getAttribute('href') === '/cases/case-lakeside/claims/claim-caretaker?tab=graph')
    ).toBe(true);
  });

  it('証言の無い資料では、発言者の代わりに、証言を書き起こすと発言者が並ぶことを示す', () => {
    render(<InterviewDetail interviewId="interview-press" />);

    const speakers = screen.getByRole('region', { name: '発言者' });
    expect(within(speakers).queryByRole('link')).not.toBeInTheDocument();
    expect(speakers).toHaveTextContent('証言を書き起こすと、その発言者がここに並びます');
  });

  it('本文を持つ資料では、本文を最初から開いておく（読みながら証言を拾えるようにするため）', () => {
    render(<InterviewDetail interviewId="interview-press" />);

    expect(screen.getByRole('region', { name: '1998年8月14日の資料の本文' })).toHaveTextContent('あの夜は別荘が真っ暗でした');
  });

  it('長い本文でも省略せず、「全文を表示」を置かない（資料の詳細は本文を読むための画面のため）', () => {
    const longTranscript = Array.from({ length: 20 }, (_, index) => `記者の記事の${index + 1}段落目です。`).join('\n');
    openTestCase({
      ...openedCase(),
      interviews: openedCase().interviews.map((interview) =>
        interview.id === 'interview-press' ? { ...interview, transcript: longTranscript } : interview
      ),
    });
    render(<InterviewDetail interviewId="interview-press" />);

    expect(screen.getByRole('region', { name: '1998年8月14日の資料の本文' })).toHaveTextContent('記者の記事の20段落目です。');
    expect(screen.queryByRole('button', { name: '全文を表示' })).not.toBeInTheDocument();
  });

  it('本文の無い資料では、本文を貼り付けると証言を書き起こせることを示す', () => {
    render(<InterviewDetail interviewId="interview-book" />);

    expect(screen.getByText(/「編集」から記事の本文や動画の文字起こしを貼り付けると/)).toBeInTheDocument();
  });

  it('YouTube の動画の資料では、動画を埋め込みプレーヤーで表示する', () => {
    const videoInterview: Interview = { id: 'interview-video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: '管理人の会見動画' };
    openTestCase({ ...caseWithInterviews, interviews: [...caseWithInterviews.interviews, videoInterview] });
    render(<InterviewDetail interviewId="interview-video" />);

    expect(screen.getByTitle('日時不明の資料の動画')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  describe('引用の時刻から、埋め込みプレーヤーをその位置へ進める', () => {
    /** 管理人の会見動画です。文字起こしを貼り付け、0:05 からの発言を管理人の証言として書き起こしています。 */
    const videoInterview: Interview = {
      id: 'interview-video',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      transcript: '0:00\nこんばんは、管理人です\n0:05\nあの夜は別荘が真っ暗でした',
    };

    beforeEach(() => {
      openTestCase({
        ...caseWithInterviews,
        interviews: [...caseWithInterviews.interviews, videoInterview],
        claims: caseWithInterviews.claims.map((claim) =>
          claim.id === 'claim-caretaker'
            ? { ...claim, interviewId: videoInterview.id, quote: { text: '0:05\nあの夜は別荘が真っ暗でした', seconds: 5 } }
            : claim
        ),
      });
    });

    it('ひもづく証言の引用の時刻を押すと、プレーヤーをその位置から再生する', async () => {
      const user = userEvent.setup();
      render(<InterviewDetail interviewId="interview-video" />);

      await user.click(screen.getByRole('button', { name: '0:05から動画を再生' }));

      expect(screen.getByTitle('日時不明の資料の動画')).toHaveAttribute(
        'src',
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=5&autoplay=1'
      );
    });

    it('本文の時刻の行を押すと、プレーヤーをその位置から再生する', async () => {
      const user = userEvent.setup();
      render(<InterviewDetail interviewId="interview-video" />);

      const transcriptRegion = screen.getByRole('region', { name: '日時不明の資料の本文' });
      await user.click(within(transcriptRegion).getByRole('button', { name: '0:00から動画を再生' }));

      expect(screen.getByTitle('日時不明の資料の動画')).toHaveAttribute(
        'src',
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=0&autoplay=1'
      );
    });
  });

  it('YouTube 以外のURLの資料では、動画を埋め込まない', () => {
    const { container } = render(<InterviewDetail interviewId="interview-press" />);

    expect(container.querySelector('iframe')).toBeNull();
  });

  it('資料を編集して、タイトルを変えられる', async () => {
    const user = userEvent.setup();
    render(<InterviewDetail interviewId="interview-book" />);

    await user.click(screen.getByRole('button', { name: '2018年5月の資料を編集' }));
    const editSection = screen.getByRole('region', { name: '資料の編集' });
    await user.clear(within(editSection).getByLabelText('タイトル（任意）'));
    await user.type(within(editSection).getByLabelText('タイトル（任意）'), '湖畔の夏 第4章');
    await user.click(within(editSection).getByRole('button', { name: '資料を保存' }));

    expect(openedCase().interviews.find((interview) => interview.id === bookInterview.id)?.title).toBe('湖畔の夏 第4章');
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

  it('URLだけを入れて保存すると、資料をケースに追加し、その資料の詳細へ移る', async () => {
    const user = userEvent.setup();
    render(<NewInterviewDetail />);

    const registerSection = screen.getByRole('region', { name: '資料の登録' });
    await user.type(within(registerSection).getByLabelText('URL（任意）'), 'https://www.youtube.com/watch?v=abc');
    await user.click(within(registerSection).getByRole('button', { name: '資料を保存' }));

    const added = openedCase().interviews.at(-1);
    expect(added).toEqual({ id: expect.any(String), url: 'https://www.youtube.com/watch?v=abc' });
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
