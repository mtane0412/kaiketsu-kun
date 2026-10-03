/**
 * 人物の詳細に並べる「供述の変遷」（その人物が相手の聴取の一覧・登録・編集・削除と、聴取からの証言の書き足し）のテスト
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case, Interview } from '@/domain/types';
import { openedCase, openTestCase } from '@/test/open-case';
import { resetMockNavigation } from '@/test/mock-navigation';
import { InterviewSection } from './InterviewSection';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** 管理人への県警の初回の聴取です（事件の翌日。証言はまだひもづけていません）。 */
const firstInterview: Interview = {
  id: 'interview-first',
  subjectPersonId: 'person-caretaker',
  interviewerPersonId: 'person-police',
  at: '1998-08-13T10:00',
  placeId: 'place-villa',
  subjectRole: '参考人',
  documentRef: '供述調書 第1号',
};

/** 20年後の、書籍の著者による取材です（管理人の証言をひもづけています）。 */
const bookInterview: Interview = {
  id: 'interview-book',
  subjectPersonId: 'person-caretaker',
  interviewerPersonId: 'person-book',
  at: '2018-05',
};

/** 登録順を日時の順と逆にし、書籍の取材に管理人の証言をひもづけたケースです。 */
const caseWithInterviews: Case = {
  ...sampleFictionalCase,
  interviews: [bookInterview, firstInterview],
  claims: sampleFictionalCase.claims.map((claim) =>
    claim.id === 'claim-caretaker' ? { ...claim, interviewId: bookInterview.id } : claim
  ),
};

beforeEach(() => {
  localStorage.clear();
  openTestCase(caseWithInterviews);
  resetMockNavigation('/cases/case-lakeside/persons/person-caretaker');
});

/** 管理人の詳細に並ぶ「供述の変遷」を描画します。 */
function renderCaretakerStatementHistory() {
  render(<InterviewSection personId="person-caretaker" tab="timeline" />);
  return screen.getByRole('region', { name: '供述の変遷' });
}

describe('InterviewSection', () => {
  it('この人物が相手の聴取を、日時の早い順に、聴取者・場所・立場・資料番号とともに並べる', () => {
    const history = renderCaretakerStatementHistory();

    const interviewHeading = within(history).getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent);
    expect(interviewHeading).toEqual(['1998年8月13日 10:00', '2018年5月']);
    expect(within(history).getByText('聴取者: 県警 / 場所: 湖畔の別荘 / 立場: 参考人 / 資料: 供述調書 第1号')).toBeInTheDocument();
  });

  it('各聴取の下に、その聴取で得た証言を、証言の詳細へのリンクで並べる', () => {
    const history = renderCaretakerStatementHistory();

    expect(within(history).getByRole('link', { name: /見回りをしたとき/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-caretaker'
    );
    expect(within(history).getByText('この聴取にひもづく証言は、まだありません。')).toBeInTheDocument();
  });

  it('聴取が1件も無い人物では、聴取の登録を促す案内を表示する', () => {
    render(<InterviewSection personId="person-neighbor" tab="timeline" />);

    const history = screen.getByRole('region', { name: '供述の変遷' });
    expect(within(history).getByRole('button', { name: '聴取を追加' })).toBeInTheDocument();
    expect(within(history).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('日時・聴取者・場所・立場・資料番号を入力して保存すると、この人物を相手とする聴取をケースに追加する', async () => {
    const user = userEvent.setup();
    renderCaretakerStatementHistory();

    await user.click(screen.getByRole('button', { name: '聴取を追加' }));
    const registerButton = screen.getByRole('region', { name: '聴取の登録' });
    await user.type(within(registerButton).getByLabelText('日時（任意）'), '1998年8月20日14時');
    await user.selectOptions(within(registerButton).getByLabelText('聴取者または媒体（任意）'), 'person-police');
    await user.selectOptions(within(registerButton).getByLabelText('場所（任意）'), 'place-villa');
    await user.type(within(registerButton).getByLabelText('相手の立場（任意）'), '参考人');
    await user.type(within(registerButton).getByLabelText('資料番号（任意）'), '供述調書 第2号');
    await user.click(within(registerButton).getByRole('button', { name: '聴取を保存' }));

    expect(openedCase().interviews.at(-1)).toMatchObject({
      subjectPersonId: 'person-caretaker',
      interviewerPersonId: 'person-police',
      at: '1998-08-20T14:00',
      placeId: 'place-villa',
      subjectRole: '参考人',
      documentRef: '供述調書 第2号',
    });
  });

  it('任意の項目を入力しない聴取は、その項目を持たずに保存する', async () => {
    const user = userEvent.setup();
    renderCaretakerStatementHistory();

    await user.click(screen.getByRole('button', { name: '聴取を追加' }));
    await user.click(within(screen.getByRole('region', { name: '聴取の登録' })).getByRole('button', { name: '聴取を保存' }));

    const addedInterview = openedCase().interviews.at(-1);
    expect(addedInterview).toEqual({ id: expect.any(String), subjectPersonId: 'person-caretaker' });
  });

  it('日時として解釈できない表記では、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    renderCaretakerStatementHistory();

    await user.click(screen.getByRole('button', { name: '聴取を追加' }));
    const registerButton = screen.getByRole('region', { name: '聴取の登録' });
    await user.type(within(registerButton).getByLabelText('日時（任意）'), '事件の翌週');
    await user.click(within(registerButton).getByRole('button', { name: '聴取を保存' }));

    expect(within(registerButton).getByText(/日時を解釈できません/)).toBeInTheDocument();
    expect(openedCase().interviews).toHaveLength(2);
  });

  it('登録済みの聴取を編集して保存すると、同じ聴取を書き換える', async () => {
    const user = userEvent.setup();
    const history = renderCaretakerStatementHistory();

    await user.click(within(history).getByRole('button', { name: '1998年8月13日 10:00の聴取を編集' }));
    const editButton = screen.getByRole('region', { name: '聴取の編集' });
    expect(within(editButton).getByLabelText('日時（任意）')).toHaveValue('1998-08-13T10:00');
    await user.clear(within(editButton).getByLabelText('相手の立場（任意）'));
    await user.type(within(editButton).getByLabelText('相手の立場（任意）'), '重要参考人');
    await user.click(within(editButton).getByRole('button', { name: '聴取を保存' }));

    expect(openedCase().interviews.find((interview) => interview.id === firstInterview.id)).toEqual({
      ...firstInterview,
      subjectRole: '重要参考人',
    });
  });

  it('証言がひもづいていない聴取を削除すると、ケースから聴取を取り除く', async () => {
    const user = userEvent.setup();
    const history = renderCaretakerStatementHistory();

    await user.click(within(history).getByRole('button', { name: '1998年8月13日 10:00の聴取を削除' }));
    await user.click(screen.getByRole('button', { name: '削除する' }));

    expect(openedCase().interviews.map((interview) => interview.id)).toEqual([bookInterview.id]);
  });

  it('証言がひもづいている聴取は削除できず、理由を示す', async () => {
    const user = userEvent.setup();
    const history = renderCaretakerStatementHistory();

    await user.click(within(history).getByRole('button', { name: '2018年5月の聴取を削除' }));
    await user.click(screen.getByRole('button', { name: '削除する' }));

    expect(within(history).getByText(/他のデータから参照されているため削除できません/)).toBeInTheDocument();
    expect(openedCase().interviews).toHaveLength(2);
  });

  it('「この聴取の証言を書き足す」から書いた証言は、その聴取にひもづき、聴取の相手の発言として保存する', async () => {
    const user = userEvent.setup();
    const history = renderCaretakerStatementHistory();

    await user.click(within(history).getByRole('button', { name: '1998年8月13日 10:00の聴取の証言を書き足す' }));
    const appendButton = screen.getByRole('region', { name: '聴取の証言の書き足し' });
    await user.type(within(appendButton).getByLabelText('内容'), '見回りは夜10時ごろで、別荘には明かりがついていた。');
    await user.click(within(appendButton).getByRole('button', { name: '書き足す' }));

    expect(openedCase().claims.at(-1)).toMatchObject({
      speaker: { kind: 'person', personIds: ['person-caretaker'] },
      interviewId: firstInterview.id,
    });
    expect(screen.queryByRole('region', { name: '聴取の証言の書き足し' })).not.toBeInTheDocument();
  });
  it('URLと本文を入力して保存すると、聴取に資料のURLと本文を持たせる', async () => {
    const user = userEvent.setup();
    renderCaretakerStatementHistory();

    await user.click(screen.getByRole('button', { name: '聴取を追加' }));
    const registration = screen.getByRole('region', { name: '聴取の登録' });
    await user.type(within(registration).getByLabelText('URL（任意）'), 'https://www.youtube.com/watch?v=abc');
    await user.type(within(registration).getByLabelText('本文・文字起こし（任意）'), '0:05{Enter}あの夜は別荘が真っ暗でした');
    await user.click(within(registration).getByRole('button', { name: '聴取を保存' }));

    expect(openedCase().interviews.at(-1)).toMatchObject({
      url: 'https://www.youtube.com/watch?v=abc',
      transcript: '0:05\nあの夜は別荘が真っ暗でした',
    });
  });

  it('http か https でないURLでは、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    renderCaretakerStatementHistory();

    await user.click(screen.getByRole('button', { name: '聴取を追加' }));
    const registration = screen.getByRole('region', { name: '聴取の登録' });
    await user.type(within(registration).getByLabelText('URL（任意）'), '動画のページ');
    await user.click(within(registration).getByRole('button', { name: '聴取を保存' }));

    expect(within(registration).getByText(/URLは http か https/)).toBeInTheDocument();
    expect(openedCase().interviews).toHaveLength(2);
  });

  it('URLを持つ聴取には、資料を新しいタブで開くリンクを置く', () => {
    openTestCase(withVideoInterview());
    const history = renderCaretakerStatementHistory();

    const link = within(history).getByRole('link', { name: '1998年8月13日 10:00の聴取の資料を開く' });
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('本文の範囲を選んで「選んだ範囲を証言にする」を押すと、聴取・発言者・本文・引用を入力済みにして書き足せる', async () => {
    const user = userEvent.setup();
    openTestCase(withVideoInterview());
    const history = renderCaretakerStatementHistory();

    await user.click(within(history).getByRole('button', { name: '1998年8月13日 10:00の聴取の本文を開く' }));
    const transcriptRegion = screen.getByRole('region', { name: '1998年8月13日 10:00の聴取の本文' });
    const quoteButton = within(transcriptRegion).getByRole('button', { name: '選んだ範囲を証言にする' });
    expect(quoteButton).toBeDisabled();

    // 「0:05」の行から「真っ暗でした」までを選ぶ（時刻の行は本文の初期値から取り除き、動画の位置として補う）
    selectTextIn(within(transcriptRegion).getByTestId('transcript-text'), '0:05\nあの夜は別荘が真っ暗でした');
    await user.click(quoteButton);

    const composer = screen.getByRole('region', { name: '聴取の証言の書き足し' });
    expect(within(composer).getByLabelText('内容')).toHaveValue('あの夜は別荘が真っ暗でした');
    expect(within(composer).getByRole('group', { name: '引用' })).toHaveTextContent('0:05');
    await user.click(within(composer).getByRole('button', { name: '書き足す' }));

    expect(openedCase().claims.at(-1)).toMatchObject({
      speaker: { kind: 'person', personIds: ['person-caretaker'] },
      interviewId: firstInterview.id,
      content: 'あの夜は別荘が真っ暗でした',
      quote: { text: '0:05\nあの夜は別荘が真っ暗でした', seconds: 5 },
    });
  });

  it('本文の外を選んでいるときは、「選んだ範囲を証言にする」を押せない', async () => {
    const user = userEvent.setup();
    openTestCase(withVideoInterview());
    const history = renderCaretakerStatementHistory();

    await user.click(within(history).getByRole('button', { name: '1998年8月13日 10:00の聴取の本文を開く' }));
    selectTextIn(within(history).getByRole('heading', { name: '1998年8月13日 10:00' }), '1998年8月13日');

    expect(screen.getByRole('button', { name: '選んだ範囲を証言にする' })).toBeDisabled();
  });

  it('本文のうち、証言として書き起こした範囲を、その証言へのリンクとして示す', async () => {
    const user = userEvent.setup();
    openTestCase(
      withVideoInterview((claims) =>
        claims.map((claim) =>
          claim.id === 'claim-caretaker' ? { ...claim, interviewId: firstInterview.id, quote: { text: '別荘が真っ暗でした' } } : claim
        )
      )
    );
    const history = renderCaretakerStatementHistory();

    await user.click(within(history).getByRole('button', { name: '1998年8月13日 10:00の聴取の本文を開く' }));
    const transcriptRegion = screen.getByRole('region', { name: '1998年8月13日 10:00の聴取の本文' });

    const quoted = within(transcriptRegion).getByRole('link', { name: /^書き起こした証言:/ });
    expect(quoted).toHaveTextContent('別荘が真っ暗でした');
    expect(quoted).toHaveAttribute('href', '/cases/case-lakeside/claims/claim-caretaker');
  });
});

/**
 * 県警の初回の聴取を、動画の文字起こしを貼り付けた聴取にしたケースを返します。
 * mapClaims で、証言を書き換えられます。
 */
function withVideoInterview(mapClaims: (claims: Case['claims']) => Case['claims'] = (claims) => claims): Case {
  const videoInterview: Interview = {
    ...firstInterview,
    url: 'https://www.youtube.com/watch?v=abc',
    transcript: '0:00\nこんばんは、管理人です\n0:05\nあの夜は別荘が真っ暗でした',
  };
  return {
    ...caseWithInterviews,
    interviews: [bookInterview, videoInterview],
    claims: mapClaims(caseWithInterviews.claims),
  };
}

/**
 * 要素の中の文字列 text を、利用者がマウスでなぞったときと同じように選択します。
 * 選択の変化は selectionchange で伝わるため、選択した後にこのイベントを発生させます。
 */
function selectTextIn(element: HTMLElement, text: string): void {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  const fullText = textNodes.map((node) => node.data).join('');
  const start = fullText.indexOf(text);
  if (start === -1) throw new Error(`選択する文字列が見つかりません: ${text}`);

  /** 要素の中での文字の位置を、テキストノードとその中の位置に直します。 */
  const locate = (offset: number): [Text, number] => {
    let rest = offset;
    for (const node of textNodes) {
      if (rest <= node.data.length) return [node, rest];
      rest -= node.data.length;
    }
    throw new Error(`位置が要素の外です: ${offset}`);
  };
  const range = document.createRange();
  range.setStart(...locate(start));
  range.setEnd(...locate(start + text.length));
  const selection = window.getSelection();
  if (selection === null) throw new Error('選択を取得できません');
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent(document, new Event('selectionchange'));
}
