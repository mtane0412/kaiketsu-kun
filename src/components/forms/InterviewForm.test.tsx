/**
 * 聴取の入力フォームのテスト（相手の選択と、記事のURLから本文を取得して本文の欄に入れる操作）
 *
 * 本文の取得 API（/api/fetch-article）の呼び出しは、fetch を置き換えて確かめます。
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Interview } from '@/domain/types';
import { openedCase, openTestCase } from '@/test/open-case';
import { InterviewForm } from './InterviewForm';

/** 記事のURLです。 */
const articleUrl = 'https://news.example.com/kohan-1998';

/** 本文の取得 API が返す、湖畔新聞の記事です。 */
const fetchedArticle = {
  text: '13日午前2時ごろ、湖畔の別荘から火が出た。\n別荘の管理人は「12日の夜は別荘が真っ暗でした」と話している。',
  title: '湖畔の別荘で火事',
  publishedAt: '1998-08-13T06:30',
};

/** 本文を貼り付け済みの、湖畔新聞による管理人への取材です。 */
const pastedInterview: Interview = {
  id: 'interview-newspaper',
  subjectPersonIds: ['person-caretaker'],
  at: '1998-08-14',
  transcript: '手で貼り付けた本文',
};

beforeEach(() => {
  openTestCase(sampleFictionalCase);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 本文の取得 API を、指定した状態コードと JSON を返すように置き換えます。 */
function mockFetchArticleApi(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(body, { status }));
}

/** 管理人を相手とする聴取のフォームを描画します。 */
function renderForm(initial?: Interview) {
  const onDone = vi.fn();
  render(<InterviewForm defaultSubjectPersonIds={['person-caretaker']} initial={initial} onDone={onDone} onCancel={vi.fn()} />);
  return { onDone };
}

/** 本文の欄に、取得した記事の本文が入るまで待ちます（本文は改行を含むため、欄の値で比べます）。 */
async function waitForFetchedText() {
  await waitFor(() => expect(screen.getByLabelText('本文・文字起こし（任意）')).toHaveValue(fetchedArticle.text));
}

/** URLの欄に記事のURLを入れ、「本文を取得」を押します。 */
async function fetchArticle(user: ReturnType<typeof userEvent.setup>, url = articleUrl) {
  await user.clear(screen.getByLabelText('URL（任意）'));
  await user.type(screen.getByLabelText('URL（任意）'), url);
  await user.click(screen.getByRole('button', { name: '本文を取得' }));
}

describe('InterviewForm の相手', () => {
  /** 相手の欄で、人物 name の選択を切り替えます。 */
  async function toggleSubject(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(within(screen.getByRole('group', { name: '相手' })).getByRole('checkbox', { name }));
  }

  it('最初に渡した相手を選んだ状態で始まり、相手を足すと、選んだ順に相手を持つ聴取として保存する', async () => {
    const user = userEvent.setup();
    const { onDone } = renderForm();

    expect(within(screen.getByRole('group', { name: '相手' })).getByRole('checkbox', { name: '管理人' })).toBeChecked();
    await toggleSubject(user, '隣家の住人');
    await user.click(screen.getByRole('button', { name: '資料を保存' }));

    const saved = openedCase().interviews[0];
    expect(saved?.subjectPersonIds).toEqual(['person-caretaker', 'person-neighbor']);
    expect(onDone).toHaveBeenCalledWith(saved);
  });

  it('編集では、保存済みの相手を選んだ状態で始まる', () => {
    render(
      <InterviewForm
        initial={{ id: 'interview-press', subjectPersonIds: ['person-neighbor', 'person-caretaker'] }}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const subjectField = screen.getByRole('group', { name: '相手' });
    expect(within(subjectField).getByRole('checkbox', { name: '隣家の住人' })).toBeChecked();
    expect(within(subjectField).getByRole('checkbox', { name: '管理人' })).toBeChecked();
    expect(within(subjectField).getByRole('checkbox', { name: '別荘の持ち主' })).not.toBeChecked();
  });

  it('相手を1人も選ばずに保存しようとすると、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    renderForm();

    await toggleSubject(user, '管理人');
    await user.click(screen.getByRole('button', { name: '資料を保存' }));

    expect(screen.getByText('相手を1人以上選んでください')).toBeInTheDocument();
    expect(openedCase().interviews).toEqual([]);
  });

  it('聴取者に相手と同じ人物を選んで保存しようとすると、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText('聴取者または媒体（任意）'), '管理人');
    await user.click(screen.getByRole('button', { name: '資料を保存' }));

    expect(screen.getByText('聴取者または媒体に、相手と同じ人物（管理人）は選べません')).toBeInTheDocument();
    expect(openedCase().interviews).toEqual([]);
  });
});

describe('InterviewForm の本文の取得', () => {
  it('記事のURLから取得した本文を本文の欄に、公開日時を日時の欄に入れ、保存はしない', async () => {
    const fetchSpy = mockFetchArticleApi(200, fetchedArticle);
    const user = userEvent.setup();
    renderForm();

    await fetchArticle(user);

    await waitForFetchedText();
    expect(screen.getByLabelText('日時（任意）')).toHaveValue('1998-08-13T06:30');
    expect(screen.getByRole('status')).toHaveTextContent('「湖畔の別荘で火事」の本文（');
    expect(fetchSpy).toHaveBeenCalledWith('/api/fetch-article', expect.objectContaining({ method: 'POST' }));
    expect(openedCase().interviews).toEqual(sampleFictionalCase.interviews);
  });

  it('取得した本文は「資料を保存」で保存する', async () => {
    mockFetchArticleApi(200, fetchedArticle);
    const user = userEvent.setup();
    const { onDone } = renderForm();

    await fetchArticle(user);
    await waitForFetchedText();
    await user.click(screen.getByRole('button', { name: '資料を保存' }));

    expect(onDone).toHaveBeenCalled();
    const saved = openedCase().interviews.find((interview) => interview.url === articleUrl);
    expect(saved).toMatchObject({ transcript: fetchedArticle.text, at: '1998-08-13T06:30' });
  });

  it('日時の欄に入力がある場合は、公開日時で上書きしない', async () => {
    mockFetchArticleApi(200, fetchedArticle);
    const user = userEvent.setup();
    renderForm({ id: 'interview-newspaper', subjectPersonIds: ['person-caretaker'], at: '1998-08-14' });

    await fetchArticle(user);

    await waitForFetchedText();
    expect(screen.getByLabelText('日時（任意）')).toHaveValue('1998-08-14');
  });

  it('本文の欄に入力がある場合は、置き換える前に確認し、やめると本文を変えない', async () => {
    mockFetchArticleApi(200, fetchedArticle);
    const user = userEvent.setup();
    renderForm(pastedInterview);

    await fetchArticle(user);
    const dialog = await screen.findByRole('alertdialog', { name: '本文を置き換えますか？' });
    await user.click(within(dialog).getByRole('button', { name: 'やめる' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByLabelText('本文・文字起こし（任意）')).toHaveValue('手で貼り付けた本文');
  });

  it('本文の欄に入力がある場合も、確認して承認すると本文を置き換える', async () => {
    mockFetchArticleApi(200, fetchedArticle);
    const user = userEvent.setup();
    renderForm(pastedInterview);

    await fetchArticle(user);
    const dialog = await screen.findByRole('alertdialog', { name: '本文を置き換えますか？' });
    await user.click(within(dialog).getByRole('button', { name: '置き換える' }));

    await waitForFetchedText();
  });

  it('取得に失敗した場合は、理由を示し、本文の欄を変えない', async () => {
    mockFetchArticleApi(504, { error: '記事のページが時間内に応答しませんでした。' });
    const user = userEvent.setup();
    renderForm(pastedInterview);

    await fetchArticle(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('記事のページが時間内に応答しませんでした。');
    expect(screen.getByLabelText('本文・文字起こし（任意）')).toHaveValue('手で貼り付けた本文');
  });

  it('YouTube のURLでは取得せず、文字起こしを貼り付けるよう案内する', async () => {
    const fetchSpy = mockFetchArticleApi(200, fetchedArticle);
    const user = userEvent.setup();
    renderForm();

    await fetchArticle(user, 'https://www.youtube.com/watch?v=abc');

    expect(await screen.findByRole('alert')).toHaveTextContent('YouTube の「文字起こしを表示」の内容を、本文の欄に貼り付けてください。');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
